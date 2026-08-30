begin;
select extensions.no_plan();

select extensions.has_table('public', 'procedure_cases', 'procedure cases table exists');
select extensions.has_table('public', 'procedure_case_events', 'procedure case event log exists');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.procedure_cases'::regclass), 'procedure cases have RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.procedure_case_events'::regclass), 'procedure case events have RLS enabled');
select extensions.ok(
  not has_table_privilege('authenticated', 'public.procedure_cases', 'select')
  and not has_table_privilege('authenticated', 'public.procedure_case_events', 'insert'),
  'authenticated has no direct procedure-case table privileges'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('f4010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','case-owner@synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug) values
 ('f4020000-0000-0000-0000-000000000001','Case A Inc','Case A','case-a'),
 ('f4020000-0000-0000-0000-000000000002','Case B Inc','Case B','case-b');
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values
 ('f4030000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','Case A Main','case-a-main','CA','1 Synthetic','Test','Test'),
 ('f4030000-0000-0000-0000-000000000002','f4020000-0000-0000-0000-000000000002','Case B Main','case-b-main','CB','1 Synthetic','Test','Test');
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values
 ('f4040000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','CA-1','Synthetic','A','1990-01-01','f4030000-0000-0000-0000-000000000001'),
 ('f4040000-0000-0000-0000-000000000002','f4020000-0000-0000-0000-000000000002','CB-1','Synthetic','B','1990-01-01','f4030000-0000-0000-0000-000000000002');
insert into public.procedures(id,organization_id,code,name,status) values
 ('f4050000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','CA1','Synthetic case procedure','active'),
 ('f4050000-0000-0000-0000-000000000002','f4020000-0000-0000-0000-000000000002','CB1','Synthetic case procedure','active');
insert into public.treatment_plans(id,organization_id,patient_id,title,status,version,created_by) values
 ('f4060000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','f4040000-0000-0000-0000-000000000001','Synthetic case plan','DRAFT',1,'f4010000-0000-0000-0000-000000000001');
insert into public.treatment_plan_items(id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values
 ('f4070000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','f4060000-0000-0000-0000-000000000001',1,'f4050000-0000-0000-0000-000000000001','11','Synthetic detail',1000);
select extensions.is((select sequence_no from public.treatment_plan_items where id='f4070000-0000-0000-0000-000000000001'), 1, 'existing writer compatibility derives sequence from line number');

select extensions.throws_ok(
  $$insert into public.procedure_cases (organization_id, patient_id, origin_branch_id, procedure_id, opened_by)
    values ('f4020000-0000-0000-0000-000000000001','f4040000-0000-0000-0000-000000000002','f4030000-0000-0000-0000-000000000001','f4050000-0000-0000-0000-000000000001','f4010000-0000-0000-0000-000000000001')$$,
  '23503', null, 'a case cannot cross tenant patient ownership'
);
insert into public.procedure_cases(id,organization_id,patient_id,origin_branch_id,procedure_id,treatment_plan_item_id,opened_by) values
 ('f4080000-0000-0000-0000-000000000001','f4020000-0000-0000-0000-000000000001','f4040000-0000-0000-0000-000000000001','f4030000-0000-0000-0000-000000000001','f4050000-0000-0000-0000-000000000001','f4070000-0000-0000-0000-000000000001','f4010000-0000-0000-0000-000000000001');
select extensions.ok(exists(select 1 from public.procedure_cases where id='f4080000-0000-0000-0000-000000000001'), 'same-tenant case accepts its plan item');
select extensions.throws_ok(
  $$update public.treatment_plan_items set surfaces=array['X']::text[] where id='f4070000-0000-0000-0000-000000000001'$$,
  '23514', null, 'invalid renderer-independent surface is rejected'
);
update public.treatment_plan_items set priority='HIGH', sequence_no=1, surfaces=array['O','M']::text[], notes='Synthetic detail' where id='f4070000-0000-0000-0000-000000000001';
update public.treatment_plans set status='ACKNOWLEDGED',version=2 where id='f4060000-0000-0000-0000-000000000001';
select extensions.throws_ok(
  $$update public.treatment_plan_items set notes = 'changed' where id = 'f4070000-0000-0000-0000-000000000001'$$,
  'P0001', 'treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately', 'acknowledged structured plan details remain frozen'
);
insert into public.procedure_case_events(organization_id,procedure_case_id,event_type,occurred_at,recorded_by) values
 ('f4020000-0000-0000-0000-000000000001','f4080000-0000-0000-0000-000000000001','TREATMENT',statement_timestamp(),'f4010000-0000-0000-0000-000000000001');
select extensions.throws_ok(
  $$update public.procedure_case_events set event_type='CORRECTION' where procedure_case_id='f4080000-0000-0000-0000-000000000001'$$,
  'P0001', 'procedure_case_events are append-only', 'case history cannot be rewritten'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;
rollback;
