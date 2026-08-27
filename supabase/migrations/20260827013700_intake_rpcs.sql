-- P17-02: digital intake RPC boundaries.
--
-- create_intake_form / mark_intake_form_paper / list_intake_forms are
-- intake.manage-gated staff surfaces; public_get_intake_form and
-- public_submit_intake_form are the third deliberate anonymous surface of the
-- system (extending the documented get_public_site + booking exception list,
-- plan 017). The anonymous functions are SECURITY DEFINER with an empty
-- search_path, never read auth.uid(), resolve the tenant by org slug, match a
-- link purely by its stored SHA-256 token hash, and return only the bounded
-- per-patient form projection below -- never other patient data and never
-- another form. Wrong, expired, revoked, or foreign-organization tokens are
-- all indistinguishable NULLs, so a link can never expose another patient.
--
-- This object migration grants nothing; the 20260827013701 terminal owns the
-- only anon/authenticated grants.

create or replace function private.has_intake_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('intake.manage') and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.has_intake_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_intake_permission_at_branch(uuid, text) is
  'Current-user intake.manage check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_intake_form(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_form_type text,
  p_consent_template_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_template_organization_id uuid;
  v_template_is_active boolean;
  v_template_version integer;
  v_template_version_label text;
  v_form_id uuid;
  v_form_version integer;
  v_token text := gen_random_uuid()::text;
  v_token_hash text := pg_catalog.encode(pg_catalog.sha256(v_token::bytea), 'hex');
  v_expires_at timestamptz := pg_catalog.statement_timestamp() + interval '7 days';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_intake_permission_at_branch(
       p_acting_branch_id, 'intake.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null
     or p_form_type not in ('MEDICAL_HISTORY', 'DENTAL_HISTORY', 'CONSENT') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_form_type = 'CONSENT' then
    if p_consent_template_id is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    select template.organization_id, template.is_active, template.version
    into v_template_organization_id, v_template_is_active, v_template_version
    from public.consent_templates as template
    where template.id = p_consent_template_id
    for key share;

    if not found
       or (
         v_template_organization_id is not null
         and v_template_organization_id <> v_organization_id
       )
       or not v_template_is_active then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_template_version_label := 'v' || v_template_version;
  else
    if p_consent_template_id is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_template_version_label := 'v1';
  end if;

  insert into public.intake_forms (
    organization_id, branch_id, patient_id, form_type, consent_template_id,
    template_version, answers, privacy_acknowledged, status, created_by
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_form_type,
    p_consent_template_id, v_template_version_label, '{}'::jsonb, false,
    'PENDING', v_actor_user_id
  ) returning id, public.intake_forms.version into v_form_id, v_form_version;

  insert into public.intake_links (
    organization_id, patient_id, intake_form_id, token_hash, status, expires_at
  ) values (
    v_organization_id, p_patient_id, v_form_id, v_token_hash, 'ACTIVE', v_expires_at
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INTAKE',
    'intake.form.created', 'intake_form', v_form_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return jsonb_build_object(
    'formId', v_form_id,
    'version', v_form_version,
    'token', v_token,
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.create_intake_form(uuid, uuid, text, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_intake_form(uuid, uuid, text, uuid) is
  'intake.manage-gated creation of a PENDING intake form plus one ACTIVE 7-day intake link for a same-tenant patient. For CONSENT forms the template must be a global or same-organization active consent template and template_version snapshots its version (v1 otherwise). The link token is generated as a UUID, returned in plaintext exactly once, and only its SHA-256 hash is stored. Appends one intake.form.created audit event atomically.';

create function public.public_get_intake_form(
  p_org_slug text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_token_hash text;
  v_link public.intake_links%rowtype;
  v_form public.intake_forms%rowtype;
  v_consent_body text;
  v_privacy_notice text;
begin
  select organization.id into v_organization_id
  from public.organizations as organization
  where organization.status = 'active'
    and organization.slug = p_org_slug;

  if v_organization_id is null then
    return null;
  end if;

  v_token_hash := pg_catalog.encode(
    pg_catalog.sha256(coalesce(p_token, '')::bytea),
    'hex'
  );

  select link.* into v_link
  from public.intake_links as link
  where link.organization_id = v_organization_id
    and link.token_hash = v_token_hash
  for update;

  if not found then
    return null;
  end if;

  -- Tokens expire via an explicit state transition, never a bare
  -- expires_at predicate: an ACTIVE link past its lifetime is flipped to
  -- EXPIRED and treated indistinguishably from an unknown token.
  if v_link.status = 'ACTIVE'
     and v_link.expires_at < pg_catalog.statement_timestamp() then
    update public.intake_links
    set status = 'EXPIRED'
    where organization_id = v_organization_id
      and intake_form_id = v_link.intake_form_id
      and status = 'ACTIVE';
    return null;
  end if;

  if v_link.status <> 'ACTIVE' then
    return null;
  end if;

  select form.* into v_form
  from public.intake_forms as form
  where form.organization_id = v_organization_id
    and form.id = v_link.intake_form_id;

  if not found then
    return null;
  end if;

  if v_form.form_type = 'CONSENT' then
    select template.body into v_consent_body
    from public.consent_templates as template
    where template.id = v_form.consent_template_id;
  end if;

  select settings.privacy_notice into v_privacy_notice
  from public.public_site_settings as settings
  where settings.organization_id = v_organization_id;

  return jsonb_build_object(
    'formId', v_form.id,
    'formType', v_form.form_type,
    'templateVersion', v_form.template_version,
    'consentBody', v_consent_body,
    'privacyNotice', v_privacy_notice,
    'expiresAt', v_link.expires_at,
    'status', v_form.status
  );
end;
$$;

revoke all on function public.public_get_intake_form(text, text)
from public, anon, authenticated, service_role;

comment on function public.public_get_intake_form(text, text) is
  'Anonymous bounded read of the single intake form bound to a link token hash within the organization resolved by slug. Returns only form id, type, snapshot template version, the consent body for CONSENT forms, the organization privacy notice, the link expiry, and the form status -- never patient identity, answers, or any other form. An active link past its lifetime is transitioned to EXPIRED; a wrong, expired, revoked, or foreign-organization token is an indistinguishable NULL.';

create function public.public_submit_intake_form(
  p_org_slug text,
  p_token text,
  p_answers jsonb,
  p_privacy_acknowledged boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_token_hash text;
  v_link public.intake_links%rowtype;
  v_form public.intake_forms%rowtype;
begin
  select organization.id into v_organization_id
  from public.organizations as organization
  where organization.status = 'active'
    and organization.slug = p_org_slug;

  if v_organization_id is null then
    return null;
  end if;

  v_token_hash := pg_catalog.encode(
    pg_catalog.sha256(coalesce(p_token, '')::bytea),
    'hex'
  );

  select link.* into v_link
  from public.intake_links as link
  where link.organization_id = v_organization_id
    and link.token_hash = v_token_hash
  for update;

  if not found then
    return null;
  end if;

  select form.* into v_form
  from public.intake_forms as form
  where form.organization_id = v_organization_id
    and form.id = v_link.intake_form_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotent duplicate submission: an already-submitted form is returned
  -- unchanged whatever the new payload or the link state.
  if v_form.status = 'SUBMITTED' then
    return jsonb_build_object(
      'formId', v_form.id,
      'status', v_form.status,
      'submittedAt', v_form.submitted_at
    );
  end if;

  if v_link.status = 'ACTIVE'
     and v_link.expires_at < pg_catalog.statement_timestamp() then
    update public.intake_links
    set status = 'EXPIRED'
    where organization_id = v_organization_id
      and intake_form_id = v_link.intake_form_id
      and status = 'ACTIVE';
    return null;
  end if;

  if v_link.status <> 'ACTIVE' or v_form.status <> 'PENDING' then
    return null;
  end if;

  if p_answers is null
     or pg_catalog.jsonb_typeof(p_answers) <> 'object'
     or pg_catalog.pg_column_size(p_answers) > 16384 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_form.form_type = 'CONSENT' and p_privacy_acknowledged is not true then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  update public.intake_forms
  set status = 'SUBMITTED',
      submitted_at = pg_catalog.statement_timestamp(),
      submitted_via = 'LINK',
      answers = p_answers,
      privacy_acknowledged = p_privacy_acknowledged,
      version = v_form.version + 1
  where id = v_form.id
    and organization_id = v_organization_id
  returning status, submitted_at into v_form.status, v_form.submitted_at;

  update public.intake_links
  set status = 'EXPIRED'
  where organization_id = v_organization_id
    and intake_form_id = v_form.id
    and status = 'ACTIVE';

  return jsonb_build_object(
    'formId', v_form.id,
    'status', v_form.status,
    'submittedAt', v_form.submitted_at
  );
end;
$$;

revoke all on function public.public_submit_intake_form(text, text, jsonb, boolean)
from public, anon, authenticated, service_role;

comment on function public.public_submit_intake_form(text, text, jsonb, boolean) is
  'Anonymous submission of the single intake form bound to a link token hash. Validates a bounded answers object (and requires privacy_acknowledged for CONSENT forms), transitions the PENDING form to SUBMITTED with answers preserved verbatim, submitted_via LINK and submitted_at stamped under a version bump, and expires the link. An already-submitted form is returned idempotently unchanged; wrong, expired, revoked, or foreign-organization tokens are indistinguishable NULLs. No audit event is written because the caller is anonymous; the form row is the record.';

create function public.mark_intake_form_paper(
  p_acting_branch_id uuid,
  p_form_id uuid,
  p_expected_version integer,
  p_reason text default null
)
returns table(form_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_reason text;
  v_form public.intake_forms%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_intake_permission_at_branch(
       p_acting_branch_id, 'intake.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');

  if p_form_id is null or p_expected_version is null or p_expected_version < 1
     or coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select form.* into v_form
  from public.intake_forms as form
  where form.id = p_form_id
    and form.organization_id = v_organization_id
    and form.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_form.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_form.status not in ('PENDING', 'SUBMITTED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.intake_forms
  set status = 'PRINTED',
      signed_by = v_actor_user_id,
      signed_at = pg_catalog.statement_timestamp(),
      submitted_via = 'PAPER',
      version = v_form.version + 1
  where id = p_form_id and organization_id = v_organization_id
  returning id, public.intake_forms.version into form_id, version;

  update public.intake_links
  set status = 'REVOKED'
  where organization_id = v_organization_id
    and intake_form_id = p_form_id
    and status = 'ACTIVE';

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INTAKE',
    'intake.form.printed', 'intake_form', p_form_id, v_form.patient_id,
    'SUCCESS', pg_catalog.jsonb_strip_nulls(
      jsonb_build_object('reason', v_reason)
    )
  );

  return next;
end;
$$;

revoke all on function public.mark_intake_form_paper(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.mark_intake_form_paper(uuid, uuid, integer, text) is
  'intake.manage-gated paper-sign alternative: moves a PENDING or SUBMITTED same-branch form to PRINTED under an optimistic version, stamping signed_by (the actor), signed_at, and submitted_via PAPER, and revoking every ACTIVE link so the digital surface closes. Appends one intake.form.printed audit event with bounded {reason} metadata (nulls stripped).';

create function public.list_intake_forms(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(
  form_id uuid,
  form_type text,
  template_version text,
  status text,
  submitted_via text,
  submitted_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_intake_permission_at_branch(
       p_acting_branch_id, 'intake.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    form.id,
    form.form_type,
    form.template_version,
    form.status,
    form.submitted_via,
    form.submitted_at,
    form.signed_at,
    form.created_at,
    form.version
  from public.intake_forms as form
  where form.organization_id = v_organization_id
    and form.branch_id = p_acting_branch_id
    and form.patient_id = p_patient_id
  order by form.created_at desc, form.id
  limit 100;
end;
$$;

revoke all on function public.list_intake_forms(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.list_intake_forms(uuid, uuid) is
  'intake.manage-gated bounded 100-row projection of same-branch intake forms for a same-tenant patient. Returns only form id, type, template version, status, submission/signing provenance and timestamps; never the answers body, and writes no audit event.';