-- P16-02: treatment plan RPC boundaries. All twelve functions are SECURITY
-- DEFINER with an empty search_path, derive the tenant from an active acting
-- branch, gate on patient.clinical.write (mutations) or patient.clinical.read
-- (bounded projections) through the shared clinical permission helper, and
-- carry one atomic audit event per mutation. DRAFT plans are editable; a
-- PRESENTED plan becomes immutable after ACKNOWLEDGED, backed by the
-- treatment_plans immutable trigger. Discussions are append-only on any status
-- and always capture provider/time/context. This object migration grants
-- nothing; the 20260827013401 terminal owns the only browser-reachable grants.

create function public.create_treatment_plan(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_title text
)
returns table(plan_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null
     or p_title is null
     or pg_catalog.btrim(p_title) = ''
     or pg_catalog.length(p_title) > 200 then
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

  insert into public.treatment_plans (
    organization_id, patient_id, title, status, created_by
  ) values (
    v_organization_id, p_patient_id, pg_catalog.btrim(p_title), 'DRAFT', v_actor_user_id
  ) returning id, public.treatment_plans.version into plan_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.created', 'treatment_plan', plan_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_treatment_plan(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.create_treatment_plan(uuid, uuid, text) is
  'Creates a DRAFT treatment plan for a same-tenant patient under clinical.write and audits it atomically.';

create function public.update_treatment_plan(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_title text
)
returns table(plan_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1
     or p_title is null
     or pg_catalog.btrim(p_title) = ''
     or pg_catalog.length(p_title) > 200 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.treatment_plans
  set title = pg_catalog.btrim(p_title), version = v_plan.version + 1
  where id = p_plan_id and organization_id = v_organization_id
  returning id, public.treatment_plans.version into plan_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.updated', 'treatment_plan', p_plan_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_treatment_plan(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.update_treatment_plan(uuid, uuid, integer, text) is
  'Edits a DRAFT same-tenant plan under clinical.write with an optimistic version and audits it atomically; PRESENTED/ACKNOWLEDGED plans are rejected.';

create function public.present_treatment_plan(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer
)
returns table(plan_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.treatment_plans
  set status = 'PRESENTED', version = v_plan.version + 1
  where id = p_plan_id and organization_id = v_organization_id
  returning id, public.treatment_plans.version into plan_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.presented', 'treatment_plan', p_plan_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.present_treatment_plan(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.present_treatment_plan(uuid, uuid, integer) is
  'Moves a DRAFT plan to PRESENTED under clinical.write with an optimistic version and audits it atomically.';

create function public.acknowledge_treatment_plan(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer
)
returns table(plan_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'PRESENTED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.treatment_plans
  set status = 'ACKNOWLEDGED', version = v_plan.version + 1
  where id = p_plan_id and organization_id = v_organization_id
  returning id, public.treatment_plans.version into plan_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.acknowledged', 'treatment_plan', p_plan_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.acknowledge_treatment_plan(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.acknowledge_treatment_plan(uuid, uuid, integer) is
  'Moves a PRESENTED plan to ACKNOWLEDGED under clinical.write; the immutable trigger then rejects any later UPDATE or DELETE.';

create function public.add_treatment_plan_item(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee numeric default null
)
returns table(item_id uuid, line_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_line_no integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1
     or p_description is null
     or pg_catalog.btrim(p_description) = ''
     or pg_catalog.length(p_description) > 2000
     or (p_tooth_code is not null and not (
       p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
     ))
     or (p_estimated_fee is not null and not (
       p_estimated_fee >= 0 and p_estimated_fee <= 999999999
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1
    from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select coalesce(max(item.line_no), 0) + 1 into v_line_no
  from public.treatment_plan_items as item
  where item.organization_id = v_organization_id
    and item.plan_id = p_plan_id;

  insert into public.treatment_plan_items (
    organization_id, plan_id, line_no, procedure_id, tooth_code,
    description, estimated_fee
  ) values (
    v_organization_id, p_plan_id, v_line_no, p_procedure_id, p_tooth_code,
    pg_catalog.btrim(p_description), p_estimated_fee
  ) returning id, public.treatment_plan_items.line_no into item_id, line_no;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_added', 'treatment_plan_item', item_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric)
from public, anon, authenticated, service_role;

comment on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric) is
  'Appends the next line to a DRAFT plan under clinical.write with validated FDI tooth, org-scoped procedure, and bounded fee, and audits it atomically.';

create function public.update_treatment_plan_item(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee numeric default null
)
returns table(item_id uuid, line_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_item public.treatment_plan_items%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_item_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_description is null
     or pg_catalog.btrim(p_description) = ''
     or pg_catalog.length(p_description) > 2000
     or (p_tooth_code is not null and not (
       p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
     ))
     or (p_estimated_fee is not null and not (
       p_estimated_fee >= 0 and p_estimated_fee <= 999999999
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1
    from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
    and item.plan_id = p_plan_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  update public.treatment_plan_items
  set procedure_id = p_procedure_id,
      tooth_code = p_tooth_code,
      description = pg_catalog.btrim(p_description),
      estimated_fee = p_estimated_fee
  where id = p_item_id and organization_id = v_organization_id
  returning id, public.treatment_plan_items.line_no into item_id, line_no;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_updated', 'treatment_plan_item', p_item_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric)
from public, anon, authenticated, service_role;

comment on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric) is
  'Edits a line item on a DRAFT plan under clinical.write with the same bounded validation and audits it atomically.';

create function public.remove_treatment_plan_item(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_item_id uuid,
  p_expected_version integer
)
returns table(item_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_item public.treatment_plan_items%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_item_id is null
     or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
    and item.plan_id = p_plan_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  delete from public.treatment_plan_items
  where id = p_item_id and organization_id = v_organization_id
  returning id into item_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_removed', 'treatment_plan_item', p_item_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.remove_treatment_plan_item(uuid, uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.remove_treatment_plan_item(uuid, uuid, uuid, integer) is
  'Removes a line item from a DRAFT plan under clinical.write and audits it atomically.';

create function public.add_treatment_plan_alternative(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_summary text
)
returns table(alternative_id uuid, alternative_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_alternative_no integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1
     or p_summary is null
     or pg_catalog.btrim(p_summary) = ''
     or pg_catalog.length(p_summary) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select coalesce(max(alternative.alternative_no), 0) + 1 into v_alternative_no
  from public.treatment_plan_alternatives as alternative
  where alternative.organization_id = v_organization_id
    and alternative.plan_id = p_plan_id;

  insert into public.treatment_plan_alternatives (
    organization_id, plan_id, alternative_no, summary
  ) values (
    v_organization_id, p_plan_id, v_alternative_no, pg_catalog.btrim(p_summary)
  ) returning id, public.treatment_plan_alternatives.alternative_no
    into alternative_id, alternative_no;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.alternative_added', 'treatment_plan_alternative', alternative_id,
    v_plan.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.add_treatment_plan_alternative(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.add_treatment_plan_alternative(uuid, uuid, integer, text) is
  'Appends the next alternative to a DRAFT plan under clinical.write and audits it atomically.';

create function public.add_treatment_plan_discussion(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_treating_provider_id uuid default null,
  p_context text default null,
  p_notes text default null
)
returns table(discussion_id uuid, discussed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_patient_id uuid;
  v_discussed_at timestamptz := pg_catalog.statement_timestamp();
  v_notes text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_notes), '');

  if p_plan_id is null
     or p_context is null
     or pg_catalog.btrim(p_context) = ''
     or pg_catalog.length(p_context) > 200
     or coalesce(pg_catalog.length(v_notes), 0) > 4000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_treating_provider_id is not null and not exists (
    select 1
    from public.providers as provider
    where provider.id = p_treating_provider_id
      and provider.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.patient_id into v_patient_id
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.treatment_plan_discussions (
    organization_id, plan_id, discussed_by, treating_provider_id,
    discussed_at, context, notes
  ) values (
    v_organization_id, p_plan_id, v_actor_user_id, p_treating_provider_id,
    v_discussed_at, pg_catalog.btrim(p_context), v_notes
  ) returning id, public.treatment_plan_discussions.discussed_at
    into discussion_id, discussed_at;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.discussion_added', 'treatment_plan_discussion', discussion_id,
    v_patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text)
from public, anon, authenticated, service_role;

comment on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text) is
  'Appends a discussion to a plan in any status under clinical.write, always capturing the provider, discussed_at, and bounded context, and audits it atomically.';

create function public.save_treatment_plan_drawing(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_drawing jsonb
)
returns table(drawing_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1
     or jsonb_typeof(p_drawing) <> 'object'
     or pg_catalog.pg_column_size(p_drawing) > 65536 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status = 'ACKNOWLEDGED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.treatment_plan_drawings (
    organization_id, plan_id, drawing, updated_by, version
  ) values (
    v_organization_id, p_plan_id, p_drawing, v_actor_user_id, 1
  )
  on conflict (organization_id, plan_id) do update
    set drawing = excluded.drawing,
        updated_by = excluded.updated_by,
        updated_at = pg_catalog.statement_timestamp(),
        version = public.treatment_plan_drawings.version + 1
  returning id, public.treatment_plan_drawings.version into drawing_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.drawing_saved', 'treatment_plan_drawing', drawing_id,
    v_plan.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb) is
  'Upserts the bounded renderer-independent drawing canvas on a DRAFT/PRESENTED plan under clinical.write with an optimistic version; ACKNOWLEDGED plans are rejected as immutable.';

create function public.list_treatment_plans(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(
  plan_id uuid,
  title text,
  status text,
  version integer,
  created_at timestamptz,
  item_count integer,
  has_drawing boolean
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
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
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
    plan.id,
    plan.title,
    plan.status,
    plan.version,
    plan.created_at,
    coalesce(item_counts.item_count, 0),
    coalesce(drawing_count.has_drawing, false)
  from public.treatment_plans as plan
  left join lateral (
    select count(*)::integer as item_count
    from public.treatment_plan_items as item
    where item.organization_id = plan.organization_id
      and item.plan_id = plan.id
  ) as item_counts on true
  left join lateral (
    select true as has_drawing
    from public.treatment_plan_drawings as drawing
    where drawing.organization_id = plan.organization_id
      and drawing.plan_id = plan.id
    limit 1
  ) as drawing_count on true
  where plan.organization_id = v_organization_id
    and plan.patient_id = p_patient_id
  order by plan.created_at desc, plan.id
  limit 100;
end;
$$;

revoke all on function public.list_treatment_plans(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.list_treatment_plans(uuid, uuid) is
  'Bounded treatment-plan projection for a same-tenant patient under clinical.read: plan id/title/status/version/created_at plus item_count and drawing presence, with no item, alternative, or discussion bodies and no audit event.';

create function public.get_treatment_plan_detail(
  p_acting_branch_id uuid,
  p_plan_id uuid
)
returns jsonb
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
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.treatment_plans as plan
    where plan.id = p_plan_id
      and plan.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return (
    select jsonb_build_object(
      'plan', jsonb_build_object(
        'planId', plan.id,
        'patientId', plan.patient_id,
        'title', plan.title,
        'status', plan.status,
        'version', plan.version,
        'createdAt', plan.created_at,
        'updatedAt', plan.updated_at,
        'createdBy', plan.created_by
      ),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemId', item.id,
          'lineNo', item.line_no,
          'procedureId', item.procedure_id,
          'toothCode', item.tooth_code,
          'description', item.description,
          'estimatedFee', item.estimated_fee,
          'createdAt', item.created_at
        ) order by item.line_no, item.id)
        from public.treatment_plan_items as item
        where item.organization_id = plan.organization_id
          and item.plan_id = plan.id
        limit 200
      ), '[]'::jsonb),
      'alternatives', coalesce((
        select jsonb_agg(jsonb_build_object(
          'alternativeId', alternative.id,
          'alternativeNo', alternative.alternative_no,
          'summary', alternative.summary,
          'createdAt', alternative.created_at
        ) order by alternative.alternative_no, alternative.id)
        from public.treatment_plan_alternatives as alternative
        where alternative.organization_id = plan.organization_id
          and alternative.plan_id = plan.id
        limit 100
      ), '[]'::jsonb),
      'discussions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'discussionId', discussion.id,
          'discussedBy', discussion.discussed_by,
          'treatingProviderId', discussion.treating_provider_id,
          'discussedAt', discussion.discussed_at,
          'context', discussion.context,
          'notes', discussion.notes,
          'createdAt', discussion.created_at
        ) order by discussion.discussed_at, discussion.id)
        from public.treatment_plan_discussions as discussion
        where discussion.organization_id = plan.organization_id
          and discussion.plan_id = plan.id
        limit 200
      ), '[]'::jsonb),
      'drawing', (
        select jsonb_build_object(
          'drawingId', drawing.id,
          'drawing', drawing.drawing,
          'updatedBy', drawing.updated_by,
          'updatedAt', drawing.updated_at,
          'version', drawing.version
        )
        from public.treatment_plan_drawings as drawing
        where drawing.organization_id = plan.organization_id
          and drawing.plan_id = plan.id
        limit 1
      )
    )
    from public.treatment_plans as plan
    where plan.id = p_plan_id
      and plan.organization_id = v_organization_id
  );
end;
$$;

revoke all on function public.get_treatment_plan_detail(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_treatment_plan_detail(uuid, uuid) is
  'Bounded same-tenant plan detail under clinical.read: the plan projection, items, alternatives, discussion history (provider/time/context), and the drawing canvas; no audit event.';