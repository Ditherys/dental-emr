begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('patient.clinical.read', 'patient.clinical.write')
    group by permission.code
    order by permission.code
  $$,
  array['patient.clinical.read:1', 'patient.clinical.write:1']::text[],
  'each clinical permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('patient.clinical.read', 'patient.clinical.write')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:patient.clinical.read',
    'ADMIN:patient.clinical.write',
    'DENTAL_ASSISTANT:patient.clinical.read',
    'DENTIST:patient.clinical.read',
    'DENTIST:patient.clinical.write',
    'OWNER:patient.clinical.read',
    'OWNER:patient.clinical.write'
  ]::text[],
  'the clinical role matrix is exactly as specified'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('RECEPTIONIST', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code in ('patient.clinical.read', 'patient.clinical.write')
  ),
  0,
  'reception, visiting specialist, and billing roles receive no clinical permission'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('RECEPTIONIST')
      and permission.code = 'patient.clinical.write'
  ),
  0,
  'reception cannot write clinical notes'
);

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;