begin;

select extensions.no_plan();

-- Synthetic-only Task 6 graph for the treatment-event boundary.
--
-- Organization A holds a dentist with an active linked provider at A Main, an
-- owner with no provider link, and a receptionist (payment.record only).
-- Organization B is foreign. Fixture inserts run as postgres; every RPC call
-- runs with `set local role authenticated` plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('f6100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@tev.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain-a@tev.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@tev.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@tev.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('f6200000-0000-0000-0000-000000000001','TEV Synthetic A Inc.','TEV A','tev-a'),
  ('f6200000-0000-0000-0000-000000000002','TEV Synthetic B Inc.','TEV B','tev-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('f6300000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','TEV A Main','tev-a-main','TEV-A','1 Synthetic St','Test City','Test Province'),
  ('f6300000-0000-0000-0000-000000000003','f6200000-0000-0000-0000-000000000002','TEV B Main','tev-b-main','TEV-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('f6400000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('f6400000-0000-0000-0000-000000000002','f6200000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('f6400000-0000-0000-0000-000000000003','f6200000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('f6400000-0000-0000-0000-000000000004','f6200000-0000-0000-0000-000000000002','f6100000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('f6200000-0000-0000-0000-000000000001','f6300000-0000-0000-0000-000000000001','f6400000-0000-0000-0000-000000000001','active'),
  ('f6200000-0000-0000-0000-000000000001','f6300000-0000-0000-0000-000000000001','f6400000-0000-0000-0000-000000000002','active'),
  ('f6200000-0000-0000-0000-000000000001','f6300000-0000-0000-0000-000000000001','f6400000-0000-0000-0000-000000000003','active'),
  ('f6200000-0000-0000-0000-000000000002','f6300000-0000-0000-0000-000000000003','f6400000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('f6200000-0000-0000-0000-000000000001'::uuid,'f6400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'f6100000-0000-0000-0000-000000000001'::uuid),
  ('f6200000-0000-0000-0000-000000000001'::uuid,'f6400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'f6100000-0000-0000-0000-000000000002'::uuid),
  ('f6200000-0000-0000-0000-000000000001'::uuid,'f6400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'f6300000-0000-0000-0000-000000000001'::uuid,'f6100000-0000-0000-0000-000000000001'::uuid),
  ('f6200000-0000-0000-0000-000000000002'::uuid,'f6400000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,null::uuid,'f6100000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('f6500000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','TEV-A-1','Patient','A1',date '1990-01-01','f6300000-0000-0000-0000-000000000001'),
  ('f6500000-0000-0000-0000-000000000003','f6200000-0000-0000-0000-000000000002','TEV-B-1','Patient','B1',date '1992-03-03',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('f6600000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('f6600000-0000-0000-0000-000000000002','f6200000-0000-0000-0000-000000000002','f6100000-0000-0000-0000-000000000004','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('f6200000-0000-0000-0000-000000000001','f6600000-0000-0000-0000-000000000001','f6300000-0000-0000-0000-000000000001',true),
  ('f6200000-0000-0000-0000-000000000002','f6600000-0000-0000-0000-000000000002','f6300000-0000-0000-0000-000000000003',true);
insert into public.procedures (id, organization_id, code, name, status) values
  ('f6700000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','TEV_FILL','Synthetic composite filling','active'),
  ('f6700000-0000-0000-0000-000000000002','f6200000-0000-0000-0000-000000000001','TEV_ORTHO','Synthetic orthodontic case','active'),
  ('f6700000-0000-0000-0000-000000000003','f6200000-0000-0000-0000-000000000001','TEV_RCT','Synthetic root canal','active'),
  ('f6700000-0000-0000-0000-000000000004','f6200000-0000-0000-0000-000000000001','TEV_IMPL','Synthetic implant placement','active');

-- Active findings on patient A1. 16 and 26 are two separate caries findings;
-- only one of them is ever named for resolution.
insert into public.tooth_clinical_entries (id, organization_id, patient_id, tooth_code, kind, clinical_code, status, lifecycle, provenance) values
  ('f6b00000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','16','FINDING','CARIES','ACTIVE','OPEN','INTERNAL'),
  ('f6b00000-0000-0000-0000-000000000002','f6200000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','26','FINDING','CARIES','ACTIVE','OPEN','INTERNAL'),
  ('f6b00000-0000-0000-0000-000000000003','f6200000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','46','FINDING','MISSING','ACTIVE','OPEN','INTERNAL');

-- A plan-opened, charge-less procedure case with an IN_PROGRESS execution. In
-- production Task 8's plan mode opens this; that path does not exist yet, so the
-- fixture creates it directly, exactly as the O8 completion suite does.
insert into public.treatment_plans (id, organization_id, patient_id, title, status, version, created_by) values
  ('f6800000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','Synthetic acknowledged plan','DRAFT',1,'f6100000-0000-0000-0000-000000000001');
insert into public.treatment_plan_items (id, organization_id, plan_id, line_no, procedure_id, tooth_code, description, estimated_fee_centavos) values
  ('f6900000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6800000-0000-0000-0000-000000000001',1,'f6700000-0000-0000-0000-000000000003','36','Root canal on 36',450000);
update public.treatment_plan_item_materialization_contracts
set materialization_kind='CLINICAL', design_snapshot='{"tooth_code":"36","clinical_code":"ROOT_CANAL"}'::jsonb
where organization_id='f6200000-0000-0000-0000-000000000001' and item_id='f6900000-0000-0000-0000-000000000001';
update public.treatment_plans set status='ACKNOWLEDGED', version=2 where id='f6800000-0000-0000-0000-000000000001';
insert into public.procedure_cases (id, organization_id, patient_id, origin_branch_id, procedure_id, treatment_plan_item_id, opened_by, status, version) values
  ('f6a00000-0000-0000-0000-000000000001','f6200000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6300000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003','f6900000-0000-0000-0000-000000000001','f6100000-0000-0000-0000-000000000001','OPEN',1);

create temp table tev_result (seq integer primary key, payload jsonb);
create temp table tev_scalar (seq integer primary key, value text);
grant select, insert on tev_result to authenticated;
grant select, insert on tev_scalar to authenticated;

-- The payment-method catalogue is not browser readable, so the synthetic method
-- id is resolved once as postgres and read back from the temp table.
insert into tev_scalar (seq, value)
select 0, method.id::text from public.payment_methods as method
where method.organization_id = 'f6200000-0000-0000-0000-000000000001' and method.code = 'CASH';

-- ---------------------------------------------------------------------------
-- Boundary
-- ---------------------------------------------------------------------------

select extensions.ok(
  has_function_privilege('authenticated','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('anon','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('service_role','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('public','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute'),
  'only authenticated may execute the treatment-event boundary'
);
select extensions.ok(
  (select proc.prosecdef and proc.proconfig = array['search_path=""']::text[]
   from pg_proc as proc
   where proc.oid = 'public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)'::regprocedure),
  'the treatment-event boundary is SECURITY DEFINER with an empty search path'
);
select extensions.ok(
  (select proc.prosrc ~ 'start_or_resume_clinical_visit'
      and proc.prosrc ~ 'complete_treatment_case'
      and proc.prosrc ~ 'post_charge'
      and proc.prosrc !~ 'update public\.charges'
   from pg_proc as proc
   where proc.oid = 'public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)'::regprocedure),
  'the boundary obtains its visit and its charge from reviewed helpers and never updates a charge'
);
select extensions.ok(
  not exists (
    select 1 from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    where has_table_privilege(viewer.role_name,'private.clinical_treatment_event_idempotency','select')
       or has_table_privilege(viewer.role_name,'private.clinical_treatment_event_idempotency','insert')
       or has_table_privilege(viewer.role_name,'private.clinical_treatment_event_idempotency','update')
       or has_table_privilege(viewer.role_name,'private.clinical_treatment_event_idempotency','delete')
  ),
  'the treatment-event request-key store is unreachable from any browser or service role'
);

-- ---------------------------------------------------------------------------
-- Refused input, before any write
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',null,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000001')$$,
  '22023','invalid input','a treatment event without a service date is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date + 1,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000002')$$,
  '22023','invalid input','a service date after the server clinical date is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'AMENDMENT',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000003')$$,
  '22023','invalid input','an unknown lifecycle event kind is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'FOLLOW_UP',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000004')$$,
  '22023','invalid input','a follow-up cannot open a new procedure case'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,3,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000005')$$,
  '22023','invalid input','a new case may not claim an expected case version'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,null,null,null,'f6e00000-0000-0000-0000-000000000006')$$,
  '22023','invalid input','a new case requires an explicitly confirmed charge amount'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,0,null,null,'f6e00000-0000-0000-0000-000000000007')$$,
  '22023','invalid input','a zero confirmed charge is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,-1,null,null,'f6e00000-0000-0000-0000-000000000008')$$,
  '22023','invalid input','a negative confirmed charge is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,100000000000,null,null,'f6e00000-0000-0000-0000-000000000009')$$,
  '22023','invalid input','a confirmed charge above the ledger bound is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"unobtanium","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000010')$$,
  '22023','invalid input','a restoration material outside the controlled vocabulary is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":[],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000011')$$,
  '22023','invalid input','a restoration must name at least one treated surface'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["I"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000012')$$,
  '22023','invalid input','an incisal surface on a posterior tooth is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["47"],"surfaces":["O"],"detail":{"code":"ROOT_CANAL","state":"endo-filling"}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000013')$$,
  '22023','invalid input','a whole-tooth treatment may not claim a surface'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["47"],"detail":{"code":"ROOT_CANAL","state":"not-a-canal-state"}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000014')$$,
  '22023','invalid input','a root-canal anatomical state outside the controlled vocabulary is refused'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"CARIES","depth":"DENTIN","icdas":null,"cars":null,"radiographicDepth":null}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000015')$$,
  '22023','invalid input','a finding code is refused by the treatment-event boundary'
);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array['f6b00000-0000-0000-0000-000000000002'::uuid],'{"toothCodes":["16"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000016')$$,
  '22023','invalid finding resolution','a finding on a tooth this event does not treat may not be resolved'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  0,
  'every refused treatment event posted no charge'
);
select extensions.is(
  (select count(*)::integer from public.procedure_cases where organization_id='f6200000-0000-0000-0000-000000000001' and id <> 'f6a00000-0000-0000-0000-000000000001'),
  0,
  'every refused treatment event opened no procedure case'
);

