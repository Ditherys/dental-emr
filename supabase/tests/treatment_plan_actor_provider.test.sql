-- Unified Clinical Chart workspace, task 8.
--
-- Treatment planning folded into the chart. Two guarantees are proved here:
--
--   1. Plan authorship derives the treating provider from the signed-in actor.
--      public.add_treatment_plan_discussion_v2 accepts no provider parameter at
--      all, and the superseded five-argument v1 signature that did is no longer
--      reachable from any browser role. An OWNER who also holds an active
--      provider link and Provider A are proved to be separate identities.
--   2. A plan-linked completion is bound to the managed clinical visit. Before
--      this task public.complete_treatment_case created its clinical entry with
--      encounter_id null, so a plan-linked treatment carried no encounter and
--      therefore no visit attribution at all.
--
-- Everything is synthetic and rolled back.

begin;

select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('c8100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@tpap.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('c8100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-treating@tpap.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('c8100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain@tpap.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('c8100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception@tpap.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('c8100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@tpap.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('c8200000-0000-0000-0000-000000000001','TPAP Synthetic A Inc.','TPAP A','tpap-a'),
  ('c8200000-0000-0000-0000-000000000002','TPAP Synthetic B Inc.','TPAP B','tpap-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('c8300000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','TPAP A Main','tpap-a-main','TPAP-A','1 Synthetic St','Test City','Test Province'),
  ('c8300000-0000-0000-0000-000000000002','c8200000-0000-0000-0000-000000000002','TPAP B Main','tpap-b-main','TPAP-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('c8400000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('c8400000-0000-0000-0000-000000000002','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('c8400000-0000-0000-0000-000000000003','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('c8400000-0000-0000-0000-000000000004','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('c8400000-0000-0000-0000-000000000005','c8200000-0000-0000-0000-000000000002','c8100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('c8200000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000001','active'),
  ('c8200000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000002','active'),
  ('c8200000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000003','active'),
  ('c8200000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000004','active'),
  ('c8200000-0000-0000-0000-000000000002','c8300000-0000-0000-0000-000000000002','c8400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('c8200000-0000-0000-0000-000000000001'::uuid,'c8400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'c8100000-0000-0000-0000-000000000001'::uuid),
  ('c8200000-0000-0000-0000-000000000001'::uuid,'c8400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'c8100000-0000-0000-0000-000000000002'::uuid),
  ('c8200000-0000-0000-0000-000000000001'::uuid,'c8400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'c8100000-0000-0000-0000-000000000003'::uuid),
  ('c8200000-0000-0000-0000-000000000001'::uuid,'c8400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'c8300000-0000-0000-0000-000000000001'::uuid,'c8100000-0000-0000-0000-000000000001'::uuid),
  ('c8200000-0000-0000-0000-000000000002'::uuid,'c8400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'c8100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('c8600000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','Provider','A','REGULAR','active'),
  ('c8600000-0000-0000-0000-000000000002','c8200000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000002','Owner','Dentist','REGULAR','active'),
  ('c8600000-0000-0000-0000-000000000003','c8200000-0000-0000-0000-000000000002','c8100000-0000-0000-0000-000000000005','Provider','B','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('c8200000-0000-0000-0000-000000000001','c8600000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001',true),
  ('c8200000-0000-0000-0000-000000000001','c8600000-0000-0000-0000-000000000002','c8300000-0000-0000-0000-000000000001',true),
  ('c8200000-0000-0000-0000-000000000002','c8600000-0000-0000-0000-000000000003','c8300000-0000-0000-0000-000000000002',true);
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('c8500000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','TPAP-A-1','Patient','A1',date '1990-01-01','c8300000-0000-0000-0000-000000000001'),
  ('c8500000-0000-0000-0000-000000000002','c8200000-0000-0000-0000-000000000002','TPAP-B-1','Patient','B1',date '1991-02-02','c8300000-0000-0000-0000-000000000002');
insert into public.procedures (id, organization_id, code, name, status) values
  ('c8700000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','TPAP_RCT','Synthetic root canal','active');

-- A DRAFT plan the chart authors into, an ACKNOWLEDGED plan that must stay
-- immutable and still accept an appended discussion, and a foreign-tenant plan.
insert into public.treatment_plans (id, organization_id, patient_id, title, status, version, created_by) values
  ('c8800000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8500000-0000-0000-0000-000000000001','Synthetic draft proposal','DRAFT',1,'c8100000-0000-0000-0000-000000000001'),
  ('c8800000-0000-0000-0000-000000000002','c8200000-0000-0000-0000-000000000001','c8500000-0000-0000-0000-000000000001','Synthetic acknowledged proposal','DRAFT',1,'c8100000-0000-0000-0000-000000000001'),
  ('c8800000-0000-0000-0000-000000000003','c8200000-0000-0000-0000-000000000002','c8500000-0000-0000-0000-000000000002','Foreign tenant proposal','DRAFT',1,'c8100000-0000-0000-0000-000000000005');
insert into public.treatment_plan_items (id, organization_id, plan_id, line_no, procedure_id, tooth_code, description, estimated_fee_centavos) values
  ('c8900000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000002',1,'c8700000-0000-0000-0000-000000000001','26','Frozen root canal proposal',125000);
update public.treatment_plan_item_materialization_contracts
set materialization_kind = 'CLINICAL',
    design_snapshot = '{"tooth_code":"26","clinical_code":"ROOT_CANAL"}'::jsonb
where organization_id = 'c8200000-0000-0000-0000-000000000001'
  and item_id = 'c8900000-0000-0000-0000-000000000001';
update public.treatment_plans set status = 'ACKNOWLEDGED', version = 2 where id = 'c8800000-0000-0000-0000-000000000002';
insert into public.procedure_cases (id, organization_id, patient_id, origin_branch_id, procedure_id, treatment_plan_item_id, opened_by, status, version) values
  ('c8a00000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8500000-0000-0000-0000-000000000001','c8300000-0000-0000-0000-000000000001','c8700000-0000-0000-0000-000000000001','c8900000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','OPEN',1);

create temp table tpap_counts (seq integer primary key, rows integer);
grant select, insert on tpap_counts to authenticated;
insert into tpap_counts (seq, rows) select 1, count(*)::integer from public.tooth_clinical_entries where organization_id = 'c8200000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Boundary shape
-- ---------------------------------------------------------------------------

select extensions.ok(
  has_function_privilege('authenticated','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and not has_function_privilege('public','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute'),
  'only authenticated may execute the provider-free plan discussion boundary'
);
select extensions.ok(
  not has_function_privilege('authenticated','public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)','execute')
  and not has_function_privilege('public','public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)','execute'),
  'the superseded provider-accepting discussion signature is reachable from no role'
);
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)'::regprocedure),
  'the plan discussion boundary is SECURITY DEFINER with an empty search path'
);
select extensions.ok(
  (select prosrc ~ 'require_active_actor_provider'
   from pg_proc where oid = 'public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)'::regprocedure),
  'the plan discussion boundary derives the treating provider from the signed-in actor'
);
select extensions.is(
  (select pg_catalog.count(*)::integer
   from pg_catalog.unnest(
     (select proargnames from pg_proc where oid = 'public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)'::regprocedure)
   ) as argument
   where argument like '%provider%'),
  0,
  'the plan discussion boundary accepts no provider argument of any kind'
);

-- ---------------------------------------------------------------------------
-- Provider derivation: Provider A and an OWNER who also treats are distinct
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000001',true);
select public.add_treatment_plan_discussion_v2(
  'c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001',
  'Provider A discussed the proposal', null
);
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000002',true);
select public.add_treatment_plan_discussion_v2(
  'c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001',
  'The owner discussed the proposal', 'Owner treats under an active provider link.'
);
reset role;

select extensions.is(
  (select treating_provider_id from public.treatment_plan_discussions
   where context = 'Provider A discussed the proposal'),
  'c8600000-0000-0000-0000-000000000001'::uuid,
  'a discussion recorded by the dentist is attributed to that dentist provider'
);
select extensions.is(
  (select treating_provider_id from public.treatment_plan_discussions
   where context = 'The owner discussed the proposal'),
  'c8600000-0000-0000-0000-000000000002'::uuid,
  'an owner who treats is a separate provider identity from Provider A'
);
select extensions.is(
  (select discussed_by from public.treatment_plan_discussions
   where context = 'The owner discussed the proposal'),
  'c8100000-0000-0000-0000-000000000002'::uuid,
  'the discussion records the signed-in user who wrote it'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'c8200000-0000-0000-0000-000000000001'
     and action = 'treatment.plan.discussion_added'),
  2,
  'each provider-free discussion appends exactly one audit event'
);

-- ---------------------------------------------------------------------------
-- Negative authorization
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001','Owner with no provider link',null)$$,
  '42501','not authorized',
  'an owner with no active provider link at the acting branch may not author plan discussion'
);
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001','Receptionist attempt',null)$$,
  '42501','not authorized',
  'a receptionist may not author a treatment plan discussion'
);
select extensions.throws_ok(
  $$select public.create_treatment_plan('c8300000-0000-0000-0000-000000000001','c8500000-0000-0000-0000-000000000001','Receptionist plan')$$,
  '42501','not authorized',
  'a receptionist may not create a treatment plan'
);
select extensions.throws_ok(
  $$select * from public.complete_treatment_case('c8300000-0000-0000-0000-000000000001','c8a00000-0000-0000-0000-000000000001','c8900000-0000-0000-0000-000000000001',1,array[]::uuid[],125000,'{"code":"ROOT_CANAL","state":"endo-filling"}'::jsonb,'tpap-reception')$$,
  '42501','not authorized',
  'a receptionist may not execute a plan item'
);
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001','Foreign tenant attempt',null)$$,
  '42501','not authorized',
  'a foreign-tenant dentist may not author a discussion at another organization branch'
);
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000003','Cross tenant plan',null)$$,
  '42501','not authorized',
  'a plan belonging to another organization is not reachable'
);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001','   ',null)$$,
  '22023','invalid input',
  'an empty discussion context is refused'
);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001',repeat('c',201),null)$$,
  '22023','invalid input',
  'an over-long discussion context is refused'
);
select extensions.throws_ok(
  $$select public.add_treatment_plan_discussion_v2('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001','Context',repeat('n',4001))$$,
  '22023','invalid input',
  'over-long discussion notes are refused'
);
reset role;

-- ---------------------------------------------------------------------------
-- Versioning, acknowledgement and immutability
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.update_treatment_plan('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000002',2,'Renamed after acknowledgement')$$,
  'P0001','invalid state',
  'an acknowledged plan cannot be retitled'
);
select extensions.throws_ok(
  $$select * from public.add_treatment_plan_item_centavos('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000002',2,null,'27','Added after acknowledgement',1000)$$,
  'P0001','invalid state',
  'an acknowledged plan cannot gain another item'
);
select extensions.throws_ok(
  $$select * from public.present_treatment_plan('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000002',2)$$,
  'P0001','invalid state',
  'an acknowledged plan cannot be re-presented'
);
select extensions.throws_ok(
  $$select * from public.add_treatment_plan_item_centavos('c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001',99,null,'27','Stale version',1000)$$,
  'P0001','stale version',
  'a plan item write carrying a stale version is refused'
);
-- A discussion stays append-only on any status, including an acknowledged plan.
select public.add_treatment_plan_discussion_v2(
  'c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000002',
  'Discussed after acknowledgement', null
);
reset role;
select extensions.is(
  (select count(*)::integer from public.treatment_plan_discussions where plan_id = 'c8800000-0000-0000-0000-000000000002'),
  1,
  'an acknowledged plan still accepts an appended discussion'
);
select extensions.throws_ok(
  $$update public.treatment_plans set title = 'Rewritten' where id = 'c8800000-0000-0000-0000-000000000002'$$,
  '23514',
  'presented/acknowledged treatment plans are immutable; create a new version',
  'the immutable trigger refuses a direct update of an acknowledged plan'
);

-- Authoring a plan item changes no canonical clinical record.
set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000001',true);
select * from public.add_treatment_plan_item_centavos(
  'c8300000-0000-0000-0000-000000000001','c8800000-0000-0000-0000-000000000001',1,
  'c8700000-0000-0000-0000-000000000001','27','Planned root canal on 27',150000,
  'HIGH',2,array['O']::text[],'Discussed with the patient.'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where organization_id = 'c8200000-0000-0000-0000-000000000001'),
  (select rows from tpap_counts where seq = 1),
  'authoring a planned treatment creates no canonical clinical entry before execution'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters where organization_id = 'c8200000-0000-0000-0000-000000000001'),
  0,
  'authoring a planned treatment opens no clinical visit'
);
select extensions.is(
  (select tooth_code || '/' || priority || '/' || sequence_no::text || '/' || array_to_string(surfaces,',') || '/' || coalesce(notes,'')
   from public.treatment_plan_items where plan_id = 'c8800000-0000-0000-0000-000000000001'),
  '27/HIGH/2/O/Discussed with the patient.',
  'the plan item keeps its tooth, priority, sequence, surfaces and notes exactly'
);

-- ---------------------------------------------------------------------------
-- Execution binds the plan-linked clinical entry to the managed visit
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','c8100000-0000-0000-0000-000000000001',true);
select public.transition_treatment_plan_item_execution('c8300000-0000-0000-0000-000000000001','c8900000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'tpap-accept');
select public.transition_treatment_plan_item_execution('c8300000-0000-0000-0000-000000000001','c8900000-0000-0000-0000-000000000001',2,'IN_PROGRESS',null,'tpap-start');
select * from public.complete_treatment_case(
  'c8300000-0000-0000-0000-000000000001','c8a00000-0000-0000-0000-000000000001',
  'c8900000-0000-0000-0000-000000000001',1,array[]::uuid[],125000,
  '{"code":"ROOT_CANAL","state":"endo-filling"}'::jsonb,'tpap-complete'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'c8200000-0000-0000-0000-000000000001'
     and patient_id = 'c8500000-0000-0000-0000-000000000001'
     and treating_provider_id = 'c8600000-0000-0000-0000-000000000001'
     and managed_visit
     and status = 'OPEN'
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date),
  1,
  'a plan-linked completion opens exactly one managed clinical visit'
);
select extensions.is(
  (select entry.encounter_id from public.tooth_clinical_entries as entry
   where entry.treatment_plan_item_id = 'c8900000-0000-0000-0000-000000000001'),
  (select encounter.id from public.clinical_encounters as encounter
   where encounter.organization_id = 'c8200000-0000-0000-0000-000000000001'
     and encounter.patient_id = 'c8500000-0000-0000-0000-000000000001'
     and encounter.managed_visit
     and encounter.status = 'OPEN'),
  'the plan-linked clinical entry is bound to the managed visit encounter'
);
select extensions.is(
  (select entry.treating_provider_id from public.tooth_clinical_entries as entry
   where entry.treatment_plan_item_id = 'c8900000-0000-0000-0000-000000000001'),
  'c8600000-0000-0000-0000-000000000001'::uuid,
  'the plan-linked clinical entry carries the derived treating provider'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id = 'c8200000-0000-0000-0000-000000000001'
     and treatment_plan_item_id is not null
     and encounter_id is null),
  0,
  'no plan-linked clinical entry is left without an encounter'
);
select extensions.is(
  (select status from public.procedure_cases where id = 'c8a00000-0000-0000-0000-000000000001'),
  'COMPLETED',
  'execution closes the procedure case it was linked to'
);
select extensions.is(
  (select current_state from public.treatment_plan_item_executions where item_id = 'c8900000-0000-0000-0000-000000000001'),
  'COMPLETED',
  'execution advances the plan item execution rather than rewriting the plan row'
);
select extensions.is(
  (select status from public.treatment_plans where id = 'c8800000-0000-0000-0000-000000000002'),
  'ACKNOWLEDGED',
  'executing a plan item leaves the acknowledged plan row untouched'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
