-- O8 treatment-plan item execution contract.
-- Covers structure, frozen proposal content, the complete nonterminal state
-- machine, append-only correction, optimistic concurrency/idempotency, and
-- browser denial. Completion-family materialization is covered by the sibling
-- odontogram_rpcs_v2 suite.

begin;
select extensions.no_plan();

select extensions.has_table('public', 'treatment_plan_item_executions', 'execution projection table exists');
select extensions.has_table('public', 'treatment_plan_item_execution_events', 'execution event table exists');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_item_executions'::regclass),'execution projection has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_item_execution_events'::regclass),'execution event log has RLS enabled');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('treatment_plan_item_executions','treatment_plan_item_execution_events')),0,'execution tables expose no browser RLS policies');
select extensions.ok(
  not has_table_privilege('authenticated','public.treatment_plan_item_executions','SELECT')
  and not has_table_privilege('authenticated','public.treatment_plan_item_executions','INSERT')
  and not has_table_privilege('authenticated','public.treatment_plan_item_executions','UPDATE')
  and not has_table_privilege('authenticated','public.treatment_plan_item_executions','DELETE')
  and not has_table_privilege('authenticated','public.treatment_plan_item_execution_events','SELECT')
  and not has_table_privilege('authenticated','public.treatment_plan_item_execution_events','INSERT')
  and not has_table_privilege('authenticated','public.treatment_plan_item_execution_events','UPDATE')
  and not has_table_privilege('authenticated','public.treatment_plan_item_execution_events','DELETE'),
  'authenticated has no direct execution-table privileges'
);
select extensions.ok(exists(select 1 from pg_attribute where attrelid='public.treatment_plan_item_executions'::regclass and attname='current_event_id' and attnotnull),'projection current_event_id is mandatory');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='treatment_execution_events_one_successor_idx' and indexdef ilike '%UNIQUE INDEX%'),'one-successor index serializes event lineage');
select extensions.ok(exists(select 1 from pg_trigger where tgrelid='public.treatment_plan_items'::regclass and tgname='treatment_plan_items_initialize_execution' and not tgisinternal),'item creation initializes its execution atomically');
select extensions.ok(exists(select 1 from pg_trigger where tgrelid='public.treatment_plan_items'::regclass and tgname='treatment_plan_items_protect_frozen_plan' and not tgisinternal),'frozen proposal item mutations are guarded');
select extensions.ok(exists(select 1 from pg_trigger where tgrelid='public.treatment_plan_item_execution_events'::regclass and tgname='treatment_plan_item_execution_events_no_update' and not tgisinternal),'execution history is append-only');
select extensions.ok(exists(select 1 from pg_trigger where tgrelid='public.treatment_plan_item_executions'::regclass and tgname='treatment_execution_projection_agreement' and not tgisinternal),'projection must agree with its current event');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('e8110000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@o8.synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug) values
 ('e8120000-0000-0000-0000-000000000001','O8 Synthetic Inc','O8 Synthetic','o8-synthetic');
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values
 ('e8130000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','O8 Main','o8-main','O8','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values
 ('e8140000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','e8110000-0000-0000-0000-000000000001','active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values
 ('e8120000-0000-0000-0000-000000000001','e8130000-0000-0000-0000-000000000001','e8140000-0000-0000-0000-000000000001','active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by)
select 'e8120000-0000-0000-0000-000000000001','e8140000-0000-0000-0000-000000000001',role.id,'e8110000-0000-0000-0000-000000000001'
from public.roles role where role.organization_id is null and role.code='OWNER';
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values
 ('e8150000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','O8-1','Synthetic','Execution','1990-01-01','e8130000-0000-0000-0000-000000000001');
insert into public.procedures(id,organization_id,code,name,status) values
 ('e8160000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','O8_PROC','Synthetic execution procedure','active');
insert into public.treatment_plans(id,organization_id,patient_id,title,status,version,created_by) values
 ('e8170000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','e8150000-0000-0000-0000-000000000001','Synthetic execution plan','DRAFT',1,'e8110000-0000-0000-0000-000000000001');
insert into public.treatment_plan_items(id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values
 ('e8180000-0000-0000-0000-000000000001','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',1,'e8160000-0000-0000-0000-000000000001','11','Lifecycle',100000),
 ('e8180000-0000-0000-0000-000000000002','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',2,'e8160000-0000-0000-0000-000000000001','12','Cancel proposed',100000),
 ('e8180000-0000-0000-0000-000000000003','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',3,'e8160000-0000-0000-0000-000000000001','13','Illegal skip',100000),
 ('e8180000-0000-0000-0000-000000000004','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',4,'e8160000-0000-0000-0000-000000000001','14','Accepted path',100000),
 ('e8180000-0000-0000-0000-000000000005','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',5,'e8160000-0000-0000-0000-000000000001','15','Cancellation reason',100000),
 ('e8180000-0000-0000-0000-000000000006','e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',6,'e8160000-0000-0000-0000-000000000001','16','Projection mismatch',100000);

select extensions.is((select count(*)::integer from public.treatment_plan_item_executions where organization_id='e8120000-0000-0000-0000-000000000001'),6,'every item receives exactly one PROPOSED projection');
select extensions.ok(not exists(
  select 1 from public.treatment_plan_item_executions e
  join public.treatment_plan_item_execution_events v on v.organization_id=e.organization_id and v.id=e.current_event_id
  where e.organization_id='e8120000-0000-0000-0000-000000000001'
    and (e.current_state<>'PROPOSED' or e.version<>1 or v.from_state is not null or v.to_state<>'PROPOSED'
      or e.item_id<>v.item_id or e.plan_id<>v.plan_id or v.predecessor_event_id is not null)
),'bootstrap projections and root events agree');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e8110000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o8-before-ack')$$,'P0001','invalid state','ACCEPTED is unavailable before ACKNOWLEDGED');
select extensions.throws_ok($$select * from public.treatment_plan_item_executions$$,'42501','permission denied for table treatment_plan_item_executions','authenticated cannot bypass the RPC read boundary');
reset role;

update public.treatment_plans set status='PRESENTED',version=2 where id='e8170000-0000-0000-0000-000000000001';
select extensions.throws_ok($$update public.treatment_plan_items set description='forged edit' where id='e8180000-0000-0000-0000-000000000001'$$,'P0001','treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately','PRESENTED item content cannot be updated');
select extensions.throws_ok($$delete from public.treatment_plan_items where id='e8180000-0000-0000-0000-000000000001'$$,'P0001','treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately','PRESENTED item content cannot be deleted');
select extensions.throws_ok($$insert into public.treatment_plan_items(organization_id,plan_id,line_no,procedure_id,description,estimated_fee_centavos) values('e8120000-0000-0000-0000-000000000001','e8170000-0000-0000-0000-000000000001',7,'e8160000-0000-0000-0000-000000000001','forged insert',1)$$,'P0001','treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately','PRESENTED plan cannot receive a new item');
update public.treatment_plans set status='ACKNOWLEDGED',version=3 where id='e8170000-0000-0000-0000-000000000001';
select extensions.throws_ok($$update public.treatment_plan_items set estimated_fee_centavos=1 where id='e8180000-0000-0000-0000-000000000001'$$,'P0001','treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately','ACKNOWLEDGED frozen estimate cannot be changed');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e8110000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o8-accept-1')),2,'PROPOSED advances to ACCEPTED');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o8-accept-1')),2,'same idempotency key returns the existing transition despite stale supplied version');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',2,'CANCELLED','Synthetic','o8-accept-1')$$,'P0001','idempotency conflict','same idempotency key cannot describe a different transition');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',1,'IN_PROGRESS',null,'o8-stale')$$,'P0001','stale version','distinct stale transition is rejected');
select extensions.is((select version from public.correct_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',2,'PROPOSED','Synthetic correction','o8-correct-accept')),3,'elevated correction appends ACCEPTED to PROPOSED');
select extensions.is((select version from public.correct_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',2,'PROPOSED','Synthetic correction','o8-correct-accept')),3,'correction idempotency returns its existing event');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',3,'IN_PROGRESS',null,'o8-skip')$$,'P0001','invalid state','PROPOSED cannot skip ACCEPTED');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',3,'ACCEPTED',null,'o8-accept-2')),4,'corrected PROPOSED can be accepted again');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',4,'IN_PROGRESS',null,'o8-start-1')),5,'ACCEPTED advances to IN_PROGRESS');
select extensions.is((select version from public.correct_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',5,'ACCEPTED','Synthetic start correction','o8-correct-start')),6,'elevated correction appends IN_PROGRESS to ACCEPTED');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',6,'IN_PROGRESS',null,'o8-start-2')),7,'corrected ACCEPTED can start again');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',7,'CANCELLED','Patient declined synthetic treatment','o8-cancel-terminal')),8,'IN_PROGRESS may terminalize as CANCELLED');
select extensions.throws_ok($$select public.correct_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',8,'ACCEPTED','Forbidden terminal correction','o8-correct-terminal')$$,'P0001','invalid state','CANCELLED cannot be corrected');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000001',8,'CANCELLED','Again','o8-after-terminal')$$,'P0001','invalid state','CANCELLED cannot transition again');
select extensions.is((select execution_state from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000002',1,'CANCELLED','Patient declined synthetic treatment','o8-cancel-proposed')),'CANCELLED','PROPOSED may terminalize as CANCELLED');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000003',1,'IN_PROGRESS',null,'o8-illegal-skip')$$,'P0001','invalid state','PROPOSED to IN_PROGRESS is rejected');
select extensions.is((select execution_state from public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000004',1,'ACCEPTED',null,'o8-accepted')),'ACCEPTED','second path reaches ACCEPTED');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000004',2,'ACCEPTED',null,'o8-repeat-state')$$,'P0001','invalid state','ACCEPTED cannot transition to itself');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e8130000-0000-0000-0000-000000000001','e8180000-0000-0000-0000-000000000005',1,'CANCELLED',null,'o8-no-reason')$$,'22023','invalid input','cancellation requires a bounded nonblank reason');
reset role;

