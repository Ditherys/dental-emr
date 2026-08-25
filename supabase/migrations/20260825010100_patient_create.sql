-- P2-04: private patient-number allocation and narrow duplicate/create RPCs.
-- This object migration grants nothing.

create table private.patient_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  last_number integer not null default 0,
  constraint patient_number_counters_last_number_check check (last_number >= 0)
);

revoke all on table private.patient_number_counters
from public, anon, authenticated, service_role;

create or replace function private.has_patient_permission_at_branch(
  target_branch_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_permission_code in (
    'patient.demographics.read',
    'patient.demographics.write'
  ) and exists (
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
     and permission.code = target_permission_code
    where branch.id = target_branch_id
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

revoke all on function private.has_patient_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

create or replace function private.patient_duplicate_review(
  target_organization_id uuid,
  target_first_name text,
  target_last_name text,
  target_birth_date date,
  target_mobile text,
  target_email text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with signals as (
    select patient.id as patient_id, 'NAME_DOB'::text as signal
    from public.patients as patient
    where patient.organization_id = target_organization_id
      and patient.normalized_first_name = private.normalize_patient_name(target_first_name)
      and patient.normalized_last_name = private.normalize_patient_name(target_last_name)
      and patient.birth_date = target_birth_date
    union all
    select contact.patient_id, 'MOBILE'::text
    from public.patient_contacts as contact
    where target_mobile is not null
      and contact.organization_id = target_organization_id
      and contact.status = 'active'
      and contact.contact_type = 'MOBILE'
      and contact.normalized_value = target_mobile
    union all
    select contact.patient_id, 'EMAIL'::text
    from public.patient_contacts as contact
    where target_email is not null
      and contact.organization_id = target_organization_id
      and contact.status = 'active'
      and contact.contact_type = 'EMAIL'
      and contact.normalized_value = target_email
  ), candidates as (
    select
      patient.id,
      patient.patient_number,
      concat_ws(' ', patient.first_name, patient.middle_name, patient.last_name, patient.suffix) as display_name,
      patient.birth_date,
      patient.status,
      array_agg(distinct signals.signal order by signals.signal) as matched_signals
    from signals
    join public.patients as patient on patient.id = signals.patient_id
    group by patient.id, patient.patient_number, patient.first_name, patient.middle_name,
      patient.last_name, patient.suffix, patient.birth_date, patient.status
  ), ordered as (
    select *, count(*) over () as candidate_count,
      case status when 'active' then 1 when 'inactive' then 2 else 3 end as status_rank
    from candidates
    order by status_rank, patient_number, id
    limit 10
  )
  select jsonb_build_object(
    'candidates', coalesce(jsonb_agg(jsonb_build_object(
      'patientId', id,
      'patientNumber', patient_number,
      'displayName', display_name,
      'birthDate', birth_date,
      'status', status,
      'matchedSignals', matched_signals
    ) order by status_rank, patient_number, id), '[]'::jsonb),
    'truncated', coalesce(max(candidate_count) > 10, false)
  )
  from ordered;
$$;

revoke all on function private.patient_duplicate_review(uuid, text, text, date, text, text)
from public, anon, authenticated, service_role;

create or replace function public.find_duplicate_candidates(
  p_acting_branch_id uuid,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_initial_mobile text default null,
  p_initial_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  normalized_mobile text;
  normalized_email text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null
     or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_first_name is null or pg_catalog.btrim(p_first_name) = ''
     or p_last_name is null or pg_catalog.btrim(p_last_name) = ''
     or p_birth_date is null or p_birth_date < date '1900-01-01'
     or p_birth_date > current_date then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_initial_mobile is not null then
    normalized_mobile := private.normalize_patient_mobile(p_initial_mobile);
    if normalized_mobile is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if p_initial_email is not null then
    normalized_email := private.normalize_patient_email(p_initial_email);
    if normalized_email is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  return private.patient_duplicate_review(
    v_organization_id, p_first_name, p_last_name, p_birth_date,
    normalized_mobile, normalized_email
  );
end;
$$;

revoke all on function public.find_duplicate_candidates(uuid, text, text, date, text, text)
from public, anon, authenticated, service_role;

create or replace function public.create_patient(
  p_acting_branch_id uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_preferred_name text,
  p_birth_date date,
  p_sex_at_registration text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_preferred_branch_id uuid,
  p_initial_mobile text,
  p_initial_email text,
  p_duplicate_confirmed boolean
)
returns table(patient_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  actor_user_id uuid := (select auth.uid());
  normalized_mobile text;
  normalized_email text;
  duplicate_review jsonb;
  patient_number text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or actor_user_id is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_first_name is null or pg_catalog.btrim(p_first_name) = ''
     or pg_catalog.length(p_first_name) > 120
     or private.normalize_patient_name(p_first_name) is null
     or p_last_name is null or pg_catalog.btrim(p_last_name) = ''
     or pg_catalog.length(p_last_name) > 120
     or private.normalize_patient_name(p_last_name) is null
     or p_birth_date is null or p_birth_date < date '1900-01-01'
     or p_birth_date > current_date
     or p_duplicate_confirmed is null
     or coalesce(pg_catalog.length(p_middle_name), 0) > 120
     or coalesce(pg_catalog.length(p_suffix), 0) > 40
     or coalesce(pg_catalog.length(p_preferred_name), 0) > 120
     or coalesce(pg_catalog.length(p_address_line1), 0) > 160
     or coalesce(pg_catalog.length(p_address_line2), 0) > 160
     or coalesce(pg_catalog.length(p_city), 0) > 100
     or coalesce(pg_catalog.length(p_province), 0) > 100
     or coalesce(pg_catalog.length(p_postal_code), 0) > 20
     or (p_sex_at_registration is not null and p_sex_at_registration not in ('female', 'male', 'intersex', 'unknown', 'not_recorded')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_initial_mobile is not null then
    normalized_mobile := private.normalize_patient_mobile(p_initial_mobile);
    if normalized_mobile is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  end if;
  if p_initial_email is not null then
    normalized_email := private.normalize_patient_email(p_initial_email);
    if normalized_email is null then raise invalid_parameter_value using message = 'invalid input'; end if;
  end if;

  if p_preferred_branch_id is not null then
    if not exists (
      select 1
      from public.branches as preferred_branch
      where preferred_branch.id = p_preferred_branch_id
        and preferred_branch.organization_id = v_organization_id
        and preferred_branch.status = 'active'
    ) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    if p_preferred_branch_id <> p_acting_branch_id
       and not private.has_patient_permission_at_branch(
         p_preferred_branch_id, 'patient.demographics.write'
       ) then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text, 1)
  );

  duplicate_review := private.patient_duplicate_review(
    v_organization_id, p_first_name, p_last_name, p_birth_date,
    normalized_mobile, normalized_email
  );
  if not p_duplicate_confirmed
     and jsonb_array_length(duplicate_review -> 'candidates') > 0 then
    raise exception using errcode = 'P0001', message = 'duplicate review required';
  end if;

  insert into private.patient_number_counters (organization_id, last_number)
  values (v_organization_id, 1)
  on conflict (organization_id) do update
  set last_number = private.patient_number_counters.last_number + 1
  returning 'P-' || pg_catalog.lpad(last_number::text, 6, '0') into patient_number;

  insert into public.patients (
    organization_id, patient_number, first_name, middle_name, last_name, suffix,
    preferred_name, birth_date, sex_at_registration, address_line1, address_line2,
    city, province, postal_code, preferred_branch_id, created_by_user_id
  ) values (
    v_organization_id, patient_number, pg_catalog.btrim(p_first_name), nullif(pg_catalog.btrim(p_middle_name), ''),
    pg_catalog.btrim(p_last_name), nullif(pg_catalog.btrim(p_suffix), ''),
    nullif(pg_catalog.btrim(p_preferred_name), ''), p_birth_date, p_sex_at_registration,
    nullif(pg_catalog.btrim(p_address_line1), ''), nullif(pg_catalog.btrim(p_address_line2), ''),
    nullif(pg_catalog.btrim(p_city), ''), nullif(pg_catalog.btrim(p_province), ''),
    nullif(pg_catalog.btrim(p_postal_code), ''), p_preferred_branch_id, actor_user_id
  ) returning id, public.patients.version into patient_id, version;

  if p_initial_mobile is not null then
    insert into public.patient_contacts (
      organization_id, patient_id, contact_type, value, is_primary
    ) values (v_organization_id, patient_id, 'MOBILE', normalized_mobile, true);
  end if;
  if p_initial_email is not null then
    insert into public.patient_contacts (
      organization_id, patient_id, contact_type, value, is_primary
    ) values (v_organization_id, patient_id, 'EMAIL', normalized_email, true);
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result
  ) values (
    v_organization_id, p_acting_branch_id, actor_user_id, 'USER', 'PATIENT',
    case when p_duplicate_confirmed and jsonb_array_length(duplicate_review -> 'candidates') > 0
      then 'patient.created_duplicate_override' else 'patient.created' end,
    'patient', patient_id, patient_id, 'SUCCESS'
  );
  return next;
end;
$$;

revoke all on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean)
from public, anon, authenticated, service_role;
