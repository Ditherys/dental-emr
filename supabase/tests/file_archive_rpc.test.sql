begin;

select extensions.no_plan();

-- Synthetic-only P4-06 authorization graph.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b6800000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p406.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6800000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p406.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6800000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staffer-a@p406.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6800000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p406.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id,legal_name,business_name,slug) values
  ('b6810000-0000-0000-0000-000000000001','P406 Synthetic A Inc.','P406 A','p406-a'),
  ('b6810000-0000-0000-0000-000000000002','P406 Synthetic B Inc.','P406 B','p406-b');
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values
  ('b6820000-0000-0000-0000-000000000001','b6810000-0000-0000-0000-000000000001','P406 A Main','p406-a-main','P406-A','1 Synthetic St','Test City','Test Province'),
  ('b6820000-0000-0000-0000-000000000002','b6810000-0000-0000-0000-000000000002','P406 B Main','p406-b-main','P406-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id,organization_id,user_id,membership_status,joined_at) values
  ('b6830000-0000-0000-0000-000000000001','b6810000-0000-0000-0000-000000000001','b6800000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b6830000-0000-0000-0000-000000000002','b6810000-0000-0000-0000-000000000001','b6800000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b6830000-0000-0000-0000-000000000003','b6810000-0000-0000-0000-000000000001','b6800000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b6830000-0000-0000-0000-000000000004','b6810000-0000-0000-0000-000000000002','b6800000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select assignment.organization_id,assignment.member_id,role.id,null,assignment.user_id
from (values
  ('b6810000-0000-0000-0000-000000000001'::uuid,'b6830000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,'b6800000-0000-0000-0000-000000000001'::uuid),
  ('b6810000-0000-0000-0000-000000000001'::uuid,'b6830000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'b6800000-0000-0000-0000-000000000002'::uuid),
  ('b6810000-0000-0000-0000-000000000002'::uuid,'b6830000-0000-0000-0000-000000000004'::uuid,'OWNER'::text,'b6800000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id,member_id,role_code,user_id)
join public.roles as role on role.organization_id is null and role.code=assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, status) values
  ('b6840000-0000-0000-0000-000000000001','b6810000-0000-0000-0000-000000000001','P406-A-0001','Synthetic','Patient A',date '2015-01-01','active'),
  ('b6840000-0000-0000-0000-000000000002','b6810000-0000-0000-0000-000000000002','P406-B-0001','Foreign','Patient B',date '1980-01-01','active');

insert into public.file_objects (
  id, organization_id, patient_id, object_key, mime_type, size_bytes,
  uploaded_by, status, created_at, archived_at
) values
  ('b6850000-0000-0000-0000-000000000001','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000001',
   'application/pdf',1024,'b6800000-0000-0000-0000-000000000001','available',timestamptz '2026-03-01 10:00:00+00',null),
  ('b6850000-0000-0000-0000-000000000002','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000002',
   'image/png',2048,'b6800000-0000-0000-0000-000000000001','pending',timestamptz '2026-03-01 11:00:00+00',null),
  ('b6850000-0000-0000-0000-000000000003','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000003',
   'text/csv',256,'b6800000-0000-0000-0000-000000000001','archived',timestamptz '2026-03-02 10:00:00+00',timestamptz '2026-03-03 10:00:00+00'),
  ('b6850000-0000-0000-0000-000000000004','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000004',
   'video/mp4',4096,'b6800000-0000-0000-0000-000000000001','available',timestamptz '2026-03-04 10:00:00+00',null),
  ('b6850000-0000-0000-0000-000000000005','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000005',
   'application/json',128,'b6800000-0000-0000-0000-000000000001','available',timestamptz '2026-03-05 10:00:00+00',null),
  ('b6850000-0000-0000-0000-000000000006','b6810000-0000-0000-0000-000000000001','b6840000-0000-0000-0000-000000000001',
   'org/b6810000-0000-0000-0000-000000000001/patients/b6840000-0000-0000-0000-000000000001/files/b6850000-0000-0000-0000-000000000006',
   'image/webp',512,'b6800000-0000-0000-0000-000000000001','available',timestamptz '2026-03-06 10:00:00+00',null),
  ('b6850000-0000-0000-0000-000000000007','b6810000-0000-0000-0000-000000000002','b6840000-0000-0000-0000-000000000002',
   'org/b6810000-0000-0000-0000-000000000002/patients/b6840000-0000-0000-0000-000000000002/files/b6850000-0000-0000-0000-000000000007',
   'application/octet-stream',768,'b6800000-0000-0000-0000-000000000004','available',timestamptz '2026-03-07 10:00:00+00',null);

select extensions.ok(
  has_function_privilege('authenticated','public.archive_file(uuid,uuid,integer)','EXECUTE')
  and not exists(
    select 1 from (values('anon'),('service_role'),('public')) as viewer(role_name)
    where has_function_privilege(viewer.role_name,'public.archive_file(uuid,uuid,integer)','EXECUTE')
  ),
  'only authenticated receives the file archive RPC grant'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.file_objects','UPDATE')
  and not has_table_privilege('service_role','public.file_objects','UPDATE'),
  'the archive RPC adds no direct file_objects DML grants'
);
select extensions.is(
  (select count(*)::integer from pg_proc
   where oid = 'public.archive_file(uuid,uuid,integer)'::regprocedure
     and prosecdef
     and proconfig=array['search_path=""']::text[]),
  1,
  'archive_file is SECURITY DEFINER with an empty search path'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000001',1)$$,
  '42501','AAL2 required','AAL1 cannot archive a file despite live write permission'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.audit_events where action='patient.file.archived'),
  0,'an AAL1 refusal writes no audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is(
  (select version from public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000001',1)),
  2,'an authorized owner archives an available file at AAL2 and bumps the locked version'
);
reset role;
select extensions.ok(
  (select status='archived' and archived_at is not null and version=2
   from public.file_objects where id='b6850000-0000-0000-0000-000000000001'),
  'the archived row satisfies the status/archived_at/version invariant'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where action='patient.file.archived' and entity_type='file_object'
     and entity_id='b6850000-0000-0000-0000-000000000001' and metadata='{}'::jsonb),
  1,'the successful archive writes exactly one opaque audit event atomically'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is(
  (select version from public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000002',1)),
  2,'a pending upload may be archived before any bytes were confirmed'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000001',2)$$,
  'P0001','invalid state','an already-archived file cannot be archived again'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000004',9)$$,
  'P0001','stale version','a stale expected version cannot archive a newer row'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000004',0)$$,
  '22023','invalid input','a non-positive expected version is rejected before any row access'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000004',null)$$,
  '22023','invalid input','a missing expected version is rejected before any row access'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000007',1)$$,
  '42501','not authorized','a foreign tenant file is not disclosed to the caller'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6860000-0000-0000-0000-000000000099',1)$$,
  '42501','not authorized','a missing file is indistinguishable from a foreign one'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000002','b6850000-0000-0000-0000-000000000001',2)$$,
  '42501','not authorized','a forged foreign acting branch cannot archive'
);
reset role;
select extensions.is((select status || ':' || version from public.file_objects where id='b6850000-0000-0000-0000-000000000001'),'archived:2','a refused re-archive leaves the archived row untouched');
select extensions.is((select status || ':' || version from public.file_objects where id='b6850000-0000-0000-0000-000000000004'),'available:1','refused stale, invalid-input, foreign, and missing attempts leave the target row untouched');
select extensions.is((select status from public.file_objects where id='b6850000-0000-0000-0000-000000000007'),'available','the refused cross-tenant archive leaves the foreign row untouched');
select extensions.is(
  (select count(*)::integer from public.audit_events where organization_id='b6810000-0000-0000-0000-000000000002'),
  0,'the refused cross-tenant archive wrote no audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000005',1)$$,
  '42501','not authorized','staff with neither permission cannot archive at AAL2'
);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6860000-0000-0000-0000-000000000099',1)$$,
  '42501','not authorized','unauthorized callers get the identical error for missing files'
);
reset role;
select extensions.is((select status from public.file_objects where id='b6850000-0000-0000-0000-000000000005'),'available','the unauthorized archive attempt left the file available');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is(
  (select version from public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000005',1)),
  2,'a demographics-write holder may archive at AAL2 without provider.manage'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select * from public.file_objects$$,'42501',null,'authenticated direct file_objects SELECT is still privilege-denied');
select extensions.throws_ok($$update public.file_objects set status='archived'$$,'42501',null,'authenticated direct file_objects UPDATE is still privilege-denied');
reset role;

create function private.p406_reject_archive_audit()
returns trigger language plpgsql as $$
begin
  if new.action = 'patient.file.archived' then
    raise exception using errcode = 'P0001', message = 'audit blocked';
  end if;
  return new;
end;
$$;
create trigger p406_reject_archive_audit
before insert on public.audit_events
for each row execute function private.p406_reject_archive_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6800000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok(
  $$select public.archive_file('b6820000-0000-0000-0000-000000000001','b6850000-0000-0000-0000-000000000006',1)$$,
  'P0001','audit blocked','an audit insertion failure rejects the archive'
);
reset role;
drop trigger p406_reject_archive_audit on public.audit_events;
drop function private.p406_reject_archive_audit();
select extensions.is(
  (select status || ':' || version from public.file_objects where id='b6850000-0000-0000-0000-000000000006'),
  'available:1','audit failure rolls the archive back entirely'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where entity_id='b6850000-0000-0000-0000-000000000006'),
  0,'audit-blocked archives leave no partial audit event behind'
);

select extensions.is(
  (select count(*)::integer from public.audit_events where action='patient.file.archived'),
  3,'organization A holds exactly its three successful archive audit events'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where action='patient.file.archived'
     and (entity_type <> 'file_object' or category <> 'PATIENT' or result <> 'SUCCESS'
          or actor_type <> 'USER' or metadata <> '{}'::jsonb)),
  0,'every file archive audit event follows the approved shape'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
