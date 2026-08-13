-- Phase 1 secure baseline — file 7 of 8: the hardened administrative mutation
-- boundary.
--
-- Privileged foundation mutations are user-context, AAL2-gated, transactional
-- SECURITY DEFINER RPCs. There is deliberately no authenticated table-write path
-- to organizations, branches, organization_members, roles, role_permissions,
-- branch_memberships, member_roles, or audit_events anywhere in this baseline.
--
-- BASELINE INVARIANT: this file grants nothing. Every function revokes EXECUTE
-- from PUBLIC, anon, authenticated, and service_role in the statement
-- immediately following its creation, so a definer-rights administrative
-- function is never reachable at any boundary before file 8 issues the exact
-- approved EXECUTE grants.

create or replace function public.create_branch(
  target_organization_id uuid,
  branch_name text,
  branch_slug text,
  branch_code text,
  branch_address_line1 text,
  branch_city text,
  branch_province text,
  branch_phone text default null,
  branch_email text default null,
  branch_address_line2 text default null,
  branch_postal_code text default null,
  branch_country_code text default 'PH',
  branch_timezone text default 'Asia/Manila',
  branch_latitude numeric default null,
  branch_longitude numeric default null,
  branch_website_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  created_branch_id uuid;
begin
  perform private.require_aal2();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'branch.manage'
     )) then
    raise insufficient_privilege using message = 'not authorized to create branch';
  end if;

  insert into public.branches (
    organization_id,
    name,
    slug,
    code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    province,
    postal_code,
    country_code,
    timezone,
    latitude,
    longitude,
    website_visible
  ) values (
    target_organization_id,
    branch_name,
    branch_slug,
    branch_code,
    branch_phone,
    branch_email,
    branch_address_line1,
    branch_address_line2,
    branch_city,
    branch_province,
    branch_postal_code,
    branch_country_code,
    branch_timezone,
    branch_latitude,
    branch_longitude,
    branch_website_visible
  )
  returning id into created_branch_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    created_branch_id,
    actor_user_id,
    'USER',
    'ADMINISTRATION',
    'branch.created',
    'branch',
    created_branch_id,
    'SUCCESS'
  );

  return created_branch_id;
end;
$$;

revoke all on function public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)
from public, anon, authenticated, service_role;

comment on function public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean) is
  'Creates one branch under current-user branch.manage + AAL2 and audits atomically.';

create or replace function public.set_role_permission(
  target_role_id uuid,
  target_permission_code text,
  grant_permission boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_member_id uuid;
  target_organization_id uuid;
  target_permission_id uuid;
begin
  perform private.require_aal2();

  select role.organization_id
  into target_organization_id
  from public.roles as role
  where role.id = target_role_id
    and role.organization_id is not null
    and not role.is_system;

  if not found then
    raise insufficient_privilege using message = 'role permission change is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'role.manage'
     )) then
    raise insufficient_privilege using message = 'role permission change is not authorized';
  end if;

  select organization_member.id
  into actor_member_id
  from public.organization_members as organization_member
  where organization_member.organization_id = target_organization_id
    and organization_member.user_id = actor_user_id
    and organization_member.membership_status = 'active';

  if actor_member_id is null
     or exists (
       select 1
       from public.member_roles as member_role
       where member_role.organization_id = target_organization_id
         and member_role.organization_member_id = actor_member_id
         and member_role.role_id = target_role_id
     ) then
    raise insufficient_privilege using message = 'cannot change permissions on an assigned role';
  end if;

  select permission.id
  into target_permission_id
  from public.permissions as permission
  where permission.code = target_permission_code;

  if target_permission_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       target_permission_code
     )) then
    raise insufficient_privilege using message = 'permission may not be delegated';
  end if;

  if target_permission_code in ('role.manage', 'security.manage')
     and not (select private.has_org_permission(
       target_organization_id,
       'security.manage'
     )) then
    raise insufficient_privilege using message = 'sensitive permission requires security.manage';
  end if;

  if grant_permission then
    if exists (
      select 1
      from public.role_permissions as role_permission
      where role_permission.role_id = target_role_id
        and role_permission.permission_id = target_permission_id
    ) then
      raise invalid_parameter_value using message = 'permission grant already matches requested state';
    end if;

    if exists (
      select 1
      from public.role_permissions as role_permission
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where role_permission.role_id = target_role_id
        and not (select private.has_org_permission(
          target_organization_id,
          permission.code
        ))
    ) then
      raise insufficient_privilege using message = 'role contains permissions the actor may not delegate';
    end if;

    insert into public.role_permissions (role_id, permission_id)
    values (target_role_id, target_permission_id);
  else
    delete from public.role_permissions
    where role_id = target_role_id
      and permission_id = target_permission_id;

    if not found then
      raise invalid_parameter_value using message = 'permission grant already matches requested state';
    end if;
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result,
    metadata
  ) values (
    target_organization_id,
    actor_user_id,
    'USER',
    'AUTHORIZATION',
    case when grant_permission
      then 'role.permission_granted'
      else 'role.permission_revoked'
    end,
    'role',
    target_role_id,
    'SUCCESS',
    pg_catalog.jsonb_build_object('permission_code', target_permission_code)
  );

  return target_role_id;
