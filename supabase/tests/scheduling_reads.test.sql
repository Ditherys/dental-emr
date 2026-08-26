begin;

select extensions.no_plan();

-- Synthetic-only P6-07 graph. Appointment permissions come from member_roles.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b8100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p607.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','no-perm@p607.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p607.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P607 Synthetic A Inc.','P607 A','p607-a'),
  ('b8200000-0000-0000-0000-000000000002','P607 Synthetic B Inc.','P607 B','p607-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P607 A Main','p607-a-main','P607-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P607 B Main','p607-b-main','P607-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b8400000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000003','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8400000-0000-0000-0000-000000000001','active'),
  ('b8200000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000002','b8400000-0000-0000-0000-000000000002','active'),
  ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8400000-0000-0000-0000-000000000003','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b8200000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b8300000-0000-0000-0000-000000000001'::uuid,'b8100000-0000-0000-0000-000000000001'::uuid),
  ('b8200000-0000-0000-0000-000000000002'::uuid,'b8400000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'b8300000-0000-0000-0000-000000000002'::uuid,'b8100000-0000-0000-0000-000000000002'::uuid),
  ('b8200000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'b8300000-0000-0000-0000-000000000001'::uuid,'b8100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P607-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('c2100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A','REGULAR'),
  ('c2100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','Dentist','B','REGULAR');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from, valid_to) values
  ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',1,time '09:00',time '18:00',date '2026-01-01',null),
  ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',2,time '09:00',time '12:00',date '2026-01-01',null);

insert into public.provider_schedule_exceptions (organization_id, provider_id, branch_id, exception_type, starts_at, ends_at) values
  ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','LEAVE','2026-01-05 09:00:00+00','2026-01-05 11:00:00+00');

select extensions.is((select procedure.proconfig from pg_proc as procedure where procedure.oid='private.has_appointment_permission_at_branch(uuid,text)'::regprocedure),array['search_path=""']::text[],'the appointment permission helper fixes an empty search path');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000001',true);

select extensions.set_eq(
  $$select availability_date::text || ':' || source from public.list_availability('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001',date '2026-01-05',date '2026-01-06') order by availability_date, source$$,
  array['2026-01-05:RULE','2026-01-06:RULE']::text[],
  'list_availability returns the weekly rule coverage for matching weekdays'
);
select extensions.is(
  (select count(*)::integer from public.find_available_slots('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','2026-01-05 09:30:00+00','2026-01-05 10:30:00+00',30)),
  0,
  'a LEAVE exception removes every slot it overlaps'
);
select extensions.set_eq(
  $$select starts_at::text from public.find_available_slots('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','2026-01-05 13:00:00+00','2026-01-05 13:30:00+00',30)$$,
  array['2026-01-05 13:00:00+00']::text[],
  'find_available_slots enumerates slots on the 15-minute grid inside the availability window'
);
select extensions.throws_ok($$select public.find_available_slots('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 10:00:00+00',5)$$,'22023',null,'slot durations below 15 minutes are rejected');
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.find_available_slots('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 10:00:00+00',30)$$,'42501',null,'an appointment-permission-less Org A user is denied slot reads');

select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.list_availability('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001',date '2026-01-05',date '2026-01-06')$$,'42501',null,'a foreign-organization user is denied availability reads');
reset role;

delete from public.provider_schedule_exceptions where exception_type='LEAVE';
insert into public.provider_reservations (organization_id, provider_id, branch_id, starts_at, ends_at) values
  ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','2026-01-05 09:30:00+00','2026-01-05 10:00:00+00');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000001',true);
select extensions.set_eq(
  $$select starts_at::text from public.find_available_slots('b8300000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:45:00+00',30)$$,
  array['2026-01-05 09:00:00+00']::text[],
  'an existing ACTIVE provider reservation removes overlapping slots while preserving back-to-back availability'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;