-- ---------------------------------------------------------------------------
-- New case: performed restoration with exact finding resolution
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
insert into tev_result (seq, payload)
select 1, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',
  null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array['f6b00000-0000-0000-0000-000000000001'::uuid],
  '{"toothCodes":["16"],"surfaces":["O","M"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false},"note":"Synthetic composite restoration"}'::jsonb,
  250000,null,null,'f6e00000-0000-0000-0000-000000000101');
reset role;

select extensions.ok(
  (select (payload->>'charge_confirmed')::boolean
      and payload->>'case_status' = 'OPEN'
      and payload->>'charge_amount_centavos' = '250000'
      and payload->>'balance_centavos' = '250000'
      and payload->>'paid_centavos' = '0'
      and payload->>'service_date' = (timezone('Asia/Manila', statement_timestamp()))::date::text
      and not (payload->>'replayed')::boolean
   from tev_result where seq = 1),
  'a performed treatment confirms one charge, leaves the case open, and reports charge/paid/balance'
);
select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  1,
  'exactly one charge exists after the first confirmed treatment'
);
select extensions.ok(
  (select entry.kind = 'TREATMENT' and entry.clinical_code = 'RESTORATION' and entry.status = 'COMPLETED'
      and entry.treating_provider_id = 'f6600000-0000-0000-0000-000000000001'
      and entry.recorded_by = 'f6100000-0000-0000-0000-000000000001'
      and entry.encounter_id = (select (payload->>'encounter_id')::uuid from tev_result where seq = 1)
      and entry.charge_id = (select (payload->>'charge_id')::uuid from tev_result where seq = 1)
   from public.tooth_clinical_entries as entry
   where entry.id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 1)),
  'the treatment entry is bound to the managed visit, the confirmed charge, and the signed-in dentist'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entry_surfaces as surface
   where surface.entry_id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 1)),
  2,
  'the treatment entry records both treated surfaces'
);
select extensions.is(
  (select detail.feature_code from public.tooth_clinical_entry_details as detail
   where detail.entry_id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 1)),
  'RESTORATION',
  'the restoration material detail is persisted under its matching feature code'
);
select extensions.is(
  (select charge.provider_id from public.charges as charge
   where charge.id = (select (payload->>'charge_id')::uuid from tev_result where seq = 1)),
  'f6600000-0000-0000-0000-000000000001'::uuid,
  'the confirmed charge is attributed to the signed-in dentist provider'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_finding_resolutions
   where finding_entry_id = 'f6b00000-0000-0000-0000-000000000001'),
  1,
  'the exact named caries finding is resolved'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_finding_resolutions
   where finding_entry_id = 'f6b00000-0000-0000-0000-000000000002'),
  0,
  'the unrelated caries on another tooth remains active and unresolved'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_events
   where procedure_case_id = (select (payload->>'procedure_case_id')::uuid from tev_result where seq = 1)
     and event_type = 'TREATMENT'),
  1,
  'a performed treatment appends one dated TREATMENT case event'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id='f6200000-0000-0000-0000-000000000001'
     and action='procedure.case.treatment_event.recorded'),
  1,
  'the treatment event appends exactly one attributable clinical audit event'
);

