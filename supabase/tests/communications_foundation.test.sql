begin;

select extensions.no_plan();

-- Synthetic-only P8-02 graph. No browser policies exist.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P802 Synthetic A Inc.','P802 A','p802-a');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P802 A Main','p802-a-main','P802-A','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P802-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001');
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at) values
  ('c4100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00');

select extensions.columns_are('public','communications',array['id','organization_id','branch_id','patient_id','appointment_id','channel','template_type','recipient','subject','body','provider_id','provider_message_id','status','idempotency_key','attempts','max_attempts','next_attempt_at','scheduled_for','sent_at','delivered_at','failed_at','cancelled_at','created_at','updated_at'],'communications has only the approved P8-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.communications'::regclass),'communications has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.communications',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no communications privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='communications'),0,'communications is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.communications (id,organization_id,branch_id,patient_id,appointment_id,channel,template_type,recipient,body,idempotency_key) values ('c8100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','SMS','REMINDER','+639170000001','Your appointment is tomorrow at 9:00 AM.','a-reminder')$$,'a template-only communication job is accepted');
select extensions.is((select status from public.communications where id='c8100000-0000-0000-0000-000000000001'),'QUEUED','communications default to QUEUED');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key) values ('b8200000-0000-0000-0000-000000000001','FAX','REMINDER','x','y','b')$$,'23514',null,'invented channels are rejected');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key) values ('b8200000-0000-0000-0000-000000000001','SMS','RANDOM','x','y','b')$$,'23514',null,'invented template types are rejected');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key,status) values ('b8200000-0000-0000-0000-000000000001','SMS','REMINDER','x','y','b','SENT')$$,'23514',null,'a SENT status requires a sent timestamp');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key) values ('b8200000-0000-0000-0000-000000000001','SMS','REMINDER','x','y','a-reminder')$$,'23505',null,'a duplicate organization idempotency key is rejected');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key,attempts,max_attempts) values ('b8200000-0000-0000-0000-000000000001','SMS','REMINDER','x','y','c',4,3)$$,'23514',null,'attempts cannot exceed max_attempts');
select extensions.throws_ok($$insert into public.communications (organization_id,channel,template_type,recipient,body,idempotency_key) values ('b8200000-0000-0000-0000-000000000001','SMS','REMINDER','x',repeat('n',4001),'d')$$,'23514',null,'communication bodies are bounded');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;