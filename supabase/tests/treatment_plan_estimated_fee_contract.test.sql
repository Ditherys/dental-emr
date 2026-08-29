begin;

select extensions.no_plan();

-- Synthetic-only B11 repair graph. Dentist A writes/reads/generates in tenant
-- A; assistant A is clinical-read-only; receptionist A lacks clinical access;
-- dentist B is fully privileged only in tenant B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@estimate.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@estimate.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@estimate.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@estimate.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e7200000-0000-0000-0000-000000000001','Estimate Synthetic A Inc.','Estimate A','estimate-a'),
  ('e7200000-0000-0000-0000-000000000002','Estimate Synthetic B Inc.','Estimate B','estimate-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e7300000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001','Estimate A Main','estimate-a-main','EST-A','1 Synthetic St','Test City','Test Province'),
  ('e7300000-0000-0000-0000-000000000002','e7200000-0000-0000-0000-000000000002','Estimate B Main','estimate-b-main','EST-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e7400000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e7400000-0000-0000-0000-000000000002','e7200000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e7400000-0000-0000-0000-000000000003','e7200000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e7400000-0000-0000-0000-000000000005','e7200000-0000-0000-0000-000000000002','e7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e7200000-0000-0000-0000-000000000001','e7300000-0000-0000-0000-000000000001','e7400000-0000-0000-0000-000000000001','active'),
  ('e7200000-0000-0000-0000-000000000001','e7300000-0000-0000-0000-000000000001','e7400000-0000-0000-0000-000000000002','active'),
  ('e7200000-0000-0000-0000-000000000001','e7300000-0000-0000-0000-000000000001','e7400000-0000-0000-0000-000000000003','active'),
  ('e7200000-0000-0000-0000-000000000002','e7300000-0000-0000-0000-000000000002','e7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e7200000-0000-0000-0000-000000000001'::uuid,'e7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e7100000-0000-0000-0000-000000000001'::uuid),
  ('e7200000-0000-0000-0000-000000000001'::uuid,'e7400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'e7100000-0000-0000-0000-000000000001'::uuid),
  ('e7200000-0000-0000-0000-000000000001'::uuid,'e7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'e7300000-0000-0000-0000-000000000001'::uuid,'e7100000-0000-0000-0000-000000000001'::uuid),
  ('e7200000-0000-0000-0000-000000000002'::uuid,'e7400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'e7100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e7500000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001','EST-A-1','Patient','A',date '1990-01-01','e7300000-0000-0000-0000-000000000001'),
  ('e7500000-0000-0000-0000-000000000002','e7200000-0000-0000-0000-000000000002','EST-B-1','Patient','B',date '1991-01-01','e7300000-0000-0000-0000-000000000002');

create temp table estimate_plans (id uuid primary key);
create temp table estimate_items (seq integer primary key, id uuid);
grant select on estimate_plans, estimate_items to authenticated, anon, service_role;

select extensions.hasnt_column('public','treatment_plan_items','estimated_fee','the retired decimal storage column is absent');
select extensions.ok(not exists (
  select 1
  from pg_proc as proc
  join pg_namespace as namespace on namespace.oid = proc.pronamespace
  where namespace.nspname in ('public','private')
    and proc.prosrc ~ 'item\.estimated_fee([^_]|$)|description,[[:space:]]+estimated_fee([^_]|$)'
),'no live function reads or writes the retired decimal storage column');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid in (
    'public.get_treatment_plan_detail(uuid,uuid)'::regprocedure,
    'public.generate_document(uuid,uuid,text,jsonb)'::regprocedure
  ) and proc.prosrc like '%pg_get_functiondef%'
),'both centavo projections are explicit function bodies, not catalog-source rewrites');
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)'::regprocedure,
  'public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)'::regprocedure,
  'public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)'::regprocedure,
  'public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)'::regprocedure,
  'public.get_treatment_plan_detail(uuid,uuid)'::regprocedure,
  'public.generate_document(uuid,uuid,text,jsonb)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),6,'every estimate writer and projection is SECURITY DEFINER with an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and has_function_privilege('authenticated','public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and not has_function_privilege('anon','public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and not has_function_privilege('anon','public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and not has_function_privilege('service_role','public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)','execute')
  and not has_function_privilege('service_role','public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)','execute'),
  'only authenticated receives the two current centavo writer grants'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_treatment_plan('e7300000-0000-0000-0000-000000000001','e7500000-0000-0000-0000-000000000001','Centavo contract')),1,'dentist A creates the tenant-A DRAFT plan');
reset role;
insert into estimate_plans (id)
select id from public.treatment_plans where organization_id='e7200000-0000-0000-0000-000000000001' and title='Centavo contract';

