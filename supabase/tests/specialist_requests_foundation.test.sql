begin;

select extensions.no_plan();

-- Synthetic-only P10-02 graph. No browser policies exist.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P1002 Synthetic A Inc.','P1002 A','p1002-a'),
  ('b8200000-0000-0000-0000-000000000002','P1002 Synthetic B Inc.','P1002 B','p1002-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P1002 A Main','p1002-a-main','P1002-A','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P1002-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('c2100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A','REGULAR');
insert into public.specialties (id, organization_id, code, name) values
  ('c6100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P1002_B','P1002 B');

select extensions.columns_are('public','specialist_requests',array['id','organization_id','branch_id','patient_id','appointment_id','required_specialty_id','requested_provider_id','requested_starts_at','requested_ends_at','case_summary','request_channel','status','response_message','expires_at','version','created_at','updated_at'],'specialist_requests has only the approved P10-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.specialist_requests'::regclass),'specialist_requests has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.specialist_requests',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no specialist_requests privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='specialist_requests'),0,'specialist_requests is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.specialist_requests (id,organization_id,branch_id,patient_id,required_specialty_id,case_summary,request_channel,expires_at) values ('c7100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001',(select id from public.specialties where organization_id is null and code='ORTHODONTICS'),'Ortho consult for a patient.','EMAIL','2026-03-01 00:00:00+00')$$,'a specialist request accepts a global specialty and a minimal case summary');
select extensions.is((select status from public.specialist_requests where id='c7100000-0000-0000-0000-000000000001'),'SENT','specialist requests default to SENT');
select extensions.throws_ok($$insert into public.specialist_requests (organization_id,branch_id,patient_id,required_specialty_id,case_summary,request_channel,expires_at) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','c6100000-0000-0000-0000-000000000002','x','EMAIL','2026-03-01 00:00:00+00')$$,'23503','specialist request specialty must be global or belong to the request organization','a foreign custom specialty fails the scope trigger');
select extensions.throws_ok($$insert into public.specialist_requests (organization_id,branch_id,patient_id,case_summary,request_channel,expires_at) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','   ','EMAIL','2026-03-01 00:00:00+00')$$,'23514',null,'blank case summaries are rejected');
select extensions.throws_ok($$insert into public.specialist_requests (organization_id,branch_id,patient_id,case_summary,request_channel,expires_at) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001',repeat('n',1001),'EMAIL','2026-03-01 00:00:00+00')$$,'23514',null,'case summaries are bounded to 1000 characters');
select extensions.throws_ok($$insert into public.specialist_requests (organization_id,branch_id,patient_id,case_summary,request_channel,requested_starts_at,requested_ends_at,expires_at) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','x','EMAIL','2026-03-02 12:00:00+00','2026-03-02 08:00:00+00','2026-03-01 00:00:00+00')$$,'23514',null,'the requested window requires ends after starts');

select extensions.columns_are('public','specialist_request_status_history',array['id','organization_id','specialist_request_id','old_value','new_value','changed_by','reason','changed_at'],'specialist_request_status_history has only the approved P10-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.specialist_request_status_history'::regclass),'specialist_request_status_history has RLS enabled');
select extensions.lives_ok($$insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value) values ('b8200000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000001','SENT','ACCEPTED')$$,'a specialist request status history entry is accepted');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;