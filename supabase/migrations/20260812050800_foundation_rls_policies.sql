-- P1-11: foundation RLS helpers, least-privilege grants, and policies.
--
-- These SECURITY DEFINER helpers are necessary to read the membership graph
-- without recursive RLS evaluation. They are deliberately kept in the
-- non-exposed private schema, bind identity only through auth.uid(), set an
-- empty search_path, schema-qualify every relation, and return only booleans.

create or replace function private.is_active_org_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
      and organization.status = 'active'
  );
$$;

comment on function private.is_active_org_member(uuid) is
  'RLS-only check for the current JWT user active membership in an active organization.';

create or replace function private.has_org_permission(
  target_organization_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
     and member_role.branch_id is null
    join public.roles as role
      on role.id = member_role.role_id
     and (
       role.organization_id is null
       or role.organization_id = organization_member.organization_id
     )
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
      and organization.status = 'active'
      and permission.code = target_permission_code
  );
$$;

comment on function private.has_org_permission(uuid, text) is
  'RLS-only current-user permission check requiring an organization-wide role assignment.';

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
        exists (
          select 1
          from public.member_roles as member_role
          where member_role.organization_id = organization_member.organization_id
            and member_role.organization_member_id = organization_member.id
            and member_role.branch_id is null
        )
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
  'RLS-only branch context check for an org-wide role or an active explicit branch membership.';

create or replace function private.has_branch_permission(
  target_branch_id uuid,
  target_permission_code text
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
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
     and (
       member_role.branch_id is null
       or member_role.branch_id = branch.id
     )
    join public.roles as role
      on role.id = member_role.role_id
     and (
       role.organization_id is null
       or role.organization_id = organization_member.organization_id
     )
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where branch.id = target_branch_id
      and branch.status = 'active'
      and organization.status = 'active'
      and permission.code = target_permission_code
      and (
        member_role.branch_id is null
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

comment on function private.has_branch_permission(uuid, text) is
  'RLS-only current-user permission check honoring organization-wide or active exact-branch role scope.';

create or replace function private.is_own_organization_member(
  target_organization_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    where organization_member.id = target_organization_member_id
      and organization_member.user_id = (select auth.uid())
  );
$$;

comment on function private.is_own_organization_member(uuid) is
  'RLS-only identity binding used to expose own assignments and block self-escalation.';

revoke all on function private.is_active_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_permission(uuid, text) from public, anon, authenticated;
revoke all on function private.has_branch_access(uuid) from public, anon, authenticated;
revoke all on function private.has_branch_permission(uuid, text) from public, anon, authenticated;
revoke all on function private.is_own_organization_member(uuid) from public, anon, authenticated;

-- EXECUTE is required while evaluating stored policy expressions. The private
-- schema itself remains unavailable, so none of these helpers is a Data API RPC.
grant execute on function private.is_active_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid, text) to authenticated;
grant execute on function private.has_branch_access(uuid) to authenticated;
grant execute on function private.has_branch_permission(uuid, text) to authenticated;
grant execute on function private.is_own_organization_member(uuid) to authenticated;

-- Remove broad/default Data API privileges before granting the exact commands
-- and mutable columns supported by the foundation policies below.
revoke all on table
  public.organizations,
  public.branches,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.branch_memberships,
  public.member_roles,
  public.audit_events
from public, anon, authenticated;

grant select on table
  public.organizations,
  public.branches,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.branch_memberships,
  public.member_roles,
  public.audit_events
to authenticated;

grant update (
  legal_name,
  business_name,
  slug,
  country_code,
  default_timezone,
  default_currency
) on public.organizations to authenticated;

grant insert (
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
) on public.branches to authenticated;

grant update (
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
) on public.branches to authenticated;

grant update (
  display_name,
  first_name,
  last_name,
  mobile,
  avatar_object_key
) on public.profiles to authenticated;

grant insert (
  organization_id,
  user_id,
  membership_status,
  joined_at,
  suspended_at
) on public.organization_members to authenticated;

grant update (
  membership_status,
  joined_at,
  suspended_at
) on public.organization_members to authenticated;

grant insert (organization_id, code, name) on public.roles to authenticated;
grant update (code, name) on public.roles to authenticated;
grant delete on public.roles to authenticated;

grant insert (role_id, permission_id) on public.role_permissions to authenticated;
grant delete on public.role_permissions to authenticated;

grant insert (
  organization_id,
  branch_id,
  organization_member_id,
  access_status
) on public.branch_memberships to authenticated;

grant update (access_status, revoked_at) on public.branch_memberships to authenticated;
grant delete on public.branch_memberships to authenticated;

grant insert (
  organization_id,
  organization_member_id,
  role_id,
  branch_id,
  assigned_by
) on public.member_roles to authenticated;

grant delete on public.member_roles to authenticated;

-- Reassert RLS on every exposed foundation application table. No anon policy is
-- created; anonymous Data API access therefore fails closed at the grant layer.
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.branch_memberships enable row level security;
alter table public.member_roles enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select_active_member
on public.organizations
for select
to authenticated
using ((select private.is_active_org_member(id)));

create policy organizations_update_manager
on public.organizations
for update
to authenticated
using ((select private.has_org_permission(id, 'organization.manage')))
with check ((select private.has_org_permission(id, 'organization.manage')));

create policy branches_select_authorized
on public.branches
for select
to authenticated
using (
  (select private.has_branch_access(id))
  or (select private.has_org_permission(organization_id, 'branch.manage'))
);

create policy branches_insert_org_manager
on public.branches
for insert
to authenticated
with check ((select private.has_org_permission(organization_id, 'branch.manage')));

create policy branches_update_manager
on public.branches
for update
to authenticated
using (
  (select private.has_org_permission(organization_id, 'branch.manage'))
  or (select private.has_branch_permission(id, 'branch.manage'))
)
with check (
  (select private.has_org_permission(organization_id, 'branch.manage'))
  or (select private.has_branch_permission(id, 'branch.manage'))
);

create policy profiles_select_self_or_org_manager
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.organization_members as target_membership
    where target_membership.user_id = profiles.user_id
      and target_membership.membership_status <> 'removed'
      and (select private.has_org_permission(
        target_membership.organization_id,
        'user.manage'
      ))
  )
);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy organization_members_select_manager
on public.organization_members
for select
to authenticated
using ((select private.has_org_permission(organization_id, 'user.manage')));

