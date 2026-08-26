-- P10-01: specialist request permission vocabulary and the fixed baseline role
-- matrix. Mirrors the P6-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values (
  'specialist.request',
  'Create and respond to visiting and on-call specialist requests.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST', 'RECEPTIONIST')
  and permission.code = 'specialist.request'
on conflict do nothing;