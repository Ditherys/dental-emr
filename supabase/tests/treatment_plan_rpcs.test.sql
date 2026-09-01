begin;

select extensions.no_plan();

-- Synthetic-only P16-02 graph, GUC-as-postgres. Owner/dentist A is the positive
-- writer; dental assistant A reads only; reception A has no clinical
-- permission; dentist B is foreign. Fixture inserts run as the owner; every
-- RPC call runs with set local role authenticated plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1602.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@p1602.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1602.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1602.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7200000-0000-0000-0000-000000000001','P1602 Synthetic A Inc.','P1602 A','p1602-a'),
  ('b7200000-0000-0000-0000-000000000002','P1602 Synthetic B Inc.','P1602 B','p1602-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1602 A Main','p1602-a-main','P1602-A','1 Synthetic St','Test City','Test Province'),
  ('b7300000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000002','P1602 B Main','p1602-b-main','P1602-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b7400000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000005','b7200000-0000-0000-0000-000000000002','b7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000001','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000002','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000003','active'),
  ('b7200000-0000-0000-0000-000000000002','b7300000-0000-0000-0000-000000000003','b7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'b7300000-0000-0000-0000-000000000001'::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000002'::uuid,'b7400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7500000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1602-A-1','Patient','A',date '1990-01-01','b7300000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','P1602-B-1','Patient','B',date '1991-01-01',null);
-- Plan authorship derives the treating provider from the signed-in actor, so
-- dentist A1 now carries an active provider link at P1602 A Main. Dentist B1
-- stays foreign and unlinked.
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('c9200000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('c9200000-0000-0000-0000-000000000004','b7200000-0000-0000-0000-000000000002',null,'Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b7200000-0000-0000-0000-000000000001','c9200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001',true);
insert into public.procedures (id, organization_id, code, name, status) values
  ('c9300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','PROC_A1','Synthetic Procedure A1','active'),
  ('c9300000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','PROC_B1','Synthetic Procedure B1','active');

create temp table p1602_plans (seq integer primary key, id uuid);
create temp table p1602_items (seq integer primary key, id uuid);
create temp table p1602_alternatives (seq integer primary key, id uuid);
grant select on p1602_plans to authenticated;
grant select on p1602_items to authenticated;
grant select on p1602_alternatives to authenticated;

select extensions.ok(
  has_function_privilege('authenticated','public.create_treatment_plan(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.update_treatment_plan(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.present_treatment_plan(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.acknowledge_treatment_plan(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)','execute')
  and has_function_privilege('authenticated','public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)','execute')
  and has_function_privilege('authenticated','public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and has_function_privilege('authenticated','public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and has_function_privilege('authenticated','public.remove_treatment_plan_item(uuid,uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.add_treatment_plan_alternative(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)','execute')
  and has_function_privilege('authenticated','public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.list_treatment_plans(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.get_treatment_plan_detail(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.create_treatment_plan(uuid,uuid,text)','execute')
  and not has_function_privilege('anon','public.list_treatment_plans(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.get_treatment_plan_detail(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.create_treatment_plan(uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.list_treatment_plans(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.get_treatment_plan_detail(uuid,uuid)','execute'),
  'only authenticated has the treatment-plan RPC grants, including both centavo application writers'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_treatment_plan(uuid,uuid,text)'::regprocedure,'public.update_treatment_plan(uuid,uuid,integer,text)'::regprocedure,'public.present_treatment_plan(uuid,uuid,integer)'::regprocedure,'public.acknowledge_treatment_plan(uuid,uuid,integer)'::regprocedure,'public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)'::regprocedure,'public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)'::regprocedure,'public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)'::regprocedure,'public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)'::regprocedure,'public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'::regprocedure,'public.add_treatment_plan_alternative(uuid,uuid,integer,text)'::regprocedure,'public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)'::regprocedure,'public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)'::regprocedure,'public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)'::regprocedure,'public.list_treatment_plans(uuid,uuid)'::regprocedure,'public.get_treatment_plan_detail(uuid,uuid)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),15,'the treatment-plan definers, including both centavo application writers, pin an empty search path');
