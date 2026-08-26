begin;
select extensions.no_plan();

-- Synthetic-only P5-03 graph. The receptionist is scoped to Org A; Org B and
-- its branch/source/referrer prove that every RPC derives the tenant server-side.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b8100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer@p503.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foreign@p503.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001', 'P503 A Inc.', 'P503 A', 'p503-a'),
  ('b8200000-0000-0000-0000-000000000002', 'P503 B Inc.', 'P503 B', 'p503-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001', 'P503 A', 'p503-a-main', 'P503-A', '1 Test St', 'Test', 'Test'),
  ('b8300000-0000-0000-0000-000000000002', 'b8200000-0000-0000-0000-000000000002', 'P503 B', 'p503-b-main', 'P503-B', '2 Test St', 'Test', 'Test');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b8400000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001', 'b8100000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000002', 'b8200000-0000-0000-0000-000000000002', 'b8100000-0000-0000-0000-000000000002', 'active', statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b8200000-0000-0000-0000-000000000001', 'b8300000-0000-0000-0000-000000000001', 'b8400000-0000-0000-0000-000000000001', 'active'),
  ('b8200000-0000-0000-0000-000000000002', 'b8300000-0000-0000-0000-000000000002', 'b8400000-0000-0000-0000-000000000002', 'active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b8200000-0000-0000-0000-000000000001'::uuid, 'b8400000-0000-0000-0000-000000000001'::uuid, 'b8300000-0000-0000-0000-000000000001'::uuid, 'b8100000-0000-0000-0000-000000000001'::uuid),
  ('b8200000-0000-0000-0000-000000000002'::uuid, 'b8400000-0000-0000-0000-000000000002'::uuid, 'b8300000-0000-0000-0000-000000000002'::uuid, 'b8100000-0000-0000-0000-000000000002'::uuid)
) as assignment(organization_id, member_id, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = 'RECEPTIONIST';
insert into public.acquisition_sources (id, organization_id, code, name, category, is_active) values
  ('b8500000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001', 'P503_CUSTOM', 'P503 Custom', 'OTHER', true),
  ('b8500000-0000-0000-0000-000000000002', 'b8200000-0000-0000-0000-000000000002', 'P503_FOREIGN', 'P503 Foreign', 'OTHER', true),
  ('b8500000-0000-0000-0000-000000000003', 'b8200000-0000-0000-0000-000000000001', 'P503_INACTIVE', 'P503 Inactive', 'OTHER', false);
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b8600000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001', 'P503-A-1', 'Referrer', 'A', date '1980-01-01'),
  ('b8600000-0000-0000-0000-000000000002', 'b8200000-0000-0000-0000-000000000001', 'P503-A-2', 'Target', 'A', date '1990-01-01'),
  ('b8600000-0000-0000-0000-000000000003', 'b8200000-0000-0000-0000-000000000002', 'P503-B-1', 'Referrer', 'B', date '1981-01-01');

select extensions.ok(
  has_function_privilege('authenticated', 'public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean,jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.update_patient_attribution(uuid,uuid,integer,jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.get_patient_detail(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.update_patient_attribution(uuid,uuid,integer,jsonb)', 'execute'),
  'only authenticated receives the exact P5-03 RPC grants'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean,jsonb)'::regprocedure, 'public.update_patient_attribution(uuid,uuid,integer,jsonb)'::regprocedure, 'public.get_patient_detail(uuid,uuid)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]), 3, 'P5-03 definers pin an empty search path');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b8100000-0000-0000-0000-000000000001', true);
