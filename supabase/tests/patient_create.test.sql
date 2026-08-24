begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a4010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-a@p204.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a4010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@p204.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a4010000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-b@p204.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('a4020000-0000-0000-0000-000000000001', 'P204 Synthetic A Inc.', 'P204 Synthetic A', 'p204-synthetic-a'),
  ('a4020000-0000-0000-0000-000000000002', 'P204 Synthetic B Inc.', 'P204 Synthetic B', 'p204-synthetic-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('a4030000-0000-0000-0000-000000000001', 'a4020000-0000-0000-0000-000000000001', 'P204 A Main', 'p204-a-main', 'P204-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('a4030000-0000-0000-0000-000000000002', 'a4020000-0000-0000-0000-000000000002', 'P204 B Main', 'p204-b-main', 'P204-B1', '2 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('a4040000-0000-0000-0000-000000000001', 'a4020000-0000-0000-0000-000000000001', 'a4010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('a4040000-0000-0000-0000-000000000002', 'a4020000-0000-0000-0000-000000000001', 'a4010000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('a4040000-0000-0000-0000-000000000003', 'a4020000-0000-0000-0000-000000000002', 'a4010000-0000-0000-0000-000000000003', 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.user_id
from (values
  ('a4020000-0000-0000-0000-000000000001'::uuid, 'a4040000-0000-0000-0000-000000000001'::uuid, 'DENTIST'::text, 'a4010000-0000-0000-0000-000000000001'::uuid),
  ('a4020000-0000-0000-0000-000000000001'::uuid, 'a4040000-0000-0000-0000-000000000002'::uuid, 'OWNER'::text, 'a4010000-0000-0000-0000-000000000002'::uuid),
  ('a4020000-0000-0000-0000-000000000002'::uuid, 'a4040000-0000-0000-0000-000000000003'::uuid, 'DENTIST'::text, 'a4010000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, member_id, role_code, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

select extensions.ok(
  not has_table_privilege('authenticated', 'private.patient_number_counters', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('service_role', 'private.patient_number_counters', 'SELECT, INSERT, UPDATE, DELETE'),
  'the private counter is never browser or service-role accessible'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.find_duplicate_candidates(uuid,text,text,date,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean)', 'EXECUTE'),
  'only authenticated receives the two patient creation RPC grants'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);

select extensions.is(
  (select version from public.create_patient(
    'a4030000-0000-0000-0000-000000000001', 'Ana', null, 'Santos', null, null,
    date '1990-01-01', null, null, null, null, null, null, null,
    '0917 123 4567', ' ANA@EXAMPLE.TEST ', false
  )),
  1,
  'authorized creation returns the initial patient version'
);
reset role;
select extensions.is(
  (select patient_number from public.patients where organization_id = 'a4020000-0000-0000-0000-000000000001'),
  'P-000001',
  'authorized creation allocates the first organization-scoped patient number'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);
reset role;
select extensions.is(
  (select count(*)::integer from public.patient_contacts where organization_id = 'a4020000-0000-0000-0000-000000000001'),
  2,
  'initial mobile and email are inserted atomically with the patient'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);
reset role;
select extensions.is(
  (select action from public.audit_events where organization_id = 'a4020000-0000-0000-0000-000000000001' order by occurred_at desc limit 1),
  'patient.created',
  'normal creation records the patient-created audit action'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.create_patient('a4030000-0000-0000-0000-000000000001', 'Ana', null, 'Santos', null, null, date '1990-01-01', null, null, null, null, null, null, null, '09171234567', null, false)$$,
  'P0001', 'duplicate review required', 'an unconfirmed exact name/DOB or mobile duplicate is blocked'
);
select extensions.is(
  (select version from public.create_patient(
    'a4030000-0000-0000-0000-000000000001', 'Ana', null, 'Santos', null, null,
    date '1990-01-01', null, null, null, null, null, null, null, null, null, true
  )),
  1,
  'confirmed namesakes are permitted'
);
reset role;
select extensions.is(
  (select last_number from private.patient_number_counters where organization_id = 'a4020000-0000-0000-0000-000000000001'),
  2,
  'confirmed namesakes preserve the private counter sequence'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);
reset role;
select extensions.is(
  (select action from public.audit_events where organization_id = 'a4020000-0000-0000-0000-000000000001' order by occurred_at desc limit 1),
  'patient.created_duplicate_override',
  'confirmed duplicate creation records the override audit action'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);
select extensions.ok(
  public.find_duplicate_candidates(
    'a4030000-0000-0000-0000-000000000001', 'Ana', 'Santos', date '1990-01-01', '09171234567', 'ana@example.test'
  ) @> '{"candidates":[{"matchedSignals":["EMAIL","MOBILE","NAME_DOB"]}],"truncated":false}'::jsonb,
  'duplicate review combines the three exact signals without returning contact values'
);
select extensions.throws_ok(
  $$select public.find_duplicate_candidates('a4030000-0000-0000-0000-000000000002', 'Ana', 'Santos', date '1990-01-01', null, null)$$,
  '42501', 'not authorized', 'a forged foreign acting branch is denied without tenant enumeration'
);
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.find_duplicate_candidates('a4030000-0000-0000-0000-000000000001', 'Ana', 'Santos', date '1990-01-01', null, null)$$,
  '42501', 'not authorized', 'an owner without patient permission cannot enumerate duplicate candidates'
);
reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result
from test_failures;

rollback;
