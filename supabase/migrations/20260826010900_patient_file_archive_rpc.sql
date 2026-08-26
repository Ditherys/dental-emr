-- P4-06: AAL2-gated soft delete for patient file metadata. This RPC flips only
-- metadata status and appends one audit event; object-storage deletion is the
-- application service's job (P4-07). This object migration grants nothing.

create function public.archive_file(
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
  perform private.require_aal2();

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

  if v_file.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.file_objects
  set status = 'archived',
      archived_at = pg_catalog.statement_timestamp(),
      version = v_file.version + 1
  where id = v_file.id and organization_id = v_organization_id
  returning id, public.file_objects.version into file_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
    'patient.file.archived', 'file_object', file_id, v_file.patient_id,
    'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.archive_file(uuid, uuid, integer)
from public, anon, authenticated, service_role;
