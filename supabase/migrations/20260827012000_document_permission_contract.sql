-- P11-01: document permission vocabulary and the fixed baseline role matrix.
-- Mirrors the P6-01 contract pattern. Grants no functions.

insert into public.permissions (code, description)
values
  (
    'document.view',
    'View generated and exportable clinic documents and their snapshots.'
  ),
  (
    'document.generate',
    'Generate sensitive clinic documents and authorized patient-record exports.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST')
  and permission.code in ('document.generate', 'document.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('RECEPTIONIST')
  and permission.code = 'document.view'
on conflict do nothing;