-- ---------------------------------------------------------------------------
-- Idempotent retry, and a different payload under the same key
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
insert into tev_result (seq, payload)
select 2, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',
  null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array['f6b00000-0000-0000-0000-000000000001'::uuid],
  '{"toothCodes":["16"],"surfaces":["O","M"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false},"note":"Synthetic composite restoration"}'::jsonb,
  250000,null,null,'f6e00000-0000-0000-0000-000000000101');
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array['f6b00000-0000-0000-0000-000000000001'::uuid],'{"toothCodes":["16"],"surfaces":["O","M"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false},"note":"Synthetic composite restoration"}'::jsonb,999999,null,null,'f6e00000-0000-0000-0000-000000000101')$$,
  'P0001','idempotency conflict','the same request key with a different confirmed amount is refused'
);
reset role;

select extensions.ok(
  (select (select payload->>'procedure_case_id' from tev_result where seq = 2) = (select payload->>'procedure_case_id' from tev_result where seq = 1)
      and (select payload->>'charge_id' from tev_result where seq = 2) = (select payload->>'charge_id' from tev_result where seq = 1)
      and (select (payload->>'replayed')::boolean from tev_result where seq = 2)),
  'a replayed request key returns the original case and charge and reports itself as a replay'
);
select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  1,
  'a duplicate submission posts no second charge'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id='f6200000-0000-0000-0000-000000000001' and kind='TREATMENT'),
  1,
  'a duplicate submission records no second treatment'
);