-- Success boundaries: both retained numeric and current centavo entrypoints
-- accept zero and the exact canonical maximum without rounding.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.is((select line_no from public.add_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'11','Legacy zero',0.00)),1,'legacy add accepts zero pesos exactly');
select extensions.is((select line_no from public.add_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'12','Legacy max',999999999.99)),2,'legacy add accepts the maximum exact peso value');
select extensions.is((select line_no from public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'13','Centavo zero',0)),3,'current add accepts zero centavos exactly');
select extensions.is((select line_no from public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'14','Centavo max',99999999999)),4,'current add accepts the maximum centavo value');
reset role;
insert into estimate_items (seq,id)
select line_no,id from public.treatment_plan_items where plan_id=(select id from estimate_plans);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.is((select line_no from public.update_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Legacy zero to max',999999999.99)),1,'legacy update accepts the maximum exact peso value');
select extensions.is((select line_no from public.update_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=2),1,null,'12','Legacy max to zero',0.00)),2,'legacy update accepts zero pesos exactly');
select extensions.is((select line_no from public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=3),1,null,'13','Centavo zero to max',99999999999)),3,'current update accepts the maximum centavo value');
select extensions.is((select line_no from public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=4),1,null,'14','Centavo max to zero',0)),4,'current update accepts zero centavos exactly');

-- Rejected boundaries fail before mutation/audit. Fractional-centavo probes
-- apply only to the retained numeric-peso signatures.
select extensions.throws_ok($$select public.add_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Legacy fractional',1.001)$$,'22023','invalid input','legacy add rejects a fractional-centavo peso value');
select extensions.throws_ok($$select public.add_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Legacy overflow',1000000000.00)$$,'22023','invalid input','legacy add rejects maximum plus one centavo');
select extensions.throws_ok($$select public.update_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Legacy fractional',1.001)$$,'22023','invalid input','legacy update rejects a fractional-centavo peso value');
select extensions.throws_ok($$select public.update_treatment_plan_item('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Legacy overflow',1000000000.00)$$,'22023','invalid input','legacy update rejects maximum plus one centavo');
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Centavo negative',-1)$$,'22023','invalid input','current add rejects negative centavos');
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Centavo overflow',100000000000)$$,'22023','invalid input','current add rejects maximum plus one centavo');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=3),1,null,'13','Centavo negative',-1)$$,'22023','invalid input','current update rejects negative centavos');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=3),1,null,'13','Centavo overflow',100000000000)$$,'22023','invalid input','current update rejects maximum plus one centavo');
reset role;

select extensions.is((select count(*)::integer from public.treatment_plan_items where plan_id=(select id from estimate_plans)),4,'rejected values append no treatment-plan item');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action='treatment.plan.item_added'),4,'only four successful adds are audited');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action='treatment.plan.item_updated'),4,'only four successful updates are audited');
select extensions.ok((select array_agg(estimated_fee_centavos order by line_no)=array[99999999999,0,99999999999,0]::bigint[] from public.treatment_plan_items where plan_id=(select id from estimate_plans)),'storage contains only the four exact centavo results');

-- Browser-role, tenant, and direct-role denials cover both current writers.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Assistant denied',1)$$,'42501','not authorized','clinical-read-only assistant cannot add through the centavo RPC');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Assistant denied',1)$$,'42501','not authorized','clinical-read-only assistant cannot update through the centavo RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Reception denied',1)$$,'42501','not authorized','receptionist cannot add through the centavo RPC');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Reception denied',1)$$,'42501','not authorized','receptionist cannot update through the centavo RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000002',(select id from estimate_plans),1,null,'15','Foreign denied',1)$$,'42501','not authorized','tenant-B dentist cannot add to the tenant-A plan');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000002',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Foreign denied',1)$$,'42501','not authorized','tenant-B dentist cannot update the tenant-A item');
reset role;
set local role anon;
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Anon denied',1)$$,'42501',null,'anon has no centavo add grant');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Anon denied',1)$$,'42501',null,'anon has no centavo update grant');
reset role;
set local role service_role;
select extensions.throws_ok($$select public.add_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),1,null,'15','Service denied',1)$$,'42501',null,'service_role has no centavo add grant');
select extensions.throws_ok($$select public.update_treatment_plan_item_centavos('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans),(select id from estimate_items where seq=1),1,null,'11','Service denied',1)$$,'42501',null,'service_role has no centavo update grant');
reset role;

select extensions.is((select count(*)::integer from public.treatment_plan_items where plan_id=(select id from estimate_plans)),4,'all authorization failures are atomic');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action in ('treatment.plan.item_added','treatment.plan.item_updated')),8,'authorization failures append no item audit event');

