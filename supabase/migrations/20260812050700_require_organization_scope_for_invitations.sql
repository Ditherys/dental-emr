-- P1-08 hardening: workforce invitation authority is organization-wide.
-- A role assignment scoped to one branch must not inherit tenant-wide invite or
-- role-management capability merely because its role catalog contains it.

create or replace function private.user_has_permission(
  target_user_id uuid,
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
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.role_permissions as role_permission
      on role_permission.role_id = member_role.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = target_user_id
      and organization_member.membership_status = 'active'
      and member_role.branch_id is null
      and permission.code = target_permission_code
  );
$$;

comment on function private.user_has_permission(uuid, uuid, text) is
  'Current organization-wide membership permission check used only by server-controlled foundation RPCs.';

revoke all on function private.user_has_permission(uuid, uuid, text) from public;
revoke all on function private.user_has_permission(uuid, uuid, text) from anon;
revoke all on function private.user_has_permission(uuid, uuid, text) from authenticated;
