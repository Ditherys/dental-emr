-- P7-02: queue RPC boundaries. A walk-in creates a queue entry, never a fake
-- appointment; queue transitions never touch appointment rows. Mutations are
-- queue.manage gated with one atomic audit event each; the list is queue.read
-- gated with no audit. This object migration grants nothing.

create or replace function private.has_queue_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('queue.read', 'queue.manage') and exists (
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

revoke all on function private.has_queue_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_queue_permission_at_branch(uuid, text) is
  'Current-user queue permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_walkin_entry(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_chief_complaint text,
  p_provider_id uuid default null,
  p_resource_id uuid default null
)
returns table(queue_entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_entry_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_queue_permission_at_branch(
       p_acting_branch_id, 'queue.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null
     or (p_chief_complaint is not null and pg_catalog.length(p_chief_complaint) > 2000) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_provider_id is not null and not exists (
    select 1 from public.providers as provider
    where provider.id = p_provider_id and provider.organization_id = v_organization_id
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.branch_resources as resource
    where resource.id = p_resource_id
      and resource.organization_id = v_organization_id
      and resource.branch_id = p_acting_branch_id
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.queue_entries (
    organization_id, branch_id, patient_id, provider_id, resource_id,
    chief_complaint, status
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_provider_id,
    p_resource_id, nullif(pg_catalog.btrim(p_chief_complaint), ''), 'WAITING'
  ) returning id, public.queue_entries.version into v_entry_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'QUEUE',
    'queue.entry.created', 'queue_entry', v_entry_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  queue_entry_id := v_entry_id;
  return next;
end;
$$;

revoke all on function public.create_walkin_entry(uuid, uuid, text, uuid, uuid)
from public, anon, authenticated, service_role;

create function public.update_queue_status(
  p_acting_branch_id uuid,
  p_queue_entry_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_reason text default null
)
returns table(queue_entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_entry public.queue_entries%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_queue_permission_at_branch(
       p_acting_branch_id, 'queue.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_queue_entry_id is null or p_expected_version is null or p_expected_version < 1
     or p_new_status not in ('READY', 'CALLED', 'IN_CHAIR', 'COMPLETED', 'LEFT', 'CANCELLED')
     or (p_reason is not null and pg_catalog.length(p_reason) > 500) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select entry.* into v_entry
  from public.queue_entries as entry
  where entry.id = p_queue_entry_id and entry.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_entry.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if not (
    (v_entry.status = 'WAITING' and p_new_status in ('READY', 'CANCELLED'))
    or (v_entry.status = 'READY' and p_new_status in ('CALLED', 'LEFT'))
    or (v_entry.status = 'CALLED' and p_new_status in ('IN_CHAIR', 'LEFT'))
    or (v_entry.status = 'IN_CHAIR' and p_new_status = 'COMPLETED')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.queue_entries
  set status = p_new_status,
      version = v_entry.version + 1,
      completed_at = case when p_new_status = 'COMPLETED' then statement_timestamp() else completed_at end,
      left_at = case when p_new_status = 'LEFT' then statement_timestamp() else left_at end
  where id = v_entry.id and organization_id = v_organization_id
  returning id, public.queue_entries.version into queue_entry_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'QUEUE',
    'queue.entry.status_updated', 'queue_entry', queue_entry_id,
    v_entry.patient_id, 'SUCCESS',
    jsonb_strip_nulls(jsonb_build_object(
      'old_value', v_entry.status,
      'new_value', p_new_status,
      'reason', p_reason
    ))
  );
  return next;
end;
$$;

revoke all on function public.update_queue_status(uuid, uuid, integer, text, text)
from public, anon, authenticated, service_role;

create function public.list_queue(
  p_acting_branch_id uuid,
  p_include_terminal boolean default false
)
returns table(
  queue_entry_id uuid,
  patient_id uuid,
  patient_display_name text,
  status text,
  provider_id uuid,
  provider_display_name text,
  resource_id uuid,
  resource_name text,
  chief_complaint text,
  arrived_at timestamptz,
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
     or not private.has_queue_permission_at_branch(
       p_acting_branch_id, 'queue.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_include_terminal is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    entry.id,
    entry.patient_id,
    pg_catalog.concat_ws(' ', patient.first_name, patient.middle_name, patient.last_name, patient.suffix),
    entry.status,
    entry.provider_id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    entry.resource_id,
    resource.name,
    entry.chief_complaint,
    entry.arrived_at,
    entry.version
  from public.queue_entries as entry
  join public.patients as patient
    on patient.organization_id = entry.organization_id
   and patient.id = entry.patient_id
  left join public.providers as provider
    on provider.organization_id = entry.organization_id
   and provider.id = entry.provider_id
  left join public.branch_resources as resource
    on resource.organization_id = entry.organization_id
   and resource.id = entry.resource_id
  where entry.organization_id = v_organization_id
    and entry.branch_id = p_acting_branch_id
    and (p_include_terminal or entry.status not in ('COMPLETED', 'LEFT', 'CANCELLED'))
  order by entry.arrived_at, entry.id
  limit 200;
end;
$$;

revoke all on function public.list_queue(uuid, boolean)
from public, anon, authenticated, service_role;