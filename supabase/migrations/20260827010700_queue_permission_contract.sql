-- P7-01: queue permission vocabulary and the fixed baseline role matrix.
-- Mirrors the P3-01/P6-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values
  (
    'queue.read',
    'View the authorized branch walk-in and waiting queue.'
  ),
  (
    'queue.manage',
    'Create and advance authorized branch walk-in and queue entries.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'RECEPTIONIST')
  and permission.code in ('queue.read', 'queue.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('DENTIST', 'DENTAL_ASSISTANT')
  and permission.code = 'queue.read'
on conflict do nothing;