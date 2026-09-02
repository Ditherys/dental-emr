-- Task 14 round 2: the success path public.record_procedure_followup never had.
--
-- The boundary's existing coverage asserts grants and the anonymous denial and
-- nothing else, so an unqualified `version` reference against
-- public.procedure_cases — ambiguous with the function's own RETURNS TABLE OUT
-- parameter — survived unnoticed and made every authorized follow-up raise
-- 42702 at runtime. A denial-only suite proves a boundary is shut, never that
-- it works. This suite records a follow-up, replays it, and pins the version
-- the case and the caller both end up with.
--
-- Self-contained synthetic tenant; every row is rolled back.
begin;
select extensions.no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('fb100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','followup-owner@synthetic.test','',now(),'{}','{}',now(),now()),
 ('fb100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','followup-nonprovider@synthetic.test','',now(),'{}','{}',now(),now());
insert into public.organizations(id,legal_name,business_name,slug) values ('fb200000-0000-0000-0000-000000000001','Follow-up Synthetic Inc','Follow-up Synthetic','followup-synthetic');
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values
 ('fb300000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','Follow-up Main','followup-main','FU1','1 Synthetic','Test','Test'),
 ('fb300000-0000-0000-0000-000000000002','fb200000-0000-0000-0000-000000000001','Follow-up Second','followup-second','FU2','2 Synthetic','Test','Test');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values
 ('fb400000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','active',now()),
 ('fb400000-0000-0000-0000-000000000002','fb200000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000002','active',now());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values
 ('fb200000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000001','fb400000-0000-0000-0000-000000000001','active'),
 ('fb200000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000002','fb400000-0000-0000-0000-000000000001','active'),
 ('fb200000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000001','fb400000-0000-0000-0000-000000000002','active');
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select 'fb200000-0000-0000-0000-000000000001','fb400000-0000-0000-0000-000000000001',id,null,'fb100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='OWNER';
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select 'fb200000-0000-0000-0000-000000000001','fb400000-0000-0000-0000-000000000002',id,null,'fb100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='OWNER';

-- The provider link exists only at Follow-up Main, so acting at Follow-up
-- Second must fail on private.require_active_actor_provider even though the
-- OWNER role reaches both branches. Owner status is not treatment authority.
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values ('fb600000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','Synthetic','Dentist','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values ('fb200000-0000-0000-0000-000000000001','fb600000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000001',true);

insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values ('fb500000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','FU-001','Synthetic','Patient','1990-01-01','fb300000-0000-0000-0000-000000000001');
insert into public.procedures(id,organization_id,code,name,status) values ('fb700000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','FU_PROC','Synthetic procedure','active');
insert into public.procedure_cases(id,organization_id,patient_id,origin_branch_id,procedure_id,treatment_plan_item_id,opened_by,status,version) values
 ('fba00000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','fb500000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000001','fb700000-0000-0000-0000-000000000001',null,'fb100000-0000-0000-0000-000000000001','OPEN',1),
 ('fba00000-0000-0000-0000-000000000002','fb200000-0000-0000-0000-000000000001','fb500000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000001','fb700000-0000-0000-0000-000000000001',null,'fb100000-0000-0000-0000-000000000001','COMPLETED',1);

create temp table followup_result(seq integer primary key, event_id uuid, version integer);
grant select, insert on followup_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- The success path
-- ---------------------------------------------------------------------------

insert into followup_result(seq,event_id,version)
select 1, event_id, version from public.record_procedure_followup(
  'fb300000-0000-0000-0000-000000000001','fba00000-0000-0000-0000-000000000001',
  'Synthetic follow-up note', timestamptz '2026-09-01 02:00:00+00', 'fu-first');

select extensions.ok(
  (select event_id is not null from followup_result where seq=1),
  'an authorized dentist records a procedure follow-up'
);

select extensions.is(
  (select version from followup_result where seq=1),
  2,
  'the follow-up returns the case version it advanced to'
);

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.procedure_case_events
   where procedure_case_id='fba00000-0000-0000-0000-000000000001' and event_type='FOLLOW_UP'),
  1,
  'exactly one follow-up event is recorded'
);

select extensions.is(
  (select recorded_by from public.procedure_case_events where id=(select event_id from followup_result where seq=1)),
  'fb100000-0000-0000-0000-000000000001'::uuid,
  'the follow-up is attributed to the signed-in actor'
);

select extensions.is(
  (select version from public.procedure_cases where id='fba00000-0000-0000-0000-000000000001'),
  2,
  'the stored case version agrees with the version the caller was told'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where action='procedure.case.follow_up.recorded'
     and entity_id=(select event_id from followup_result where seq=1)),
  1,
  'the follow-up is audited'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- Replay is idempotent and does not advance the case a second time
-- ---------------------------------------------------------------------------

insert into followup_result(seq,event_id,version)
select 2, event_id, version from public.record_procedure_followup(
  'fb300000-0000-0000-0000-000000000001','fba00000-0000-0000-0000-000000000001',
  'Synthetic follow-up note', timestamptz '2026-09-01 02:00:00+00', 'fu-first');

select extensions.is(
  (select event_id from followup_result where seq=2),
  (select event_id from followup_result where seq=1),
  'a replayed follow-up returns the original event rather than recording a second'
);
select extensions.is(
  (select version from followup_result where seq=2),
  2,
  'a replayed follow-up reports the same case version, not a further bump'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.procedure_case_events
   where procedure_case_id='fba00000-0000-0000-0000-000000000001' and event_type='FOLLOW_UP'),
  1,
  'a replayed follow-up records no second event'
);
select extensions.is(
  (select version from public.procedure_cases where id='fba00000-0000-0000-0000-000000000001'),
  2,
  'a replayed follow-up does not advance the stored case version again'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- The guards this repair must not have loosened
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.record_procedure_followup('fb300000-0000-0000-0000-000000000001','fba00000-0000-0000-0000-000000000002','Closed case',null,'fu-closed')$$,
  'P0001','invalid state','a follow-up cannot be recorded against a case that is not open'
);

select extensions.throws_ok(
  $$select public.record_procedure_followup('fb300000-0000-0000-0000-000000000002','fba00000-0000-0000-0000-000000000001','Foreign branch',null,'fu-other-branch')$$,
  '42501','not authorized','an owner without an active provider link at the acting branch cannot record a follow-up'
);

select set_config('request.jwt.claim.sub','fb100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok(
  $$select public.record_procedure_followup('fb300000-0000-0000-0000-000000000001','fba00000-0000-0000-0000-000000000001','Not a provider',null,'fu-nonprovider')$$,
  '42501','not authorized','an actor who is not a provider here cannot record a follow-up'
);

reset role;

with test_failures as (select finish from extensions.finish() where finish not like '1..%')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\\n') end as p1_test_result from test_failures;
rollback;
