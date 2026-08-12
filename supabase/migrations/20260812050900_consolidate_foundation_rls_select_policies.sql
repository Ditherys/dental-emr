-- P1-11 performance hardening: combine equivalent permissive SELECT policies
-- so PostgreSQL evaluates one authorization expression per protected table.

drop policy organization_members_select_self
on public.organization_members;

drop policy organization_members_select_manager
on public.organization_members;

create policy organization_members_select_authorized
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_org_permission(organization_id, 'user.manage'))
);

drop policy branch_memberships_select_self
on public.branch_memberships;

drop policy branch_memberships_select_manager
on public.branch_memberships;

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

drop policy member_roles_select_self
on public.member_roles;

drop policy member_roles_select_manager
on public.member_roles;

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
