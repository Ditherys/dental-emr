begin;

select extensions.no_plan();

-- Synthetic-only Task 1 graph for the managed clinical visit lifecycle.
-- Organization A holds: dentist A (linked active provider at A Main), owner A
-- with their own linked active provider at A Main, owner A2 with no provider
-- link at all, a receptionist, a dentist whose provider is active only at A
-- Branch 2, and a dentist whose linked provider is inactive. Organization B is
-- foreign. Fixture inserts run as postgres; every RPC call runs with
-- set local role authenticated plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-provider-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-other-branch-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1100000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-inactive-a@ucv.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e1200000-0000-0000-0000-000000000001','UCV Synthetic A Inc.','UCV A','ucv-a'),
  ('e1200000-0000-0000-0000-000000000002','UCV Synthetic B Inc.','UCV B','ucv-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e1300000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','UCV A Main','ucv-a-main','UCV-A','1 Synthetic St','Test City','Test Province'),
  ('e1300000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','UCV A Branch 2','ucv-a-2','UCV-A2','2 Synthetic St','Test City','Test Province'),
  ('e1300000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000002','UCV B Main','ucv-b-main','UCV-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e1400000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000004','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000005','e1200000-0000-0000-0000-000000000002','e1100000-0000-0000-0000-000000000005','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000006','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000006','active',statement_timestamp()),
  ('e1400000-0000-0000-0000-000000000007','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000007','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000001','active'),
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000002','active'),
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000003','active'),
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000004','active'),
  ('e1200000-0000-0000-0000-000000000002','e1300000-0000-0000-0000-000000000003','e1400000-0000-0000-0000-000000000005','active'),
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000006','active'),
  ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1400000-0000-0000-0000-000000000007','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e1100000-0000-0000-0000-000000000001'::uuid),
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'e1100000-0000-0000-0000-000000000002'::uuid),
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'e1100000-0000-0000-0000-000000000003'::uuid),
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'e1300000-0000-0000-0000-000000000001'::uuid,'e1100000-0000-0000-0000-000000000001'::uuid),
  ('e1200000-0000-0000-0000-000000000002'::uuid,'e1400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'e1100000-0000-0000-0000-000000000005'::uuid),
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000006'::uuid,'DENTIST'::text,null::uuid,'e1100000-0000-0000-0000-000000000001'::uuid),
  ('e1200000-0000-0000-0000-000000000001'::uuid,'e1400000-0000-0000-0000-000000000007'::uuid,'DENTIST'::text,null::uuid,'e1100000-0000-0000-0000-000000000001'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e1500000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','UCV-A-1','Patient','A1',date '1990-01-01','e1300000-0000-0000-0000-000000000001'),
  ('e1500000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','UCV-A-2','Patient','A2',date '1992-02-02','e1300000-0000-0000-0000-000000000001'),
  ('e1500000-0000-0000-0000-000000000004','e1200000-0000-0000-0000-000000000001','UCV-A-3','Patient','A3',date '1993-03-03','e1300000-0000-0000-0000-000000000001'),
  ('e1500000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000002','UCV-B-1','Patient','B1',date '1991-01-01',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('e1600000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('e1600000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000002','Owner','A2','REGULAR','active'),
  ('e1600000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000006','Dentist','A3','REGULAR','active'),
  ('e1600000-0000-0000-0000-000000000004','e1200000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000007','Dentist','A4','REGULAR','inactive'),
  ('e1600000-0000-0000-0000-000000000005','e1200000-0000-0000-0000-000000000002','e1100000-0000-0000-0000-000000000005','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001',true),
  ('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000002','e1300000-0000-0000-0000-000000000001',true),
  ('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000003','e1300000-0000-0000-0000-000000000002',true),
  ('e1200000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000004','e1300000-0000-0000-0000-000000000001',true),
  ('e1200000-0000-0000-0000-000000000002','e1600000-0000-0000-0000-000000000005','e1300000-0000-0000-0000-000000000003',true);
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, created_by) values
  ('e1700000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','e1100000-0000-0000-0000-000000000001'),
  ('e1700000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000002','2026-01-05 10:00:00+00','2026-01-05 10:30:00+00','SCHEDULED','e1100000-0000-0000-0000-000000000001'),
  ('e1700000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000002','e1300000-0000-0000-0000-000000000003','e1500000-0000-0000-0000-000000000003','2026-01-05 11:00:00+00','2026-01-05 11:30:00+00','SCHEDULED','e1100000-0000-0000-0000-000000000005');
insert into public.payment_methods (id, organization_id, code, name) values
  ('e1a00000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','UCV_CASH','Synthetic cash');
insert into public.procedures (id, organization_id, code, name, status) values
  ('e1800000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','UCV_PROC','Synthetic procedure','active');
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, created_by) values
  ('e1900000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001','e1800000-0000-0000-0000-000000000001',50000,current_date,'ucv-charge-1','e1100000-0000-0000-0000-000000000001');

-- A pre-workspace encounter for the same tenant/branch/patient/provider that the
-- managed lifecycle must never resume, finalize, delete, or rewrite.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by) values
  ('e1b00000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001','OPEN','e1100000-0000-0000-0000-000000000001');

-- A managed OPEN visit for patient A3 dated yesterday. It matches this tenant,
-- branch, patient, and provider on every dimension except the clinical date, so it
-- pins date scoping: today's call must open a new visit rather than resume it.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by, clinical_date, managed_visit) values
  ('e1b00000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000004','e1600000-0000-0000-0000-000000000001','OPEN','e1100000-0000-0000-0000-000000000001',(timezone('Asia/Manila', statement_timestamp()))::date - 1, true);

create temp table ucv_visits (
  seq integer primary key,
  encounter_id uuid,
  clinical_date date,
  status text,
  version integer,
  resumed boolean
);
create temp table ucv_payments (seq integer primary key, payment_id uuid);
grant select, insert on ucv_visits to authenticated;
grant select, insert on ucv_payments to authenticated;

-- Browser boundary: only the managed lifecycle RPC is callable.
select extensions.ok(
  has_function_privilege('authenticated','public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('public','public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)','execute'),
  'only authenticated may execute the managed clinical visit lifecycle RPC'
);
select extensions.ok(
  not has_function_privilege('authenticated','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.create_clinical_encounter(uuid,uuid,uuid,uuid)','execute'),
  'the superseded manual encounter-creation paths are no longer browser-callable'
);
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)'::regprocedure),
  'the lifecycle RPC is SECURITY DEFINER with an empty search path'
);
select extensions.is(
  (select count(*)::integer
   from pg_proc as proc
   join pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.prosrc ~* 'insert into public\.clinical_encounters'
     and has_function_privilege('authenticated', proc.oid, 'execute')),
  1,
  'exactly one browser-callable function may create a clinical encounter'
);

