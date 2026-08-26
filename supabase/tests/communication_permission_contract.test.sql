begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('communication.view', 'communication.send')
    group by permission.code
    order by permission.code
  $$,
  array['communication.send:1', 'communication.view:1']::text[],
  'each communication permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select permission.code || ':' || permission.description
    from public.permissions as permission
    where permission.code in ('communication.view', 'communication.send')
    order by permission.code
  $$,
  array[
    'communication.send:Enqueue and manage authorized outbound communications and reminders.',
    'communication.view:View authorized communication history and delivery state.'
  ]::text[],
  'communication permission descriptions remain stable'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('communication.view', 'communication.send')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:communication.send',
    'ADMIN:communication.view',
    'OWNER:communication.send',
    'OWNER:communication.view',
    'RECEPTIONIST:communication.send',
    'RECEPTIONIST:communication.view'
  ]::text[],
  'the communication role matrix is exactly as specified'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('DENTIST', 'DENTAL_ASSISTANT', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code in ('communication.view', 'communication.send')
  ),
  0,
  'no clinical or billing role receives a communication permission'
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