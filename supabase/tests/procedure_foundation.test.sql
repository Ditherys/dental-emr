begin;

select extensions.no_plan();

-- Synthetic-only P3-05 authorization graph.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b5010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p305.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b5010000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p305.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b5010000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p305.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id,legal_name,business_name,slug) values
  ('b5020000-0000-0000-0000-000000000001','P305 Synthetic A Inc.','P305 A','p305-a'),
  ('b5020000-0000-0000-0000-000000000002','P305 Synthetic B Inc.','P305 B','p305-b');
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values
  ('b5030000-0000-0000-0000-000000000001','b5020000-0000-0000-0000-000000000001','P305 A Main','p305-a-main','P305-A','1 Synthetic St','Test City','Test Province'),
  ('b5030000-0000-0000-0000-000000000002','b5020000-0000-0000-0000-000000000002','P305 B Main','p305-b-main','P305-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id,organization_id,user_id,membership_status,joined_at) values
  ('b5040000-0000-0000-0000-000000000001','b5020000-0000-0000-0000-000000000001','b5010000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b5040000-0000-0000-0000-000000000002','b5020000-0000-0000-0000-000000000001','b5010000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b5040000-0000-0000-0000-000000000003','b5020000-0000-0000-0000-000000000002','b5010000-0000-0000-0000-000000000003','active',statement_timestamp());
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select assignment.organization_id,assignment.member_id,role.id,null,assignment.user_id
from (values
  ('b5020000-0000-0000-0000-000000000001'::uuid,'b5040000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,'b5010000-0000-0000-0000-000000000001'::uuid),
  ('b5020000-0000-0000-0000-000000000001'::uuid,'b5040000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,'b5010000-0000-0000-0000-000000000001'::uuid),
  ('b5020000-0000-0000-0000-000000000002'::uuid,'b5040000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,'b5010000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id,member_id,role_code,user_id)
join public.roles as role on role.organization_id is null and role.code=assignment.role_code;
insert into public.providers (id,organization_id,first_name,last_name,provider_type) values
  ('b5050000-0000-0000-0000-000000000001','b5020000-0000-0000-0000-000000000001','Provider','A','REGULAR'),
  ('b5050000-0000-0000-0000-000000000002','b5020000-0000-0000-0000-000000000002','Provider','B','REGULAR');
insert into public.specialties (id,organization_id,code,name) values
  ('b5060000-0000-0000-0000-000000000001','b5020000-0000-0000-0000-000000000001','P305_A','P305 Specialty A'),
  ('b5060000-0000-0000-0000-000000000002','b5020000-0000-0000-0000-000000000002','P305_B','P305 Specialty B');
insert into public.procedures (id,organization_id,code,name,default_duration_minutes,pre_buffer_minutes,post_buffer_minutes) values
  ('b5070000-0000-0000-0000-000000000001','b5020000-0000-0000-0000-000000000001','P305_EXAM','P305 Examination',30,5,5),
  ('b5070000-0000-0000-0000-000000000002','b5020000-0000-0000-0000-000000000002','P305_EXAM','P305 Examination B',30,0,0);

select extensions.columns_are('public','procedures',array['id','organization_id','code','name','description','default_duration_minutes','pre_buffer_minutes','post_buffer_minutes','status','website_visible','online_booking_enabled','booking_mode','version','created_at','updated_at','archived_at'],'procedures has only the approved P3-05 catalog fields and no price field');
select extensions.columns_are('public','procedure_specialties',array['id','organization_id','procedure_id','specialty_id','requirement_level','created_at'],'procedure specialties has only qualification fields');
select extensions.columns_are('public','procedure_eligible_providers',array['id','organization_id','procedure_id','provider_id','created_at'],'eligible providers is an explicit optional allow-list');
select extensions.is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name in ('procedures','procedure_specialties','procedure_eligible_providers') and column_name ~* 'price|cost|fee|amount'),'0'::integer,'P3-05 tables contain no price-like columns');
select extensions.is((select count(*)::integer from pg_class where oid in ('public.procedures'::regclass,'public.procedure_specialties'::regclass,'public.procedure_eligible_providers'::regclass) and relrowsecurity),3,'RLS is enabled on all procedure tables');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('public.procedures'),('public.procedure_specialties'),('public.procedure_eligible_providers')) as tab(name) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,tab.name,privilege.name)),'PUBLIC, anon, authenticated, and service_role have no procedure table privileges');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='procedures_organization_status_name_idx'),'procedures has a tenant/status/name access-path index');
select extensions.throws_ok($$insert into public.procedures(organization_id,code,name,default_duration_minutes,pre_buffer_minutes) values('b5020000-0000-0000-0000-000000000001','P305_NULL','Null duration',null,1)$$,'23514','new row for relation "procedures" violates check constraint "procedures_null_duration_zero_buffers_check"','null duration requires zero buffers');
select extensions.throws_ok($$insert into public.procedures(organization_id,code,name,default_duration_minutes) values('b5020000-0000-0000-0000-000000000001','P305_ZERO','Zero duration',0)$$,'23514','new row for relation "procedures" violates check constraint "procedures_duration_positive_check"','duration must be positive when present');
select extensions.throws_ok($$insert into public.procedures(organization_id,code,name,booking_mode) values('b5020000-0000-0000-0000-000000000001','P305_AUTO','Auto','AUTO_CONFIRM')$$,'23514','new row for relation "procedures" violates check constraint "procedures_booking_mode_check"','AUTO_CONFIRM is prohibited before scheduling');
select extensions.throws_ok($$insert into public.procedures(organization_id,code,name) values('b5020000-0000-0000-0000-000000000001','P305_EXAM','Duplicate')$$,'23505','duplicate key value violates unique constraint "procedures_organization_code_key"','procedure codes are unique within an organization');
select extensions.lives_ok($$insert into public.procedure_specialties(organization_id,procedure_id,specialty_id,requirement_level) select 'b5020000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',id,'REQUIRED' from public.specialties where organization_id is null and code='GENERAL_DENTISTRY'$$,'Org A procedure accepts a global specialty');
select extensions.lives_ok($$insert into public.procedure_specialties(organization_id,procedure_id,specialty_id,requirement_level) values('b5020000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001','b5060000-0000-0000-0000-000000000001','PREFERRED')$$,'Org A procedure accepts its custom specialty');
select extensions.throws_ok($$insert into public.procedure_specialties(organization_id,procedure_id,specialty_id,requirement_level) values('b5020000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001','b5060000-0000-0000-0000-000000000002','REQUIRED')$$,'23503','procedure specialty must be global or belong to the procedure organization','foreign custom specialties fail at the integrity boundary');
select extensions.throws_ok($$insert into public.procedure_eligible_providers(organization_id,procedure_id,provider_id) values('b5020000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001','b5050000-0000-0000-0000-000000000002')$$,'23503',null,'eligible providers have a tenant-safe composite provider foreign key');

