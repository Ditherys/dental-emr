-- P1-11 security hardening: privileged foundation mutations are user-context,
-- AAL2-gated, transactional RPCs. Authenticated table writes remain denied.

create or replace function private.has_branch_access(
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
    join public.organization_members as organization_member
      on organization_member.organization_id = branch.organization_id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    where branch.id = target_branch_id
      and branch.status = 'active'
      and organization.status = 'active'
      and (
        (select private.has_org_permission(
          branch.organization_id,
          'branch.manage'
        ))
        or exists (
          select 1
          from public.branch_memberships as branch_membership
          where branch_membership.organization_id = organization_member.organization_id
            and branch_membership.organization_member_id = organization_member.id
            and branch_membership.branch_id = branch.id
            and branch_membership.access_status = 'active'
        )
      )
  );
$$;

comment on function private.has_branch_access(uuid) is
  'RLS-only branch access: org-wide branch managers or active exact-branch members.';

create or replace function private.require_aal2()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise insufficient_privilege using message = 'AAL2 required';
  end if;
end;
$$;

comment on function private.require_aal2() is
  'Fails closed unless the current Supabase JWT was issued at AAL2.';

revoke all on function private.require_aal2() from public, anon, authenticated;

-- Remove every authenticated administrative table-write path. SELECT policies
-- remain as the read boundary, and profile self-service remains non-admin.
revoke update (
  legal_name,
  business_name,
  slug,
  country_code,
  default_timezone,
  default_currency
) on public.organizations from authenticated;

revoke insert (
  organization_id,
  name,
  slug,
  code,
  status,
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
  website_visible,
  archived_at
) on public.branches from authenticated;

revoke update (
  name,
  slug,
  code,
  status,
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
  website_visible,
  archived_at
) on public.branches from authenticated;

revoke insert (
  organization_id,
  user_id,
  membership_status,
  joined_at,
  suspended_at
) on public.organization_members from authenticated;

revoke update (
  membership_status,
  joined_at,
  suspended_at
) on public.organization_members from authenticated;

revoke insert (organization_id, code, name) on public.roles from authenticated;
revoke update (code, name) on public.roles from authenticated;
revoke delete on public.roles from authenticated;

revoke insert (role_id, permission_id)
on public.role_permissions from authenticated;
revoke delete on public.role_permissions from authenticated;

revoke insert (
  organization_id,
  branch_id,
  organization_member_id,
  access_status
) on public.branch_memberships from authenticated;
revoke update (access_status, revoked_at)
on public.branch_memberships from authenticated;
revoke delete on public.branch_memberships from authenticated;

revoke insert (
  organization_id,
  organization_member_id,
  role_id,
  branch_id,
  assigned_by
) on public.member_roles from authenticated;
revoke delete on public.member_roles from authenticated;

drop policy if exists organizations_update_manager
on public.organizations;
drop policy if exists branches_insert_org_manager
on public.branches;
drop policy if exists branches_update_manager
on public.branches;
drop policy if exists organization_members_insert_manager
on public.organization_members;
drop policy if exists organization_members_update_manager
on public.organization_members;
drop policy if exists roles_insert_manager
on public.roles;
drop policy if exists roles_update_manager
on public.roles;
drop policy if exists roles_delete_manager
on public.roles;
drop policy if exists role_permissions_insert_manager
on public.role_permissions;
drop policy if exists role_permissions_delete_manager
on public.role_permissions;
drop policy if exists branch_memberships_insert_manager
on public.branch_memberships;
drop policy if exists branch_memberships_update_manager
on public.branch_memberships;
drop policy if exists branch_memberships_delete_manager
on public.branch_memberships;
drop policy if exists member_roles_insert_manager
on public.member_roles;
drop policy if exists member_roles_delete_manager
on public.member_roles;

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

comment on function public.set_member_role(uuid, uuid, uuid, boolean) is
  'Assigns or revokes one role under AAL2, anti-self-escalation, and permission-superset checks.';

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

comment on function public.update_organization_member_status(uuid, text) is
  'Changes another member status under current-user user.manage + AAL2 and audits atomically.';

revoke all on function public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.set_role_permission(uuid, text, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.set_member_role(uuid, uuid, uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.set_branch_membership(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.update_organization_member_status(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)
to authenticated;
grant execute on function public.set_role_permission(uuid, text, boolean)
to authenticated;
grant execute on function public.set_member_role(uuid, uuid, uuid, boolean)
to authenticated;
grant execute on function public.set_branch_membership(uuid, uuid, text)
to authenticated;
grant execute on function public.update_organization_member_status(uuid, text)
to authenticated;
