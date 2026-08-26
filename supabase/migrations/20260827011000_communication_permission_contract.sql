-- P8-01: communication permission vocabulary and the fixed baseline role
-- matrix. Mirrors the P6-01/P7-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values
  (
    'communication.view',
    'View authorized communication history and delivery state.'
  ),
  (
    'communication.send',
    'Enqueue and manage authorized outbound communications and reminders.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'RECEPTIONIST')
  and permission.code in ('communication.view', 'communication.send')
on conflict do nothing;