begin;

select extensions.no_plan();

-- Synthetic-only P5-04 graph. P5-05 owns referral mutation RPC coverage.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b8100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p504.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p504.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P504 Synthetic A Inc.','P504 A','p504-a'),
  ('b8200000-0000-0000-0000-000000000002','P504 Synthetic B Inc.','P504 B','p504-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P504 A Main','p504-a-main','P504-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P504 B Main','p504-b-main','P504-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b8400000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8400000-0000-0000-0000-000000000001','active'),
  ('b8200000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000002','b8400000-0000-0000-0000-000000000002','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b8200000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b8300000-0000-0000-0000-000000000001'::uuid,'b8100000-0000-0000-0000-000000000001'::uuid),
  ('b8200000-0000-0000-0000-000000000002'::uuid,'b8400000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,'b8300000-0000-0000-0000-000000000002'::uuid,'b8100000-0000-0000-0000-000000000002'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P504-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001'),
  ('b8500000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P504-B-0001','Patient','B',date '1991-01-01','b8300000-0000-0000-0000-000000000002');
insert into public.specialties (id, organization_id, code, name) values
  ('b8600000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P504_A','P504 Specialty A'),
  ('b8600000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P504_B','P504 Specialty B');

select extensions.columns_are('public','patient_referrals',array['id','org_id','patient_id','direction','status','required_specialty_id','external_party_name','external_party_organization','external_party_contact','notes','version','created_at','updated_at'],'patient_referrals has only the approved P5-04 fields');
select extensions.set_eq($$select conname from pg_constraint where conrelid = 'public.patient_referrals'::regclass$$,array['patient_referrals_direction_check','patient_referrals_external_party_contact_bounded_check','patient_referrals_external_party_name_bounded_check','patient_referrals_external_party_organization_bounded_check','patient_referrals_notes_bounded_check','patient_referrals_org_id_fkey','patient_referrals_org_id_patient_id_fk','patient_referrals_pkey','patient_referrals_required_specialty_id_fkey','patient_referrals_status_check','patient_referrals_version_positive_check']::text[],'patient_referrals has the complete bounded integrity constraint set');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.patient_referrals'::regclass),'patient_referrals has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.patient_referrals',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no patient_referrals privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='patient_referrals'),1,'exactly one fail-closed referral visibility policy exists');
select extensions.is((select policyname from pg_policies where schemaname='public' and tablename='patient_referrals'),'patient_referrals_select_shared_directory','referral visibility follows the patient demographics read policy');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='patient_referrals_org_patient_status_idx'),'patient_referrals has the required org/patient/status access-path index');
select extensions.is((select string_agg(attribute.attname, ',' order by index_column.ordinality) from pg_index as index_definition join pg_class as index_relation on index_relation.oid = index_definition.indexrelid join unnest(index_definition.indkey) with ordinality as index_column(attribute_number, ordinality) on true join pg_attribute as attribute on attribute.attrelid = index_definition.indrelid and attribute.attnum = index_column.attribute_number where index_relation.relname = 'patient_referrals_org_patient_status_idx'),'org_id,patient_id,status','referral access-path index uses org, patient, and status order');
select extensions.is((select procedure.proconfig from pg_proc as procedure where procedure.oid = 'private.validate_patient_referral_specialty_scope()'::regprocedure),array['search_path=""']::text[],'referral specialty trigger fixes an empty search path');
select extensions.ok(position('for key share' in pg_get_functiondef('private.validate_patient_referral_specialty_scope()'::regprocedure)) > 0,'referral specialty validation locks the referenced specialty');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) where has_function_privilege(role.role_oid,'private.validate_patient_referral_specialty_scope()','execute')),'the specialty trigger function is not executable by browser or service roles');
select extensions.is((select namespace.nspname || '.' || procedure.proname from pg_trigger as trigger join pg_proc as procedure on procedure.oid = trigger.tgfoid join pg_namespace as namespace on namespace.oid = procedure.pronamespace where trigger.tgrelid = 'public.patient_referrals'::regclass and trigger.tgname = 'patient_referrals_validate_specialty_scope' and not trigger.tgisinternal),'private.validate_patient_referral_specialty_scope','the private specialty scope trigger guards referral writes');

select extensions.lives_ok($$insert into public.patient_referrals (id,org_id,patient_id,direction,required_specialty_id,external_party_name,external_party_organization,external_party_contact,notes) select 'b8700000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','IN',id,'Dr. Example','Example Clinic','09171234567',repeat('n',2000) from public.specialties where organization_id is null and code='GENERAL_DENTISTRY'$$,'an incoming referral accepts a global specialty and bounded external snapshot');
select extensions.is((select status from public.patient_referrals where id='b8700000-0000-0000-0000-000000000001'),'RECEIVED','referrals default to RECEIVED');
select extensions.is((select version from public.patient_referrals where id='b8700000-0000-0000-0000-000000000001'),1,'referrals start at optimistic version one');
select extensions.lives_ok($$insert into public.patient_referrals (org_id,patient_id,direction,status,required_specialty_id) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','OUT','ACTIVE','b8600000-0000-0000-0000-000000000001')$$,'an outgoing referral accepts its organization custom specialty');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000002','IN')$$,'23503',null,'foreign patients fail the tenant-safe composite patient foreign key');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction,required_specialty_id) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','OUT','b8600000-0000-0000-0000-000000000002')$$,'23503','patient referral specialty must be global or belong to the referral organization','foreign custom specialties fail at the referral integrity boundary');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','SIDEWAYS')$$,'23514','new row for relation "patient_referrals" violates check constraint "patient_referrals_direction_check"','invented directions are rejected');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction,status) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','IN','DRAFT')$$,'23514','new row for relation "patient_referrals" violates check constraint "patient_referrals_status_check"','invented statuses are rejected');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction,external_party_name) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','IN','   ')$$,'23514','new row for relation "patient_referrals" violates check constraint "patient_referrals_external_party_name_bounded_check"','blank external party names are rejected');
select extensions.throws_ok($$insert into public.patient_referrals (org_id,patient_id,direction,notes) values ('b8200000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','IN',repeat('n',2001))$$,'23514','new row for relation "patient_referrals" violates check constraint "patient_referrals_notes_bounded_check"','notes cannot exceed 2000 characters');

grant select on public.patient_referrals to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000001',true);
select extensions.is((select count(*)::integer from public.patient_referrals),2,'a demographics-authorized Org A user sees only Org A referrals through RLS');
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.patient_referrals),0,'a foreign-organization demographics-authorized user sees no Org A referrals through RLS');
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
