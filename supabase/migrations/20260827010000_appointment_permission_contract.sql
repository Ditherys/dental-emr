-- P6-01: appointment permission vocabulary and the fixed baseline role matrix.
-- Mirrors the P3-01/P5-08 contract pattern. This additive catalog migration
-- does not alter workforce delegation behavior and grants no functions.

insert into public.permissions (code, description)
values
  (
    'appointment.read',
    'View authorized branch appointment and scheduling information.'
  ),
  (
    'appointment.write',
    'Create and manage authorized branch appointments and scheduling.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST', 'RECEPTIONIST')
  and permission.code in ('appointment.read', 'appointment.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('DENTAL_ASSISTANT')
  and permission.code = 'appointment.read'
on conflict do nothing;