select extensions.ok((select count(*) from (values('public.create_procedure(uuid,jsonb)'),('public.update_procedure(uuid,uuid,integer,jsonb)'),('public.archive_procedure(uuid,uuid,integer)'),('public.set_procedure_specialties(uuid,uuid,integer,jsonb)'),('public.set_procedure_eligible_providers(uuid,uuid,integer,uuid[])'),('public.list_procedures(uuid)'),('public.get_procedure_configuration(uuid,uuid)')) as rpc(name) where has_function_privilege('authenticated',rpc.name,'EXECUTE'))=7 and not exists(select 1 from (values('public.create_procedure(uuid,jsonb)'),('public.update_procedure(uuid,uuid,integer,jsonb)'),('public.archive_procedure(uuid,uuid,integer)'),('public.set_procedure_specialties(uuid,uuid,integer,jsonb)'),('public.set_procedure_eligible_providers(uuid,uuid,integer,uuid[])'),('public.list_procedures(uuid)'),('public.get_procedure_configuration(uuid,uuid)')) as rpc(name) where has_function_privilege('service_role',rpc.name,'EXECUTE')),'only authenticated receives every procedure RPC grant');
select extensions.is((select count(*)::integer from pg_proc as procedure where procedure.oid in ('public.create_procedure(uuid,jsonb)'::regprocedure,'public.update_procedure(uuid,uuid,integer,jsonb)'::regprocedure,'public.archive_procedure(uuid,uuid,integer)'::regprocedure,'public.set_procedure_specialties(uuid,uuid,integer,jsonb)'::regprocedure,'public.set_procedure_eligible_providers(uuid,uuid,integer,uuid[])'::regprocedure,'public.list_procedures(uuid)'::regprocedure,'public.get_procedure_configuration(uuid,uuid)'::regprocedure) and procedure.prosecdef and procedure.proconfig=array['search_path=""']::text[]),7,'all procedure RPCs are SECURITY DEFINER with an empty search path');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b5010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
select extensions.throws_ok($$select * from public.procedures$$,'42501',null,'authenticated direct procedure SELECT is privilege-denied');
select extensions.throws_ok($$insert into public.procedures(organization_id,code,name) values('b5020000-0000-0000-0000-000000000001','P305_DIRECT','Denied')$$,'42501',null,'authenticated direct procedure INSERT is privilege-denied');
select extensions.is((select version from public.create_procedure('b5030000-0000-0000-0000-000000000001','{"code":"P305_CREATED","name":"Created Procedure","defaultDurationMinutes":45,"preBufferMinutes":5,"postBufferMinutes":10,"bookingMode":"REQUEST_ONLY"}'::jsonb)),1,'an authorized owner may create a procedure');
select extensions.is((select count(*)::integer from public.audit_events where action='procedure.created' and category='PROVIDER_CONFIGURATION' and metadata='{}'::jsonb),1,'procedure creation writes exactly one opaque audit event');
select extensions.throws_ok($$select public.create_procedure('b5030000-0000-0000-0000-000000000001','{"code":"P305_PRICE","name":"Bad","price":100}'::jsonb)$$,'22023','invalid input','procedure input rejects price and arbitrary fields');
select extensions.throws_ok($$select public.create_procedure('b5030000-0000-0000-0000-000000000001','{"code":"P305_BUFFERS","name":"Bad","preBufferMinutes":1}'::jsonb)$$,'22023','invalid input','RPC also rejects buffers without a duration');
select extensions.throws_ok($$select public.archive_procedure('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',1)$$,'42501','AAL2 required','archive requires AAL2');
select set_config('request.jwt.claim.sub','b5010000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select * from public.list_procedures('b5030000-0000-0000-0000-000000000001')$$,'42501','not authorized','staff without provider.read cannot list procedures');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b5010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is((select version from public.set_procedure_specialties('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',1,'[{"specialtyId":"b5060000-0000-0000-0000-000000000001","requirementLevel":"REQUIRED"}]'::jsonb)),2,'specialty replacement locks and versions the procedure');
select extensions.throws_ok($$select public.set_procedure_eligible_providers('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',2,array['b5050000-0000-0000-0000-000000000002'::uuid])$$,'22023','invalid input','foreign eligible providers are rejected through the RPC');
select extensions.is((select version from public.set_procedure_eligible_providers('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',2,array['b5050000-0000-0000-0000-000000000001'::uuid])),3,'same-tenant active eligible providers replace atomically');
select extensions.ok((select public.get_procedure_configuration('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001') ?& array['procedureId','code','name','description','defaultDurationMinutes','preBufferMinutes','postBufferMinutes','status','websiteVisible','onlineBookingEnabled','bookingMode','version','specialties','eligibleProviderIds']),'detail projection includes only editable procedure fields and relation IDs');
select extensions.ok(not ((select public.get_procedure_configuration('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001')) ?| array['organizationId','actorUserId','price','cost']),'detail excludes tenant internals and prices');
select extensions.throws_ok($$select * from public.list_procedures('b5030000-0000-0000-0000-000000000002')$$,'42501','not authorized','a forged foreign acting branch cannot list another tenant procedures');
select extensions.is((select count(*)::integer from public.list_procedures('b5030000-0000-0000-0000-000000000001')),2,'list returns only non-archived same-tenant procedures');
reset role;
create function private.p305_reject_procedure_audit() returns trigger language plpgsql as $$begin if new.action='procedure.archived' then raise exception using errcode='P0001',message='audit blocked'; end if; return new; end;$$;
create trigger p305_reject_procedure_audit before insert on public.audit_events for each row execute function private.p305_reject_procedure_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b5010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok($$select public.archive_procedure('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',3)$$,'P0001','audit blocked','an audit insertion failure rejects procedure archive');
reset role;
select extensions.is((select status from public.procedures where id='b5070000-0000-0000-0000-000000000001'),'active','audit failure rolls back the procedure archive');
drop trigger p305_reject_procedure_audit on public.audit_events;
drop function private.p305_reject_procedure_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b5010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is((select version from public.archive_procedure('b5030000-0000-0000-0000-000000000001','b5070000-0000-0000-0000-000000000001',3)),4,'AAL2 owner may archive a procedure');
reset role;

set local role anon;
select extensions.throws_ok($$select * from public.list_procedures('b5030000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous callers cannot execute procedure RPCs');
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
