begin;

select extensions.no_plan();

-- Synthetic-only P4-04 authorization graph.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b6600000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p404.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6600000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p404.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6600000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staffer-a@p404.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6600000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p404.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id,legal_name,business_name,slug) values
  ('b6610000-0000-0000-0000-000000000001','P404 Synthetic A Inc.','P404 A','p404-a'),
  ('b6610000-0000-0000-0000-000000000002','P404 Synthetic B Inc.','P404 B','p404-b');
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values
  ('b6620000-0000-0000-0000-000000000001','b6610000-0000-0000-0000-000000000001','P404 A Main','p404-a-main','P404-A','1 Synthetic St','Test City','Test Province'),
  ('b6620000-0000-0000-0000-000000000002','b6610000-0000-0000-0000-000000000002','P404 B Main','p404-b-main','P404-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id,organization_id,user_id,membership_status,joined_at) values
  ('b6630000-0000-0000-0000-000000000001','b6610000-0000-0000-0000-000000000001','b6600000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b6630000-0000-0000-0000-000000000002','b6610000-0000-0000-0000-000000000001','b6600000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b6630000-0000-0000-0000-000000000003','b6610000-0000-0000-0000-000000000001','b6600000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b6630000-0000-0000-0000-000000000004','b6610000-0000-0000-0000-000000000002','b6600000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select assignment.organization_id,assignment.member_id,role.id,null,assignment.user_id
from (values
  ('b6610000-0000-0000-0000-000000000001'::uuid,'b6630000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,'b6600000-0000-0000-0000-000000000001'::uuid),
  ('b6610000-0000-0000-0000-000000000001'::uuid,'b6630000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'b6600000-0000-0000-0000-000000000002'::uuid),
  ('b6610000-0000-0000-0000-000000000002'::uuid,'b6630000-0000-0000-0000-000000000004'::uuid,'OWNER'::text,'b6600000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id,member_id,role_code,user_id)
join public.roles as role on role.organization_id is null and role.code=assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, status, archived_at) values
  ('b6640000-0000-0000-0000-000000000001','b6610000-0000-0000-0000-000000000001','P404-A-0001','Synthetic','Patient A',date '2015-01-01','active',null),
  ('b6640000-0000-0000-0000-000000000002','b6610000-0000-0000-0000-000000000001','P404-A-0002','Archived','Patient A',date '2012-01-01','archived',statement_timestamp()),
  ('b6640000-0000-0000-0000-000000000003','b6610000-0000-0000-0000-000000000002','P404-B-0001','Foreign','Patient B',date '1980-01-01','active',null);

select extensions.ok(
  (select count(*) from (values('public.create_file_upload(uuid,uuid,text,bigint)'),('public.confirm_file_upload(uuid,uuid,integer,bigint)')) as rpc(name) where has_function_privilege('authenticated',rpc.name,'EXECUTE'))=2
  and not exists(
    select 1 from (values('anon'),('service_role'),('public')) as viewer(role_name)
    cross join (values('public.create_file_upload(uuid,uuid,text,bigint)'),('public.confirm_file_upload(uuid,uuid,integer,bigint)')) as rpc(name)
    where has_function_privilege(viewer.role_name,rpc.name,'EXECUTE')
  ),
  'only authenticated receives the file upload RPC grants'
);
select extensions.is(
  (select count(*)::integer from pg_proc where oid in ('public.create_file_upload(uuid,uuid,text,bigint)'::regprocedure,'public.confirm_file_upload(uuid,uuid,integer,bigint)'::regprocedure) and prosecdef and proconfig=array['search_path=""']::text[]),
  2,
  'both file upload RPCs are SECURITY DEFINER with an empty search path'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','application/pdf',1024)),1,'an authorized owner creates a pending upload at version 1');
select extensions.is((select version from public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','image/png',2048)),1,'a second upload for the same patient starts independently at version 1');
reset role;
select set_config('p404.pdf',(select id::text from public.file_objects where organization_id='b6610000-0000-0000-0000-000000000001' and mime_type='application/pdf'),true);
select set_config('p404.png',(select id::text from public.file_objects where organization_id='b6610000-0000-0000-0000-000000000001' and mime_type='image/png'),true);
select extensions.is(
  (select object_key from public.file_objects where id=current_setting('p404.pdf')::uuid),
  'org/b6610000-0000-0000-0000-000000000001/patients/b6640000-0000-0000-0000-000000000001/files/' || current_setting('p404.pdf')::uuid::text,
  'the stored object key embeds exactly the caller org, patient, and file ids'
);
select extensions.ok(
  (select status='pending' and version=1 and uploaded_by='b6600000-0000-0000-0000-000000000001'::uuid and size_bytes=1024 and checksum_sha256 is null from public.file_objects where id=current_setting('p404.pdf')::uuid),
  'the created row stays pending, unverified, and attributed to the caller'
);
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000001' and action='patient.file.upload_created' and metadata='{}'::jsonb),2,'each successful upload creation writes exactly one opaque audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000002','application/pdf',1024)$$,'P0001','invalid state','uploads against an archived patient are refused');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000003','application/pdf',1024)$$,'42501','not authorized','a foreign patient is not disclosed to the caller');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000099','application/pdf',1024)$$,'42501','not authorized','a missing patient is indistinguishable from a foreign one');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','garbage',1024)$$,'22023','invalid input','a non type/subtype MIME token cannot open an upload');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','',1024)$$,'22023','invalid input','a blank MIME type cannot open an upload');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','application/pdf',0)$$,'22023','invalid input','a zero declared size cannot open an upload');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','application/pdf',-1)$$,'22023','invalid input','a negative declared size cannot open an upload');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000002','b6640000-0000-0000-0000-000000000003','application/pdf',1024)$$,'42501','not authorized','a forged foreign acting branch cannot open an upload');

