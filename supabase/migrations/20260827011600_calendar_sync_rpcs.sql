-- P9-03: calendar sync RPC boundaries and the appointment calendar automation
-- trigger. Eight calendar.manage-gated RPCs plus three internal SECURITY
-- DEFINER helpers and one appointment trigger function, mirroring the P8-03
-- communication boundary. Enqueuing is a durable INSERT inside the appointment
-- transaction so external sync never blocks the appointment save; the worker
-- claims due jobs with FOR UPDATE SKIP LOCKED and acknowledges or fails them.
-- This object migration grants nothing and opens no RLS policy; the
-- 20260827011601 terminal owns the only browser/worker-reachable grants.
--
-- The appointment insert trigger is a DEFERRABLE INITIALLY DEFERRED constraint
-- trigger because create_appointment inserts the appointment row before its
-- appointment_providers rows: an immediate AFTER INSERT trigger would fire
-- before any ASSIGNED provider exists. Deferral lets the trigger read the
-- providers and enqueue CREATE in the same transaction, and the insert branch
-- re-reads the live appointment row so a create-then-cancel in one transaction
-- cannot enqueue a CREATE for a cancelled appointment.

create or replace function private.has_calendar_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code = 'calendar.manage' and exists (
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

revoke all on function private.has_calendar_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_calendar_permission_at_branch(uuid, text) is
  'Current-user calendar.manage check scoped to an active acting branch with org-wide or exact-branch role coverage.';

-- Server-internal automation path: enqueues a durable job with a unique
-- organization idempotency key when the provider has a CONNECTED calendar
-- integration. No permission check here — the trigger and the public RPC
-- boundary own authorization. The helper is deliberately silent on every
-- mismatch so the appointment transaction can never be broken by a sync
-- enqueue; a missing appointment/provider/integration just enqueues nothing.
create function private.enqueue_calendar_sync_internal(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_provider_id uuid,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null or p_appointment_id is null or p_provider_id is null
     or p_operation is null or p_operation not in ('CREATE', 'UPDATE', 'CANCEL') then
    return;
  end if;

  if not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = p_organization_id
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.providers as provider
    where provider.id = p_provider_id
      and provider.organization_id = p_organization_id
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.calendar_integrations as integration
    where integration.organization_id = p_organization_id
      and integration.provider_id = p_provider_id
      and integration.connection_status = 'CONNECTED'
  ) then
    return;
  end if;

  insert into public.calendar_sync_jobs (
    organization_id, appointment_id, provider_id, operation, idempotency_key
  ) values (
    p_organization_id, p_appointment_id, p_provider_id, p_operation,
    'cal-' || p_operation || '-' || p_appointment_id || '-' || p_provider_id
  )
  on conflict (organization_id, idempotency_key) do nothing;
end;
$$;

revoke all on function private.enqueue_calendar_sync_internal(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function private.enqueue_calendar_sync_internal(uuid, uuid, uuid, text) is
  'Server-internal calendar sync enqueue keyed cal-<op>-<appointment>-<provider>; requires a CONNECTED integration and never raises.';

create function public.enqueue_calendar_sync(
  p_acting_branch_id uuid,
  p_appointment_id uuid,
  p_provider_id uuid,
  p_operation text
)
returns table(sync_job_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_inserted_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_appointment_id is null or p_provider_id is null
     or p_operation is null or p_operation not in ('CREATE', 'UPDATE', 'CANCEL') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.providers as provider
    join public.provider_branches as provider_branch
      on provider_branch.organization_id = provider.organization_id
     and provider_branch.provider_id = provider.id
     and provider_branch.branch_id = p_acting_branch_id
     and provider_branch.is_active
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
  ) then
    if exists (
      select 1
      from public.providers as provider
      where provider.id = p_provider_id
        and provider.organization_id = v_organization_id
    ) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.calendar_integrations as integration
    where integration.organization_id = v_organization_id
      and integration.provider_id = p_provider_id
      and integration.connection_status = 'CONNECTED'
  ) then
    raise exception using errcode = 'P0001', message = 'calendar not connected';
  end if;

  insert into public.calendar_sync_jobs (
    organization_id, appointment_id, provider_id, operation, idempotency_key
  ) values (
    v_organization_id, p_appointment_id, p_provider_id, p_operation,
    'cal-' || p_operation || '-' || p_appointment_id || '-' || p_provider_id
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    sync_job_id := v_inserted_id;
    status := 'QUEUED';
  else
    select job.id, job.status into sync_job_id, status
    from public.calendar_sync_jobs as job
    where job.organization_id = v_organization_id
      and job.idempotency_key = 'cal-' || p_operation || '-' || p_appointment_id || '-' || p_provider_id;
  end if;

  return next;
end;
$$;

revoke all on function public.enqueue_calendar_sync(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.enqueue_calendar_sync(uuid, uuid, uuid, text) is
  'Idempotently enqueues a durable calendar sync job for an appointment and provider scoped to the acting branch.';

create function public.list_calendar_syncs(
  p_acting_branch_id uuid,
  p_appointment_id uuid default null
)
returns table(
  sync_job_id uuid,
  appointment_id uuid,
  provider_id uuid,
  provider_display_name text,
  operation text,
  status text,
  attempts integer,
  next_attempt_at timestamptz,
  external_event_id text,
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
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    job.id,
    job.appointment_id,
    job.provider_id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    job.operation,
    job.status,
    job.attempts,
    job.next_attempt_at,
    job.external_event_id,
    job.created_at,
    coalesce(link.version, 1)
  from public.calendar_sync_jobs as job
  join public.appointments as appointment
    on appointment.organization_id = job.organization_id
   and appointment.id = job.appointment_id
  join public.providers as provider
    on provider.organization_id = job.organization_id
   and provider.id = job.provider_id
  left join public.calendar_event_links as link
    on link.organization_id = job.organization_id
   and link.appointment_id = job.appointment_id
   and link.provider_id = job.provider_id
   and link.operation = job.operation
  where job.organization_id = v_organization_id
    and appointment.branch_id = p_acting_branch_id
    and (p_appointment_id is null or job.appointment_id = p_appointment_id)
  order by job.created_at desc, job.id
  limit 200;
end;
$$;

revoke all on function public.list_calendar_syncs(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.list_calendar_syncs(uuid, uuid) is
  'Bounded org+branch calendar sync job projection; never returns Google event titles or details. The version column is the correlated event link optimistic version.';

create function public.claim_due_calendar_syncs(
  p_acting_branch_id uuid,
  p_limit integer default 10
)
returns table(
  sync_job_id uuid,
  appointment_id uuid,
  provider_id uuid,
  operation text
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
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    job.id,
    job.appointment_id,
    job.provider_id,
    job.operation
  from public.calendar_sync_jobs as job
  join public.appointments as appointment
    on appointment.organization_id = job.organization_id
   and appointment.id = job.appointment_id
  where job.organization_id = v_organization_id
    and appointment.branch_id = p_acting_branch_id
    and job.status = 'QUEUED'
    and job.next_attempt_at <= pg_catalog.statement_timestamp()
  order by job.next_attempt_at, job.id
  limit p_limit
  for update of job skip locked;
end;
$$;

revoke all on function public.claim_due_calendar_syncs(uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.claim_due_calendar_syncs(uuid, integer) is
  'Worker claim of due QUEUED calendar sync jobs with FOR UPDATE SKIP LOCKED; the status stays QUEUED until acknowledge or fail.';

create function public.acknowledge_calendar_sync(
  p_acting_branch_id uuid,
  p_sync_job_id uuid,
  p_external_event_id text
)
returns table(sync_job_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_job public.calendar_sync_jobs%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_sync_job_id is null
     or p_external_event_id is null or pg_catalog.btrim(p_external_event_id) = ''
     or pg_catalog.length(p_external_event_id) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select job.* into v_job
  from public.calendar_sync_jobs as job
  join public.appointments as appointment
    on appointment.organization_id = job.organization_id
   and appointment.id = job.appointment_id
  where job.id = p_sync_job_id
    and job.organization_id = v_organization_id
    and appointment.branch_id = p_acting_branch_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_job.status <> 'QUEUED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.calendar_sync_jobs
  set status = 'PROCESSED',
      external_event_id = p_external_event_id
  where id = v_job.id and organization_id = v_organization_id
  returning id, public.calendar_sync_jobs.status into sync_job_id, status;

  insert into public.calendar_event_links (
    organization_id, appointment_id, provider_id, external_event_id, operation,
    sync_status, last_synced_at
  ) values (
    v_organization_id, v_job.appointment_id, v_job.provider_id, p_external_event_id,
    v_job.operation, 'SYNCED', pg_catalog.statement_timestamp()
  )
  on conflict (organization_id, appointment_id, provider_id, operation)
  do update set
    external_event_id = excluded.external_event_id,
    sync_status = 'SYNCED',
    last_synced_at = excluded.last_synced_at,
    version = public.calendar_event_links.version + 1;

  update public.calendar_integrations
  set last_synced_at = pg_catalog.statement_timestamp()
  where organization_id = v_organization_id
    and provider_id = v_job.provider_id;

  return next;
end;
$$;

revoke all on function public.acknowledge_calendar_sync(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.acknowledge_calendar_sync(uuid, uuid, text) is
  'Marks a claimed QUEUED job PROCESSED, upserts the SYNCED event link, and stamps the provider integration last_synced_at.';

create function public.fail_calendar_sync(
  p_acting_branch_id uuid,
  p_sync_job_id uuid,
  p_error text default null
)
returns table(sync_job_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_job public.calendar_sync_jobs%rowtype;
  v_attempts integer;
  v_error text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_error := p_error;

  if p_sync_job_id is null
     or (v_error is not null and pg_catalog.length(v_error) > 1000) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select job.* into v_job
  from public.calendar_sync_jobs as job
  join public.appointments as appointment
    on appointment.organization_id = job.organization_id
   and appointment.id = job.appointment_id
  where job.id = p_sync_job_id
    and job.organization_id = v_organization_id
    and appointment.branch_id = p_acting_branch_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_job.status <> 'QUEUED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_attempts := v_job.attempts + 1;

  if v_attempts >= v_job.max_attempts then
    update public.calendar_sync_jobs
    set status = 'FAILED',
        attempts = v_job.max_attempts
    where id = v_job.id and organization_id = v_organization_id
    returning id, public.calendar_sync_jobs.status into sync_job_id, status;

    update public.calendar_event_links
    set sync_status = 'FAILED',
        last_error = v_error,
        version = public.calendar_event_links.version + 1
    where organization_id = v_organization_id
      and appointment_id = v_job.appointment_id
      and provider_id = v_job.provider_id
      and operation = v_job.operation;
  else
    update public.calendar_sync_jobs
    set attempts = v_attempts,
        next_attempt_at = pg_catalog.statement_timestamp()
          + (pg_catalog.power(2, least(v_attempts, 5))::integer * interval '1 minute')
    where id = v_job.id and organization_id = v_organization_id
    returning id, public.calendar_sync_jobs.status into sync_job_id, status;
  end if;

  return next;
end;
$$;

revoke all on function public.fail_calendar_sync(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.fail_calendar_sync(uuid, uuid, text) is
  'Fails a QUEUED calendar sync job with bounded backoff, or terminalizes it at max attempts and marks any existing event link FAILED.';

create function public.connect_calendar(
  p_acting_branch_id uuid,
  p_provider_id uuid,
  p_calendar_id text,
  p_google_account_ref text
)
returns table(integration_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_id uuid;
  v_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_provider_id is null
     or p_google_account_ref is null or pg_catalog.btrim(p_google_account_ref) = ''
     or pg_catalog.length(p_google_account_ref) > 500
     or p_calendar_id is null or pg_catalog.btrim(p_calendar_id) = ''
     or pg_catalog.length(p_calendar_id) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.providers as provider
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.calendar_integrations (
    organization_id, provider_id, google_account_ref, calendar_id, connection_status
  ) values (
    v_organization_id, p_provider_id, p_google_account_ref, p_calendar_id, 'CONNECTED'
  )
  on conflict (organization_id, provider_id)
  do update set
    google_account_ref = excluded.google_account_ref,
    calendar_id = excluded.calendar_id,
    connection_status = 'CONNECTED',
    version = public.calendar_integrations.version + 1
  returning id, public.calendar_integrations.version into v_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CALENDAR',
    'calendar.connected', 'calendar_integration', v_id, null, 'SUCCESS', '{}'::jsonb
  );

  integration_id := v_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.connect_calendar(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

comment on function public.connect_calendar(uuid, uuid, text, text) is
  'Upserts a CONNECTED per-provider calendar integration from an opaque server-side reference and appends one calendar.connected audit event.';

create function public.disconnect_calendar(
  p_acting_branch_id uuid,
  p_provider_id uuid
)
returns table(integration_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_id uuid;
  v_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_provider_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.providers as provider
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  update public.calendar_integrations
  set connection_status = 'DISCONNECTED',
      google_account_ref = null,
      version = public.calendar_integrations.version + 1
  where organization_id = v_organization_id
    and provider_id = p_provider_id
  returning id, public.calendar_integrations.version into v_id, v_version;

  if v_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CALENDAR',
    'calendar.disconnected', 'calendar_integration', v_id, null, 'SUCCESS', '{}'::jsonb
  );

  integration_id := v_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.disconnect_calendar(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.disconnect_calendar(uuid, uuid) is
  'Disconnects a provider calendar, clearing the opaque token reference for server-side revocation, and appends one calendar.disconnected audit event.';

create function public.list_calendar_integrations(
  p_acting_branch_id uuid
)
returns table(
  integration_id uuid,
  provider_id uuid,
  provider_display_name text,
  privacy_mode text,
  connection_status text,
  calendar_id text,
  last_synced_at timestamptz,
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
     or not private.has_calendar_permission_at_branch(
       p_acting_branch_id, 'calendar.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    integration.id,
    integration.provider_id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    integration.privacy_mode,
    integration.connection_status,
    integration.calendar_id,
    integration.last_synced_at,
    integration.version
  from public.calendar_integrations as integration
  join public.providers as provider
    on provider.organization_id = integration.organization_id
   and provider.id = integration.provider_id
  join public.provider_branches as provider_branch
    on provider_branch.organization_id = provider.organization_id
   and provider_branch.provider_id = provider.id
   and provider_branch.branch_id = p_acting_branch_id
   and provider_branch.is_active
  where integration.organization_id = v_organization_id
  order by provider.last_name, provider.first_name, integration.id
  limit 200;
end;
$$;

revoke all on function public.list_calendar_integrations(uuid)
from public, anon, authenticated, service_role;

comment on function public.list_calendar_integrations(uuid) is
  'Bounded org+branch calendar integration projection that never returns the opaque google_account_ref.';

-- Appointment automation trigger: enqueues CREATE/UPDATE/CANCEL calendar sync
-- jobs inside the appointment transaction for ASSIGNED providers that hold a
-- CONNECTED calendar integration. Enqueue is just an INSERT into the durable
-- queue, so the appointment save is never blocked by external IO. The actor
-- never needs calendar.manage — the internal helper performs no permission
-- check, because the trigger fires on appointments the actor may only have
-- appointment.write for. Provider reassignment is covered by UPDATE sync for
-- the appointment's current ASSIGNED providers; appointment_providers diffs
-- are deliberately not chased in this phase.
create or replace function private.appointment_calendar_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment_status text;
  v_provider_id uuid;
begin
  if tg_op = 'INSERT' then
    select appointment.scheduling_status into v_appointment_status
    from public.appointments as appointment
    where appointment.id = new.id
      and appointment.organization_id = new.organization_id;

    if v_appointment_status is null or v_appointment_status = 'CANCELLED' then
      return new;
    end if;

    for v_provider_id in
      select provider_assignment.provider_id
      from public.appointment_providers as provider_assignment
      where provider_assignment.organization_id = new.organization_id
        and provider_assignment.appointment_id = new.id
        and provider_assignment.assignment_status = 'ASSIGNED'
    loop
      perform private.enqueue_calendar_sync_internal(
        new.organization_id, new.id, v_provider_id, 'CREATE'
      );
    end loop;

    return new;
  end if;

  if new.scheduling_status = 'CANCELLED' and old.scheduling_status <> 'CANCELLED' then
    for v_provider_id in
      select provider_assignment.provider_id
      from public.appointment_providers as provider_assignment
      where provider_assignment.organization_id = new.organization_id
        and provider_assignment.appointment_id = new.id
        and provider_assignment.assignment_status = 'ASSIGNED'
        and (
          exists (
            select 1
            from public.calendar_event_links as link
            where link.organization_id = provider_assignment.organization_id
              and link.appointment_id = provider_assignment.appointment_id
              and link.provider_id = provider_assignment.provider_id
          )
          or exists (
            select 1
            from public.calendar_sync_jobs as job
            where job.organization_id = provider_assignment.organization_id
              and job.appointment_id = provider_assignment.appointment_id
              and job.provider_id = provider_assignment.provider_id
          )
        )
    loop
      perform private.enqueue_calendar_sync_internal(
        new.organization_id, new.id, v_provider_id, 'CANCEL'
      );
    end loop;

    return new;
  end if;

  if new.starts_at is distinct from old.starts_at
     and new.scheduling_status <> 'CANCELLED' then
    for v_provider_id in
      select provider_assignment.provider_id
      from public.appointment_providers as provider_assignment
      where provider_assignment.organization_id = new.organization_id
        and provider_assignment.appointment_id = new.id
        and provider_assignment.assignment_status = 'ASSIGNED'
    loop
      perform private.enqueue_calendar_sync_internal(
        new.organization_id, new.id, v_provider_id, 'UPDATE'
      );
    end loop;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.appointment_calendar_sync_trigger()
from public, anon, authenticated, service_role;

comment on function private.appointment_calendar_sync_trigger() is
  'Appointment automation: enqueues CREATE on insert, CANCEL on cancellation, and UPDATE on reschedule for ASSIGNED providers with a CONNECTED calendar integration.';

-- Deferred constraint trigger: create_appointment inserts the appointment row
-- before its appointment_providers rows, so an immediate AFTER INSERT trigger
-- would see no ASSIGNED provider. Deferral to transaction end (or an explicit
-- SET CONSTRAINTS ... IMMEDIATE) lets the enqueue observe the providers while
-- staying inside the appointment transaction.
create constraint trigger appointments_calendar_sync_after_insert
after insert on public.appointments
deferrable initially deferred
for each row execute function private.appointment_calendar_sync_trigger();

create trigger appointments_calendar_sync_after_update
after update of scheduling_status, starts_at, ends_at on public.appointments
for each row execute function private.appointment_calendar_sync_trigger();