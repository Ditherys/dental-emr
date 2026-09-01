begin;

select extensions.no_plan();

-- Synthetic-only Task 2 graph for the read-only current-managed-visit
-- projection. Organization A holds two dentists with their own active linked
-- providers at A Main, an owner with no provider link, and a receptionist.
-- Organization B is foreign. Fixture inserts run as postgres; every RPC call
-- runs with set local role authenticated plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e2100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a1@cmv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e2100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a2@cmv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e2100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain-a@cmv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e2100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@cmv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e2100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@cmv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e2200000-0000-0000-0000-000000000001','CMV Synthetic A Inc.','CMV A','cmv-a'),
  ('e2200000-0000-0000-0000-000000000002','CMV Synthetic B Inc.','CMV B','cmv-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e2300000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','CMV A Main','cmv-a-main','CMV-A','1 Synthetic St','Test City','Test Province'),
  ('e2300000-0000-0000-0000-000000000002','e2200000-0000-0000-0000-000000000001','CMV A Branch 2','cmv-a-2','CMV-A2','2 Synthetic St','Test City','Test Province'),
  ('e2300000-0000-0000-0000-000000000003','e2200000-0000-0000-0000-000000000002','CMV B Main','cmv-b-main','CMV-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e2400000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e2400000-0000-0000-0000-000000000002','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e2400000-0000-0000-0000-000000000003','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e2400000-0000-0000-0000-000000000004','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('e2400000-0000-0000-0000-000000000005','e2200000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2400000-0000-0000-0000-000000000001','active'),
  ('e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000002','e2400000-0000-0000-0000-000000000001','active'),
  ('e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2400000-0000-0000-0000-000000000002','active'),
  ('e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2400000-0000-0000-0000-000000000003','active'),
  ('e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2400000-0000-0000-0000-000000000004','active'),
  ('e2200000-0000-0000-0000-000000000002','e2300000-0000-0000-0000-000000000003','e2400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e2200000-0000-0000-0000-000000000001'::uuid,'e2400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e2100000-0000-0000-0000-000000000001'::uuid),
  ('e2200000-0000-0000-0000-000000000001'::uuid,'e2400000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,null::uuid,'e2100000-0000-0000-0000-000000000001'::uuid),
  ('e2200000-0000-0000-0000-000000000001'::uuid,'e2400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'e2100000-0000-0000-0000-000000000003'::uuid),
  ('e2200000-0000-0000-0000-000000000001'::uuid,'e2400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'e2300000-0000-0000-0000-000000000001'::uuid,'e2100000-0000-0000-0000-000000000001'::uuid),
  ('e2200000-0000-0000-0000-000000000002'::uuid,'e2400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'e2100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e2500000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','CMV-A-1','Patient','A1',date '1990-01-01','e2300000-0000-0000-0000-000000000001'),
  ('e2500000-0000-0000-0000-000000000002','e2200000-0000-0000-0000-000000000001','CMV-A-2','Patient','A2',date '1991-02-02','e2300000-0000-0000-0000-000000000001'),
  ('e2500000-0000-0000-0000-000000000004','e2200000-0000-0000-0000-000000000001','CMV-A-4','Patient','A4',date '1993-04-04','e2300000-0000-0000-0000-000000000001'),
  ('e2500000-0000-0000-0000-000000000005','e2200000-0000-0000-0000-000000000001','CMV-A-5','Patient','A5',date '1994-05-05','e2300000-0000-0000-0000-000000000001'),
  ('e2500000-0000-0000-0000-000000000003','e2200000-0000-0000-0000-000000000002','CMV-B-1','Patient','B1',date '1992-03-03',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('e2600000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('e2600000-0000-0000-0000-000000000002','e2200000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000002','Dentist','A2','REGULAR','active'),
  ('e2600000-0000-0000-0000-000000000003','e2200000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000005','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e2200000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001',true),
  ('e2200000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000002','e2300000-0000-0000-0000-000000000001',true),
  ('e2200000-0000-0000-0000-000000000002','e2600000-0000-0000-0000-000000000003','e2300000-0000-0000-0000-000000000003',true);

-- Patient A1 carries this actor's managed OPEN visit for today plus a second
-- provider's managed OPEN visit for the same patient and day. The projection
-- must return only the acting provider's own visit.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by, clinical_date, managed_visit) values
  ('e2b00000-0000-0000-0000-000000000001','e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000001','OPEN','e2100000-0000-0000-0000-000000000001',(timezone('Asia/Manila', statement_timestamp()))::date,true),
  ('e2b00000-0000-0000-0000-000000000002','e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001','e2600000-0000-0000-0000-000000000002','OPEN','e2100000-0000-0000-0000-000000000002',(timezone('Asia/Manila', statement_timestamp()))::date,true);

-- Patient A2 carries ONLY a pre-workspace unmanaged OPEN encounter created
-- today. It is exactly the row the created_at approximation used to surface as
-- the current visit, and it must never be returned by this projection.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by) values
  ('e2b00000-0000-0000-0000-000000000003','e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002','e2600000-0000-0000-0000-000000000001','OPEN','e2100000-0000-0000-0000-000000000001');

-- Patient A4 carries a managed FINALIZED visit for today.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by, clinical_date, managed_visit, finalized_at) values
  ('e2b00000-0000-0000-0000-000000000004','e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000004','e2600000-0000-0000-0000-000000000001','FINALIZED','e2100000-0000-0000-0000-000000000001',(timezone('Asia/Manila', statement_timestamp()))::date,true,statement_timestamp());

-- Patient A5 carries a managed OPEN visit dated yesterday. Date scoping means
-- today's projection must report no current visit for that patient.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by, clinical_date, managed_visit) values
  ('e2b00000-0000-0000-0000-000000000005','e2200000-0000-0000-0000-000000000001','e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000005','e2600000-0000-0000-0000-000000000001','OPEN','e2100000-0000-0000-0000-000000000001',(timezone('Asia/Manila', statement_timestamp()))::date - 1,true);

create temp table cmv_reads (
  seq integer primary key,
  encounter_id uuid,
  status text,
  clinical_date date,
  provider_display text,
  version integer
);
create temp table cmv_counts (seq integer primary key, rows integer);
grant select, insert on cmv_reads to authenticated;
grant select, insert on cmv_counts to authenticated;

-- Browser boundary.
select extensions.ok(
  has_function_privilege('authenticated','public.get_current_managed_visit(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.get_current_managed_visit(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.get_current_managed_visit(uuid,uuid)','execute')
  and not has_function_privilege('public','public.get_current_managed_visit(uuid,uuid)','execute'),
  'only authenticated may execute the current managed visit projection'
);
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.get_current_managed_visit(uuid,uuid)'::regprocedure),
  'the projection is SECURITY DEFINER with an empty search path'
);

-- Read-only: the projection writes nothing, not even an audit event.
select extensions.ok(
  (select prosrc !~* 'insert into'
      and prosrc !~* 'update public\.'
      and prosrc !~* 'delete from'
      and prosrc !~* 'audit_events'
   from pg_proc where oid = 'public.get_current_managed_visit(uuid,uuid)'::regprocedure),
  'the projection body contains no insert, update, delete, or audit write'
);
select extensions.is(
  (select count(*)::integer
   from pg_proc as proc
   join pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.prosrc ~* 'insert into public\.clinical_encounters'
     and has_function_privilege('authenticated', proc.oid, 'execute')),
  1,
  'the projection does not add a second browser-callable encounter creation path'
);

insert into cmv_counts (seq, rows)
select 1, count(*)::integer from public.clinical_encounters where organization_id = 'e2200000-0000-0000-0000-000000000001';

-- Positive read: the acting dentist sees their own current managed visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
insert into cmv_reads (seq, encounter_id, status, clinical_date, provider_display, version)
select 1, visit.encounter_id, visit.status, visit.clinical_date, visit.provider_display, visit.version
from public.get_current_managed_visit(
  'e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001'
) as visit;
reset role;
select extensions.is(
  (select count(*)::integer from cmv_reads where seq = 1),
  1,
  'the acting dentist reads exactly one current managed visit row'
);
select extensions.ok(
  (select encounter_id = 'e2b00000-0000-0000-0000-000000000001'
     and status = 'OPEN'
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date
     and provider_display = 'Dentist A1'
     and version = 1
   from cmv_reads where seq = 1),
  'the projection returns the acting provider own managed OPEN visit with the Philippine clinical date'
);
select extensions.ok(
  (select encounter_id <> 'e2b00000-0000-0000-0000-000000000002' from cmv_reads where seq = 1),
  'another provider managed visit for the same patient and day is never returned as this actor visit'
);

-- The second dentist reads their own visit, not the first dentist's.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000002',true);
insert into cmv_reads (seq, encounter_id, status, clinical_date, provider_display, version)
select 2, visit.encounter_id, visit.status, visit.clinical_date, visit.provider_display, visit.version
from public.get_current_managed_visit(
  'e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001'
) as visit;
reset role;
select extensions.ok(
  (select encounter_id = 'e2b00000-0000-0000-0000-000000000002' and provider_display = 'Dentist A2'
   from cmv_reads where seq = 2),
  'each dentist reads their own managed visit for the same patient and day'
);

-- A legacy unmanaged OPEN encounter created today is not a managed visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
insert into cmv_counts (seq, rows)
select 2, count(*)::integer from public.get_current_managed_visit(
  'e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000002'
);
reset role;
select extensions.is(
  (select rows from cmv_counts where seq = 2),
  0,
  'a pre-workspace unmanaged OPEN encounter created today is never returned as the current managed visit'
);
select extensions.ok(
  (select managed_visit = false and clinical_date is null and status = 'OPEN'
   from public.clinical_encounters where id = 'e2b00000-0000-0000-0000-000000000003'),
  'the legacy encounter stays readable and unmodified through the existing list path'
);

-- A finalized managed visit reports FINALIZED rather than being hidden.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
insert into cmv_reads (seq, encounter_id, status, clinical_date, provider_display, version)
select 3, visit.encounter_id, visit.status, visit.clinical_date, visit.provider_display, visit.version
from public.get_current_managed_visit(
  'e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000004'
) as visit;
reset role;
select extensions.ok(
  (select encounter_id = 'e2b00000-0000-0000-0000-000000000004' and status = 'FINALIZED'
   from cmv_reads where seq = 3),
  'a finalized managed visit is reported as FINALIZED, not hidden and not reopened'
);
select extensions.ok(
  (select status = 'FINALIZED' and finalized_at is not null
   from public.clinical_encounters where id = 'e2b00000-0000-0000-0000-000000000004'),
  'reading a finalized visit does not reopen it'
);

-- Date scoping: yesterday's managed visit is not today's current visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
insert into cmv_counts (seq, rows)
select 3, count(*)::integer from public.get_current_managed_visit(
  'e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000005'
);
reset role;
select extensions.is(
  (select rows from cmv_counts where seq = 3),
  0,
  'a managed visit dated yesterday is not returned as today current visit'
);

-- Negative authorization.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','a receptionist may not read the current managed visit'
);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','an owner with no active provider link is denied exactly as the write lifecycle denies them'
);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000002','e2500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','a dentist whose provider is not active at the requested branch is denied'
);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000003')$$,
  '42501','not authorized','a cross-tenant patient identifier is denied'
);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000001',null)$$,
  '22023','invalid input','a missing patient identifier is rejected'
);
select set_config('request.jwt.claim.sub','e2100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok(
  $$select * from public.get_current_managed_visit('e2300000-0000-0000-0000-000000000001','e2500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','a foreign-tenant dentist may not read a visit at another organization branch'
);
reset role;

-- Reading changed nothing.
select extensions.is(
  (select count(*)::integer from public.clinical_encounters where organization_id = 'e2200000-0000-0000-0000-000000000001'),
  (select rows from cmv_counts where seq = 1),
  'every projection read left the encounter set unchanged'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where organization_id = 'e2200000-0000-0000-0000-000000000001'),
  0,
  'the projection wrote no audit event'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