-- ---------------------------------------------------------------------------
-- Root canal state, missing-to-implant transition, immediate payment
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
insert into tev_result (seq, payload)
select 3, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003',
  null,null,null,'COMPLETED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array[]::uuid[],
  '{"toothCodes":["47"],"detail":{"code":"ROOT_CANAL","state":"endo-filling"}}'::jsonb,
  400000,
  ('{"paymentMethodId":"' || (select value from tev_scalar where seq = 0) || '","amountCentavos":"400000","paymentDate":"' || (timezone('Asia/Manila', statement_timestamp()))::date || '"}')::jsonb,
  null,'f6e00000-0000-0000-0000-000000000102');
insert into tev_result (seq, payload)
select 4, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000004',
  null,null,null,'COMPLETED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array['f6b00000-0000-0000-0000-000000000003'::uuid],
  '{"toothCodes":["46"],"detail":{"code":"IMPLANT"}}'::jsonb,
  900000,
  ('{"paymentMethodId":"' || (select value from tev_scalar where seq = 0) || '","amountCentavos":"300000","paymentDate":"' || (timezone('Asia/Manila', statement_timestamp()))::date || '"}')::jsonb,
  '[{"dueDate":"2026-10-01","expectedCentavos":"300000"},{"dueDate":"2026-11-01","expectedCentavos":"300000"}]'::jsonb,
  'f6e00000-0000-0000-0000-000000000103');
reset role;

