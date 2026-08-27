begin;

select extensions.plan(4);

select extensions.is(
  (select count(*)::integer from public.permissions where code = 'intake.manage'),
  1,
  'the intake.manage permission row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'intake.manage'
    order by role.code
  $$,
  array[
    'ADMIN:intake.manage',
    'OWNER:intake.manage',
    'RECEPTIONIST:intake.manage'
  ]::text[],
  'only OWNER, ADMIN, and RECEPTIONIST receive intake.manage'
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
      and permission.code = 'intake.manage'
  ),
  0,
  'no other baseline role receives intake.manage'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.permissions as permission on permission.id = role_permission.permission_id
    where permission.code = 'intake.manage'
      and role_permission.role_id in (
        select role.id from public.roles as role where role.organization_id is not null
      )
  ),
  0,
  'intake.manage is never granted to an organization-custom role'
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