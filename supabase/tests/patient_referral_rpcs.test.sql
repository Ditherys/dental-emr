begin;

select extensions.no_plan();

-- Synthetic-only P5-05 graph. Owner A is positive; Billing A, anonymous, and
-- foreign Owner B prove the RPCs, rather than table/RLS access, are the boundary.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b9100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p505.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p505.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p505.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b9200000-0000-0000-0000-000000000001','P505 A Inc.','P505 A','p505-a'),
  ('b9200000-0000-0000-0000-000000000002','P505 B Inc.','P505 B','p505-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b9300000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','P505 A Main','p505-a-main','P505-A','1 Test St','Test','Test'),
  ('b9300000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000002','P505 B Main','p505-b-main','P505-B','2 Test St','Test','Test');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b9400000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','b9100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b9400000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000001','b9100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b9400000-0000-0000-0000-000000000003','b9200000-0000-0000-0000-000000000002','b9100000-0000-0000-0000-000000000003','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9400000-0000-0000-0000-000000000001','active'),
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9400000-0000-0000-0000-000000000002','active'),
  ('b9200000-0000-0000-0000-000000000002','b9300000-0000-0000-0000-000000000002','b9400000-0000-0000-0000-000000000003','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,null::uuid,'b9100000-0000-0000-0000-000000000001'::uuid),
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b9300000-0000-0000-0000-000000000001'::uuid,'b9100000-0000-0000-0000-000000000001'::uuid),
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000002'::uuid,'BILLING'::text,'b9300000-0000-0000-0000-000000000001'::uuid,'b9100000-0000-0000-0000-000000000001'::uuid),
  ('b9200000-0000-0000-0000-000000000002'::uuid,'b9400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'b9100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b9500000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','P505-A-1','Patient','A',date '1990-01-01'),
  ('b9500000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000002','P505-B-1','Patient','B',date '1991-01-01');
insert into public.specialties (id, organization_id, code, name) values
  ('b9600000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','P505_A','P505 Specialty A'),
  ('b9600000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000002','P505_B','P505 Specialty B');

select extensions.ok(
  has_function_privilege('authenticated','public.create_patient_referral(uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.update_patient_referral_status(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.list_patient_referrals(uuid,uuid,boolean)','execute')
  and not has_function_privilege('anon','public.create_patient_referral(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.list_patient_referrals(uuid,uuid,boolean)','execute'),
  'only authenticated has the three exact P5-05 RPC grants'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_patient_referral(uuid,uuid,jsonb)'::regprocedure,'public.update_patient_referral_status(uuid,uuid,integer,text)'::regprocedure,'public.list_patient_referrals(uuid,uuid,boolean)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),3,'P5-05 definers pin an empty search path');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN","requiredSpecialtyId":"b9600000-0000-0000-0000-000000000001","externalPartyName":" Dr. Example ","externalPartyOrganization":" Example Clinic ","externalPartyContact":" 09171234567 ","notes":" Administrative handoff "}'::jsonb)),1,'owner creates a bounded referral at version one');
reset role;
select extensions.ok((select external_party_name = 'Dr. Example' and notes = 'Administrative handoff' and status = 'RECEIVED' from public.patient_referrals where org_id='b9200000-0000-0000-0000-000000000001'),'create derives tenant, trims snapshots, and fixes initial status');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN","organizationId":"b9200000-0000-0000-0000-000000000002"}'::jsonb)$$,'22023','invalid input','creation rejects tenant mass assignment');
select extensions.throws_ok($$select public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN","status":"ACTIVE"}'::jsonb)$$,'22023','invalid input','creation rejects caller-selected status');
select extensions.throws_ok($$select public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN","requiredSpecialtyId":"b9600000-0000-0000-0000-000000000002"}'::jsonb)$$,'22023','invalid input','creation rejects foreign specialty safely');
select extensions.throws_ok($$select public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000002','{"direction":"IN"}'::jsonb)$$,'42501','not authorized','creation safely denies foreign patients');
select extensions.is((select version from public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)),1,'ACTIVE')),2,'RECEIVED transitions only forward to ACTIVE');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)),1,'COMPLETED')$$,'P0001','stale version','stale referral status writes are rejected');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)),2,'RECEIVED')$$,'22023','invalid input','arbitrary state regression input is rejected');
select extensions.is((select version from public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)),2,'COMPLETED')),3,'ACTIVE transitions forward to COMPLETED');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)),3,'ACTIVE')$$,'P0001','invalid state','terminal referrals cannot regress');
select extensions.is((select version from public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"OUT","notes":"Received cancellation"}'::jsonb)),1,'a second referral begins RECEIVED for cancellation coverage');
select extensions.is((select version from public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Received cancellation'),1,'CANCELLED')),2,'RECEIVED transitions forward to CANCELLED');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Received cancellation'),2,'ACTIVE')$$,'P0001','invalid state','CANCELLED referrals reject further mutation');
select extensions.is((select version from public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN","notes":"Active cancellation"}'::jsonb)),1,'a third referral begins RECEIVED for active cancellation coverage');
select extensions.is((select version from public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Active cancellation'),1,'ACTIVE')),2,'the cancellation fixture progresses to ACTIVE');
select extensions.is((select version from public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Active cancellation'),2,'CANCELLED')),3,'ACTIVE transitions forward to CANCELLED');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Active cancellation'),3,'COMPLETED')$$,'P0001','invalid state','CANCELLED referrals remain terminal');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b9500000-0000-0000-0000-000000000001' and action in ('patient.referral.created','patient.referral.status_updated') and metadata='{}'::jsonb),8,'each successful referral mutation writes exactly one opaque audit event');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b9500000-0000-0000-0000-000000000001'),8,'referral list reads do not audit');
select extensions.ok((select count(*) from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',false)) = 0,'default list excludes terminal referrals');
select extensions.ok((select count(*) from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)) = 3,'terminal-inclusive list returns the deterministic bounded projection');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b9500000-0000-0000-0000-000000000001'),8,'reads leave audit count unchanged');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)$$,'42501','not authorized','billing without demographics-read cannot list referrals');
select extensions.throws_ok($$select public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"IN"}'::jsonb)$$,'42501','not authorized','billing without demographics-write cannot create referrals');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true)$$,'42501','not authorized','foreign acting branches are denied');
reset role;

create function private.p505_block_referral_audit() returns trigger language plpgsql as $$begin if new.action = 'patient.referral.status_updated' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p505_block_referral_audit before insert on public.audit_events for each row execute function private.p505_block_referral_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_patient_referral('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"direction":"OUT","notes":"Status audit rollback"}'::jsonb)),1,'the status audit rollback fixture is created before its status mutation');
select extensions.throws_ok($$select public.update_patient_referral_status('b9300000-0000-0000-0000-000000000001',(select referral_id from public.list_patient_referrals('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',true) where notes='Status audit rollback'),1,'CANCELLED')$$,'P0001','audit blocked','status audit failure rejects the status mutation');
reset role;
select extensions.ok((select status = 'RECEIVED' and version = 1 from public.patient_referrals where org_id='b9200000-0000-0000-0000-000000000001' and notes='Status audit rollback'),'status audit failure rolls back referral status and version');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b9500000-0000-0000-0000-000000000001' and action in ('patient.referral.created','patient.referral.status_updated')),9,'status audit failure rolls back its audit event');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
