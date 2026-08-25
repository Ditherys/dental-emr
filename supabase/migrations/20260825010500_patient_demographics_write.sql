-- P2-06: optimistic demographics PATCH update. This object migration grants nothing.

create or replace function public.update_patient(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_duplicate_confirmed boolean
)
returns table(patient_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_patient public.patients%rowtype;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_suffix text;
  v_preferred_name text;
  v_birth_date date;
  v_sex_at_registration text;
  v_address_line1 text;
  v_address_line2 text;
  v_city text;
  v_province text;
  v_postal_code text;
  v_preferred_branch_id uuid;
  v_name_dob_changed boolean;
  v_has_duplicate boolean;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or p_duplicate_confirmed is null
     or jsonb_typeof(p_patch) <> 'object'
     or p_patch ?| array[
       'organizationId', 'patientNumber', 'createdByUserId', 'status', 'version',
       'archivedAt', 'id', 'patientId', 'actorUserId', 'auditAction'
     ]
     or not (p_patch ?| array[
       'firstName', 'middleName', 'lastName', 'suffix', 'preferredName', 'birthDate',
       'sexAtRegistration', 'addressLine1', 'addressLine2', 'city', 'province',
       'postalCode', 'preferredBranchId'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_patch) as key
       where key not in (
         'firstName', 'middleName', 'lastName', 'suffix', 'preferredName', 'birthDate',
         'sexAtRegistration', 'addressLine1', 'addressLine2', 'city', 'province',
         'postalCode', 'preferredBranchId'
       )
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text, 1)
  );

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

  if p_patch ? 'firstName' then
    if jsonb_typeof(p_patch -> 'firstName') <> 'string' then raise invalid_parameter_value using message = 'invalid input'; end if;
    v_first_name := pg_catalog.btrim(p_patch ->> 'firstName');
  else v_first_name := v_patient.first_name; end if;
  if p_patch ? 'lastName' then
    if jsonb_typeof(p_patch -> 'lastName') <> 'string' then raise invalid_parameter_value using message = 'invalid input'; end if;
    v_last_name := pg_catalog.btrim(p_patch ->> 'lastName');
  else v_last_name := v_patient.last_name; end if;
  if p_patch ? 'birthDate' then
    if jsonb_typeof(p_patch -> 'birthDate') <> 'string' or (p_patch ->> 'birthDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise invalid_parameter_value using message = 'invalid input'; end if;
    begin v_birth_date := (p_patch ->> 'birthDate')::date; exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
  else v_birth_date := v_patient.birth_date; end if;

  if v_first_name = '' or length(v_first_name) > 120 or private.normalize_patient_name(v_first_name) is null
     or v_last_name = '' or length(v_last_name) > 120 or private.normalize_patient_name(v_last_name) is null
     or v_birth_date < date '1900-01-01' or v_birth_date > current_date then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_middle_name := case when p_patch ? 'middleName' then nullif(pg_catalog.btrim(p_patch ->> 'middleName'), '') else v_patient.middle_name end;
  v_suffix := case when p_patch ? 'suffix' then nullif(pg_catalog.btrim(p_patch ->> 'suffix'), '') else v_patient.suffix end;
  v_preferred_name := case when p_patch ? 'preferredName' then nullif(pg_catalog.btrim(p_patch ->> 'preferredName'), '') else v_patient.preferred_name end;
  v_sex_at_registration := case when p_patch ? 'sexAtRegistration' then p_patch ->> 'sexAtRegistration' else v_patient.sex_at_registration end;
  v_address_line1 := case when p_patch ? 'addressLine1' then nullif(pg_catalog.btrim(p_patch ->> 'addressLine1'), '') else v_patient.address_line1 end;
  v_address_line2 := case when p_patch ? 'addressLine2' then nullif(pg_catalog.btrim(p_patch ->> 'addressLine2'), '') else v_patient.address_line2 end;
  v_city := case when p_patch ? 'city' then nullif(pg_catalog.btrim(p_patch ->> 'city'), '') else v_patient.city end;
  v_province := case when p_patch ? 'province' then nullif(pg_catalog.btrim(p_patch ->> 'province'), '') else v_patient.province end;
  v_postal_code := case when p_patch ? 'postalCode' then nullif(pg_catalog.btrim(p_patch ->> 'postalCode'), '') else v_patient.postal_code end;

  if (p_patch ? 'middleName' and jsonb_typeof(p_patch -> 'middleName') not in ('string', 'null'))
     or (p_patch ? 'suffix' and jsonb_typeof(p_patch -> 'suffix') not in ('string', 'null'))
     or (p_patch ? 'preferredName' and jsonb_typeof(p_patch -> 'preferredName') not in ('string', 'null'))
     or (p_patch ? 'sexAtRegistration' and jsonb_typeof(p_patch -> 'sexAtRegistration') not in ('string', 'null'))
     or (p_patch ? 'addressLine1' and jsonb_typeof(p_patch -> 'addressLine1') not in ('string', 'null'))
     or (p_patch ? 'addressLine2' and jsonb_typeof(p_patch -> 'addressLine2') not in ('string', 'null'))
     or (p_patch ? 'city' and jsonb_typeof(p_patch -> 'city') not in ('string', 'null'))
     or (p_patch ? 'province' and jsonb_typeof(p_patch -> 'province') not in ('string', 'null'))
     or (p_patch ? 'postalCode' and jsonb_typeof(p_patch -> 'postalCode') not in ('string', 'null'))
     or coalesce(length(v_middle_name), 0) > 120 or coalesce(length(v_suffix), 0) > 40
     or coalesce(length(v_preferred_name), 0) > 120 or coalesce(length(v_address_line1), 0) > 160
     or coalesce(length(v_address_line2), 0) > 160 or coalesce(length(v_city), 0) > 100
     or coalesce(length(v_province), 0) > 100 or coalesce(length(v_postal_code), 0) > 20
     or (v_sex_at_registration is not null and v_sex_at_registration not in ('female', 'male', 'intersex', 'unknown', 'not_recorded')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_patch ? 'preferredBranchId' then
    if jsonb_typeof(p_patch -> 'preferredBranchId') = 'null' then
      v_preferred_branch_id := null;
    elsif jsonb_typeof(p_patch -> 'preferredBranchId') = 'string' then
      begin v_preferred_branch_id := (p_patch ->> 'preferredBranchId')::uuid; exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
      if not exists (select 1 from public.branches as branch where branch.id = v_preferred_branch_id and branch.organization_id = v_organization_id and branch.status = 'active') then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      if not private.has_patient_permission_at_branch(v_preferred_branch_id, 'patient.demographics.write') then
        raise insufficient_privilege using message = 'not authorized';
      end if;
    else
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    v_preferred_branch_id := v_patient.preferred_branch_id;
  end if;

  v_name_dob_changed := private.normalize_patient_name(v_first_name) <> v_patient.normalized_first_name
    or private.normalize_patient_name(v_last_name) <> v_patient.normalized_last_name
    or v_birth_date <> v_patient.birth_date;
  v_has_duplicate := false;
  if v_name_dob_changed then
    select exists (
      select 1 from public.patients as candidate
      where candidate.organization_id = v_organization_id and candidate.id <> v_patient.id
        and candidate.normalized_first_name = private.normalize_patient_name(v_first_name)
        and candidate.normalized_last_name = private.normalize_patient_name(v_last_name)
        and candidate.birth_date = v_birth_date
    ) into v_has_duplicate;
    if v_has_duplicate and not p_duplicate_confirmed then
      raise exception using errcode = 'P0001', message = 'duplicate review required';
    end if;
  end if;

  update public.patients set
    first_name = v_first_name, middle_name = v_middle_name, last_name = v_last_name,
    suffix = v_suffix, preferred_name = v_preferred_name, birth_date = v_birth_date,
    sex_at_registration = v_sex_at_registration, address_line1 = v_address_line1,
    address_line2 = v_address_line2, city = v_city, province = v_province,
    postal_code = v_postal_code, preferred_branch_id = v_preferred_branch_id,
    version = v_patient.version + 1
  where id = v_patient.id and organization_id = v_organization_id
  returning id, public.patients.version into patient_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result
  ) values (
    v_organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT',
    case when v_has_duplicate then 'patient.demographics.updated_duplicate_override' else 'patient.demographics.updated' end,
    'patient', patient_id, patient_id, 'SUCCESS'
  );
  return next;
end;
$$;

revoke all on function public.update_patient(uuid, uuid, integer, jsonb, boolean)
from public, anon, authenticated, service_role;