select extensions.ok((select count(*)=8 and count(*) filter(where predecessor_event_id is null)=1 from public.treatment_plan_item_execution_events where organization_id='e8120000-0000-0000-0000-000000000001' and item_id='e8180000-0000-0000-0000-000000000001'),'lifecycle keeps every root, transition, and correction event');
select extensions.ok(not exists(
  select 1 from public.treatment_plan_item_executions e
  join public.treatment_plan_item_execution_events v on v.organization_id=e.organization_id and v.id=e.current_event_id
  where e.organization_id='e8120000-0000-0000-0000-000000000001'
    and (e.current_state<>v.to_state or e.item_id<>v.item_id or e.plan_id<>v.plan_id)
),'all projections agree with their latest linked events');
select extensions.throws_ok($$update public.treatment_plan_item_execution_events set reason='rewritten' where organization_id='e8120000-0000-0000-0000-000000000001' and item_id='e8180000-0000-0000-0000-000000000001'$$,'P0001','treatment_plan_item_execution_events is append-only; UPDATE/DELETE are not allowed','execution events cannot be updated even by a privileged direct writer');
select extensions.throws_ok($$delete from public.treatment_plan_item_execution_events where organization_id='e8120000-0000-0000-0000-000000000001' and item_id='e8180000-0000-0000-0000-000000000001'$$,'P0001','treatment_plan_item_execution_events is append-only; UPDATE/DELETE are not allowed','execution events cannot be deleted even by a privileged direct writer');
select extensions.throws_ok($$update public.treatment_plan_item_executions set current_state='ACCEPTED' where organization_id='e8120000-0000-0000-0000-000000000001' and item_id='e8180000-0000-0000-0000-000000000006'$$,'23514','execution projection/event mismatch','projection cannot disagree with current event');
select extensions.is((select description from public.treatment_plan_items where id='e8180000-0000-0000-0000-000000000001'),'Lifecycle','execution progress never mutates frozen proposal content');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
