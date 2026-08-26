-- P4-07: expose the opaque object key through the single-file metadata gate so
-- the server-only file service can verify stored objects and mint presigned
-- URLs strictly after this authorization check. The key stays an opaque UUID
-- path; checksums remain unexposed and browser roles keep no base-table
-- privileges. This object migration grants nothing.

drop function public.get_file_metadata(uuid, uuid);

create function public.get_file_metadata(
  p_acting_branch_id uuid,
  p_file_id uuid
)
returns table(
  file_id uuid,
  object_key text,
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

  select file_row.id, file_row.object_key, file_row.mime_type,
    file_row.size_bytes, file_row.status, file_row.version,
    file_row.created_at, file_row.uploaded_by
  into file_id, object_key, mime_type, size_bytes, status, version,
    created_at, uploaded_by
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