select extensions.is(
  (select detail.detail->>'state' from public.tooth_clinical_entry_details as detail
   where detail.entry_id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 3)),
  'endo-filling',
  'the root-canal anatomical state is preserved on the canonical entry'
);
select extensions.ok(
  (select payload->>'case_status' = 'COMPLETED'
      and payload->>'paid_centavos' = '400000'
      and payload->>'balance_centavos' = '0'
      and payload->>'payment_id' is not null
      and payload->>'payment_allocation_id' is not null
   from tev_result where seq = 3),
  'a full immediate payment closes the case balance and is allocated in the same transaction'
);
select extensions.ok(
  (select entry.clinical_code = 'IMPLANT' and entry.tooth_code = '46'
   from public.tooth_clinical_entries as entry
   where entry.id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 4)),
  'an implant treatment is recorded as the canonical IMPLANT entry on the missing tooth'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entry_details
   where entry_id = (select (payload->'clinical_entry_ids'->>0)::uuid from tev_result where seq = 4)),
  0,
  'an implant treatment writes no unsupported feature-detail row'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_finding_resolutions
   where finding_entry_id = 'f6b00000-0000-0000-0000-000000000003'),
  1,
  'the implant resolves the exact active missing finding'
);
select extensions.ok(
  (select payload->>'paid_centavos' = '300000' and payload->>'balance_centavos' = '600000'
      and payload->>'installment_schedule_id' is not null
   from tev_result where seq = 4),
  'a partial immediate payment leaves the remaining balance and records the installment schedule'
);
select extensions.is(
  (select count(*)::integer from public.procedure_installment_schedule_items
   where schedule_id = (select (payload->>'installment_schedule_id')::uuid from tev_result where seq = 4)),
  2,
  'the installment schedule persists both expectation rows for a non-orthodontic procedure'
);

-- ---------------------------------------------------------------------------
-- Orthodontic case: adjustments allocate payment without a second charge
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
insert into tev_result (seq, payload)
select 5, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000002',
  null,null,null,'STARTED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array[]::uuid[],
  '{"toothCodes":["11","21"],"detail":{"code":"ORTHODONTIC","appliance":"BRACKET","movement":"DRIFT"}}'::jsonb,
  8000000,null,null,'f6e00000-0000-0000-0000-000000000104');
reset role;

select extensions.ok(
  (select payload->>'case_status' = 'OPEN' and payload->>'balance_centavos' = '8000000'
   from tev_result where seq = 5),
  'a started orthodontic case confirms its one charge and stays open'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id='f6200000-0000-0000-0000-000000000001' and clinical_code='ORTHODONTIC'),
  2,
  'the orthodontic start records one dated entry per treated tooth'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  format($$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000002',null,%L,%s,'FOLLOW_UP',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["11"],"detail":{"code":"ORTHODONTIC","appliance":"BRACKET","movement":"DRIFT"}}'::jsonb,500000,null,null,'f6e00000-0000-0000-0000-000000000105')$$,
    (select payload->>'procedure_case_id' from tev_result where seq = 5),
    (select payload->>'case_version' from tev_result where seq = 5)),
  '22023','charge already confirmed','a follow-up may not confirm a replacement charge on an already-charged case'
);
select extensions.throws_ok(
  format($$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000002',null,%L,999,'FOLLOW_UP',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["11"],"detail":{"code":"ORTHODONTIC","appliance":"BRACKET","movement":"DRIFT"}}'::jsonb,null,null,null,'f6e00000-0000-0000-0000-000000000106')$$,
    (select payload->>'procedure_case_id' from tev_result where seq = 5)),
  'P0001','stale version','a stale expected case version is refused'
);
insert into tev_result (seq, payload)
select 6, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000002',
  null,
  (select (payload->>'procedure_case_id')::uuid from tev_result where seq = 5),
  (select (payload->>'case_version')::integer from tev_result where seq = 5),
  'FOLLOW_UP',(timezone('Asia/Manila', statement_timestamp()))::date,
  array[]::uuid[],
  '{"toothCodes":["11"],"detail":{"code":"ORTHODONTIC","appliance":"BRACKET","movement":"DRIFT"},"note":"Monthly adjustment"}'::jsonb,
  null,
  ('{"paymentMethodId":"' || (select value from tev_scalar where seq = 0) || '","amountCentavos":"500000","paymentDate":"' || (timezone('Asia/Manila', statement_timestamp()))::date || '"}')::jsonb,
  null,'f6e00000-0000-0000-0000-000000000107');
reset role;

select extensions.ok(
  (select payload->>'case_status' = 'OPEN'
      and not (payload->>'charge_confirmed')::boolean
      and payload->>'charge_id' = (select payload->>'charge_id' from tev_result where seq = 5)
      and payload->>'charge_amount_centavos' = '8000000'
      and payload->>'paid_centavos' = '500000'
      and payload->>'balance_centavos' = '7500000'
   from tev_result where seq = 6),
  'an orthodontic adjustment allocates payment to the same case, adds no charge, and leaves the original amount unchanged'
);
select extensions.is(
  (select count(*)::integer from public.charges
   where organization_id='f6200000-0000-0000-0000-000000000001' and procedure_id='f6700000-0000-0000-0000-000000000002'),
  1,
  'the orthodontic case still carries exactly one confirmed charge after an adjustment'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_events
   where procedure_case_id = (select (payload->>'procedure_case_id')::uuid from tev_result where seq = 5)
     and event_type='FOLLOW_UP'),
  1,
  'the adjustment is recorded as a dated FOLLOW_UP case event'
);

