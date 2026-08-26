-- P4-04: bounded patient file upload RPCs. The functions authorize and version
-- file metadata only; presigned URLs are minted by the application storage
-- adapter (P4-07). This object migration grants nothing.
--
-- A pending row exists before any bytes are stored, and no client-supplied
-- size or checksum is trusted here, so those two columns must accept null
-- until the P4-07 server-side object verification records them. The existing
-- positive-size and checksum-format checks already treat null as unverified.

alter table public.file_objects
  alter column size_bytes drop not null,
  alter column checksum_sha256 drop not null;

create function public.create_file_upload(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_mime_type text,
  p_size_bytes bigint default null
)
returns table(file_id uuid, object_key text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_new_file_id uuid;
  v_patient_status text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not (
       private.has_patient_permission_at_branch(
         p_acting_branch_id, 'patient.demographics.write'
       )
       or private.can_manage_provider_configuration(v_organization_id)
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_mime_type is null
     or pg_catalog.btrim(p_mime_type) = ''
     or pg_catalog.length(p_mime_type) > 255
     or p_mime_type !~ '^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$'
     or (p_size_bytes is not null and p_size_bytes <= 0) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select patient.status
  into v_patient_status
  from public.patients as patient
  where patient.id = p_patient_id
    and patient.organization_id = v_organization_id
  for update;

  if v_patient_status is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_patient_status = 'archived' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_new_file_id := pg_catalog.gen_random_uuid();

  insert into public.file_objects (
    id, organization_id, patient_id, object_key, mime_type, size_bytes,
    uploaded_by
  ) values (
    v_new_file_id,
    v_organization_id,
    p_patient_id,
    'org/' || v_organization_id::text || '/patients/' || p_patient_id::text
      || '/files/' || v_new_file_id::text,
    p_mime_type,
    p_size_bytes,
    v_actor_user_id
  )
  returning id, public.file_objects.object_key, public.file_objects.version
    into file_id, object_key, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
    'patient.file.upload_created', 'file_object', file_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.create_file_upload(uuid, uuid, text, bigint)
from public, anon, authenticated, service_role;

create function public.confirm_file_upload(
  p_acting_branch_id uuid,
  p_file_id uuid,
  p_expected_version integer
)
returns table(file_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_file public.file_objects%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not (
       private.has_patient_permission_at_branch(
         p_acting_branch_id, 'patient.demographics.write'
       )
       or private.can_manage_provider_configuration(v_organization_id)
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select file_row.* into v_file
  from public.file_objects as file_row
  join public.patients as patient
    on patient.id = file_row.patient_id
   and patient.organization_id = file_row.organization_id
  where file_row.id = p_file_id
    and file_row.organization_id = v_organization_id
  for update of file_row;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_file.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_file.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.file_objects
  set status = 'available',
      version = v_file.version + 1
  where id = v_file.id and organization_id = v_organization_id
  returning id, public.file_objects.version into file_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
    'patient.file.confirmed', 'file_object', file_id, v_file.patient_id,
    'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.confirm_file_upload(uuid, uuid, integer)
from public, anon, authenticated, service_role;
