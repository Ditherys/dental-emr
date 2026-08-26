begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('queue.read', 'queue.manage')
    group by permission.code
    order by permission.code
  $$,
  array['queue.manage:1', 'queue.read:1']::text[],
  'each queue permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select permission.code || ':' || permission.description
    from public.permissions as permission
    where permission.code in ('queue.read', 'queue.manage')
    order by permission.code
  $$,
  array[
    'queue.manage:Create and advance authorized branch walk-in and queue entries.',
    'queue.read:View the authorized branch walk-in and waiting queue.'
  ]::text[],
  'queue permission descriptions remain stable'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('queue.read', 'queue.manage')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:queue.manage',
    'ADMIN:queue.read',
    'DENTAL_ASSISTANT:queue.read',
    'DENTIST:queue.read',
    'OWNER:queue.manage',
    'OWNER:queue.read',
    'RECEPTIONIST:queue.manage',
    'RECEPTIONIST:queue.read'
  ]::text[],
  'the queue role matrix is exactly as specified'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('VISITING_SPECIALIST', 'BILLING')
      and permission.code in ('queue.read', 'queue.manage')
  ),
  0,
  'neither VISITING_SPECIALIST nor BILLING receives a queue permission'
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