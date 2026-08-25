-- P3-01: Provider permission vocabulary and the fixed baseline role matrix.
-- This additive catalog migration does not alter workforce delegation behavior.

insert into public.permissions (code, description)
values
  (
    'provider.read',
    'Read organization-level provider, specialty, and procedure configuration.'
  ),
  (
    'provider.manage',
    'Manage organization-level provider, specialty, and procedure configuration.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code in ('provider.read', 'provider.manage')
on conflict do nothing;