-- Forward-only lifecycle columns, uniqueness, and read index.
select extensions.ok(
  (select data_type = 'date' and is_nullable = 'YES'
   from information_schema.columns
   where table_schema = 'public' and table_name = 'clinical_encounters' and column_name = 'clinical_date')
  and (select data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'
   from information_schema.columns
   where table_schema = 'public' and table_name = 'clinical_encounters' and column_name = 'managed_visit'),
  'clinical_encounters gains a nullable clinical_date and a non-null managed_visit defaulting to false'
);
select extensions.ok(
  (select indexdef ilike '%unique%'
     and indexdef ilike '%organization_id%branch_id%patient_id%treating_provider_id%clinical_date%'
     and indexdef ilike '%where%managed_visit%'
     and indexdef ilike '%status%=%''OPEN''%'
   from pg_indexes
   where schemaname = 'public' and indexname = 'clinical_encounters_managed_open_visit_key'),
  'a partial unique index scopes one managed OPEN visit per tenant, branch, patient, provider, and clinical date'
);
select extensions.ok(
  (select indexdef ilike '%organization_id%patient_id%branch_id%treating_provider_id%clinical_date%'
   from pg_indexes
   where schemaname = 'public' and indexname = 'clinical_encounters_managed_visit_lookup_idx'),
  'a patient/branch/provider/date read index exists'
);
select extensions.throws_ok(
  $$insert into public.clinical_encounters (organization_id, branch_id, patient_id, treating_provider_id, status, managed_visit)
    values ('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1600000-0000-0000-0000-000000000001','OPEN',true)$$,
  '23514',
  'new row for relation "clinical_encounters" violates check constraint "clinical_encounters_managed_visit_date_check"',
  'a managed visit always carries a clinical date'
);
select extensions.ok(
  (select managed_visit = false and clinical_date is null
   from public.clinical_encounters where id = 'e1b00000-0000-0000-0000-000000000001'),
  'the pre-workspace encounter is preserved as an unmanaged row with no clinical date'
);