-- Over-cap fixtures prove each projection bounds its source rows before
-- aggregation. Values are deliberately short so the test exercises row-count
-- contracts rather than unrelated field-size boundaries.
create temp table estimate_cap_plans (id uuid primary key);
insert into public.treatment_plans (id, organization_id, patient_id, title, status, version, created_by)
values ('e7600000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001','e7500000-0000-0000-0000-000000000001','Centavo cap fixture','DRAFT',1,'e7100000-0000-0000-0000-000000000001');
insert into estimate_cap_plans values ('e7600000-0000-0000-0000-000000000001');
grant select on estimate_cap_plans to authenticated, anon, service_role;
insert into public.treatment_plan_items (id, organization_id, plan_id, line_no, description, estimated_fee_centavos)
values
 ('e7610000-0000-0000-0000-000000000001','e7200000-0000-0000-0000-000000000001','e7600000-0000-0000-0000-000000000001',1,'i1',99999999999),
 ('e7610000-0000-0000-0000-000000000002','e7200000-0000-0000-0000-000000000001','e7600000-0000-0000-0000-000000000001',2,'i2',0),
 ('e7610000-0000-0000-0000-000000000003','e7200000-0000-0000-0000-000000000001','e7600000-0000-0000-0000-000000000001',3,'i3',99999999999),
 ('e7610000-0000-0000-0000-000000000004','e7200000-0000-0000-0000-000000000001','e7600000-0000-0000-0000-000000000001',4,'i4',0);
insert into public.treatment_plan_items (
  id, organization_id, plan_id, line_no, description, estimated_fee_centavos
)
select
  ('e8' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  (select id from estimate_cap_plans),
  seq,
  'i' || seq,
  seq
from generate_series(5,205) as seq;

insert into public.treatment_plan_alternatives (
  id, organization_id, plan_id, alternative_no, summary
)
select
  ('e9' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  (select id from estimate_cap_plans),
  seq,
  'a' || seq
from generate_series(1,105) as seq;

insert into public.treatment_plan_discussions (
  id, organization_id, plan_id, discussed_at, context
)
select
  ('ea' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  (select id from estimate_cap_plans),
  timestamptz '2026-01-01 00:00:00+00' + seq * interval '1 minute',
  'd' || seq
from generate_series(1,205) as seq;

insert into public.patient_contacts (
  id, organization_id, patient_id, contact_type, value, created_at
)
select
  ('eb' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  'e7500000-0000-0000-0000-000000000001',
  'OTHER',
  'c' || seq,
  timestamptz '2026-01-01 00:00:00+00' + seq * interval '1 minute'
from generate_series(1,55) as seq;

insert into public.patient_referrals (
  id, org_id, patient_id, direction, external_party_name, created_at
)
select
  ('ec' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  'e7500000-0000-0000-0000-000000000001',
  'IN',
  'r' || seq,
  timestamptz '2026-01-01 00:00:00+00' + seq * interval '1 minute'
from generate_series(1,105) as seq;

insert into public.appointments (
  id, organization_id, branch_id, patient_id, starts_at, ends_at, title
)
select
  ('ed' || lpad(seq::text,30,'0'))::uuid,
  'e7200000-0000-0000-0000-000000000001',
  'e7300000-0000-0000-0000-000000000001',
  'e7500000-0000-0000-0000-000000000001',
  timestamptz '2026-01-01 00:00:00+00' + seq * interval '1 hour',
  timestamptz '2026-01-01 00:30:00+00' + seq * interval '1 hour',
  'p' || seq
from generate_series(1,205) as seq;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000002',true);
select extensions.ok((
  select jsonb_array_length(detail->'items')=200
    and jsonb_array_length(detail->'alternatives')=100
    and jsonb_array_length(detail->'discussions')=200
    and detail #>> '{items,0,lineNo}'='1'
    and detail #>> '{items,199,lineNo}'='200'
  from (
    select public.get_treatment_plan_detail(
      'e7300000-0000-0000-0000-000000000001',
      (select id from estimate_cap_plans)
    ) as detail
  ) as projection
),'detail caps over-limit items, alternatives, and discussions before aggregation');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.generate_document(
  'e7300000-0000-0000-0000-000000000001',
  'e7500000-0000-0000-0000-000000000001',
  'TREATMENT_PLAN',
  jsonb_build_object('planId',(select id from estimate_cap_plans),'items',true,'alternatives',true,'discussions',true)
)$$,'23514',null,'an oversized bounded treatment-plan snapshot is rejected by the 16 KiB hard limit');
reset role;

select extensions.ok((
  select detail_proc.prosrc ~ 'limit 200[[:space:]]+[)] as item'
    and detail_proc.prosrc ~ 'limit 100[[:space:]]+[)] as alternative'
    and detail_proc.prosrc ~ 'limit 200[[:space:]]+[)] as discussion'
    and document_proc.prosrc ~ 'limit 50[[:space:]]+[)] as contact'
    and document_proc.prosrc ~ 'limit 100[[:space:]]+[)] as referral'
    and document_proc.prosrc ~ 'limit 200[[:space:]]+[)] as appointment'
    and document_proc.prosrc ~ 'limit 200[[:space:]]+[)] as item'
    and document_proc.prosrc ~ 'limit 100[[:space:]]+[)] as alternative'
    and document_proc.prosrc ~ 'limit 200[[:space:]]+[)] as discussion'
  from pg_proc as detail_proc
  cross join pg_proc as document_proc
  where detail_proc.oid='public.get_treatment_plan_detail(uuid,uuid)'::regprocedure
    and document_proc.oid='public.generate_document(uuid,uuid,text,jsonb)'::regprocedure
),'all six deterministic source-family caps occur inside derived tables before aggregation');
select extensions.is((select count(*)::integer from public.documents where organization_id='e7200000-0000-0000-0000-000000000001'),0,'oversized document rejection leaves no document residue');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action='document.generated'),0,'oversized document rejection leaves no audit residue');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.generate_document(
  'e7300000-0000-0000-0000-000000000001',
  'e7500000-0000-0000-0000-000000000001',
  'PATIENT_RECORD_SUMMARY',
  '{"demographics":"yes"}'::jsonb
)$$,'22023','invalid input','genuine include-set validation failure remains explicit');
reset role;
select extensions.is((select count(*)::integer from public.documents where organization_id='e7200000-0000-0000-0000-000000000001'),0,'validation failure appends no document residue');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action='document.generated'),0,'validation failure appends no audit residue');

