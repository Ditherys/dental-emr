-- P8-03: communication RPC boundaries and appointment automation triggers.
-- Six browser/worker RPCs plus three internal SECURITY DEFINER helpers and one
-- appointment trigger function. Enqueuing is a durable INSERT inside the
-- appointment transaction so external sending never blocks the appointment
-- save; cancellation/rescheduling cancels obsolete queued jobs; a worker
-- claims due jobs with FOR UPDATE SKIP LOCKED and acknowledges or fails them
-- without ever blocking the appointment transaction. This object migration
-- grants nothing and opens no RLS policy; the 20260827011201 terminal owns the
-- only browser-reachable grants.
--
-- The P8-02 communications table carried no optimistic-version column, so this
-- migration adds one; the P8-03 cancel/retry boundaries use it for stale-write
-- rejection exactly like every other versioned table in the baseline.

alter table public.communications
  add column version integer not null default 1,
  add constraint communications_version_positive_check check (version > 0);

comment on column public.communications.version is
  'Optimistic concurrency version for cancel/acknowledge/fail transitions; bumped on every status write.';

create or replace function private.has_communication_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('communication.view', 'communication.send') and exists (
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
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
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

revoke all on function private.has_communication_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_communication_permission_at_branch(uuid, text) is
  'Current-user communication permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

-- Server-internal automation path: enqueues a durable job with a unique
-- organization idempotency key. No permission check here — the trigger and the
-- public RPC boundary own authorization.
create function private.enqueue_communication_internal(
  p_organization_id uuid,
  p_branch_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid,
  p_channel text,
  p_template_type text,
  p_recipient text,
  p_body text,
  p_idempotency_key text,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_channel is null or p_channel not in ('EMAIL', 'SMS')
     or p_template_type is null or p_template_type not in ('CONFIRMATION', 'REMINDER', 'RESCHEDULE', 'CANCELLATION')
     or p_recipient is null or pg_catalog.btrim(p_recipient) = '' or pg_catalog.length(p_recipient) > 320
     or p_body is null or pg_catalog.btrim(p_body) = '' or pg_catalog.length(p_body) > 4000
     or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) < 1 or pg_catalog.length(p_idempotency_key) > 128 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.communications (
    organization_id, branch_id, patient_id, appointment_id, channel, template_type,
    recipient, body, idempotency_key, scheduled_for
  ) values (
    p_organization_id, p_branch_id, p_patient_id, p_appointment_id, p_channel, p_template_type,
    p_recipient, p_body, p_idempotency_key, p_scheduled_for
  )
  on conflict (organization_id, idempotency_key) do nothing;
end;
$$;

revoke all on function private.enqueue_communication_internal(uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

-- Marks every pending job for an appointment as CANCELLED. Called by the
-- appointment automation trigger when an appointment is cancelled/rescheduled.
create function private.cancel_appointment_communications_internal(
  p_organization_id uuid,
  p_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.communications
  set status = 'CANCELLED',
      cancelled_at = pg_catalog.statement_timestamp(),
      version = communications.version + 1
  where organization_id = p_organization_id
    and appointment_id = p_appointment_id
    and status = 'QUEUED';
end;
$$;

revoke all on function private.cancel_appointment_communications_internal(uuid, uuid)
from public, anon, authenticated, service_role;

create function public.enqueue_communication(
  p_acting_branch_id uuid,
  p_appointment_id uuid,
  p_channel text,
  p_template_type text,
  p_recipient text,
  p_body text,
  p_idempotency_key text,
  p_scheduled_for timestamptz default null
)
returns table(communication_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_patient_id uuid;
  v_inserted_id uuid;
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

  if p_appointment_id is null
     or p_channel is null or p_channel not in ('EMAIL', 'SMS')
     or p_template_type is null or p_template_type not in ('CONFIRMATION', 'REMINDER', 'RESCHEDULE', 'CANCELLATION')
     or p_recipient is null or pg_catalog.btrim(p_recipient) = '' or pg_catalog.length(p_recipient) > 320
     or p_body is null or pg_catalog.btrim(p_body) = '' or pg_catalog.length(p_body) > 4000
     or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) < 1 or pg_catalog.length(p_idempotency_key) > 128 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select appointment.patient_id into v_patient_id
  from public.appointments as appointment
  where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
  for key share;

  if v_patient_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.communications (
    organization_id, branch_id, patient_id, appointment_id, channel, template_type,
    recipient, body, idempotency_key, scheduled_for
  ) values (
    v_organization_id, p_acting_branch_id, v_patient_id, p_appointment_id, p_channel, p_template_type,
    p_recipient, p_body, p_idempotency_key, p_scheduled_for
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    communication_id := v_inserted_id;
    status := 'QUEUED';
  else
    select comm.id, comm.status into communication_id, status
    from public.communications as comm
    where comm.organization_id = v_organization_id
      and comm.idempotency_key = p_idempotency_key;
  end if;

  return next;
end;
$$;

revoke all on function public.enqueue_communication(uuid, uuid, text, text, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

create function public.cancel_communication(
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

  select comm.* into v_comm
  from public.communications as comm
  where comm.id = p_communication_id and comm.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_comm.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_comm.status <> 'QUEUED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.communications
  set status = 'CANCELLED',
      cancelled_at = pg_catalog.statement_timestamp(),
      version = v_comm.version + 1
  where id = v_comm.id and organization_id = v_organization_id
  returning id, public.communications.status into communication_id, status;

  return next;
end;
$$;

revoke all on function public.cancel_communication(uuid, uuid, integer)
from public, anon, authenticated, service_role;

create function public.list_communications(
  p_acting_branch_id uuid,
  p_appointment_id uuid default null,
  p_status text default null
)
returns table(
  communication_id uuid,
  channel text,
  template_type text,
  recipient_masked text,
  status text,
  attempts integer,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  version integer
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
     or not private.has_communication_permission_at_branch(
       p_acting_branch_id, 'communication.view'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_status is not null and p_status not in ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    comm.id,
    comm.channel,
    comm.template_type,
    case
      when comm.channel = 'SMS' and comm.recipient ~ '^\+?[0-9]{7,}$' then '+63****' || pg_catalog.right(comm.recipient, 4)
      else pg_catalog.left(comm.recipient, 3) || '***'
    end,
    comm.status,
    comm.attempts,
    comm.next_attempt_at,
    comm.sent_at,
    comm.delivered_at,
    comm.failed_at,
    comm.cancelled_at,
    comm.created_at,
    comm.version
  from public.communications as comm
  where comm.organization_id = v_organization_id
    and comm.branch_id = p_acting_branch_id
    and (p_appointment_id is null or comm.appointment_id = p_appointment_id)
    and (p_status is null or comm.status = p_status)
  order by comm.created_at desc, comm.id
  limit 200;
end;
$$;

revoke all on function public.list_communications(uuid, uuid, text)
from public, anon, authenticated, service_role;

create function public.acknowledge_communication(
  p_acting_branch_id uuid,
  p_communication_id uuid,
  p_provider_message_id text default null
)
returns table(communication_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_comm public.communications%rowtype;
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

  if p_communication_id is null
     or (p_provider_message_id is not null and pg_catalog.length(p_provider_message_id) > 200) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select comm.* into v_comm
  from public.communications as comm
  where comm.id = p_communication_id and comm.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_comm.status <> 'QUEUED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.communications
  set status = 'SENT',
      sent_at = pg_catalog.statement_timestamp(),
      provider_message_id = p_provider_message_id,
      version = v_comm.version + 1
  where id = v_comm.id and organization_id = v_organization_id
  returning id, public.communications.status into communication_id, status;

  return next;
end;
$$;

revoke all on function public.acknowledge_communication(uuid, uuid, text)
from public, anon, authenticated, service_role;

create function public.fail_communication(
  p_acting_branch_id uuid,
  p_communication_id uuid
)
returns table(communication_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_comm public.communications%rowtype;
  v_attempts integer;
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

  if p_communication_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select comm.* into v_comm
  from public.communications as comm
  where comm.id = p_communication_id and comm.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_comm.status <> 'QUEUED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_attempts := v_comm.attempts + 1;

  if v_attempts >= v_comm.max_attempts then
    update public.communications
    set status = 'FAILED',
        failed_at = pg_catalog.statement_timestamp(),
        attempts = v_comm.max_attempts,
        version = v_comm.version + 1
    where id = v_comm.id and organization_id = v_organization_id
    returning id, public.communications.status into communication_id, status;
  else
    update public.communications
    set attempts = v_attempts,
        next_attempt_at = pg_catalog.statement_timestamp()
          + (pg_catalog.power(2, least(v_attempts, 5))::integer * interval '1 minute'),
        version = v_comm.version + 1
    where id = v_comm.id and organization_id = v_organization_id
    returning id, public.communications.status into communication_id, status;
  end if;

  return next;
end;
$$;

revoke all on function public.fail_communication(uuid, uuid)
from public, anon, authenticated, service_role;

-- Worker claim: locks up to p_limit due QUEUED jobs with FOR UPDATE SKIP LOCKED
-- so concurrent workers never claim the same job. The status stays QUEUED; the
-- worker acknowledges or fails the claimed job afterwards. The full recipient
-- and body are returned to this communication.send holder only.
create function public.claim_due_communications(
  p_acting_branch_id uuid,
  p_limit integer default 10
)
returns table(
  communication_id uuid,
  appointment_id uuid,
  channel text,
  template_type text,
  recipient text,
  body text,
  scheduled_for timestamptz
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
     or not private.has_communication_permission_at_branch(
       p_acting_branch_id, 'communication.send'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    comm.id,
    comm.appointment_id,
    comm.channel,
    comm.template_type,
    comm.recipient,
    comm.body,
    comm.scheduled_for
  from public.communications as comm
  where comm.organization_id = v_organization_id
    and comm.branch_id = p_acting_branch_id
    and comm.status = 'QUEUED'
    and comm.next_attempt_at <= pg_catalog.statement_timestamp()
  order by comm.next_attempt_at, comm.id
  limit p_limit
  for update skip locked;
end;
$$;

revoke all on function public.claim_due_communications(uuid, integer)
from public, anon, authenticated, service_role;

-- Appointment automation trigger: enqueues a durable, template-only,
-- non-clinical communication inside the appointment transaction. The enqueue
-- is just an INSERT into the communications queue, so the appointment save is
-- never blocked by external IO. No PHI and no full clinical notes ever reach a
-- body. Scheduled 48h/24h reminders are the worker's job and are deliberately
-- not created here.
create or replace function private.appointment_communication_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mobile text;
  v_email text;
  v_channel text;
  v_recipient text;
  v_template text;
  v_key text;
  v_branch_name text;
  v_time_label text;
  v_body text;
begin
  select branch.name into v_branch_name
  from public.branches as branch
  where branch.organization_id = new.organization_id
    and branch.id = new.branch_id;

  v_branch_name := coalesce(v_branch_name, 'our clinic'::text);
  v_time_label := pg_catalog.to_char(new.starts_at, 'YYYY-MM-DD HH24:MI');

  if tg_op = 'INSERT' then
    if new.scheduling_status = 'CANCELLED' then
      return new;
    end if;

    select contact.normalized_value into v_mobile
    from public.patient_contacts as contact
    where contact.organization_id = new.organization_id
      and contact.patient_id = new.patient_id
      and contact.contact_type = 'MOBILE'
      and contact.status = 'active'
    order by contact.is_primary desc, contact.created_at, contact.id
    limit 1;

    if v_mobile is null then
      select contact.normalized_value into v_email
      from public.patient_contacts as contact
      where contact.organization_id = new.organization_id
        and contact.patient_id = new.patient_id
        and contact.contact_type = 'EMAIL'
        and contact.status = 'active'
      order by contact.is_primary desc, contact.created_at, contact.id
      limit 1;
    end if;

    if v_mobile is null and v_email is null then
      return new;
    end if;

    v_channel := case when v_mobile is not null then 'SMS' else 'EMAIL' end;
    v_recipient := coalesce(v_mobile, v_email);
    v_body := case v_channel
      when 'SMS' then 'Your appointment is at ' || v_time_label || ' at ' || v_branch_name || '. Reply to reschedule or cancel.'
      else 'You have an appointment at ' || v_time_label || ' at ' || v_branch_name || '. Reply to reschedule or cancel.'
    end;

    perform private.enqueue_communication_internal(
      new.organization_id, new.branch_id, new.patient_id, new.id, v_channel,
      'CONFIRMATION', v_recipient, v_body, 'appt-confirm-' || new.id,
      pg_catalog.statement_timestamp()
    );

    return new;
  end if;

  if new.scheduling_status = 'CANCELLED' and old.scheduling_status <> 'CANCELLED' then
    perform private.cancel_appointment_communications_internal(new.organization_id, new.id);
    v_template := 'CANCELLATION';
    v_key := 'appt-cancel-' || new.id;
  elsif new.starts_at is distinct from old.starts_at and new.scheduling_status <> 'CANCELLED' then
    perform private.cancel_appointment_communications_internal(new.organization_id, new.id);
    v_template := 'RESCHEDULE';
    v_key := 'appt-reschedule-' || new.id || '-' || new.version;
  elsif new.confirmation_status = 'CONFIRMED' and old.confirmation_status <> 'CONFIRMED' then
    v_template := 'CONFIRMATION';
    v_key := 'appt-confirm-' || new.id;
  else
    return new;
  end if;

  select contact.normalized_value into v_mobile
  from public.patient_contacts as contact
  where contact.organization_id = new.organization_id
    and contact.patient_id = new.patient_id
    and contact.contact_type = 'MOBILE'
    and contact.status = 'active'
  order by contact.is_primary desc, contact.created_at, contact.id
  limit 1;

  if v_mobile is null then
    select contact.normalized_value into v_email
    from public.patient_contacts as contact
    where contact.organization_id = new.organization_id
      and contact.patient_id = new.patient_id
      and contact.contact_type = 'EMAIL'
      and contact.status = 'active'
    order by contact.is_primary desc, contact.created_at, contact.id
    limit 1;
  end if;

  if v_mobile is null and v_email is null then
    return new;
  end if;

  v_channel := case when v_mobile is not null then 'SMS' else 'EMAIL' end;
  v_recipient := coalesce(v_mobile, v_email);

  v_body := case
    when v_template = 'CONFIRMATION' then
      case v_channel
        when 'SMS' then 'Your appointment is at ' || v_time_label || ' at ' || v_branch_name || '. Reply to reschedule or cancel.'
        else 'You have an appointment at ' || v_time_label || ' at ' || v_branch_name || '. Reply to reschedule or cancel.'
      end
    when v_template = 'CANCELLATION' then
      'Your appointment at ' || v_time_label || ' has been cancelled. Reply to reschedule if needed.'
    when v_template = 'RESCHEDULE' then
      'Your appointment has been moved to ' || v_time_label || ' at ' || v_branch_name || '. Reply to reschedule or cancel.'
  end;

  perform private.enqueue_communication_internal(
    new.organization_id, new.branch_id, new.patient_id, new.id, v_channel,
    v_template, v_recipient, v_body, v_key, pg_catalog.statement_timestamp()
  );

  return new;
end;
$$;

revoke all on function private.appointment_communication_trigger()
from public, anon, authenticated, service_role;

create trigger appointments_communication_after_insert
after insert on public.appointments
for each row execute function private.appointment_communication_trigger();

create trigger appointments_communication_after_update
after update of scheduling_status, confirmation_status, starts_at, ends_at
on public.appointments
for each row execute function private.appointment_communication_trigger();