end;
$$;

revoke all on function public.set_role_permission(uuid, text, boolean)
from public, anon, authenticated, service_role;

comment on function public.set_role_permission(uuid, text, boolean) is
  'Changes one custom-role grant under AAL2 without self-role or superset delegation escalation.';

create or replace function public.set_member_role(
  target_organization_member_id uuid,
  target_role_id uuid,
  target_branch_id uuid,
  grant_role boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_user_id uuid;
  target_membership_status text;
  target_organization_id uuid;
  role_organization_id uuid;
  assignment_id uuid;
begin
  perform private.require_aal2();

  select organization_member.organization_id
  into target_organization_id
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id;

  if not found then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select
    organization_member.user_id,
    organization_member.membership_status
  into
    target_user_id,
    target_membership_status
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id
    and organization_member.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  if actor_user_id is null
     or actor_user_id = target_user_id
     or not (select private.has_org_permission(
       target_organization_id,
       'role.manage'
     )) then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  select role.organization_id
  into role_organization_id
  from public.roles as role
  where role.id = target_role_id;

  if not found
     or (role_organization_id is not null
         and role_organization_id <> target_organization_id) then
    raise insufficient_privilege using message = 'role assignment is not authorized';
  end if;

  if exists (
    select 1
    from public.member_roles as current_member_role
    join public.role_permissions as current_role_permission
      on current_role_permission.role_id = current_member_role.role_id
    join public.permissions as current_permission
      on current_permission.id = current_role_permission.permission_id
    where current_member_role.organization_id = target_organization_id
      and current_member_role.organization_member_id = target_organization_member_id
      and current_member_role.branch_id is null
      and current_permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive member role changes require security.manage';
  end if;

  if target_branch_id is not null and not exists (
    select 1
    from public.branches as branch
    join public.branch_memberships as branch_membership
      on branch_membership.organization_id = branch.organization_id
     and branch_membership.branch_id = branch.id
     and branch_membership.organization_member_id = target_organization_member_id
     and branch_membership.access_status = 'active'
    where branch.organization_id = target_organization_id
      and branch.id = target_branch_id
      and branch.status = 'active'
  ) then
    raise insufficient_privilege using message = 'branch-scoped role requires active branch access';
  end if;

  if exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role_permission.role_id = target_role_id
      and permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive role assignment requires security.manage';
  end if;

  if grant_role and exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role_permission.role_id = target_role_id
      and not (select private.has_org_permission(
        target_organization_id,
        permission.code
      ))
  ) then
    raise insufficient_privilege using message = 'role contains permissions the actor may not delegate';
  end if;

  if grant_role then
    if target_membership_status not in ('invited', 'active') then
      raise insufficient_privilege using message = 'target membership cannot receive roles';
    end if;

    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      branch_id,
      assigned_by
    ) values (
      target_organization_id,
      target_organization_member_id,
      target_role_id,
      target_branch_id,
      actor_user_id
    )
    returning id into assignment_id;
  else
    delete from public.member_roles
    where organization_id = target_organization_id
      and organization_member_id = target_organization_member_id
      and role_id = target_role_id
      and branch_id is not distinct from target_branch_id
    returning id into assignment_id;

    if assignment_id is null then
      raise invalid_parameter_value using message = 'role assignment already matches requested state';
    end if;
  end if;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'AUTHORIZATION',
    case when grant_role
      then 'member_role.assigned'
      else 'member_role.revoked'
    end,
    'member_role',
    assignment_id,
    'SUCCESS'
  );

  return assignment_id;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.set_member_role(uuid, uuid, uuid, boolean) is
  'Assigns or revokes one role under AAL2, anti-self-escalation, permission-superset, sensitive-role, and sensitive-target checks.';

