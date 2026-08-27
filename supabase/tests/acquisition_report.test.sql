begin;

select extensions.no_plan();

-- P5-08 synthetic-only graph. The owner is an organization-wide OWNER of Org A
-- (the only role that may hold analytics.view); the receptionist is Org A's
-- RECEPTIONIST; the foreign owner belongs to Org B. Org B patients prove the
-- aggregate RPC stays tenant-scoped server-side.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a8100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@p508.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('a8100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reception@p508.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('a8100000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foreign@p508.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('a8200000-0000-0000-0000-000000000001', 'P508 A Inc.', 'P508 A', 'p508-a'),
  ('a8200000-0000-0000-0000-000000000002', 'P508 B Inc.', 'P508 B', 'p508-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('a8300000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'P508 A', 'p508-a-main', 'P508-A', '1 Test St', 'Test', 'Test'),
  ('a8300000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-000000000002', 'P508 B', 'p508-b-main', 'P508-B', '2 Test St', 'Test', 'Test');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('a8400000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('a8400000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('a8400000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-000000000003', 'active', statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('a8200000-0000-0000-0000-000000000001', 'a8300000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-000000000001', 'active'),
  ('a8200000-0000-0000-0000-000000000001', 'a8300000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-000000000002', 'active'),
  ('a8200000-0000-0000-0000-000000000002', 'a8300000-0000-0000-0000-000000000002', 'a8400000-0000-0000-0000-000000000003', 'active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('a8200000-0000-0000-0000-000000000001'::uuid, 'a8400000-0000-0000-0000-000000000001'::uuid, null::uuid, 'a8100000-0000-0000-0000-000000000001'::uuid),
  ('a8200000-0000-0000-0000-000000000001'::uuid, 'a8400000-0000-0000-0000-000000000002'::uuid, 'a8300000-0000-0000-0000-000000000001'::uuid, 'a8100000-0000-0000-0000-000000000001'::uuid),
  ('a8200000-0000-0000-0000-000000000002'::uuid, 'a8400000-0000-0000-0000-000000000003'::uuid, 'a8300000-0000-0000-0000-000000000002'::uuid, 'a8100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, member_id, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = case
  when assignment.member_id = 'a8400000-0000-0000-0000-000000000002' then 'RECEPTIONIST'
  else 'OWNER'
end;

select extensions.set_eq(
  $$
    select permission.code || ':' || count(*)::text
    from public.permissions as permission
    where permission.code = 'analytics.view'
    group by permission.code
  $$,
  array['analytics.view:1']::text[],
  'the analytics.view permission catalog row exists exactly once'
);

select extensions.is(
  (select description from public.permissions where code = 'analytics.view'),
  'View organization-level operational, acquisition, and referral analytics.',
  'the analytics.view permission description stays stable'
);

select extensions.set_eq(
  $$
    select role.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'analytics.view'
    order by role.code
  $$,
  array['ADMIN', 'OWNER']::text[],
  'only OWNER and ADMIN baseline roles receive analytics.view'
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
      and permission.code = 'analytics.view'
  ),
  0,
  'no non-administrative baseline role receives analytics.view'
);

select extensions.is(
  (select count(*)::integer from pg_proc
    where oid = 'public.get_acquisition_summary(uuid,integer)'::regprocedure
      and prosecdef
      and proconfig = array['search_path=""']::text[]),
  1,
  'the summary RPC is a definer pinned to an empty search path'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.get_acquisition_summary(uuid,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.get_acquisition_summary(uuid,integer)', 'execute'),
  'only authenticated receives the P5-08 summary grant'
);

-- The helper is exercised directly through auth context while still superuser.
select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select private.can_view_acquisition_report('a8200000-0000-0000-0000-000000000001')),
  true,
  'an organization-wide OWNER passes the analytics.view helper'
);
select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select private.can_view_acquisition_report('a8200000-0000-0000-0000-000000000001')),
  false,
  'a receptionist fails the analytics.view helper'
);
select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000003', true);
select extensions.is(
  (select private.can_view_acquisition_report('a8200000-0000-0000-0000-000000000001')),
  false,
  'a foreign-org owner cannot read the report for Org A'
);

-- Deterministic Org A patients with known source/category/channel. P5 sits
-- outside the 365-day window; P7 sits inside 365 but outside 30.
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, acquisition_source_id, initial_booking_channel_code, created_at) values
  ('a8600000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'P508-A-1', 'One', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000007', 'WALK_IN', statement_timestamp()),
  ('a8600000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-000000000001', 'P508-A-2', 'Two', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000007', 'FACEBOOK_MESSENGER', statement_timestamp()),
  ('a8600000-0000-0000-0000-000000000003', 'a8200000-0000-0000-0000-000000000001', 'P508-A-3', 'Three', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000003', 'PHONE', statement_timestamp()),
  ('a8600000-0000-0000-0000-000000000004', 'a8200000-0000-0000-0000-000000000001', 'P508-A-4', 'Four', 'A', date '1980-01-01', null, 'WALK_IN', statement_timestamp()),
  ('a8600000-0000-0000-0000-000000000005', 'a8200000-0000-0000-0000-000000000001', 'P508-A-5', 'Five', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000007', null, statement_timestamp() - interval '400 days'),
  ('a8600000-0000-0000-0000-000000000006', 'a8200000-0000-0000-0000-000000000001', 'P508-A-6', 'Six', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000005', 'WALK_IN', statement_timestamp()),
  ('a8600000-0000-0000-0000-000000000007', 'a8200000-0000-0000-0000-000000000001', 'P508-A-7', 'Seven', 'A', date '1980-01-01', 'a5000000-0000-0000-0000-000000000005', 'WALK_IN', statement_timestamp() - interval '60 days');
-- Org B patient must never leak into Org A counts.
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, acquisition_source_id, initial_booking_channel_code, created_at) values
  ('a8600000-0000-0000-0000-000000000011', 'a8200000-0000-0000-0000-000000000002', 'P508-B-1', 'One', 'B', date '1980-01-01', 'a5000000-0000-0000-0000-000000000005', 'WALK_IN', statement_timestamp());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000001', true);

select extensions.throws_ok(
  $$select public.get_acquisition_summary('a8300000-0000-0000-0000-000000000001', 45)$$,
  '22023',
  'invalid input',
  'a window outside 30/90/365 raises invalid input'
);

select extensions.set_eq(
  $$
    select group_type || ':' || code || '=' || patient_count::text
    from public.get_acquisition_summary('a8300000-0000-0000-0000-000000000001', 30)
    where group_type = 'source'
    order by group_type, name, code
  $$,
  array['source:DENTIST_REFERRAL=1', 'source:FACEBOOK=2', 'source:GOOGLE_SEARCH=1']::text[],
  'the 30-day window counts sources within it (P7 excluded)'
);

select extensions.set_eq(
  $$
    select group_type || ':' || code || '=' || patient_count::text
    from public.get_acquisition_summary('a8300000-0000-0000-0000-000000000001', 365)
    order by group_type, name, code
  $$,
  array[
    'source:DENTIST_REFERRAL=1',
    'source:FACEBOOK=2',
    'source:GOOGLE_SEARCH=2',
    'category:DIGITAL=4',
    'category:REFERRAL=1',
    'channel:FACEBOOK_MESSENGER=1',
    'channel:PHONE=1',
    'channel:WALK_IN=4'
  ]::text[],
  'the 365-day window counts by source, category, and channel, excludes the 400-day patient and no-source patients, and stays deterministic'
);

select extensions.is(
  (
    select count(*)::integer
    from public.get_acquisition_summary('a8300000-0000-0000-0000-000000000001', 365)
    where group_type = 'channel' and code = 'WALK_IN' and patient_count = 4
  ),
  1,
  'Org B patients are not counted in Org A channel totals'
);

select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.get_acquisition_summary('a8300000-0000-0000-0000-000000000001', 30)$$,
  '42501',
  'not authorized',
  'a non-administrative authenticated user is denied the report'
);

select set_config('request.jwt.claim.sub', 'a8100000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.get_acquisition_summary('a8ffffff-0000-0000-0000-000000000001', 30)$$,
  '42501',
  'not authorized',
  'a forged or bogus acting branch is denied'
);

select extensions.is(
  (select count(*)::integer from public.audit_events
    where organization_id = 'a8200000-0000-0000-0000-000000000001'
      and action like '%.viewed'
      and (metadata -> 'report') is not null),
  0,
  'the read-only report writes no audit event'
);

reset role;

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