select extensions.is(
  (select version from public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.pdf')::uuid,1,4096)),
  2,
  'confirmation bumps the optimistic version'
);
reset role;
select extensions.is((select status from public.file_objects where id=current_setting('p404.pdf')::uuid),'available','confirmation moves the row out of pending');
select extensions.is(
  (select size_bytes from public.file_objects where id=current_setting('p404.pdf')::uuid),
  4096::bigint,
  'confirmation persists exactly the server-verified size passed by the storage HEAD, overwriting any declared value'
);
select extensions.throws_ok(
  $$update public.file_objects set size_bytes = null where id=current_setting('p404.pdf')::uuid$$,
  '23514','new row for relation "file_objects" violates check constraint "file_objects_available_size_check"',
  'an available row cannot drop back to an unverified NULL size'
);
select extensions.throws_ok(
  $$insert into public.file_objects (organization_id,patient_id,object_key,mime_type,size_bytes,checksum_sha256,uploaded_by,status) values ('b6610000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','org/b6610000-0000-0000-0000-000000000001/patients/b6640000-0000-0000-0000-000000000001/files/b6650000-0000-0000-0000-000000000099','application/pdf',null,repeat('a',64),'b6600000-0000-0000-0000-000000000001','available')$$,
  '23514','new row for relation "file_objects" violates check constraint "file_objects_available_size_check"',
  'no row can exist as available without a persisted size'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where action='patient.file.confirmed' and metadata='{}'::jsonb and entity_type='file_object' and entity_id=current_setting('p404.pdf')::uuid),
  1,
  'confirmation writes exactly one opaque audit event atomically'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.pdf')::uuid,2,4096)$$,'P0001','invalid state','an already-available file cannot be confirmed again');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000001' and action='patient.file.confirmed'),1,'a failed re-confirmation writes no audit event');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.png')::uuid,5,2048)$$,'P0001','stale version','a stale confirmation cannot overwrite a newer version');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001','b6650000-0000-0000-0000-000000000099',1,1024)$$,'42501','not authorized','a missing file is not disclosed to the caller');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.png')::uuid,0,2048)$$,'22023','invalid input','a non-positive expected version is rejected before any row access');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.png')::uuid,1,0)$$,'22023','invalid input','a non-positive verified size is rejected before any row access');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000001' and action='patient.file.confirmed'),1,'failed confirmations leave exactly the successful audit event');

create function private.p404_reject_file_audit()
returns trigger language plpgsql as $$
begin
  if new.action = 'patient.file.confirmed' then
    raise exception using errcode = 'P0001', message = 'audit blocked';
  end if;
  return new;
