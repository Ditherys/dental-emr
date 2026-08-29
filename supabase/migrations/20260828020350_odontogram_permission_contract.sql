-- O5: patient.clinical.correct permission. Additive and non-destructive.
-- Fixed OWNER/ADMIN defaults only. This permission does not imply
-- patient.clinical.read or patient.clinical.write; it is required
-- in addition to the applicable patient permission for execution
-- correction, legacy resolution, and any elevated non-terminal
-- superseding-event path. This object migration grants nothing
-- beyond the documented OWNER/ADMIN default.

insert into public.permissions (code, description)
values (
  'patient.clinical.correct',
  'Correct authorized clinical records through the audited elevated workflow; requires applicable patient permission plus an explicit correction grant.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code = 'patient.clinical.correct'
on conflict (role_id, permission_id) do nothing;
