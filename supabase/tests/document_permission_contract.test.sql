begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code in ('document.generate', 'document.view')
    group by permission.code
    order by permission.code
  $$,
  array['document.generate:1', 'document.view:1']::text[],
  'each document permission catalog row exists exactly once'
);

select extensions.set_eq(
  $$
    select permission.code || ':' || permission.description
    from public.permissions as permission
    where permission.code in ('document.generate', 'document.view')
    order by permission.code
  $$,
  array[
    'document.generate:Generate sensitive clinic documents and authorized patient-record exports.',
    'document.view:View generated and exportable clinic documents and their snapshots.'
  ]::text[],
  'document permission descriptions remain stable'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code in ('document.generate', 'document.view')
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:document.generate',
    'ADMIN:document.view',
    'DENTIST:document.generate',
    'DENTIST:document.view',
    'OWNER:document.generate',
    'OWNER:document.view',
    'RECEPTIONIST:document.view'
  ]::text[],
  'the document role matrix is exactly as specified'
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
      and permission.code in ('document.generate', 'document.view')
  ),
  0,
  'no other baseline role receives a document permission'
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