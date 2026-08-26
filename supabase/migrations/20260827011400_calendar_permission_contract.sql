-- P9-01: calendar permission vocabulary and the fixed baseline role matrix.
-- Mirrors the P6-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values (
  'calendar.manage',
  'Connect and manage provider calendar integration and synchronization.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST')
  and permission.code = 'calendar.manage'
on conflict do nothing;