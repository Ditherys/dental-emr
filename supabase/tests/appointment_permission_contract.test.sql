begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('appointment.read', 'appointment.write')
    group by permission.code
    order by permission.code
  $$,
  array['appointment.read:1', 'appointment.write:1']::text[],
  'each appointment permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select permission.code || ':' || permission.description
    from public.permissions as permission
    where permission.code in ('appointment.read', 'appointment.write')
    order by permission.code
  $$,
  array[
    'appointment.read:View authorized branch appointment and scheduling information.',
    'appointment.write:Create and manage authorized branch appointments and scheduling.'
  ]::text[],
  'appointment permission descriptions remain stable'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('appointment.read', 'appointment.write')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:appointment.read',
    'ADMIN:appointment.write',
    'DENTAL_ASSISTANT:appointment.read',
    'DENTIST:appointment.read',
    'DENTIST:appointment.write',
    'OWNER:appointment.read',
    'OWNER:appointment.write',
    'RECEPTIONIST:appointment.read',
    'RECEPTIONIST:appointment.write'
  ]::text[],
  'the appointment role matrix is exactly as specified'
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
      and permission.code in ('appointment.read', 'appointment.write')
  ),
  0,
  'neither VISITING_SPECIALIST nor BILLING receives an appointment permission'
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
