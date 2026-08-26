begin;

select extensions.no_plan();

-- Synthetic-only P6-05 graph. No browser policies exist. The exclusion
-- constraints are the database-level race-condition protection being proven.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P605 Synthetic A Inc.','P605 A','p605-a'),
  ('b8200000-0000-0000-0000-000000000002','P605 Synthetic B Inc.','P605 B','p605-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P605 A Main','p605-a-main','P605-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','P605 A Second','p605-a-second','P605-A2','2 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000002','P605 B Main','p605-b-main','P605-B','3 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P605-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('c2100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','Dentist','A','REGULAR'),
  ('c2100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','Dentist','C','REGULAR');
insert into public.branch_resources (id, organization_id, branch_id, resource_type_id, name) values
  ('c1100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',(select id from public.resource_types where code='DENTAL_CHAIR'),'Chair 1'),
  ('c1100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',(select id from public.resource_types where code='DENTAL_CHAIR'),'Chair 2');
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at) values
  ('c4100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00'),
  ('c4100000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 09:30:00+00','2026-01-05 10:00:00+00'),
  ('c4100000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','2026-01-05 11:00:00+00','2026-01-05 11:30:00+00');

select extensions.is((select extname from pg_extension where extname='btree_gist'),'btree_gist','the btree_gist extension backs the reservation exclusion constraints');

select extensions.columns_are('public','provider_reservations',array['id','organization_id','provider_id','branch_id','appointment_id','starts_at','ends_at','timespan','reservation_status','reservation_kind','expires_at','created_at'],'provider_reservations has only the approved P6-05 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.provider_reservations'::regclass),'provider_reservations has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.provider_reservations',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no provider_reservations privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='provider_reservations'),0,'provider_reservations is deny-by-default with no browser policies');

select extensions.lives_ok($$insert into public.provider_reservations (id,organization_id,provider_id,branch_id,appointment_id,starts_at,ends_at) values ('c5100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'an ACTIVE provider reservation is accepted');
select extensions.throws_ok($$insert into public.provider_reservations (organization_id,provider_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:15:00+00','2026-01-05 09:45:00+00')$$,'23P01',null,'an overlapping ACTIVE reservation for the same provider is rejected by the exclusion constraint');
select extensions.lives_ok($$insert into public.provider_reservations (organization_id,provider_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000002','c4100000-0000-0000-0000-000000000002','2026-01-05 09:30:00+00','2026-01-05 10:00:00+00')$$,'a back-to-back [start,end) reservation for the same provider is accepted, including across branches');
select extensions.lives_ok($$insert into public.provider_reservations (organization_id,provider_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'a different provider may reserve the same interval');
select extensions.lives_ok($$update public.provider_reservations set reservation_status='RELEASED' where id='c5100000-0000-0000-0000-000000000001'$$,'an ACTIVE reservation can be released');
select extensions.lives_ok($$insert into public.provider_reservations (organization_id,provider_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c2100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'releasing a reservation frees the slot for a new ACTIVE reservation');

select extensions.columns_are('public','resource_reservations',array['id','organization_id','resource_id','branch_id','appointment_id','starts_at','ends_at','timespan','reservation_status','reservation_kind','expires_at','created_at'],'resource_reservations has only the approved P6-05 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.resource_reservations'::regclass),'resource_reservations has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.resource_reservations',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no resource_reservations privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='resource_reservations'),0,'resource_reservations is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.resource_reservations (id,organization_id,resource_id,branch_id,appointment_id,starts_at,ends_at) values ('c5200000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'an ACTIVE resource reservation is accepted');
select extensions.throws_ok($$insert into public.resource_reservations (organization_id,resource_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:10:00+00','2026-01-05 09:40:00+00')$$,'23P01',null,'an overlapping ACTIVE reservation for the same resource is rejected by the exclusion constraint');
select extensions.lives_ok($$insert into public.resource_reservations (organization_id,resource_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'a different resource may be reserved at the same time');
select extensions.lives_ok($$update public.resource_reservations set reservation_status='CANCELLED' where id='c5200000-0000-0000-0000-000000000001'$$,'an ACTIVE resource reservation can be cancelled');
select extensions.lives_ok($$insert into public.resource_reservations (organization_id,resource_id,branch_id,appointment_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c4100000-0000-0000-0000-000000000003','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'cancelling a reservation frees the resource for a new ACTIVE reservation');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;