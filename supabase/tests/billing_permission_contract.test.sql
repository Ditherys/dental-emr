begin;

select extensions.plan(3);

select extensions.is(
  (select count(*)::integer from public.permissions where code in (
    'billing.read', 'billing.charge', 'payment.record', 'billing.adjust',
    'billing.attribution.override', 'compensation.manage',
    'compensation.own.read', 'financial.analytics.read'
  )),
  8,
  'each granular billing permission exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null and role.is_system
      and role.code in ('OWNER', 'ADMIN', 'BILLING', 'DENTIST', 'RECEPTIONIST')
      and permission.code in (
        'billing.read', 'billing.charge', 'payment.record', 'billing.adjust',
        'billing.attribution.override', 'compensation.manage',
        'compensation.own.read', 'financial.analytics.read'
      )
    order by role.code, permission.code
  $$,
  array[
    'ADMIN:billing.adjust', 'ADMIN:billing.attribution.override', 'ADMIN:billing.charge', 'ADMIN:billing.read', 'ADMIN:compensation.manage', 'ADMIN:compensation.own.read', 'ADMIN:financial.analytics.read', 'ADMIN:payment.record',
    'BILLING:billing.charge', 'BILLING:billing.read', 'BILLING:payment.record',
    'DENTIST:billing.charge', 'DENTIST:billing.read', 'DENTIST:compensation.own.read',
    'OWNER:billing.adjust', 'OWNER:billing.attribution.override', 'OWNER:billing.charge', 'OWNER:billing.read', 'OWNER:compensation.manage', 'OWNER:compensation.own.read', 'OWNER:financial.analytics.read', 'OWNER:payment.record',
    'RECEPTIONIST:billing.read', 'RECEPTIONIST:payment.record'
  ]::text[],
  'system role financial grants match the fixed B1 matrix'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null and role.is_system
      and role.code in ('DENTAL_ASSISTANT', 'VISITING_SPECIALIST')
      and permission.code in (
        'billing.read', 'billing.charge', 'payment.record', 'billing.adjust',
        'billing.attribution.override', 'compensation.manage',
        'compensation.own.read', 'financial.analytics.read'
      )
  ),
  0,
  'assistant and visiting specialist receive no financial permission by default'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
