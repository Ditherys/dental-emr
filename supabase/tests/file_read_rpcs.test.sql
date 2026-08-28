begin;

select extensions.no_plan();

-- Synthetic-only P4-05 authorization graph.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b6700000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p405.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6700000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staffer-a@p405.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6700000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p405.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id,legal_name,business_name,slug) values
  ('b6710000-0000-0000-0000-000000000001','P405 Synthetic A Inc.','P405 A','p405-a'),
  ('b6710000-0000-0000-0000-000000000002','P405 Synthetic B Inc.','P405 B','p405-b');
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values
  ('b6720000-0000-0000-0000-000000000001','b6710000-0000-0000-0000-000000000001','P405 A Main','p405-a-main','P405-A','1 Synthetic St','Test City','Test Province'),
  ('b6720000-0000-0000-0000-000000000002','b6710000-0000-0000-0000-000000000002','P405 B Main','p405-b-main','P405-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id,organization_id,user_id,membership_status,joined_at) values
  ('b6730000-0000-0000-0000-000000000001','b6710000-0000-0000-0000-000000000001','b6700000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b6730000-0000-0000-0000-000000000003','b6710000-0000-0000-0000-000000000001','b6700000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b6730000-0000-0000-0000-000000000004','b6710000-0000-0000-0000-000000000002','b6700000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select assignment.organization_id,assignment.member_id,role.id,null,assignment.user_id
from (values
  ('b6710000-0000-0000-0000-000000000001'::uuid,'b6730000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,'b6700000-0000-0000-0000-000000000001'::uuid),
  ('b6710000-0000-0000-0000-000000000002'::uuid,'b6730000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,'b6700000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id,member_id,role_code,user_id)
join public.roles as role on role.organization_id is null and role.code=assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, status, archived_at) values
  ('b6740000-0000-0000-0000-000000000001','b6710000-0000-0000-0000-000000000001','P405-A-0001','Synthetic','Patient A',date '2015-01-01','active',null),
  ('b6740000-0000-0000-0000-000000000002','b6710000-0000-0000-0000-000000000001','P405-A-0002','Archived','Patient A',date '2012-01-01','archived',statement_timestamp()),
  ('b6740000-0000-0000-0000-000000000003','b6710000-0000-0000-0000-000000000001','P405-A-0003','Paged','Patient A',date '2010-01-01','active',null),
  ('b6740000-0000-0000-0000-000000000004','b6710000-0000-0000-0000-000000000002','P405-B-0001','Foreign','Patient B',date '1980-01-01','active',null);

insert into public.file_objects (
  id, organization_id, patient_id, object_key, mime_type, size_bytes,
  uploaded_by, status, created_at, archived_at
) values
  ('b6750000-0000-0000-0000-000000000001','b6710000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',
   'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000001/files/b6750000-0000-0000-0000-000000000001',
   'application/pdf',1024,'b6700000-0000-0000-0000-000000000001','pending',timestamptz '2026-03-01 10:00:00+00',null),
  ('b6750000-0000-0000-0000-000000000002','b6710000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',
   'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000001/files/b6750000-0000-0000-0000-000000000002',
   'image/png',2048,'b6700000-0000-0000-0000-000000000001','available',timestamptz '2026-03-01 10:00:00+00',null),
  ('b6750000-0000-0000-0000-000000000003','b6710000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',
   'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000001/files/b6750000-0000-0000-0000-000000000003',
   'text/csv',256,'b6700000-0000-0000-0000-000000000001','available',timestamptz '2026-03-02 10:00:00+00',null),
  ('b6750000-0000-0000-0000-000000000004','b6710000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',
   'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000001/files/b6750000-0000-0000-0000-000000000004',
   'video/mp4',4096,'b6700000-0000-0000-0000-000000000001','archived',timestamptz '2026-03-03 10:00:00+00',timestamptz '2026-03-04 10:00:00+00'),
  ('b6750000-0000-0000-0000-000000000005','b6710000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000002',
   'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000002/files/b6750000-0000-0000-0000-000000000005',
   'application/json',128,'b6700000-0000-0000-0000-000000000001','available',timestamptz '2026-03-05 10:00:00+00',null),
  ('b6750000-0000-0000-0000-000000000006','b6710000-0000-0000-0000-000000000002','b6740000-0000-0000-0000-000000000004',
   'org/b6710000-0000-0000-0000-000000000002/patients/b6740000-0000-0000-0000-000000000004/files/b6750000-0000-0000-0000-000000000006',
   'image/webp',512,'b6700000-0000-0000-0000-000000000004','available',timestamptz '2026-03-06 10:00:00+00',null);
insert into public.file_objects (
  id, organization_id, patient_id, object_key, mime_type, size_bytes,
  uploaded_by, status, created_at
)
select
  ('b6760000-0000-8000-c000-' || lpad(series.n::text,12,'0'))::uuid,
  'b6710000-0000-0000-0000-000000000001',
  'b6740000-0000-0000-0000-000000000003',
  'org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000003/files/b6760000-0000-8000-c000-' || lpad(series.n::text,12,'0'),
  'text/plain',10,'b6700000-0000-0000-0000-000000000001','available',timestamptz '2020-01-01 00:00:00+00'
from generate_series(1,205) as series(n);

select extensions.ok(
  (select count(*) from (values('public.list_patient_files(uuid,uuid,boolean)'),('public.get_file_metadata(uuid,uuid)')) as rpc(name) where has_function_privilege('authenticated',rpc.name,'EXECUTE'))=2
  and not exists(
    select 1 from (values('anon'),('service_role'),('public')) as viewer(role_name)
    cross join (values('public.list_patient_files(uuid,uuid,boolean)'),('public.get_file_metadata(uuid,uuid)')) as rpc(name)
    where has_function_privilege(viewer.role_name,rpc.name,'EXECUTE')
  ),
  'only authenticated receives the file read RPC grants'
);
select extensions.is(
  (select count(*)::integer from pg_proc where oid in ('public.list_patient_files(uuid,uuid,boolean)'::regprocedure,'public.get_file_metadata(uuid,uuid)'::regprocedure) and prosecdef and proconfig=array['search_path=""']::text[]),
  2,
  'both file read RPCs are SECURITY DEFINER with an empty search path'
);
select extensions.is(
  (select array_agg(argument.mode::text || ':' || argument.name order by argument.ordinality)
   from pg_proc as routine,
        unnest(routine.proargmodes, routine.proargnames) with ordinality as argument(mode, name, ordinality)
   where routine.oid='public.list_patient_files(uuid,uuid,boolean)'::regprocedure),
  array['i:p_acting_branch_id','i:p_patient_id','i:p_include_archived','t:file_id','t:mime_type','t:size_bytes','t:status','t:version','t:created_at','t:uploaded_by']::text[],
  'the list projection stays bounded: no object key, checksum, or tenant column'
);
select extensions.is(
  (select array_agg(argument.mode::text || ':' || argument.name order by argument.ordinality)
   from pg_proc as routine,
        unnest(routine.proargmodes, routine.proargnames) with ordinality as argument(mode, name, ordinality)
   where routine.oid='public.get_file_metadata(uuid,uuid)'::regprocedure),
  array['i:p_acting_branch_id','i:p_file_id','t:file_id','t:object_key','t:mime_type','t:size_bytes','t:status','t:version','t:created_at','t:uploaded_by']::text[],
  'the single-file gate adds only the opaque object key to the bounded projection'
);
select set_config('p405.audit_before',(select count(*)::text from public.audit_events),true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6700000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select * from public.file_objects$$,'42501',null,'authenticated direct file_objects SELECT is still privilege-denied');
select extensions.throws_ok($$update public.file_objects set status='archived'$$,'42501',null,'authenticated direct file_objects UPDATE is still privilege-denied');
select extensions.throws_ok($$delete from public.file_objects$$,'42501',null,'authenticated direct file_objects DELETE is still privilege-denied');

select extensions.is((
  select string_agg(listed.mime_type,',') from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false) as listed
),'application/pdf,image/png,text/csv','an authorized dentist lists own-org files ordered by created_at then id, including the pending upload');
select extensions.is((select count(*)::integer from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false)),3,'the default list excludes archived file rows only');
select extensions.ok((select bool_and(listed.status <> 'archived') from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false) as listed),'no archived row leaks through the default list');
select extensions.is((select count(*)::integer from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',true)),4,'include_archived reveals the archived row');
select extensions.is((
  select string_agg(listed.mime_type,',') from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',true) as listed
),'application/pdf,image/png,text/csv,video/mp4','the archived row sorts last by created_at');
select extensions.is((select count(*)::integer from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000002',false)),1,'an archived patient stays readable per the directory read convention');
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',null)$$,'22023','invalid input','a null include_archived flag is rejected');

select extensions.is((
  select listed.file_id::text || '|' || listed.object_key || '|' || listed.mime_type || '|' || listed.size_bytes::text || '|' || listed.status || '|' || listed.version::text || '|' || listed.uploaded_by::text
  from public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6750000-0000-0000-0000-000000000001') as listed
),'b6750000-0000-0000-0000-000000000001|org/b6710000-0000-0000-0000-000000000001/patients/b6740000-0000-0000-0000-000000000001/files/b6750000-0000-0000-0000-000000000001|application/pdf|1024|pending|1|b6700000-0000-0000-0000-000000000001','metadata exposes the approved bounded fields plus the opaque object key with an opaque uploader uuid');

select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000004')$$,'42501','not authorized','a patient uuid passed as a file id gets the identical safe denial');

select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000004',false)$$,'42501','not authorized','a foreign patient is not disclosed to the list');
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6770000-0000-0000-0000-000000000099',false)$$,'42501','not authorized','a missing patient is indistinguishable from a foreign one');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6750000-0000-0000-0000-000000000006')$$,'42501','not authorized','a cross-tenant file id is refused without disclosure');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6770000-0000-0000-0000-000000000099')$$,'42501','not authorized','a missing file id is indistinguishable from a foreign one');

select extensions.is((select count(*)::integer from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000003',false)),200,'listing caps at the fixed bound of 200 rows');
select extensions.ok((
  select bool_and(listed.created_at=timestamptz '2020-01-01 00:00:00+00')
  from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000003',false) as listed
),'the cap keeps the deterministic oldest-first window and drops newer rows');
select set_config('p405.capped_window',
  (select coalesce(array_agg(listed.file_id),'{}'::uuid[])::text
   from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000003',false) as listed),
true);

reset role;
select extensions.is(
  current_setting('p405.capped_window'),
  (select coalesce(array_agg(ordered.id order by ordered.created_at,ordered.id),'{}'::uuid[])::text
   from (
     select file_row.id, file_row.created_at
     from public.file_objects as file_row
     where file_row.organization_id='b6710000-0000-0000-0000-000000000001'
       and file_row.patient_id='b6740000-0000-0000-0000-000000000003'
     order by file_row.created_at,file_row.id
     limit 200
   ) as ordered),
  'the capped result equals exactly the deterministic created_at,id window'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6700000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','staff without demographics-read cannot list files');
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000004',false)$$,'42501','not authorized','unauthorized callers get the identical error for foreign patients');
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','permission is checked before input validation');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6750000-0000-0000-0000-000000000001')$$,'42501','not authorized','staff without demographics-read cannot fetch file metadata');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6770000-0000-0000-0000-000000000099')$$,'42501','not authorized','unauthorized callers get the identical error for missing files');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6700000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','a forged foreign acting branch cannot list another tenant files');
select extensions.is((select count(*)::integer from public.list_patient_files('b6720000-0000-0000-0000-000000000002','b6740000-0000-0000-0000-000000000004',false)),1,'the foreign tenant lists only its own patient files');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000002','b6750000-0000-0000-0000-000000000002')$$,'42501','not authorized','the reverse cross-tenant metadata fetch is refused identically');
reset role;

set local role anon;
select extensions.throws_ok($$select count(*) from public.list_patient_files('b6720000-0000-0000-0000-000000000001','b6740000-0000-0000-0000-000000000001',false)$$,'42501',null,'anonymous callers cannot execute list_patient_files');
select extensions.throws_ok($$select public.get_file_metadata('b6720000-0000-0000-0000-000000000001','b6750000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous callers cannot execute get_file_metadata');
reset role;

select extensions.is(
  (select count(*)::integer from public.audit_events),
  (current_setting('p405.audit_before')::integer),
  'successful and refused file reads write no audit events'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id='b6710000-0000-0000-0000-000000000001' and action like 'patient.file.%'),
  0,
  'no patient.file.* audit action is produced by reads'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