select extensions.ok(not exists (
  select 1
  from pg_proc as proc
  join pg_namespace as namespace on namespace.oid = proc.pronamespace
  where namespace.nspname in ('public', 'private')
    and proc.prosrc ~ 'item\.estimated_fee([^_]|$)|description,[[:space:]]+estimated_fee([^_]|$)'
),'no live function reads or writes the retired decimal estimate column');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.has_clinical_permission_at_branch(uuid,text)'::regprocedure
    and (
      has_function_privilege('public','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('anon','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('authenticated','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('service_role','private.has_clinical_permission_at_branch(uuid,text)','execute')
    )
),'the clinical permission helper reused by P16-02 stays revoked from every browser and service role');

-- Plan P1 lifecycle: create -> update -> items/alternative/discussion/drawing
-- -> present -> acknowledge, with immutability enforced at every stage.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Full mouth restoration')),1,'dentist A creates a DRAFT plan at version one');
reset role;
insert into p1602_plans (seq, id)
select 1, plan.id
from public.treatment_plans as plan
where plan.organization_id='b7200000-0000-0000-0000-000000000001'
  and plan.title='Full mouth restoration';
select extensions.ok((select status='DRAFT' and version=1 and created_by='b7100000-0000-0000-0000-000000000001' and patient_id='b7500000-0000-0000-0000-000000000001' from public.treatment_plans where id=(select id from p1602_plans where seq=1)),'create derives the tenant and persists the DRAFT plan with the actor recorded');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.created' and patient_id='b7500000-0000-0000-0000-000000000001' and entity_id=(select id from p1602_plans where seq=1)),1,'create writes exactly one treatment.plan.created audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.update_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),1,'Full mouth restoration v2')),2,'a DRAFT plan updates with an optimistic version bump');
reset role;
select extensions.ok((select title='Full mouth restoration v2' and status='DRAFT' and version=2 from public.treatment_plans where id=(select id from p1602_plans where seq=1)),'update persists the new title and version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.updated' and entity_id=(select id from p1602_plans where seq=1)),1,'update writes exactly one treatment.plan.updated audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.update_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),1,'stale')$$,'P0001','stale version','updating with a stale expected version is rejected');
select extensions.is((select line_no from public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),2,'c9300000-0000-0000-0000-000000000001','26','Composite filling on 26.',2500.00)),1,'an item with an org procedure, FDI tooth, and fee is appended at line one');
select extensions.is((select line_no from public.add_treatment_plan_item_centavos('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),2,null,'27','Crown on 27.',null)),2,'the centavo application RPC appends a second item without a procedure at line two');
reset role;
insert into p1602_items (seq, id)
select 1, item.id
from public.treatment_plan_items as item
where item.organization_id='b7200000-0000-0000-0000-000000000001'
  and item.plan_id=(select id from p1602_plans where seq=1)
  and item.description='Composite filling on 26.';
insert into p1602_items (seq, id)
select 2, item.id
from public.treatment_plan_items as item
where item.organization_id='b7200000-0000-0000-0000-000000000001'
  and item.plan_id=(select id from p1602_plans where seq=1)
  and item.description='Crown on 27.';
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.item_added' and entity_id in (select id from p1602_items where seq in (1,2))),2,'each item add writes exactly one treatment.plan.item_added audit event');
select extensions.ok((select line_no=1 and procedure_id='c9300000-0000-0000-0000-000000000001' and tooth_code='26' and estimated_fee_centavos=250000 from public.treatment_plan_items where id=(select id from p1602_items where seq=1)),'the retained peso RPC persists its org procedure and exact centavo estimate');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select line_no from public.update_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),(select id from p1602_items where seq=1),2,null,'27','Composite filling on 27.',2500.01)),1,'a DRAFT item updates in place through the retained peso contract');
reset role;
select extensions.is((select estimated_fee_centavos from public.treatment_plan_items where id=(select id from p1602_items where seq=1)),250001::bigint,'the retained update RPC converts a two-decimal peso value exactly to centavos');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select line_no from public.update_treatment_plan_item_centavos('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),(select id from p1602_items where seq=1),2,null,'27','Composite filling on 27.',250002)),1,'the centavo application RPC updates a DRAFT item without a decimal conversion path');
select extensions.is((select alternative_no from public.add_treatment_plan_alternative('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),2,'Extraction and implant alternative.')),1,'an alternative is appended at number one');
reset role;
select extensions.is((select estimated_fee_centavos from public.treatment_plan_items where id=(select id from p1602_items where seq=1)),250002::bigint,'the centavo application update persists the exact integer value');
insert into p1602_alternatives (seq, id)
select 1, alternative.id
from public.treatment_plan_alternatives as alternative
where alternative.organization_id='b7200000-0000-0000-0000-000000000001'
  and alternative.plan_id=(select id from p1602_plans where seq=1)
  and alternative.alternative_no=1;
select extensions.ok((select description='Composite filling on 27.' and tooth_code='27' from public.treatment_plan_items where id=(select id from p1602_items where seq=1)),'the item update persists the new description and tooth');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.item_updated' and entity_id=(select id from p1602_items where seq=1)),2,'each successful item update writes exactly one treatment.plan.item_updated audit event');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.alternative_added' and entity_id=(select id from p1602_alternatives where seq=1)),1,'the alternative add writes exactly one treatment.plan.alternative_added audit event');

-- Discussion on a DRAFT plan captures provider/time/context.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.ok((select discussed_at is not null from public.add_treatment_plan_discussion_v2('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),'Case discussion','Patient prefers conservative care.')),'a DRAFT discussion captures discussed_at');
reset role;
select extensions.ok((select treating_provider_id='c9200000-0000-0000-0000-000000000001' and discussed_at is not null and context='Case discussion' and notes='Patient prefers conservative care.' and discussed_by='b7100000-0000-0000-0000-000000000001' from public.treatment_plan_discussions where organization_id='b7200000-0000-0000-0000-000000000001' and plan_id=(select id from p1602_plans where seq=1) and context='Case discussion'),'the discussion row captures the treating provider, discussed_at, and context together');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.discussion_added' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'the discussion add writes exactly one treatment.plan.discussion_added audit event');

-- Drawing on a DRAFT plan, then present -> acknowledge with immutability.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.save_treatment_plan_drawing('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),2,'{"strokes":[]}'::jsonb)),1,'a drawing is saved on a DRAFT plan at version one');
select extensions.is((select version from public.present_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),2)),3,'presenting the DRAFT plan moves it to PRESENTED at version three');
reset role;
select extensions.ok((select status='PRESENTED' and version=3 from public.treatment_plans where id=(select id from p1602_plans where seq=1)),'present persists the PRESENTED status and version bump');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.presented' and entity_id=(select id from p1602_plans where seq=1)),1,'present writes exactly one treatment.plan.presented audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.update_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),3,'rewrite')$$,'P0001','invalid state','a PRESENTED plan refuses updates as invalid state');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),3,null,'26','Too late',null)$$,'P0001','invalid state','a PRESENTED plan refuses item adds as invalid state');
select extensions.throws_ok($$select public.update_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),(select id from p1602_items where seq=2),3,null,'28','rewrite',null)$$,'P0001','invalid state','a PRESENTED plan refuses item updates as invalid state');
select extensions.throws_ok($$select public.remove_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),(select id from p1602_items where seq=2),3)$$,'P0001','invalid state','a PRESENTED plan refuses item removal as invalid state');
select extensions.throws_ok($$select public.add_treatment_plan_alternative('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),3,'Late alternative')$$,'P0001','invalid state','a PRESENTED plan refuses alternative adds as invalid state');
select extensions.is((select version from public.save_treatment_plan_drawing('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),3,'{"strokes":[{"x":1,"y":2}]}'::jsonb)),2,'a drawing still saves on a PRESENTED plan with a version bump');
select extensions.is((select version from public.acknowledge_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),3)),4,'acknowledging the PRESENTED plan moves it to ACKNOWLEDGED at version four');
reset role;
select extensions.ok((select status='ACKNOWLEDGED' and version=4 from public.treatment_plans where id=(select id from p1602_plans where seq=1)),'acknowledge persists the ACKNOWLEDGED status and version bump');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.acknowledged' and entity_id=(select id from p1602_plans where seq=1)),1,'acknowledge writes exactly one treatment.plan.acknowledged audit event');

-- An ACKNOWLEDGED plan is immutable through both the RPC boundary and the
-- direct-SQL trigger.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.save_treatment_plan_drawing('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),4,'{"strokes":[]}'::jsonb)$$,'P0001','invalid state','an ACKNOWLEDGED plan rejects drawing saves as invalid state');
select extensions.throws_ok($$select public.update_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),4,'rewrite')$$,'P0001','invalid state','an ACKNOWLEDGED plan rejects updates through the RPC');
select extensions.throws_ok($$select public.present_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),4)$$,'P0001','invalid state','an ACKNOWLEDGED plan rejects re-presenting');
select extensions.ok((select discussed_at is not null from public.add_treatment_plan_discussion_v2('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),'Consent discussion','Acknowledged the plan.')),'a discussion still appends on an ACKNOWLEDGED plan');
reset role;
select extensions.is((select count(*)::integer from public.treatment_plan_discussions where organization_id='b7200000-0000-0000-0000-000000000001' and plan_id=(select id from p1602_plans where seq=1) and context='Consent discussion'),1,'the acknowledged-plan discussion row persists');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.discussion_added' and patient_id='b7500000-0000-0000-0000-000000000001'),2,'the acknowledged discussion adds a second discussion_added audit');
select extensions.throws_ok($$update public.treatment_plans set title='rewrite' where id=(select id from p1602_plans where seq=1)$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','the immutable trigger rejects the direct UPDATE of an ACKNOWLEDGED plan');
select extensions.throws_ok($$delete from public.treatment_plans where id=(select id from p1602_plans where seq=1)$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','the immutable trigger rejects the direct DELETE of an ACKNOWLEDGED plan');

-- Plan P2: item removal on DRAFT, acknowledge-order guard, and ACKNOWLEDGED
-- immutability of children.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Second plan')),1,'a second DRAFT plan is created');
reset role;
insert into p1602_plans (seq, id)
select 2, plan.id
from public.treatment_plans as plan
where plan.organization_id='b7200000-0000-0000-0000-000000000001'
  and plan.title='Second plan';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.acknowledge_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),1)$$,'P0001','invalid state','a DRAFT plan cannot be acknowledged directly');
select extensions.is((select line_no from public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),1,null,'26','Removable item.',100.00)),1,'a DRAFT item is added for the removal probe');
reset role;
insert into p1602_items (seq, id)
select 3, item.id
from public.treatment_plan_items as item
where item.organization_id='b7200000-0000-0000-0000-000000000001'
  and item.plan_id=(select id from p1602_plans where seq=2)
  and item.description='Removable item.';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select item_id from public.remove_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),(select id from p1602_items where seq=3),1)),(select id from p1602_items where seq=3),'a DRAFT item is removed by id');
