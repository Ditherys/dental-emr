begin;

select extensions.plan(3);

select extensions.is(
  (select count(*)::integer from public.permissions where code = 'specialist.request'),
  1,
  'the specialist.request permission row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'specialist.request'
    order by role.code
  $$,
  array[
    'ADMIN:specialist.request',
    'DENTIST:specialist.request',
    'OWNER:specialist.request',
    'RECEPTIONIST:specialist.request'
  ]::text[],
  'only OWNER, ADMIN, DENTIST, and RECEPTIONIST receive specialist.request'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('DENTAL_ASSISTANT', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code = 'specialist.request'
  ),
  0,
  'no other baseline role receives specialist.request'
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