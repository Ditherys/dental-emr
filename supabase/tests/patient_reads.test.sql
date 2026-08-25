begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a5010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-a@p205.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a5010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@p205.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a5010000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-b@p205.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('a5020000-0000-0000-0000-000000000001', 'P205 Synthetic A Inc.', 'P205 Synthetic A', 'p205-synthetic-a'),
  ('a5020000-0000-0000-0000-000000000002', 'P205 Synthetic B Inc.', 'P205 Synthetic B', 'p205-synthetic-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('a5030000-0000-0000-0000-000000000001', 'a5020000-0000-0000-0000-000000000001', 'P205 A Main', 'p205-a-main', 'P205-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('a5030000-0000-0000-0000-000000000002', 'a5020000-0000-0000-0000-000000000002', 'P205 B Main', 'p205-b-main', 'P205-B1', '2 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('a5040000-0000-0000-0000-000000000001', 'a5020000-0000-0000-0000-000000000001', 'a5010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('a5040000-0000-0000-0000-000000000002', 'a5020000-0000-0000-0000-000000000001', 'a5010000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('a5040000-0000-0000-0000-000000000003', 'a5020000-0000-0000-0000-000000000002', 'a5010000-0000-0000-0000-000000000003', 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.user_id
from (values
  ('a5020000-0000-0000-0000-000000000001'::uuid, 'a5040000-0000-0000-0000-000000000001'::uuid, 'DENTIST'::text, 'a5010000-0000-0000-0000-000000000001'::uuid),
  ('a5020000-0000-0000-0000-000000000001'::uuid, 'a5040000-0000-0000-0000-000000000002'::uuid, 'OWNER'::text, 'a5010000-0000-0000-0000-000000000002'::uuid),
  ('a5020000-0000-0000-0000-000000000002'::uuid, 'a5040000-0000-0000-0000-000000000003'::uuid, 'DENTIST'::text, 'a5010000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, member_id, role_code, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('a5050000-0000-0000-0000-000000000001', 'a5020000-0000-0000-0000-000000000001', 'P-000001', 'Ana', 'Santos', date '1990-01-01'),
  ('a5050000-0000-0000-0000-000000000002', 'a5020000-0000-0000-0000-000000000002', 'P-000001', 'Bea', 'Other', date '1991-01-01');
insert into public.patient_contacts (organization_id, patient_id, contact_type, value, is_primary) values
  ('a5020000-0000-0000-0000-000000000001', 'a5050000-0000-0000-0000-000000000001', 'MOBILE', '+639171234567', true),
  ('a5020000-0000-0000-0000-000000000001', 'a5050000-0000-0000-0000-000000000001', 'EMAIL', 'ana@example.test', true);

select extensions.ok(
  has_function_privilege('authenticated', 'public.search_patients(uuid,text,date,text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_patient_detail(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.search_patients(uuid,text,date,text,text,integer,integer)', 'EXECUTE'),
  'only authenticated receives the bounded patient-read RPC grants'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.patients', 'SELECT')
  and not has_table_privilege('authenticated', 'public.patient_contacts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.patient_relationships', 'SELECT'),
  'patient base tables remain privilege-denied'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a5010000-0000-0000-0000-000000000001', true);
select extensions.ok(
  public.search_patients('a5030000-0000-0000-0000-000000000001', 'ana', null, null, 'name_asc', 1, 25)
    @> '{"rows":[{"patientNumber":"P-000001","primaryMobile":"+639171234567","primaryEmail":"ana@example.test"}],"total":1,"page":1,"pageSize":25}'::jsonb,
  'search returns only the bounded tenant list projection'
);
select extensions.throws_ok(
  $$select public.get_patient_detail('a5030000-0000-0000-0000-000000000001', 'a5050000-0000-0000-0000-000000000002')$$,
  '42501', 'not authorized', 'foreign patient IDs are indistinguishable from denied detail requests'
);
select extensions.throws_ok(
  $$select public.search_patients('a5030000-0000-0000-0000-000000000001', repeat('%', 121), null, null, 'name_asc', 1, 25)$$,
  '22023', 'invalid input', 'wildcard-heavy input is bounded before query execution'
);
select extensions.is(
  (public.search_patients('a5030000-0000-0000-0000-000000000001', '%', null, null, 'name_asc', 1, 25) ->> 'total')::integer,
  0,
  'a wildcard is treated as patient-number data rather than a broad filter'
);
select extensions.ok(
  public.get_patient_detail('a5030000-0000-0000-0000-000000000001', 'a5050000-0000-0000-0000-000000000001')
    @> '{"patientNumber":"P-000001","contacts":[{"value":"+639171234567"}]}'::jsonb,
  'detail returns the approved bounded projection'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.audit_events where patient_id = 'a5050000-0000-0000-0000-000000000001' and action = 'patient.viewed'),
  1,
  'one successful detail read creates exactly one patient-linked audit event'
);
select extensions.ok(
  not exists (
    select 1 from public.audit_events
    where patient_id = 'a5050000-0000-0000-0000-000000000001'
      and action = 'patient.viewed'
      and metadata::text ~ '(Ana|Santos|1990|63917|example)'
  ),
  'view audit metadata contains no patient PII'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a5010000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.search_patients('a5030000-0000-0000-0000-000000000001', null, null, null, 'name_asc', 1, 25)$$,
  '42501', 'not authorized', 'owner without a patient-capable role cannot search after provisioning staff'
);
reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result
from test_failures;

rollback;
