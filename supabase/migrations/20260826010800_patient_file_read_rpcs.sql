-- P4-05: bounded patient file metadata reads. The functions authorize metadata
-- only; presigned download URLs are minted by the application storage adapter
-- (P4-07) after authorizing against get_file_metadata. Reads write no audit
-- events. This object migration grants nothing.
--
-- Archived-patient behavior follows the patient directory convention
-- (search_patients/get_patient_detail): patient.status is not filtered here.
-- The p_include_archived flag governs archived FILE rows only; pending and
-- available rows always return because staff just uploaded the pending ones.
-- The fixed LIMIT 200 bounds result size against unbounded-result abuse while
-- comfortably exceeding any real single-patient attachment count.

create function public.list_patient_files(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_include_archived boolean default false
)
returns table(
  file_id uuid,
  mime_type text,
  size_bytes bigint,
  status text,
  version integer,
  created_at timestamptz,
  uploaded_by uuid
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
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_include_archived is null or p_patient_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select file_row.id, file_row.mime_type, file_row.size_bytes,
    file_row.status, file_row.version, file_row.created_at, file_row.uploaded_by
  from public.file_objects as file_row
  where file_row.organization_id = v_organization_id
    and file_row.patient_id = p_patient_id
    and (p_include_archived or file_row.status <> 'archived')
  order by file_row.created_at, file_row.id
  limit 200;
end;
$$;

revoke all on function public.list_patient_files(uuid, uuid, boolean)
from public, anon, authenticated, service_role;

create function public.get_file_metadata(
  p_acting_branch_id uuid,
  p_file_id uuid
)
returns table(
  file_id uuid,
  mime_type text,
  size_bytes bigint,
  status text,
  version integer,
  created_at timestamptz,
  uploaded_by uuid
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
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select file_row.id, file_row.mime_type, file_row.size_bytes,
    file_row.status, file_row.version, file_row.created_at, file_row.uploaded_by
  into file_id, mime_type, size_bytes, status, version, created_at, uploaded_by
  from public.file_objects as file_row
  where file_row.id = p_file_id
    and file_row.organization_id = v_organization_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return next;
end;
$$;

revoke all on function public.get_file_metadata(uuid, uuid)
from public, anon, authenticated, service_role;