-- Positive create: the signed-in dentist opens the managed visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 1, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1700000-0000-0000-0000-000000000001',null
) as visit;
reset role;
select extensions.ok(
  (select encounter_id is not null and status = 'OPEN' and version = 1 and resumed = false
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date
   from ucv_visits where seq = 1),
  'the dentist opens a new managed OPEN visit stamped with the Philippine clinical date'
);
select extensions.ok(
  (select encounter.managed_visit
     and encounter.status = 'OPEN'
     and encounter.organization_id = 'e1200000-0000-0000-0000-000000000001'
     and encounter.branch_id = 'e1300000-0000-0000-0000-000000000001'
     and encounter.patient_id = 'e1500000-0000-0000-0000-000000000001'
     and encounter.treating_provider_id = 'e1600000-0000-0000-0000-000000000001'
     and encounter.appointment_id = 'e1700000-0000-0000-0000-000000000001'
     and encounter.created_by = 'e1100000-0000-0000-0000-000000000001'
   from public.clinical_encounters as encounter
   where encounter.id = (select encounter_id from ucv_visits where seq = 1)),
  'the created visit derives tenant, branch, patient, appointment, provider, and actor on the server'
);
select extensions.ok(
  (select encounter_id <> 'e1b00000-0000-0000-0000-000000000001' from ucv_visits where seq = 1),
  'the pre-workspace unmanaged encounter is never resumed'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e1200000-0000-0000-0000-000000000001'
     and action = 'clinical.encounter.opened'
     and patient_id = 'e1500000-0000-0000-0000-000000000001'
     and branch_id = 'e1300000-0000-0000-0000-000000000001'
     and actor_user_id = 'e1100000-0000-0000-0000-000000000001'
     and entity_id = (select encounter_id from ucv_visits where seq = 1)),
  1,
  'the create path writes exactly one attributed clinical.encounter.opened audit event'
);

-- Same-day resume returns the identical visit and audits nothing.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 2, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null
) as visit;
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 3, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1700000-0000-0000-0000-000000000001','e1c00000-0000-0000-0000-000000000001'
) as visit;
reset role;
select extensions.ok(
  (select count(distinct encounter_id) = 1 and bool_and(status = 'OPEN') and bool_and(version = 1)
   from ucv_visits where seq in (1, 2, 3)),
  'repeated same-day calls return the one managed visit regardless of appointment or idempotency key'
);
select extensions.ok(
  (select resumed from ucv_visits where seq = 2) and (select resumed from ucv_visits where seq = 3),
  'a resumed visit reports resumed = true'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e1200000-0000-0000-0000-000000000001'
     and action = 'clinical.encounter.opened'
     and patient_id = 'e1500000-0000-0000-0000-000000000001'),
  1,
  'a resumed visit writes no additional audit event'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e1200000-0000-0000-0000-000000000001' and managed_visit
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date),
  1,
  'three same-day calls produce exactly one managed encounter row'
);

-- A second provider and a second patient each get their own same-day visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000002',true);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 4, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null
) as visit;
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 5, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000002',null,null
) as visit;
reset role;
select extensions.ok(
  (select resumed = false from ucv_visits where seq = 4)
  and (select encounter_id from ucv_visits where seq = 4) <> (select encounter_id from ucv_visits where seq = 1),
  'an owner with their own active provider link opens a separate same-day visit'
);
select extensions.ok(
  (select treating_provider_id = 'e1600000-0000-0000-0000-000000000002'
   from public.clinical_encounters where id = (select encounter_id from ucv_visits where seq = 4)),
  'the owner visit is attributed to the owner own provider, never to another dentist'
);
select extensions.ok(
  (select resumed = false from ucv_visits where seq = 5)
  and (select encounter_id from ucv_visits where seq = 5) <> (select encounter_id from ucv_visits where seq = 1),
  'a different patient gets a different same-day visit'
);

-- Negative authorization: no denied call may create or mutate anything.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','an owner without an active provider link may not open a clinical visit'
);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','a receptionist may not open a clinical visit'
);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000006',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','a dentist whose provider is active only at another branch may not open a visit at this branch'
);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000007',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','a dentist whose linked provider is inactive may not open a visit'
);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','a foreign-tenant dentist may not open a visit at another organization branch'
);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000003','e1500000-0000-0000-0000-000000000001',null,null)$$,
  '42501','not authorized','a cross-tenant patient is denied even from the caller own branch'
);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000003',null,null)$$,
  '42501','not authorized','a foreign patient identifier is denied'
);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001',null,null,null)$$,
  '22023','invalid input','a missing patient identifier is rejected'
);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1700000-0000-0000-0000-000000000003',null)$$,
  '22023','invalid input','a foreign-tenant appointment is rejected'
);
select extensions.throws_ok(
  $$select * from public.start_or_resume_clinical_visit('e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001','e1700000-0000-0000-0000-000000000002',null)$$,
  '22023','invalid input','an appointment belonging to another patient is rejected'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e1200000-0000-0000-0000-000000000001' and managed_visit
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date),
  3,
  'every denied call leaves the managed encounter set unchanged'
);

