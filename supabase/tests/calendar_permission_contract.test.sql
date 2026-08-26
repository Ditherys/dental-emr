begin;

select extensions.plan(3);

select extensions.is(
  (select count(*)::integer from public.permissions where code = 'calendar.manage'),
  1,
  'the calendar.manage permission row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'calendar.manage'
    order by role.code
  $$,
  array[
    'ADMIN:calendar.manage',
    'DENTIST:calendar.manage',
    'OWNER:calendar.manage'
  ]::text[],
  'only OWNER, ADMIN, and DENTIST receive calendar.manage'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('RECEPTIONIST', 'DENTAL_ASSISTANT', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code = 'calendar.manage'
  ),
  0,
  'no non-owning role receives calendar.manage'
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