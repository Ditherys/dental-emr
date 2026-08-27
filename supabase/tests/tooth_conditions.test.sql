begin;

select extensions.no_plan();

-- Synthetic-only P15-01 graph. Direct inserts as the owner bypass RLS; the
-- schema is deny-by-default with zero base grants and no browser policies.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7200000-0000-0000-0000-000000000001','P1501 Synthetic A Inc.','P1501 A','p1501-a'),
  ('b7200000-0000-0000-0000-000000000002','P1501 Synthetic B Inc.','P1501 B','p1501-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1501 A Main','p1501-a-main','P1501-A','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7500000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1501-A-1','Patient','A',date '1990-01-01','b7300000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','P1501-B-1','Patient','B',date '1991-01-01',null);

select extensions.columns_are('public','tooth_conditions',array['id','organization_id','patient_id','tooth_code','surface','status','finding_type','notes','recorded_by','recorded_at','voided_at','version','created_at','updated_at'],'tooth_conditions has only the approved P15-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.tooth_conditions'::regclass),'tooth_conditions has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.tooth_conditions',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no tooth_conditions privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='tooth_conditions'),0,'tooth_conditions is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='tooth_conditions' and indexname='tooth_conditions_organization_patient_voided_idx'),1,'tooth_conditions indexes the org+patient+voided access path');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='tooth_conditions' and indexname='tooth_conditions_organization_patient_tooth_code_idx'),1,'tooth_conditions indexes the org+patient+tooth_code access path');
select extensions.is((select count(*)::integer from pg_trigger where tgrelid='public.tooth_conditions'::regclass and tgname='tooth_conditions_set_updated_at' and not tgisinternal),1,'tooth_conditions bumps updated_at through the set_updated_at trigger');

select extensions.lives_ok($$insert into public.tooth_conditions (id,organization_id,patient_id,tooth_code) values ('d7600000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26')$$,'a whole-tooth ACTIVE OTHER condition defaults to FULL/ACTIVE/OTHER at version one');
select extensions.ok((select surface='FULL' and status='ACTIVE' and finding_type='OTHER' and version=1 and voided_at is null from public.tooth_conditions where id='d7600000-0000-0000-0000-000000000001'),'tooth_conditions apply the FULL/ACTIVE/OTHER defaults and version one');
select extensions.ok((select tooth_code='26' and recorded_by is null and recorded_at is not null from public.tooth_conditions where id='d7600000-0000-0000-0000-000000000001'),'the FDI tooth code is stored verbatim and the record timestamps are stamped');
select extensions.lives_ok($$update public.tooth_conditions set notes='Reviewed at follow-up.' where id='d7600000-0000-0000-0000-000000000001'$$,'a condition row is mutable before it is voided');
select extensions.ok((select updated_at >= created_at from public.tooth_conditions where id='d7600000-0000-0000-0000-000000000001'),'the updated_at trigger fires on UPDATE');

select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','11','O','ACTIVE','CARIES')$$,'the FDI permanent lower bound 11 is accepted');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','48','D','COMPLETED','RESTORATION')$$,'the FDI permanent upper bound 48 is accepted');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','51','B','PLANNED','CROWN')$$,'the FDI primary lower bound 51 is accepted');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','85','L','REFERRED','BRIDGE')$$,'the FDI primary upper bound 85 is accepted');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','16','F','ACTIVE','SEALANT')$$,'every bounded surface vocabulary value is accepted');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','36','ACTIVE','FRACTURE')$$,'a whole-tooth default applies for a surface-less finding');

select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','49')$$,'23514',null,'an out-of-range permanent FDI tooth code is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','10')$$,'23514',null,'a zero-position FDI tooth code is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','50')$$,'23514',null,'an invalid primary FDI quadrant is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','86')$$,'23514',null,'a primary position beyond 5 is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','58')$$,'23514',null,'a sixth-position primary tooth code is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','1')$$,'23514',null,'a single-digit tooth code is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','111')$$,'23514',null,'a three-digit tooth code is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,surface) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','X')$$,'23514',null,'an unknown surface value is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','DONE')$$,'23514',null,'an unknown status value is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,finding_type) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','ABSCESS')$$,'23514',null,'an unknown finding type is rejected');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,notes) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26',repeat('n',2001))$$,'23514',null,'notes are bounded to 2000 characters');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,version) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26',0)$$,'23514',null,'version must be positive');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status,voided_at) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','COMPLETED',statement_timestamp())$$,'23514',null,'a terminal COMPLETED condition cannot carry a void stamp');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status,voided_at) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','REFERRED',statement_timestamp())$$,'23514',null,'a terminal REFERRED condition cannot carry a void stamp');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status,voided_at) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','ACTIVE',statement_timestamp())$$,'an ACTIVE condition may carry a void stamp');
select extensions.lives_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code,status,voided_at) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','PLANNED',statement_timestamp())$$,'a PLANNED condition may carry a void stamp');
select extensions.throws_ok($$insert into public.tooth_conditions (organization_id,patient_id,tooth_code) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000002','26')$$,'23503',null,'a foreign-tenant patient row cannot satisfy the composite patient FK');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;