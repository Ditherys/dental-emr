begin;

select extensions.no_plan();

-- Synthetic-only P18-01 graph. Direct inserts as the owner bypass RLS; the
-- schema is deny-by-default with zero base grants and no browser policies.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P1801 Synthetic A Inc.','P1801 A','p1801-a'),
  ('b8200000-0000-0000-0000-000000000002','P1801 Synthetic B Inc.','P1801 B','p1801-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P1801 A Main','p1801-a-main','P1801-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000002','P1801 B Main','p1801-b-main','P1801-B','3 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P1801-A-1','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001'),
  ('b8500000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P1801-B-1','Patient','B',date '1991-01-01',null);
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('c9100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b8200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',true);
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status) values
  ('c9200000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED'),
  ('c9200000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000003','b8500000-0000-0000-0000-000000000002','2026-01-05 10:00:00+00','2026-01-05 10:30:00+00','SCHEDULED');

select extensions.columns_are('public','recall_rules',array['id','organization_id','branch_id','name','interval_months','channel','is_active','version','created_by','created_at','updated_at'],'recall_rules has only the approved P18-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.recall_rules'::regclass),'recall_rules has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.recall_rules',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no recall_rules privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='recall_rules'),0,'recall_rules is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='recall_rules' and indexname='recall_rules_organization_branch_active_idx'),1,'recall_rules indexes the org+branch+active automation access path');

select extensions.columns_are('public','patient_recall_preferences',array['organization_id','patient_id','recall_opt_out','updated_at'],'patient_recall_preferences has only the approved P18-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.patient_recall_preferences'::regclass),'patient_recall_preferences has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.patient_recall_preferences',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no patient_recall_preferences privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='patient_recall_preferences'),0,'patient_recall_preferences is deny-by-default with no browser policies');

select extensions.columns_are('public','recalls',array['id','organization_id','branch_id','patient_id','recall_rule_id','due_date','status','reminder_sent_at','reminders_sent','appointment_id','created_by','version','created_at','updated_at'],'recalls has only the approved P18-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.recalls'::regclass),'recalls has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.recalls',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no recalls privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='recalls'),0,'recalls is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='recalls' and indexname='recalls_organization_status_due_date_idx'),1,'recalls indexes the org+status+due_date access path');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='recalls' and indexname='recalls_organization_patient_status_idx'),1,'recalls indexes the org+patient+status access path');

select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.recall_after_encounter_finalize()'::regprocedure
    and (
      has_function_privilege('public', proc.oid, 'execute')
      or has_function_privilege('anon', proc.oid, 'execute')
      or has_function_privilege('authenticated', proc.oid, 'execute')
      or has_function_privilege('service_role', proc.oid, 'execute')
    )
),'the recall automation trigger function is revoked from every role');
select extensions.is((select count(*)::integer from pg_proc where oid = 'private.recall_after_encounter_finalize()'::regprocedure and proconfig = array['search_path=""']::text[]),1,'the recall automation trigger function pins an empty search path');
select extensions.is((select count(*)::integer from pg_trigger where tgname='clinical_encounters_recall_after_finalize' and not tgisinternal),1,'clinical_encounters_recall_after_finalize is wired to the encounters finalize path');

select extensions.lives_ok($$insert into public.recall_rules (id,organization_id,branch_id,name,interval_months,channel) values ('d8000000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001',null,'Six Month Recall','6','EMAIL')$$,'a clinic-wide recall rule is accepted at version one with NONE->EMAIL');
select extensions.is((select is_active and version=1 from public.recall_rules where id='d8000000-0000-0000-0000-000000000001'),true,'recall_rules defaults to active at version one');
select extensions.lives_ok($$insert into public.recall_rules (id,organization_id,branch_id,name,interval_months,channel) values ('d8000000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','Main Branch Recall','12','SMS')$$,'a branch-scoped recall rule is accepted with a same-tenant branch');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,branch_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000003','Foreign','6','SMS')$$,'23503',null,'a recall rule rejects a foreign-organization branch');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001','   ','6','SMS')$$,'23514',null,'blank recall rule names are rejected');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001',repeat('n',161),'6','SMS')$$,'23514',null,'recall rule names are bounded to 160 characters');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001','Zero','0','SMS')$$,'23514',null,'an interval below one month is rejected');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001','Too Long','121','SMS')$$,'23514',null,'an interval above 120 months is rejected');
select extensions.throws_ok($$insert into public.recall_rules (organization_id,name,interval_months,channel) values ('b8200000-0000-0000-0000-000000000001','Bad Channel','6','FAX')$$,'23514',null,'recall rule channel is bounded to EMAIL/SMS/NONE');
select extensions.throws_ok($$insert into public.recall_rules (id,organization_id,name,interval_months,channel,version) values ('d8000000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000001','Zero Version','6','SMS',0)$$,'23514',null,'recall rule version must be positive');

select extensions.lives_ok($$insert into public.patient_recall_preferences (organization_id,patient_id,recall_opt_out) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001',true)$$,'a patient recall opt-out preference is accepted');
select extensions.throws_ok($$insert into public.patient_recall_preferences (organization_id,patient_id,recall_opt_out) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001',false)$$,'23505',null,'the (organization_id, patient_id) primary key rejects a duplicate preference row');
select extensions.throws_ok($$insert into public.patient_recall_preferences (organization_id,patient_id,recall_opt_out) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000002',false)$$,'23503',null,'a patient recall preference rejects a foreign-organization patient');

select extensions.lives_ok($$insert into public.recalls (id,organization_id,branch_id,patient_id,recall_rule_id,due_date,status) values ('d8100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED')$$,'a SCHEDULED recall is accepted at version one');
select extensions.is((select reminders_sent=0 and reminder_sent_at is null and version=1 from public.recalls where id='d8100000-0000-0000-0000-000000000001'),true,'recalls defaults to zero reminders sent at version one');
select extensions.lives_ok($$update public.recalls set reminder_sent_at=statement_timestamp(), reminders_sent=1, version=2 where id='d8100000-0000-0000-0000-000000000001'$$,'a reminder stamp with a positive counter is accepted');
select extensions.throws_ok($$update public.recalls set reminder_sent_at=statement_timestamp(), reminders_sent=0 where id='d8100000-0000-0000-0000-000000000001'$$,'23514',null,'a reminder stamp without a positive counter is rejected');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','LOST')$$,'23514',null,'recall status is bounded to SCHEDULED/OVERDUE/COMPLETED/CANCELLED/OPTED_OUT');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status,reminders_sent) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED',-1)$$,'23514',null,'reminders_sent cannot be negative');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status,version) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED',0)$$,'23514',null,'recall version must be positive');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000003','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED')$$,'23503',null,'a recall rejects a foreign-organization branch');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000002','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED')$$,'23503',null,'a recall rejects a foreign-organization patient');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000099','2026-07-01 00:00:00+00','SCHEDULED')$$,'23503',null,'a recall rejects a missing or foreign recall rule');
select extensions.throws_ok($$insert into public.recalls (organization_id,branch_id,patient_id,recall_rule_id,due_date,status,appointment_id) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','2026-07-01 00:00:00+00','SCHEDULED','c9200000-0000-0000-0000-000000000002')$$,'23503',null,'a recall rejects a foreign-organization appointment link');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;