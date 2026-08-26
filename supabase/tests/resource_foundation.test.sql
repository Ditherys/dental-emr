begin;

select extensions.no_plan();

-- Synthetic-only P6-02 graph. No browser policies exist; every assertion below
-- runs as the migration/superuser or via the private trigger boundaries.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P602 Synthetic A Inc.','P602 A','p602-a'),
  ('b8200000-0000-0000-0000-000000000002','P602 Synthetic B Inc.','P602 B','p602-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P602 A Main','p602-a-main','P602-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P602 B Main','p602-b-main','P602-B','2 Synthetic St','Test City','Test Province');

select extensions.columns_are('public','resource_types',array['id','organization_id','code','name','schedulable','is_active','version','created_at','updated_at'],'resource_types has only the approved P6-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.resource_types'::regclass),'resource_types has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.resource_types',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no resource_types privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='resource_types'),0,'resource_types is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from public.resource_types where organization_id is null),5,'the five global resource types are seeded');
select extensions.set_eq($$select code from public.resource_types where organization_id is null order by code$$,array['DENTAL_CHAIR','INTRAORAL_SCANNER','PANORAMIC_XRAY','SURGERY_ROOM','XRAY_ROOM']::text[],'global resource type codes match the approved catalog');
select extensions.throws_ok($$update public.resource_types set name='Forbidden' where code='DENTAL_CHAIR'$$,'23514','global resource types are immutable','global resource types cannot be renamed');
select extensions.lives_ok($$insert into public.resource_types (organization_id, code, name) values ('b8200000-0000-0000-0000-000000000001','P602_A','P602 Resource Type A')$$,'an organization can define a custom resource type');
select extensions.throws_ok($$insert into public.resource_types (organization_id, code, name) values ('b8200000-0000-0000-0000-000000000001','lowercase','Bad')$$,'23514',null,'resource type codes must be upper-case and bounded');

select extensions.columns_are('public','branch_resources',array['id','organization_id','branch_id','resource_type_id','name','status','serial_number','notes','online_booking_eligible','version','created_at','updated_at','archived_at'],'branch_resources has only the approved P6-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.branch_resources'::regclass),'branch_resources has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.branch_resources',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no branch_resources privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='branch_resources'),0,'branch_resources is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.branch_resources (id,organization_id,branch_id,resource_type_id,name,serial_number,notes) select 'c1100000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',id,'Chair 1','SN-0001',repeat('n',1000) from public.resource_types where organization_id is null and code='DENTAL_CHAIR'$$,'a branch resource accepts a global resource type and bounded metadata');
select extensions.is((select status from public.branch_resources where id='c1100000-0000-0000-0000-000000000001'),'active','branch resources default to active');
select extensions.lives_ok($$insert into public.branch_resources (organization_id,branch_id,resource_type_id,name) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Chair 2')$$,'a second global-type branch resource is accepted');
select extensions.throws_ok($$insert into public.branch_resources (organization_id,branch_id,resource_type_id,name) select 'b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','Foreign Chair'$$,'23503',null,'a branch resource cannot reference a foreign branch through the tenant-safe composite foreign key');
select extensions.lives_ok($$insert into public.resource_types (organization_id, code, name) values ('b8200000-0000-0000-0000-000000000002','P602_B','P602 Custom B')$$,'seed second org custom type');
select extensions.throws_ok($$insert into public.branch_resources (organization_id,branch_id,resource_type_id,name) values ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000000','Custom Chair')$$,'23503',null,'an unknown resource type id still fails the plain foreign key');
select extensions.throws_ok($$insert into public.branch_resources (organization_id,branch_id,resource_type_id,name) select 'b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',id,'Foreign Custom Chair' from public.resource_types where code='P602_B'$$,'23514','branch resource type must be global or belong to the resource organization','a foreign custom resource type fails the scope trigger');
select extensions.lives_ok($$update public.resource_types set is_active=false where organization_id='b8200000-0000-0000-0000-000000000001' and code='P602_A'$$,'org custom resource types can be deactivated');
select extensions.throws_ok($$insert into public.branch_resources (organization_id,branch_id,resource_type_id,name) select 'b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001',id,'Inactive Chair' from public.resource_types where organization_id='b8200000-0000-0000-0000-000000000001' and code='P602_A'$$,'23514','inactive resource types cannot be assigned to branch resources','inactive resource types are rejected at assignment');

select extensions.columns_are('public','resource_unavailability',array['id','organization_id','resource_id','starts_at','ends_at','reason','created_at'],'resource_unavailability has only the approved P6-02 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.resource_unavailability'::regclass),'resource_unavailability has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.resource_unavailability',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no resource_unavailability privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='resource_unavailability'),0,'resource_unavailability is deny-by-default with no browser policies');
select extensions.lives_ok($$insert into public.resource_unavailability (organization_id,resource_id,starts_at,ends_at,reason) values ('b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001','2026-01-01 08:00:00+00','2026-01-01 12:00:00+00','maintenance')$$,'resource unavailability accepts a valid interval and reason');
select extensions.throws_ok($$insert into public.resource_unavailability (organization_id,resource_id,starts_at,ends_at) values ('b8200000-0000-0000-0000-000000000001','c1100000-0000-0000-0000-000000000001','2026-01-02 12:00:00+00','2026-01-02 08:00:00+00')$$,'23514',null,'resource unavailability requires ends_at after starts_at');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;