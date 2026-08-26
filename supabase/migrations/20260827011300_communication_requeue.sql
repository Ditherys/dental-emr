-- P8-05 follow-up: bounded manual requeue for FAILED communications. The
-- dashboard list deliberately masks recipients and omits bodies, so a retry
-- must copy the failed job's own stored content rather than re-accept content
-- from the browser. Fresh deterministic idempotency key per retry version
-- prevents a double-retry of the same version from duplicating a send.

create function public.requeue_communication(
  p_acting_branch_id uuid,
  p_communication_id uuid,
  p_expected_version integer
)
returns table(communication_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_comm public.communications%rowtype;
  v_new_id uuid;
  v_status text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_communication_permission_at_branch(
       p_acting_branch_id, 'communication.send'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_communication_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select communication.* into v_comm
  from public.communications as communication
  where communication.id = p_communication_id
    and communication.organization_id = v_organization_id
    and communication.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_comm.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_comm.status <> 'FAILED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  insert into public.communications (
    organization_id, branch_id, patient_id, appointment_id, channel,
    template_type, recipient, subject, body, provider_id, status,
    idempotency_key, attempts, max_attempts, next_attempt_at, scheduled_for
  ) values (
    v_comm.organization_id, v_comm.branch_id, v_comm.patient_id,
    v_comm.appointment_id, v_comm.channel, v_comm.template_type,
    v_comm.recipient, v_comm.subject, v_comm.body, v_comm.provider_id,
    'QUEUED',
    'requeue-' || v_comm.id || '-' || v_comm.version,
    0, v_comm.max_attempts, statement_timestamp(), v_comm.scheduled_for
  ) returning id into v_new_id;

  v_status := 'QUEUED';
  communication_id := v_new_id;
  status := v_status;
  return next;
end;
$$;

revoke all on function public.requeue_communication(uuid, uuid, integer)
from public, anon, authenticated, service_role;