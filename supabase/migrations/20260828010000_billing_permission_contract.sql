-- B1: granular financial permission vocabulary and fixed baseline grants.
-- This additive migration intentionally creates no ledger table or base-table
-- financial access. Later billing RPCs must derive tenant/actor/branch context.

insert into public.permissions (code, description)
values
  ('billing.read', 'Read authorized patient billing summaries and permitted branch financial events.'),
  ('billing.charge', 'Post authorized clinical charges at an authorized origin branch.'),
  ('payment.record', 'Record authorized payments and allocations at permitted branches.'),
  ('billing.adjust', 'Create audited billing adjustments, voids, refunds, and approved direct-cost corrections.'),
  ('billing.attribution.override', 'Override charge attribution through an audited elevated workflow.'),
  ('compensation.manage', 'Manage provider compensation agreements and resolve compensation exceptions.'),
  ('compensation.own.read', 'Read the actor provider''s own authorized earnings projection.'),
  ('financial.analytics.read', 'Read organization-scoped financial analytics permitted by financial role scope.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code in (
    'billing.read', 'billing.charge', 'payment.record', 'billing.adjust',
    'billing.attribution.override', 'compensation.manage',
    'compensation.own.read', 'financial.analytics.read'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and (
    (role.code = 'BILLING' and permission.code in ('billing.read', 'billing.charge', 'payment.record'))
    or (role.code = 'DENTIST' and permission.code in ('billing.read', 'billing.charge', 'compensation.own.read'))
    or (role.code = 'RECEPTIONIST' and permission.code in ('billing.read', 'payment.record'))
  )
on conflict (role_id, permission_id) do nothing;
