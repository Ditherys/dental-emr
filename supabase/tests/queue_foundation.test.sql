begin;

select extensions.no_plan();

-- Synthetic-only P7-01 queue graph. No browser policies exist.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P701 Synthetic A Inc.','P701 A','p701-a'),
  ('b8200000-0000-0000-0000-000000000002','P701 Synthetic B Inc.','P701 B','p701-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P701 A Main','p701-a-main','P701-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P701 B Main','p701-b-main','P701-B','2 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P701-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001'),
  ('b8500000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P701-B-0001','Patient','B',date '1991-01-01','b8300000-0000-0000-0000-000000000002');
insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('c2100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A','REGULAR');
insert into public.branch_resources (id, organization_id, branch_id, resource_type_id, name) values
  ('c1100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',(select id from public.resource_types where code='DENTAL_CHAIR'),'Chair 1');

select extensions.columns_are('public','queue_entries',array['id','organization_id','branch_id','patient_id','status','provider_id','resource_id','chief_complaint','arrived_at','version','created_at','updated_at','completed_at','left_at'],'queue_entries has only the approved P7-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.queue_entries'::regclass),'queue_entries has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.queue_entries',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no queue_entries privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='queue_entries'),0,'queue_entries is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.queue_entries (id,organization_id,branch_id,patient_id,chief_complaint) values ('c7100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001',repeat('n',2000))$$,'a queue entry accepts a valid patient and bounded chief complaint');
select extensions.is((select status from public.queue_entries where id='c7100000-0000-0000-0000-000000000001'),'WAITING','queue entries default to WAITING');
select extensions.lives_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id,provider_id,resource_id) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001')$$,'a queue entry may optionally assign an org provider and branch resource');
select extensions.throws_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000002','b8500000-0000-0000-0000-000000000001')$$,'23503',null,'a queue entry cannot reference a foreign branch');
select extensions.throws_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000002')$$,'23503',null,'a queue entry cannot reference a foreign patient');
select extensions.throws_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','SEATED')$$,'23514',null,'invented queue statuses are rejected');
select extensions.throws_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','COMPLETED')$$,'23514',null,'a completed queue status requires a completion timestamp');
select extensions.throws_ok($$insert into public.queue_entries (organization_id,branch_id,patient_id,status) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','LEFT')$$,'23514',null,'a left queue status requires a left timestamp');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;