-- A finalized visit is never reopened; the next call opens a new visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
select extensions.is(
  (select version from public.finalize_clinical_encounter(
     'e1300000-0000-0000-0000-000000000001',(select encounter_id from ucv_visits where seq = 1),1)),
  2,
  'the managed visit finalizes through the existing encounter finalize path'
);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 6, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',null,null
) as visit;
reset role;
select extensions.ok(
  (select resumed = false and status = 'OPEN' and version = 1 from ucv_visits where seq = 6)
  and (select encounter_id from ucv_visits where seq = 6) <> (select encounter_id from ucv_visits where seq = 1),
  'a finalized same-day visit is never reopened; a new managed visit is created instead'
);
select extensions.ok(
  (select status = 'FINALIZED' and finalized_at is not null and version = 2 and managed_visit
   from public.clinical_encounters where id = (select encounter_id from ucv_visits where seq = 1)),
  'the finalized visit is preserved exactly as finalized'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e1200000-0000-0000-0000-000000000001'
     and action = 'clinical.encounter.opened'
     and patient_id = 'e1500000-0000-0000-0000-000000000001'),
  3,
  'only the three create paths for this patient wrote an opened audit event'
);
select extensions.ok(
  (select status = 'OPEN' and version = 1 and managed_visit = false and clinical_date is null
   from public.clinical_encounters where id = 'e1b00000-0000-0000-0000-000000000001'),
  'the pre-workspace encounter is still OPEN, unversioned, and unrewritten'
);

-- A managed OPEN visit from a previous clinical date is never resumed today.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
insert into ucv_visits (seq, encounter_id, clinical_date, status, version, resumed)
select 7, visit.encounter_id, visit.clinical_date, visit.status, visit.version, visit.resumed
from public.start_or_resume_clinical_visit(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000004',null,null
) as visit;
reset role;
select extensions.ok(
  (select resumed = false and status = 'OPEN' and version = 1
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date
   from ucv_visits where seq = 7)
  and (select encounter_id from ucv_visits where seq = 7) <> 'e1b00000-0000-0000-0000-000000000002',
  'a managed OPEN visit dated yesterday is not resumed today; a new visit is opened for the current clinical date'
);
select extensions.ok(
  (select status = 'OPEN' and version = 1 and managed_visit
     and appointment_id is null and finalized_at is null
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date - 1
   from public.clinical_encounters where id = 'e1b00000-0000-0000-0000-000000000002'),
  'the yesterday visit is left OPEN and unmodified'
);

-- Payment recording and allocation never touch the clinical visit lifecycle.
select extensions.ok(
  not exists (
    select 1
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'record_payment', 'record_payment_unlocked', 'allocate_payment',
        'void_payment', 'refund_payment'
      )
      and (
        proc.prosrc ~* 'start_or_resume_clinical_visit'
        or proc.prosrc ~* 'clinical_encounters'
      )
  ),
  'no payment recording or allocation function references the visit lifecycle or the encounter table'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000004',true);
insert into ucv_payments (seq, payment_id)
select 1, payment.payment_id
from public.record_payment(
  'e1300000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',
  'e1a00000-0000-0000-0000-000000000001',25000,null,'ucv-payment-1'
) as payment;
select set_config('request.jwt.claim.sub','e1100000-0000-0000-0000-000000000001',true);
select extensions.ok(
  (select allocation_id is not null from public.allocate_payment(
     'e1300000-0000-0000-0000-000000000001',(select payment_id from ucv_payments where seq = 1),
     'e1900000-0000-0000-0000-000000000001','e1500000-0000-0000-0000-000000000001',25000,'ucv-allocation-1')),
  'a receptionist-recorded payment is allocated by the dentist through the billing boundary'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e1200000-0000-0000-0000-000000000001'),
  7,
  'payment recording and allocation created no clinical encounter'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e1200000-0000-0000-0000-000000000001'
     and action = 'clinical.encounter.opened'),
  5,
  'payment recording and allocation wrote no encounter-opened audit event'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
