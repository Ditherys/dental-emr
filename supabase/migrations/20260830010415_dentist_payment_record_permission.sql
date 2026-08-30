-- ADR-030: dentists may record payments for clinically authorized patients.
-- The payment RPC still requires patient.clinical.read for DENTIST actors and
-- derives the receiving actor from auth.uid(); this grant does not confer any
-- payment adjustment, refund, reversal, or analytics capability.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code = 'DENTIST'
  and permission.code = 'payment.record'
on conflict (role_id, permission_id) do nothing;