-- An unrelated filling paid in full must not touch the orthodontic balance.
insert into tev_scalar (seq, value)
select 1, private.charge_due((select (payload->>'charge_id')::uuid from tev_result where seq = 5), 'f6200000-0000-0000-0000-000000000001')::text;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
insert into tev_result (seq, payload)
select 7, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',
  null,null,null,'COMPLETED',(timezone('Asia/Manila', statement_timestamp()))::date,
  array[]::uuid[],
  '{"toothCodes":["26"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"amalgam","marginalLeakage":false}}'::jsonb,
  150000,
  ('{"paymentMethodId":"' || (select value from tev_scalar where seq = 0) || '","amountCentavos":"150000","paymentDate":"' || (timezone('Asia/Manila', statement_timestamp()))::date || '"}')::jsonb,
  null,'f6e00000-0000-0000-0000-000000000108');
reset role;

select extensions.is(
  private.charge_due((select (payload->>'charge_id')::uuid from tev_result where seq = 5), 'f6200000-0000-0000-0000-000000000001')::text,
  (select value from tev_scalar where seq = 1),
  'paying an unrelated filling in full leaves the orthodontic case balance unchanged'
);
select extensions.is(
  (select payload->>'balance_centavos' from tev_result where seq = 7),
  '0',
  'the unrelated filling is settled by its own allocation only'
);

-- ---------------------------------------------------------------------------
-- Plan-linked completion delegates to the immutable-design boundary
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
select public.transition_treatment_plan_item_execution('f6300000-0000-0000-0000-000000000001','f6900000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'tev-accept');
select public.transition_treatment_plan_item_execution('f6300000-0000-0000-0000-000000000001','f6900000-0000-0000-0000-000000000001',2,'IN_PROGRESS',null,'tev-start');
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003','f6900000-0000-0000-0000-000000000001','f6a00000-0000-0000-0000-000000000001',1,'COMPLETED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["36"],"detail":{"code":"TOOTH_STATE","state":"EXTRACTION_WOUND"}}'::jsonb,450000,null,null,'f6e00000-0000-0000-0000-000000000109')$$,
  '22023','completion does not match immutable item design','a plan-linked completion that contradicts the frozen design is refused by the delegated boundary'
);
insert into tev_result (seq, payload)
select 8, public.record_treatment_event_v2(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000003',
  'f6900000-0000-0000-0000-000000000001','f6a00000-0000-0000-0000-000000000001',1,'COMPLETED',
  (timezone('Asia/Manila', statement_timestamp()))::date,
  array[]::uuid[],
  '{"toothCodes":["36"],"detail":{"code":"ROOT_CANAL","state":"endo-filling"}}'::jsonb,
  450000,null,null,'f6e00000-0000-0000-0000-000000000110');
reset role;

select extensions.ok(
  (select payload->>'case_status' = 'COMPLETED' and (payload->>'charge_confirmed')::boolean
      and payload->>'charge_amount_centavos' = '450000'
   from tev_result where seq = 8),
  'the plan-linked completion confirms the case first charge through the delegated boundary'
);
select extensions.is(
  (select current_state from public.treatment_plan_item_executions where item_id='f6900000-0000-0000-0000-000000000001'),
  'COMPLETED',
  'the delegated completion advances the plan execution atomically'
);
select extensions.is(
  (select clinical_code from public.tooth_clinical_entries where treatment_plan_item_id='f6900000-0000-0000-0000-000000000001'),
  'ROOT_CANAL',
  'the delegated completion materializes exactly the frozen clinical code'
);