select extensions.is((select alternative_no from public.add_treatment_plan_alternative('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),1,'Another alternative.')),1,'an alternative is added to the second plan');
reset role;
insert into p1602_alternatives (seq, id)
select 2, alternative.id
from public.treatment_plan_alternatives as alternative
where alternative.organization_id='b7200000-0000-0000-0000-000000000001'
  and alternative.plan_id=(select id from p1602_plans where seq=2);
select extensions.ok(not exists (select 1 from public.treatment_plan_items where id=(select id from p1602_items where seq=3)),'the removed item row is gone');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.item_removed' and entity_id=(select id from p1602_items where seq=3)),1,'the item removal writes exactly one treatment.plan.item_removed audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.present_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),1)),2,'the second plan presents at version two');
select extensions.is((select version from public.acknowledge_treatment_plan('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),2)),3,'the second plan acknowledges at version three');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,'26','Too late',null)$$,'P0001','invalid state','an ACKNOWLEDGED plan refuses item adds');
select extensions.throws_ok($$select public.add_treatment_plan_alternative('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,'Too late')$$,'P0001','invalid state','an ACKNOWLEDGED plan refuses alternative adds');
select extensions.throws_ok($$select public.remove_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),(select id from p1602_alternatives where seq=2),3)$$,'P0001','invalid state','an ACKNOWLEDGED plan refuses item removal');
reset role;

-- Clean invalid-input validation before the table CHECKs fire.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','   ')$$,'22023','invalid input','a blank title is rejected with a clean error');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),4,'c9300000-0000-0000-0000-000000000002','26','Foreign procedure',null)$$,'22023','invalid input','a foreign-org procedure is rejected with a clean error');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,'49','Bad tooth',null)$$,'22023','invalid input','an invalid FDI tooth code is rejected with a clean error');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,null,'Too big',1000000000)$$,'22023','invalid input','an oversized estimated fee is rejected with a clean error');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,null,'Fractional centavo',123.456)$$,'22023','invalid input','a fractional-centavo peso estimate is rejected rather than rounded');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,null,'   ',null)$$,'22023','invalid input','a blank item description is rejected with a clean error');
-- The provider-accepting signature used to reject a foreign-organization
-- treating provider. The replacement accepts no provider at all, so the
-- stronger statement is that the browser can no longer reach the old signature.
select extensions.throws_ok($$select public.add_treatment_plan_discussion('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),'c9200000-0000-0000-0000-000000000004','Foreign provider',null)$$,'42501','permission denied for function add_treatment_plan_discussion','the superseded provider-accepting discussion signature is unreachable from the browser');
select extensions.throws_ok($$select public.add_treatment_plan_discussion_v2('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1),'   ',null)$$,'22023','invalid input','a blank discussion context is rejected with a clean error');
select extensions.throws_ok($$select public.save_treatment_plan_drawing('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,'[1,2,3]'::jsonb)$$,'22023','invalid input','a non-object drawing is rejected with a clean error');
select extensions.throws_ok($$select public.save_treatment_plan_drawing('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,jsonb_build_object('data',repeat('x',70000)))$$,'22023','invalid input','an oversized drawing is rejected with a clean error');
reset role;

-- Reads: the assistant may read bounded projections and detail, writes none.
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b7500000-0000-0000-0000-000000000001'),19,'audit count is 19 before the read probes');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.list_treatment_plans('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001')),2,'a read-only assistant can list both of patient A plans');
select extensions.ok((select item_count=2 and has_drawing from public.list_treatment_plans('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001') where plan_id=(select id from p1602_plans where seq=1) and title='Full mouth restoration v2' and status='ACKNOWLEDGED' and version=4),'list projects the bounded plan fields plus item_count and drawing presence for P1');
select extensions.ok((select item_count=0 and not has_drawing from public.list_treatment_plans('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001') where plan_id=(select id from p1602_plans where seq=2) and status='ACKNOWLEDGED'),'list shows zero items and no drawing for P2');
select extensions.is((select jsonb_array_length(public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) -> 'items')),2,'detail includes both P1 items');
select extensions.is((select public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) #>> '{items,0,estimatedFeeCentavos}'),'250002','detail returns the exact centavo estimate as a base-10 string');
select extensions.ok(not (public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) #> '{items,0}' ? 'estimatedFee'),'detail has no legacy decimal estimate key');
select extensions.is((select jsonb_array_length(public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) -> 'alternatives')),1,'detail includes the P1 alternative');
select extensions.is((select jsonb_array_length(public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) -> 'discussions')),2,'detail includes both P1 discussions');
select extensions.ok((select detail #>> '{plan,status}' = 'ACKNOWLEDGED' and detail #>> '{plan,title}' = 'Full mouth restoration v2' and detail #>> '{plan,version}' = '4' from (select public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) as detail) as d),'detail returns the plan projection');
select extensions.ok((select (drawing->>'version')='2' from (select public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) -> 'drawing' as drawing) as d),'detail includes the persisted drawing with its latest version');
select extensions.ok((select exists (select 1 from jsonb_array_elements(detail -> 'discussions') as discussion where discussion->>'context'='Consent discussion' and discussion->>'treatingProviderId'='c9200000-0000-0000-0000-000000000001' and discussion->>'discussedAt' is not null and discussion->>'discussedBy'='b7100000-0000-0000-0000-000000000001') from (select public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1)) as detail) as d),'the detail discussion history carries the provider, time, and context for the acknowledged discussion');
select extensions.ok((select (public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2)) -> 'drawing')::text = 'null' and jsonb_array_length(public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2)) -> 'items') = 0),'P2 detail shows no drawing and zero items');
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Denied')$$,'42501','not authorized','a read-only assistant cannot create plans');
select extensions.throws_ok($$select public.add_treatment_plan_item('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=2),3,null,'26','Denied',null)$$,'42501','not authorized','a read-only assistant cannot add items');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b7500000-0000-0000-0000-000000000001'),19,'read probes leave the audit count unchanged');

-- Permission denials on the read and write paths.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Denied')$$,'42501','not authorized','receptionist without clinical.write cannot create plans');
select extensions.throws_ok($$select public.list_treatment_plans('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001')$$,'42501','not authorized','receptionist without clinical.read cannot list plans');
select extensions.throws_ok($$select public.get_treatment_plan_detail('b7300000-0000-0000-0000-000000000001',(select id from p1602_plans where seq=1))$$,'42501','not authorized','receptionist cannot read plan detail');
reset role;

-- Tenant isolation: the foreign dentist works only inside tenant B.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000005',true);
select extensions.is((select version from public.create_treatment_plan('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000002','Tenant B plan')),1,'the foreign dentist creates a plan inside tenant B');
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001','Denied')$$,'42501','not authorized','a foreign dentist cannot create plans on another tenant patient');
select extensions.throws_ok($$select public.list_treatment_plans('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign dentist cannot list another tenant plans');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000002','Denied')$$,'42501','not authorized','dentist A cannot create plans on the tenant-B patient');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000002' and action='treatment.plan.created'),1,'tenant B creation audits inside tenant B only');

-- Exactly-one-audit-per-mutation and audit-rollback (blocked audit rolls back).
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.created' and patient_id='b7500000-0000-0000-0000-000000000001'),2,'exactly two created audits for the two tenant-A plans');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.item_added' and patient_id='b7500000-0000-0000-0000-000000000001'),3,'exactly three item_added audits for the three tenant-A item adds');
create function private.p1602_block_treatment_plan_audit() returns trigger language plpgsql as $$begin if new.action = 'treatment.plan.created' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p1602_block_treatment_plan_audit before insert on public.audit_events for each row execute function private.p1602_block_treatment_plan_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_treatment_plan('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Rollback probe')$$,'P0001','audit blocked','a failing treatment.plan.created audit event rejects the plan');
reset role;
select extensions.ok(not exists (select 1 from public.treatment_plans where organization_id='b7200000-0000-0000-0000-000000000001' and title='Rollback probe'),'a blocked audit rolls back the new plan row entirely');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='treatment.plan.created' and patient_id='b7500000-0000-0000-0000-000000000001'),2,'a blocked audit rolls back its own audit row, leaving two created audits');
drop trigger p1602_block_treatment_plan_audit on public.audit_events;
drop function private.p1602_block_treatment_plan_audit();

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