select extensions.lives_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Legacy', null, 'Call', null, null, date '1995-01-01', null, null, null, null, null, null, null, null, null, true)$$, 'the original create_patient signature remains callable');
select extensions.lives_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Attributed', null, 'Create', null, null, date '1996-01-01', null, null, null, null, null, null, null, null, null, true, '{"acquisitionSourceId":"a5000000-0000-0000-0000-000000000007","externalReferrerName":"Dr. External","externalReferrerOrganization":"External Dental","externalReferrerContact":"09171234567","initialBookingChannelCode":"WALK_IN"}'::jsonb)$$, 'the attribution create overload accepts a global source, external snapshot, and canonical channel');
select extensions.throws_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Invalid', null, 'Create', null, null, date '1996-02-01', null, null, null, null, null, null, null, null, null, true, '{"organizationId":"b8200000-0000-0000-0000-000000000002"}'::jsonb)$$, '22023', 'invalid input', 'create attribution rejects mass-assignment keys');
select extensions.throws_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Foreign', null, 'Source', null, null, date '1996-03-01', null, null, null, null, null, null, null, null, null, true, '{"acquisitionSourceId":"b8500000-0000-0000-0000-000000000002"}'::jsonb)$$, '22023', 'invalid input', 'create attribution rejects foreign custom sources');
select extensions.throws_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Inactive', null, 'Source', null, null, date '1996-04-01', null, null, null, null, null, null, null, null, null, true, '{"acquisitionSourceId":"b8500000-0000-0000-0000-000000000003"}'::jsonb)$$, '22023', 'invalid input', 'create attribution rejects inactive sources');
select extensions.throws_ok($$select public.create_patient('b8300000-0000-0000-0000-000000000001', 'Foreign', null, 'Referrer', null, null, date '1996-05-01', null, null, null, null, null, null, null, null, null, true, '{"referrerPatientId":"b8600000-0000-0000-0000-000000000003"}'::jsonb)$$, '22023', 'invalid input', 'create attribution rejects foreign referrers');
select extensions.is((select version from public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 1, '{"acquisitionSourceId":"b8500000-0000-0000-0000-000000000001","referrerPatientId":"b8600000-0000-0000-0000-000000000001","initialBookingChannelCode":"FACEBOOK_MESSENGER"}'::jsonb)), 2, 'global/custom attribution dimensions update atomically');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 1, '{}'::jsonb)$$, 'P0001', 'stale version', 'stale attribution writes are rejected');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000002', 'b8600000-0000-0000-0000-000000000002', 2, '{}'::jsonb)$$, '42501', 'not authorized', 'a forged foreign acting branch is denied');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"acquisitionSourceId":"b8500000-0000-0000-0000-000000000002"}'::jsonb)$$, '22023', 'invalid input', 'foreign custom sources are rejected safely');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"acquisitionSourceId":"b8500000-0000-0000-0000-000000000003"}'::jsonb)$$, '22023', 'invalid input', 'inactive sources are rejected safely');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"acquisitionSourceId":"b8ffffff-0000-0000-0000-000000000001"}'::jsonb)$$, '22023', 'invalid input', 'unknown source ids are rejected before mutation');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"organizationId":"b8200000-0000-0000-0000-000000000002"}'::jsonb)$$, '22023', 'invalid input', 'tenant and audit-like fields are not accepted in attribution input');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"referrerPatientId":"b8600000-0000-0000-0000-000000000002"}'::jsonb)$$, '23514', null, 'the patient self-referral constraint remains the integrity authority');
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"referrerPatientId":"b8600000-0000-0000-0000-000000000003"}'::jsonb)$$, '22023', 'invalid input', 'foreign referrers are rejected safely');
select extensions.ok(public.get_patient_detail('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002') @> '{"attribution":{"acquisitionSource":{"code":"P503_CUSTOM","name":"P503 Custom","category":"OTHER"},"initialBookingChannel":{"code":"FACEBOOK_MESSENGER","name":"Facebook Messenger"},"referrerPatient":{"patientId":"b8600000-0000-0000-0000-000000000001","displayName":"Referrer A"}}}'::jsonb, 'detail returns the bounded attribution projection');
select extensions.ok(not (public.get_patient_detail('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002') -> 'attribution') ? 'organizationId', 'detail attribution contains no raw organization field');
select extensions.throws_ok($$select public.get_patient_detail('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000003')$$, '42501', 'not authorized', 'foreign detail targets remain safely undisclosed');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where patient_id = 'b8600000-0000-0000-0000-000000000002' and action = 'patient.attribution.updated' and metadata = '{}'::jsonb), 1, 'the successful attribution mutation writes exactly one opaque audit event');
create function private.p503_block_attribution_audit() returns trigger language plpgsql as $$begin if new.action = 'patient.attribution.updated' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p503_block_attribution_audit before insert on public.audit_events for each row execute function private.p503_block_attribution_audit();
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b8100000-0000-0000-0000-000000000001', true);
select extensions.throws_ok($$select public.update_patient_attribution('b8300000-0000-0000-0000-000000000001', 'b8600000-0000-0000-0000-000000000002', 2, '{"externalReferrerName":"Dr. Rollback"}'::jsonb)$$, 'P0001', 'audit blocked', 'audit failure rejects the attribution mutation');
reset role;
select extensions.is((select external_referrer_name from public.patients where id = 'b8600000-0000-0000-0000-000000000002'), null, 'audit failure rolls back attribution data');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$') select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
