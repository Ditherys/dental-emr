-- Phase 1 secure baseline — file 6 of 8: RLS authorization helpers and the
-- final Row Level Security policy set.
--
-- These SECURITY DEFINER helpers are necessary to read the membership graph
-- without recursive RLS evaluation. They are deliberately kept in the
-- non-exposed private schema, bind identity only through auth.uid(), set an
-- empty search_path, schema-qualify every relation, and return only booleans.
--
-- BASELINE INVARIANT: this file grants nothing. Each helper revokes PUBLIC/anon/
-- authenticated EXECUTE immediately after creation. The EXECUTE grants that RLS
-- policy evaluation requires are issued in file 8, together with the SELECT
-- grants that make policy evaluation reachable at all. Before file 8 no
-- browser-reachable role holds any table privilege, so no policy in this file is
-- evaluable by anon or authenticated at any boundary.
--
-- The policy set below is the FINAL Phase 1 set. Privileged administrative
-- mutation is not expressed as a policy at all: it is available only through the
-- AAL2-gated SECURITY DEFINER RPCs created in file 7. The only non-SELECT policy
-- is profile self-service, which is not an administrative capability.

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

revoke all on function private.is_active_org_member(uuid) from public, anon, authenticated;

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

revoke all on function private.has_org_permission(uuid, text) from public, anon, authenticated;

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

revoke all on function private.has_branch_access(uuid) from public, anon, authenticated;

comment on function private.has_branch_access(uuid) is
  'RLS-only branch access: org-wide branch managers or active exact-branch members.';

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

revoke all on function private.has_branch_permission(uuid, text) from public, anon, authenticated;

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

revoke all on function private.is_own_organization_member(uuid) from public, anon, authenticated;

comment on function private.is_own_organization_member(uuid) is
  'RLS-only identity binding used to expose own assignments and block self-escalation.';

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

revoke all on function private.require_aal2() from public, anon, authenticated;

comment on function private.require_aal2() is
  'Fails closed unless the current Supabase JWT was issued at AAL2.';

-- Reassert RLS on every exposed foundation application table. RLS was already
-- enabled with each CREATE TABLE in files 2 through 4; this is a deliberate,
-- idempotent restatement so the protected set is auditable in one place. No anon
-- policy is created anywhere in the baseline, so anonymous Data API access fails
-- closed at both the grant layer and the policy layer.
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

create policy branches_select_authorized
on public.branches
for select
to authenticated
using (
  (select private.has_branch_access(id))
  or (select private.has_org_permission(organization_id, 'branch.manage'))
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

create policy organization_members_select_authorized
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_org_permission(organization_id, 'user.manage'))
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

create policy branch_memberships_select_authorized
on public.branch_memberships
for select
to authenticated
using (
  (
    (select private.is_active_org_member(organization_id))
    and (select private.is_own_organization_member(organization_member_id))
  )
  or (select private.has_org_permission(organization_id, 'user.manage'))
);

create policy member_roles_select_authorized
on public.member_roles
for select
to authenticated
using (
  (
    (select private.is_active_org_member(organization_id))
    and (select private.is_own_organization_member(organization_member_id))
  )
  or (select private.has_org_permission(organization_id, 'role.manage'))
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
