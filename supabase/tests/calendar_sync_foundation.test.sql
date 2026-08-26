begin;

select extensions.no_plan();

-- Synthetic-only P9-02 graph. No browser policies exist.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P902 Synthetic A Inc.','P902 A','p902-a');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P902 A Main','p902-a-main','P902-A','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P902-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('c2100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A','REGULAR'),
  ('c2100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','Dentist','B','REGULAR');
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at) values
  ('c4100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00');

select extensions.columns_are('public','calendar_integrations',array['id','organization_id','provider_id','google_account_ref','calendar_id','privacy_mode','connection_status','last_synced_at','version','created_at','updated_at'],'calendar_integrations has only the approved P9-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.calendar_integrations'::regclass),'calendar_integrations has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.calendar_integrations',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no calendar_integrations privileges');
select extensions.lives_ok($$insert into public.calendar_integrations (id,organization_id,provider_id,google_account_ref,calendar_id,privacy_mode,connection_status) values ('c9100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','opaque-server-ref','primary@gmail.com','HIGH_PRIVACY','CONNECTED')$$,'a provider calendar integration accepts an opaque reference and conservative privacy mode');
select extensions.is((select privacy_mode from public.calendar_integrations where id='c9100000-0000-0000-0000-000000000001'),'HIGH_PRIVACY','calendar privacy defaults to HIGH_PRIVACY');
select extensions.throws_ok($$insert into public.calendar_integrations (organization_id,provider_id) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001')$$,'23505',null,'a provider has at most one calendar integration');
select extensions.throws_ok($$insert into public.calendar_integrations (organization_id,provider_id,privacy_mode) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000002','PRIVATE')$$,'23514',null,'invented privacy modes are rejected');

select extensions.columns_are('public','calendar_event_links',array['id','organization_id','appointment_id','provider_id','external_event_id','operation','sync_status','attempts','last_error','last_synced_at','version','created_at','updated_at'],'calendar_event_links has only the approved P9-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.calendar_event_links'::regclass),'calendar_event_links has RLS enabled');
select extensions.lives_ok($$insert into public.calendar_event_links (id,organization_id,appointment_id,provider_id,external_event_id,operation) values ('c9200000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','evt-appt-provider','CREATE')$$,'an event link records the stable external event id for an appointment and provider');
select extensions.throws_ok($$insert into public.calendar_event_links (organization_id,appointment_id,provider_id,external_event_id,operation) values ('b8200000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','evt-appt-provider','CREATE')$$,'23505',null,'a duplicate appointment+provider+operation link is rejected');

select extensions.columns_are('public','calendar_sync_jobs',array['id','organization_id','appointment_id','provider_id','operation','status','attempts','max_attempts','next_attempt_at','external_event_id','idempotency_key','created_at'],'calendar_sync_jobs has only the approved P9-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.calendar_sync_jobs'::regclass),'calendar_sync_jobs has RLS enabled');
select extensions.lives_ok($$insert into public.calendar_sync_jobs (id,organization_id,appointment_id,provider_id,operation,idempotency_key) values ('c9300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','CREATE','create-appt-provider')$$,'a calendar sync job is accepted with a deterministic idempotency key');
select extensions.is((select status from public.calendar_sync_jobs where id='c9300000-0000-0000-0000-000000000001'),'QUEUED','calendar sync jobs default to QUEUED');
select extensions.throws_ok($$insert into public.calendar_sync_jobs (organization_id,appointment_id,provider_id,operation,idempotency_key) values ('b8200000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','CREATE','create-appt-provider')$$,'23505',null,'a duplicate sync idempotency key is rejected');
select extensions.throws_ok($$insert into public.calendar_sync_jobs (organization_id,appointment_id,provider_id,operation,idempotency_key,attempts,max_attempts) values ('b8200000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','CREATE','c2',4,3)$$,'23514',null,'sync attempts cannot exceed max_attempts');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;