create policy organization_members_insert_manager
on public.organization_members
for insert
to authenticated
with check (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and user_id <> (select auth.uid())
);

create policy organization_members_update_manager
on public.organization_members
for update
to authenticated
using (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(id))
)
with check (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(id))
);

create policy roles_select_active_member
on public.roles
for select
to authenticated
using (
  (
    organization_id is null
    and exists (
      select 1
      from public.organization_members as current_membership
      where current_membership.user_id = (select auth.uid())
        and (select private.is_active_org_member(
          current_membership.organization_id
        ))
    )
  )
  or (
    organization_id is not null
    and (select private.is_active_org_member(organization_id))
  )
);

create policy roles_insert_manager
on public.roles
for insert
to authenticated
with check (
  organization_id is not null
  and not is_system
  and (select private.has_org_permission(organization_id, 'role.manage'))
);

create policy roles_update_manager
on public.roles
for update
to authenticated
using (
  organization_id is not null
  and (select private.has_org_permission(organization_id, 'role.manage'))
)
with check (
  organization_id is not null
  and not is_system
  and (select private.has_org_permission(organization_id, 'role.manage'))
);

create policy roles_delete_manager
on public.roles
for delete
to authenticated
using (
  organization_id is not null
  and (select private.has_org_permission(organization_id, 'role.manage'))
);

create policy permissions_select_active_member
on public.permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as current_membership
    where current_membership.user_id = (select auth.uid())
      and (select private.is_active_org_member(
        current_membership.organization_id
      ))
  )
);

create policy role_permissions_select_visible_role
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles as visible_role
    where visible_role.id = role_permissions.role_id
  )
);

create policy role_permissions_insert_manager
on public.role_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.roles as managed_role
    where managed_role.id = role_permissions.role_id
      and managed_role.organization_id is not null
      and (select private.has_org_permission(
        managed_role.organization_id,
        'role.manage'
      ))
  )
);

create policy role_permissions_delete_manager
on public.role_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.roles as managed_role
    where managed_role.id = role_permissions.role_id
      and managed_role.organization_id is not null
      and (select private.has_org_permission(
        managed_role.organization_id,
        'role.manage'
      ))
  )
);

create policy branch_memberships_select_self
on public.branch_memberships
for select
to authenticated
using (
  (select private.is_active_org_member(organization_id))
  and (select private.is_own_organization_member(organization_member_id))
);

create policy branch_memberships_select_manager
on public.branch_memberships
for select
to authenticated
using ((select private.has_org_permission(organization_id, 'user.manage')));

create policy branch_memberships_insert_manager
on public.branch_memberships
for insert
to authenticated
with check (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
);

create policy branch_memberships_update_manager
on public.branch_memberships
for update
to authenticated
using (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
)
with check (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
);

create policy branch_memberships_delete_manager
on public.branch_memberships
for delete
to authenticated
using (
  (select private.has_org_permission(organization_id, 'user.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
);

create policy member_roles_select_self
on public.member_roles
for select
to authenticated
using (
  (select private.is_active_org_member(organization_id))
  and (select private.is_own_organization_member(organization_member_id))
);

create policy member_roles_select_manager
on public.member_roles
for select
to authenticated
using ((select private.has_org_permission(organization_id, 'role.manage')));

create policy member_roles_insert_manager
on public.member_roles
for insert
to authenticated
with check (
  (select private.has_org_permission(organization_id, 'role.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
  and assigned_by = (select auth.uid())
);

create policy member_roles_delete_manager
on public.member_roles
for delete
to authenticated
using (
  (select private.has_org_permission(organization_id, 'role.manage'))
  and not (select private.is_own_organization_member(organization_member_id))
);

create policy audit_events_select_authorized
on public.audit_events
for select
to authenticated
using (
  (select private.has_org_permission(organization_id, 'audit.read'))
  or (
    branch_id is not null
    and (select private.has_branch_permission(branch_id, 'audit.read'))
  )
);
