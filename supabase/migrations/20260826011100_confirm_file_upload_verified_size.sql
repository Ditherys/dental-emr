-- P4-07 review fix: close the NULL-declared-size bypass. Confirmation now
-- takes a required server-verified size measured by the server-side storage
-- adapter (HEAD against the stored object) and persists it when the row
-- becomes available, and a table CHECK guarantees every available row carries
-- that persisted size. Declared sizes stop mattering entirely: no client-
-- supplied byte count is trusted anywhere in the confirm path. Authorization,
-- locking, optimistic versions, and atomic audit behavior are unchanged.
-- This object migration changes no privileges; it revokes the replaced and
-- replacement signatures adjacent to creation.

revoke all on function public.confirm_file_upload(uuid, uuid, integer)
from public, anon, authenticated, service_role;

create or replace function public.confirm_file_upload(
  p_acting_branch_id uuid,
  p_file_id uuid,
  p_expected_version integer,
  p_verified_size_bytes bigint
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

  if p_expected_version is null or p_expected_version < 1
     or p_verified_size_bytes is null or p_verified_size_bytes <= 0 then
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
      size_bytes = p_verified_size_bytes,
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

-- An available row always carries the size the server measured at confirm
-- time; pending/archived rows may still carry whatever history recorded.
alter table public.file_objects
  add constraint file_objects_available_size_check
  check (status <> 'available' or size_bytes is not null);

revoke all on function public.confirm_file_upload(uuid, uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function public.confirm_file_upload(uuid, uuid, integer, bigint)
from public, anon, authenticated, service_role;