end;
$$;
create trigger p404_reject_file_audit
before insert on public.audit_events
for each row execute function private.p404_reject_file_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.png')::uuid,1,2048)$$,'P0001','audit blocked','an audit insertion failure rejects the confirmation');
reset role;
drop trigger p404_reject_file_audit on public.audit_events;
drop function private.p404_reject_file_audit();
select extensions.is((select status || ':' || version from public.file_objects where id=current_setting('p404.png')::uuid),'pending:1','audit failure rolls the confirmation back entirely');

create or replace function private.p404_reject_file_audit()
returns trigger language plpgsql as $$
begin
  if new.action = 'patient.file.upload_created' then
    raise exception using errcode = 'P0001', message = 'audit blocked';
  end if;
  return new;
end;
$$;
select set_config('p404.pre_creates',(select count(*)::text from public.audit_events where action='patient.file.upload_created'),true);
create trigger p404_reject_file_audit
before insert on public.audit_events
for each row execute function private.p404_reject_file_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','text/plain',64)$$,'P0001','audit blocked','an audit insertion failure rejects the upload creation');
reset role;
drop trigger p404_reject_file_audit on public.audit_events;
drop function private.p404_reject_file_audit();
select extensions.is((select count(*)::integer from public.file_objects where patient_id='b6640000-0000-0000-0000-000000000001' and mime_type='text/plain'),0,'audit failure rolls the upload creation back entirely');
select extensions.is(
  (select count(*)::integer from public.audit_events where action='patient.file.upload_created'),
  (current_setting('p404.pre_creates')::integer),
  'audit-blocked creation leaves the upload_created event count unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000004',true);
select extensions.is((select version from public.create_file_upload('b6620000-0000-0000-0000-000000000002','b6640000-0000-0000-0000-000000000003','application/octet-stream',512)),1,'the foreign tenant may upload to its own patient');
reset role;
select set_config('p404.bin',(select id::text from public.file_objects where organization_id='b6610000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.bin')::uuid,1,512)$$,'42501','not authorized','a cross-tenant confirmation is refused without disclosing the file');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000002' and action='patient.file.confirmed'),0,'the refused cross-tenant confirmation wrote no audit event');
select extensions.is((select status from public.file_objects where id=current_setting('p404.bin')::uuid),'pending','the foreign pending row is untouched by the refused confirmation');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000002',true);
select set_config('p404.csv',(select file_id::text from public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','text/csv',256)),true);
select extensions.is((select version from public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.csv')::uuid,1,256)),2,'a demographics-write holder may open and confirm an upload');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','text/plain',64)$$,'42501','not authorized','staff with neither permission cannot open uploads');
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000003','text/plain',64)$$,'42501','not authorized','unauthorized callers get the identical error for foreign patients');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001',current_setting('p404.png')::uuid,1,2048)$$,'42501','not authorized','staff with neither permission cannot confirm uploads');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001','b6650000-0000-0000-0000-000000000099',1,1024)$$,'42501','not authorized','unauthorized callers get the identical error for missing files');
reset role;

set local role anon;
select extensions.throws_ok($$select public.create_file_upload('b6620000-0000-0000-0000-000000000001','b6640000-0000-0000-0000-000000000001','application/pdf',1)$$,'42501',null,'anonymous callers cannot execute create_file_upload');
select extensions.throws_ok($$select public.confirm_file_upload('b6620000-0000-0000-0000-000000000001','b6650000-0000-0000-0000-000000000099',1,1024)$$,'42501',null,'anonymous callers cannot execute confirm_file_upload');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6600000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select * from public.file_objects$$,'42501',null,'authenticated direct file_objects SELECT is still privilege-denied');
select extensions.throws_ok($$update public.file_objects set status='available'$$,'42501',null,'authenticated direct file_objects UPDATE is still privilege-denied');
reset role;

select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000001' and action='patient.file.upload_created' and metadata='{}'::jsonb),3,'organization A holds exactly its three creation audit events with empty metadata');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b6610000-0000-0000-0000-000000000001' and action='patient.file.confirmed' and metadata='{}'::jsonb),2,'organization A holds exactly its two confirmation audit events with empty metadata');
select extensions.is((select count(*)::integer from public.audit_events where action like 'patient.file.%' and (entity_type <> 'file_object' or category <> 'PATIENT' or result <> 'SUCCESS' or actor_type <> 'USER')),0,'every file audit event follows the approved shape');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