-- ---------------------------------------------------------------------------
-- Atomic rollback of a late failure
-- ---------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  6,
  'six confirmed charges exist before the rollback proof'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  format($$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["17"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,100000,'{"paymentMethodId":"%s","amountCentavos":"500000","paymentDate":"%s"}'::jsonb,null,'f6e00000-0000-0000-0000-000000000111')$$,
    (select value from tev_scalar where seq = 0),
    (timezone('Asia/Manila', statement_timestamp()))::date::text),
  'P0001','allocation exceeds adjusted due','an over-allocated immediate payment fails the whole treatment event'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  6,
  'the failed treatment event rolled back its charge'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id='f6200000-0000-0000-0000-000000000001' and tooth_code='17'),
  0,
  'the failed treatment event rolled back its clinical entry'
);
select extensions.is(
  (select count(*)::integer from public.payments
   where organization_id='f6200000-0000-0000-0000-000000000001'
     and idempotency_key='treatment-event-pay-f6e00000-0000-0000-0000-000000000111'),
  0,
  'the failed treatment event rolled back the payment it had already recorded'
);

-- ---------------------------------------------------------------------------
-- Charge immutability at the ledger
-- ---------------------------------------------------------------------------

select extensions.ok(
  exists (
    select 1 from pg_trigger as trigger
    where trigger.tgrelid = 'public.charges'::regclass
      and trigger.tgname = 'charges_append_only'
      and not trigger.tgisinternal
  ),
  'a confirmed charge amount cannot be updated or deleted at the table itself'
);
select extensions.throws_ok(
  format($$update public.charges set amount_centavos = 1 where id = %L$$,
    (select payload->>'charge_id' from tev_result where seq = 1)),
  '23514',
  'billing ledger entries are append-only',
  'even a privileged update of a confirmed charge amount is refused'
);

-- ---------------------------------------------------------------------------
-- Negative authorization
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["18"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000201')$$,
  '42501','not authorized','a receptionist may not record a treatment or confirm a procedure charge'
);
-- The same receptionist may still record and allocate a payment: that is a
-- ledger event, and it must open no clinical encounter and no case event.
insert into tev_scalar (seq, value)
select 2, (select payment_id::text from public.record_payment(
  'f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001',
  (select value::uuid from tev_scalar where seq = 0),
  100000::bigint, null, 'tev-reception-pay'));
insert into tev_scalar (seq, value)
select 3, (select allocation_id::text from public.allocate_payment(
  'f6300000-0000-0000-0000-000000000001',
  (select value::uuid from tev_scalar where seq = 2),
  (select (payload->>'charge_id')::uuid from tev_result where seq = 5),
  'f6500000-0000-0000-0000-000000000001', 100000::bigint, 'tev-reception-alloc'));
reset role;

select extensions.ok(
  (select value is not null from tev_scalar where seq = 3),
  'a receptionist may allocate a payment to the dentist-confirmed procedure charge'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id='f6200000-0000-0000-0000-000000000001'
     and created_by='f6100000-0000-0000-0000-000000000003'),
  0,
  'the receptionist payment started no clinical visit'
);
select extensions.is(
  (select count(*)::integer from public.procedure_case_events
   where organization_id='f6200000-0000-0000-0000-000000000001'
     and recorded_by='f6100000-0000-0000-0000-000000000003'),
  0,
  'the receptionist payment recorded no treatment or follow-up'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["18"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000202')$$,
  '42501','not authorized','an owner with no active provider link may not record a treatment'
);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000003','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["18"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000203')$$,
  '42501','not authorized','a cross-tenant patient is refused'
);
select set_config('request.jwt.claim.sub','f6100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.record_treatment_event_v2('f6300000-0000-0000-0000-000000000001','f6500000-0000-0000-0000-000000000001','f6700000-0000-0000-0000-000000000001',null,null,null,'PERFORMED',(timezone('Asia/Manila', statement_timestamp()))::date,array[]::uuid[],'{"toothCodes":["18"],"surfaces":["O"],"detail":{"code":"RESTORATION","restorationType":"none","material":"composite","marginalLeakage":false}}'::jsonb,250000,null,null,'f6e00000-0000-0000-0000-000000000204')$$,
  '42501','not authorized','a foreign-tenant dentist may not treat at another organization branch'
);
reset role;

-- ---------------------------------------------------------------------------
-- Nothing refused left anything behind
-- ---------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000001'),
  6,
  'every refused authorization attempt posted no charge'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id='f6200000-0000-0000-0000-000000000001' and tooth_code='18'),
  0,
  'every refused authorization attempt recorded no treatment'
);
select extensions.is(
  (select count(*)::integer from public.charges where organization_id='f6200000-0000-0000-0000-000000000002'),
  0,
  'the foreign tenant was charged nothing'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where organization_id='f6200000-0000-0000-0000-000000000002'),
  0,
  'the foreign tenant recorded nothing'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