delete from public.treatment_plan_alternatives
where plan_id=(select id from estimate_cap_plans);
delete from public.treatment_plan_discussions
where plan_id=(select id from estimate_cap_plans);

-- Same-tenant bounded detail and document projections expose centavo strings;
-- read-only, receptionist, and foreign-tenant denials disclose nothing and do
-- not create documents or audit events.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000002',true);
select extensions.ok((select detail #>> '{items,0,estimatedFeeCentavos}'='99999999999' and detail #>> '{items,1,estimatedFeeCentavos}'='0' and not (detail #> '{items,0}' ? 'estimatedFee') from (select public.get_treatment_plan_detail('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans)) as detail) as projection),'same-tenant clinical reader receives only base-10 centavo strings');
select extensions.throws_ok($$select public.generate_document('e7300000-0000-0000-0000-000000000001','e7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from estimate_plans),'items',true))$$,'42501','not authorized','clinical-read-only assistant cannot generate a treatment-plan document');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.get_treatment_plan_detail('e7300000-0000-0000-0000-000000000001',(select id from estimate_plans))$$,'42501','not authorized','receptionist cannot read treatment-plan detail');
select extensions.throws_ok($$select public.generate_document('e7300000-0000-0000-0000-000000000001','e7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from estimate_plans),'items',true))$$,'42501','not authorized','receptionist cannot generate a treatment-plan document');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.get_treatment_plan_detail('e7300000-0000-0000-0000-000000000002',(select id from estimate_plans))$$,'42501','not authorized','tenant-B dentist cannot read tenant-A detail');
select extensions.throws_ok($$select public.generate_document('e7300000-0000-0000-0000-000000000002','e7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from estimate_plans),'items',true))$$,'42501','not authorized','tenant-B dentist cannot generate a tenant-A document');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.generate_document('e7300000-0000-0000-0000-000000000001','e7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from estimate_plans),'items',true))),1,'dentist A generates the same-tenant treatment-plan document');
reset role;
select extensions.ok((select data_snapshot->'items'->0->>'estimatedFeeCentavos'='99999999999' and data_snapshot->'items'->1->>'estimatedFeeCentavos'='0' and not (data_snapshot->'items'->0 ? 'estimatedFee') from public.documents where organization_id='e7200000-0000-0000-0000-000000000001' and document_type='TREATMENT_PLAN' and include_set=jsonb_build_object('planId',(select id from estimate_plans),'items',true)),'stored document snapshot contains only exact centavo strings');
select extensions.is((select count(*)::integer from public.documents where organization_id='e7200000-0000-0000-0000-000000000001'),1,'denied, oversized, and invalid document requests create no document row');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='e7500000-0000-0000-0000-000000000001' and action='document.generated'),1,'only the successful under-bound document request is audited');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
