begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('recall.manage', 'recall.read')
    group by permission.code
    order by permission.code
  $$,
  array['recall.manage:1', 'recall.read:1']::text[],
  'each recall permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('recall.manage', 'recall.read')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:recall.manage',
    'ADMIN:recall.read',
    'DENTIST:recall.manage',
    'DENTIST:recall.read',
    'OWNER:recall.manage',
    'OWNER:recall.read',
    'RECEPTIONIST:recall.read'
  ]::text[],
  'the recall role matrix is exactly as specified'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('VISITING_SPECIALIST', 'BILLING', 'DENTAL_ASSISTANT')
      and permission.code in ('recall.manage', 'recall.read')
  ),
  0,
  'visiting specialist, billing, and dental assistant roles receive no recall permission'
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
      and permission.code = 'recall.manage'
  ),
  0,
  'reception cannot manage recalls'
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