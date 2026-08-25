begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('provider.read', 'provider.manage')
    group by permission.code
    order by permission.code
  $$,
  array['provider.manage:1', 'provider.read:1']::text[],
  'each provider permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select permission.code || ':' || permission.description
    from public.permissions as permission
    where permission.code in ('provider.read', 'provider.manage')
    order by permission.code
  $$,
  array[
    'provider.manage:Manage organization-level provider, specialty, and procedure configuration.',
    'provider.read:Read organization-level provider, specialty, and procedure configuration.'
  ]::text[],
  'provider permission descriptions remain stable'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('OWNER', 'ADMIN')
      and permission.code in ('provider.read', 'provider.manage')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:provider.manage',
    'ADMIN:provider.read',
    'OWNER:provider.manage',
    'OWNER:provider.read'
  ]::text[],
  'only the exact provider grants are attached to baseline owner and admin roles'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in (
        'DENTIST',
        'RECEPTIONIST',
        'DENTAL_ASSISTANT',
        'VISITING_SPECIALIST',
        'BILLING'
      )
      and permission.code in ('provider.read', 'provider.manage')
  ),
  0,
  'no non-administrative baseline role receives a provider permission'
);

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;