create or replace function public.set_branch_membership(
  target_organization_member_id uuid,
  target_branch_id uuid,
  target_access_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_user_id uuid;
  target_organization_id uuid;
  target_membership_status text;
  branch_membership_id uuid;
  previous_access_status text;
begin
  perform private.require_aal2();

  select organization_member.organization_id, organization_member.user_id
  into target_organization_id, target_user_id
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id;

  if not found or target_access_status not in ('active', 'suspended', 'revoked') then
    raise insufficient_privilege using message = 'branch membership change is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select
    organization_member.user_id,
    organization_member.membership_status
  into
    target_user_id,
    target_membership_status
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id
    and organization_member.organization_id = target_organization_id
  for update;

  if not found or target_membership_status <> 'active' then
    raise insufficient_privilege using message = 'branch membership change is not authorized';
  end if;

  if actor_user_id is null
     or actor_user_id = target_user_id
     or not (select private.has_org_permission(
       target_organization_id,
       'user.manage'
     )) then
    raise insufficient_privilege using message = 'branch membership change is not authorized';
  end if;

  if not exists (
    select 1
    from public.branches as branch
    where branch.organization_id = target_organization_id
      and branch.id = target_branch_id
      and branch.status = 'active'
  ) then
    raise insufficient_privilege using message = 'branch membership change is not authorized';
  end if;

  if exists (
    select 1
    from public.member_roles as member_role
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where member_role.organization_id = target_organization_id
      and member_role.organization_member_id = target_organization_member_id
      and member_role.branch_id is null
      and permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive membership change requires security.manage';
  end if;

  select branch_membership.id, branch_membership.access_status
  into branch_membership_id, previous_access_status
  from public.branch_memberships as branch_membership
  where branch_membership.branch_id = target_branch_id
    and branch_membership.organization_member_id = target_organization_member_id
  for update;

  if found then
    if previous_access_status = target_access_status then
      raise invalid_parameter_value using message = 'branch membership already matches requested state';
    end if;

    update public.branch_memberships
    set access_status = target_access_status,
        revoked_at = case
          when target_access_status = 'revoked'
            then pg_catalog.statement_timestamp()
          else null
        end
    where id = branch_membership_id;
  else
    if target_access_status <> 'active' then
      raise invalid_parameter_value using message = 'new branch membership must be active';
    end if;

    insert into public.branch_memberships (
      organization_id,
      branch_id,
      organization_member_id,
      access_status
    ) values (
      target_organization_id,
      target_branch_id,
      target_organization_member_id,
      target_access_status
    )
    returning id into branch_membership_id;
  end if;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'AUTHORIZATION',
    case target_access_status
      when 'active' then 'branch_membership.granted'
      when 'suspended' then 'branch_membership.suspended'
      else 'branch_membership.revoked'
    end,
    'branch_membership',
    branch_membership_id,
    'SUCCESS'
  );

  return branch_membership_id;
end;
$$;

revoke all on function public.set_branch_membership(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.set_branch_membership(uuid, uuid, text) is
  'Creates or changes exact-branch access under current-user user.manage + AAL2.';

create or replace function public.update_organization_member_status(
  target_organization_member_id uuid,
  target_membership_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_user_id uuid;
  target_organization_id uuid;
  previous_membership_status text;
begin
  perform private.require_aal2();

  select organization_member.organization_id
  into target_organization_id
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id;

  if not found
     or target_membership_status not in ('active', 'suspended', 'removed') then
    raise insufficient_privilege using message = 'membership status change is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select
    organization_member.user_id,
    organization_member.membership_status
  into
    target_user_id,
    previous_membership_status
  from public.organization_members as organization_member
  where organization_member.id = target_organization_member_id
    and organization_member.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'membership status change is not authorized';
  end if;

  if actor_user_id is null
     or actor_user_id = target_user_id
     or not (select private.has_org_permission(
       target_organization_id,
       'user.manage'
     )) then
    raise insufficient_privilege using message = 'membership status change is not authorized';
  end if;

  if exists (
    select 1
    from public.member_roles as member_role
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where member_role.organization_id = target_organization_id
      and member_role.organization_member_id = target_organization_member_id
      and member_role.branch_id is null
      and permission.code in ('role.manage', 'security.manage')
  ) and not (select private.has_org_permission(
    target_organization_id,
    'security.manage'
  )) then
    raise insufficient_privilege using message = 'sensitive membership change requires security.manage';
  end if;

  if previous_membership_status = target_membership_status then
    raise invalid_parameter_value using message = 'membership already matches requested state';
  end if;

  update public.organization_members
  set membership_status = target_membership_status,
      joined_at = case
        when target_membership_status = 'active'
          then coalesce(joined_at, pg_catalog.statement_timestamp())
        else joined_at
      end,
      suspended_at = case
        when target_membership_status = 'suspended'
          then pg_catalog.statement_timestamp()
        else null
      end
  where id = target_organization_member_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    actor_user_id,
    'USER',
    'MEMBERSHIP',
    case target_membership_status
      when 'active' then 'membership.activated'
      when 'suspended' then 'membership.suspended'
      else 'membership.removed'
    end,
    'organization_member',
    target_organization_member_id,
    'SUCCESS'
  );

  return target_organization_member_id;
end;
$$;

revoke all on function public.update_organization_member_status(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.update_organization_member_status(uuid, text) is
  'Changes another member status under current-user user.manage + AAL2 and audits atomically.';

create or replace function public.record_mfa_enrollment(
  p_factor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  inserted_event_count integer;
begin
  if actor_user_id is null then
    raise insufficient_privilege using message = 'authenticated user required';
  end if;

  perform private.require_aal2();

  if not exists (
    select 1
    from auth.mfa_factors as factor
    where factor.id = p_factor_id
      and factor.user_id = actor_user_id
      and factor.factor_type = 'totp'
      and factor.status = 'verified'
  ) then
    raise insufficient_privilege using message = 'verified authenticator factor required';
  end if;

  if not exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
    where organization_member.user_id = actor_user_id
      and organization_member.membership_status = 'active'
      and organization.status = 'active'
  ) then
    raise insufficient_privilege using message = 'active organization membership required';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  )
  select
    organization_member.organization_id,
    actor_user_id,
    'USER',
    'SECURITY',
    'mfa.enrolled',
    'mfa_factor',
    p_factor_id,
    'SUCCESS'
  from public.organization_members as organization_member
  join public.organizations as organization
    on organization.id = organization_member.organization_id
  where organization_member.user_id = actor_user_id
    and organization_member.membership_status = 'active'
    and organization.status = 'active'
  on conflict do nothing;

  get diagnostics inserted_event_count = row_count;
  return inserted_event_count;
end;
$$;

revoke all on function public.record_mfa_enrollment(uuid)
from public, anon, authenticated, service_role;

comment on function public.record_mfa_enrollment(uuid) is
  'Idempotently projects a verified current-user TOTP factor into each active tenant audit log.';
