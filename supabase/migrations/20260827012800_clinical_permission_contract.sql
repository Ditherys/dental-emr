-- P14-01: clinical permission vocabulary and the fixed baseline role matrix.
-- Reception gets neither clinical permission. Mirrors the P2-01 contract
-- pattern. Grants no functions.

insert into public.permissions (code, description)
values
  (
    'patient.clinical.read',
    'Read authorized patient clinical encounters, notes, and history.'
  ),
  (
    'patient.clinical.write',
    'Create and manage authorized patient clinical encounters and notes.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST')
  and permission.code in ('patient.clinical.read', 'patient.clinical.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('DENTAL_ASSISTANT')
  and permission.code = 'patient.clinical.read'
on conflict do nothing;