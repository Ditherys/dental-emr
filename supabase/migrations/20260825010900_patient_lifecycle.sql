-- P2-08: AAL2-gated, recoverable patient lifecycle. This object migration grants nothing.

-- Replace the P2-05 search surface fail-closed so its default excludes archives.
revoke all on function public.search_patients(uuid, text, date, text, text, integer, integer)
from public, anon, authenticated, service_role;

create or replace function public.search_patients(
  p_acting_branch_id uuid, p_query text default null, p_birth_date date default null,
  p_status text default null, p_sort text default 'name_asc', p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_name_query text; v_mobile_query text; v_email_query text;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.read') then raise insufficient_privilege using message = 'not authorized'; end if;
  if coalesce(pg_catalog.length(p_query), 0) > 120 or (p_birth_date is not null and p_birth_date > current_date) or (p_status not in ('active', 'inactive', 'archived') and p_status is not null) or p_sort not in ('name_asc', 'name_desc', 'patient_number_asc', 'updated_desc') or p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then raise invalid_parameter_value using message = 'invalid input'; end if;
  v_name_query := private.normalize_patient_name(p_query); v_mobile_query := private.normalize_patient_mobile(p_query); v_email_query := private.normalize_patient_email(p_query);
  return (
    with matching_patients as (
      select patient.* from public.patients as patient
      where patient.organization_id = v_organization_id and ((p_status is null and patient.status <> 'archived') or patient.status = p_status) and (p_birth_date is null or patient.birth_date = p_birth_date)
        and (p_query is null or (coalesce(pg_catalog.length(v_name_query), 0) > 0 and pg_catalog.strpos(p_query, '%') = 0 and pg_catalog.strpos(p_query, '_') = 0 and pg_catalog.strpos(patient.normalized_full_name, v_name_query) > 0) or pg_catalog.lower(patient.patient_number) = pg_catalog.lower(pg_catalog.btrim(p_query)) or (v_mobile_query is not null and exists (select 1 from public.patient_contacts as contact where contact.organization_id = patient.organization_id and contact.patient_id = patient.id and contact.status = 'active' and contact.contact_type = 'MOBILE' and contact.normalized_value = v_mobile_query)) or (v_email_query is not null and exists (select 1 from public.patient_contacts as contact where contact.organization_id = patient.organization_id and contact.patient_id = patient.id and contact.status = 'active' and contact.contact_type = 'EMAIL' and contact.normalized_value = v_email_query)))
    ), numbered as (select patient.*, count(*) over () as total from matching_patients as patient), paged as (
      select numbered.* from numbered order by case when p_sort = 'name_asc' then normalized_last_name end asc, case when p_sort = 'name_desc' then normalized_last_name end desc, case when p_sort in ('name_asc', 'name_desc') then normalized_first_name end asc, case when p_sort = 'patient_number_asc' then patient_number end asc, case when p_sort = 'updated_desc' then updated_at end desc, patient_number asc, id asc limit p_page_size offset (p_page - 1) * p_page_size
    ) select jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object('patientId', paged.id, 'patientNumber', paged.patient_number, 'displayName', concat_ws(' ', paged.first_name, paged.middle_name, paged.last_name, paged.suffix), 'birthDate', paged.birth_date, 'primaryMobile', mobile.value, 'primaryEmail', email.value, 'status', paged.status)), '[]'::jsonb), 'total', coalesce(max(paged.total), 0), 'page', p_page, 'pageSize', p_page_size)
    from paged
    left join lateral (select contact.value from public.patient_contacts as contact where contact.organization_id = paged.organization_id and contact.patient_id = paged.id and contact.contact_type = 'MOBILE' and contact.status = 'active' and contact.is_primary) as mobile on true
    left join lateral (select contact.value from public.patient_contacts as contact where contact.organization_id = paged.organization_id and contact.patient_id = paged.id and contact.contact_type = 'EMAIL' and contact.status = 'active' and contact.is_primary) as email on true
  );
end;
$$;

revoke all on function public.search_patients(uuid, text, date, text, text, integer, integer)
from public, anon, authenticated, service_role;

create or replace function public.archive_patient(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_expected_version integer
)
returns table(patient_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_patient public.patients%rowtype;
begin
  perform private.require_aal2();

  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select patient.* into v_patient
  from public.patients as patient
  where patient.id = p_patient_id and patient.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_patient.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_patient.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.patients
  set status = 'archived',
      archived_at = pg_catalog.statement_timestamp(),
      version = v_patient.version + 1
  where id = v_patient.id and organization_id = v_organization_id
  returning id, public.patients.version into patient_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result
  ) values (
    v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT',
    'patient.archived', 'patient', patient_id, patient_id, 'SUCCESS'
  );
  return next;
end;
$$;

revoke all on function public.archive_patient(uuid, uuid, integer)
from public, anon, authenticated, service_role;

create or replace function public.reactivate_patient(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_expected_version integer
)
returns table(patient_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_patient public.patients%rowtype;
begin
  perform private.require_aal2();

  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select patient.* into v_patient
  from public.patients as patient
  where patient.id = p_patient_id and patient.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_patient.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_patient.status <> 'archived' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.patients
  set status = 'active',
      archived_at = null,
      version = v_patient.version + 1
  where id = v_patient.id and organization_id = v_organization_id
  returning id, public.patients.version into patient_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result
  ) values (
    v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT',
    'patient.reactivated', 'patient', patient_id, patient_id, 'SUCCESS'
  );
  return next;
end;
$$;

revoke all on function public.reactivate_patient(uuid, uuid, integer)
from public, anon, authenticated, service_role;
