begin;

select extensions.no_plan();

-- Synthetic-only P16-03 graph, GUC-as-postgres. dentist-a is the positive
-- writer and generator (DENTIST org-wide: patient.clinical.write/read +
-- document.generate + document.view); assistant-a holds clinical read only and
-- no document permission; reception-a holds document.view only (RECEPTIONIST);
-- dentist-b is a foreign-organization DENTIST. The acknowledged plan P1 carries
-- items, an alternative, a discussion, and a drawing so the TREATMENT_PLAN
-- snapshot can be asserted exhaustively.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1603.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@p1603.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1603.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1603.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('d7200000-0000-0000-0000-000000000001','P1603 Synthetic A Inc.','P1603 A','p1603-a'),
  ('d7200000-0000-0000-0000-000000000002','P1603 Synthetic B Inc.','P1603 B','p1603-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('d7300000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','P1603 A Main','p1603-a-main','P1603-A','1 Synthetic St','Test City','Test Province'),
  ('d7300000-0000-0000-0000-000000000003','d7200000-0000-0000-0000-000000000002','P1603 B Main','p1603-b-main','P1603-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('d7400000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','d7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('d7400000-0000-0000-0000-000000000002','d7200000-0000-0000-0000-000000000001','d7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('d7400000-0000-0000-0000-000000000003','d7200000-0000-0000-0000-000000000001','d7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('d7400000-0000-0000-0000-000000000005','d7200000-0000-0000-0000-000000000002','d7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('d7200000-0000-0000-0000-000000000001','d7300000-0000-0000-0000-000000000001','d7400000-0000-0000-0000-000000000001','active'),
  ('d7200000-0000-0000-0000-000000000001','d7300000-0000-0000-0000-000000000001','d7400000-0000-0000-0000-000000000002','active'),
  ('d7200000-0000-0000-0000-000000000001','d7300000-0000-0000-0000-000000000001','d7400000-0000-0000-0000-000000000003','active'),
  ('d7200000-0000-0000-0000-000000000002','d7300000-0000-0000-0000-000000000003','d7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('d7200000-0000-0000-0000-000000000001'::uuid,'d7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'d7100000-0000-0000-0000-000000000001'::uuid),
  ('d7200000-0000-0000-0000-000000000001'::uuid,'d7400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'d7100000-0000-0000-0000-000000000001'::uuid),
  ('d7200000-0000-0000-0000-000000000001'::uuid,'d7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'d7300000-0000-0000-0000-000000000001'::uuid,'d7100000-0000-0000-0000-000000000003'::uuid),
  ('d7200000-0000-0000-0000-000000000002'::uuid,'d7400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'d7100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('d7500000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','P1603-A-1','Patient','A',date '1990-01-01','d7300000-0000-0000-0000-000000000001'),
  ('d7500000-0000-0000-0000-000000000002','d7200000-0000-0000-0000-000000000002','P1603-B-1','Patient','B',date '1991-01-01',null);
-- Plan authorship derives the treating provider from the signed-in actor, so
-- dentist A1 carries an active provider link at P1603 A Main.
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('d9200000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','d7100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('d9200000-0000-0000-0000-000000000004','d7200000-0000-0000-0000-000000000002',null,'Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('d7200000-0000-0000-0000-000000000001','d9200000-0000-0000-0000-000000000001','d7300000-0000-0000-0000-000000000001',true);
insert into public.procedures (id, organization_id, code, name, status) values
  ('d9300000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','PROC_A1','Synthetic Procedure A1','active');

create temp table d7_plans (seq integer primary key, id uuid);
create temp table d7_documents (seq integer primary key, id uuid);
grant select on d7_plans to authenticated;
grant select on d7_documents to authenticated;

-- The TREATMENT_PLAN extension adds no grantable object: the document RPC grant
-- set and definer set are unchanged from P11-03.
select extensions.ok(
  has_function_privilege('authenticated','public.generate_document(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('anon','public.generate_document(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.generate_document(uuid,uuid,text,jsonb)','execute'),
  'only authenticated holds the unchanged generate_document grant'
);
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.generate_document(uuid,uuid,text,jsonb)'::regprocedure,
  'public.list_documents(uuid,uuid,text)'::regprocedure,
  'public.get_document_snapshot(uuid,uuid)'::regprocedure,
  'private.has_document_permission_at_branch(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),4,'the four P11-03 definers still pin an empty search path');

-- Build an acknowledged plan through the reviewed P16-02 boundary.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_treatment_plan('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','Full mouth restoration')),1,'dentist A creates a DRAFT plan at version one');
reset role;
insert into d7_plans (seq, id)
select 1, plan.id
from public.treatment_plans as plan
where plan.organization_id='d7200000-0000-0000-0000-000000000001'
  and plan.title='Full mouth restoration';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000001',true);
select extensions.is((select line_no from public.add_treatment_plan_item('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),1,'d9300000-0000-0000-0000-000000000001','26','Composite filling on 26.',2500.00)),1,'an item with an org procedure, FDI tooth, and fee is appended at line one');
select extensions.is((select line_no from public.add_treatment_plan_item('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),1,null,'27','Crown on 27.',null)),2,'a second item without a procedure is appended at line two');
select extensions.is((select alternative_no from public.add_treatment_plan_alternative('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),1,'Extraction and implant alternative.')),1,'an alternative is appended at number one');
select extensions.ok((select discussed_at is not null from public.add_treatment_plan_discussion_v2('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),'Case discussion','Patient prefers conservative care.')),'a discussion captures discussed_at on the DRAFT plan');
select extensions.is((select version from public.save_treatment_plan_drawing('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),1,'{"strokes":[{"points":[{"x":1,"y":2},{"x":3,"y":4}]}],"width":320,"height":200}'::jsonb)),1,'a renderer-independent drawing is saved at version one');
select extensions.is((select version from public.present_treatment_plan('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),1)),2,'presenting the DRAFT plan moves it to PRESENTED at version two');
select extensions.is((select version from public.acknowledge_treatment_plan('d7300000-0000-0000-0000-000000000001',(select id from d7_plans where seq=1),2)),3,'acknowledging the PRESENTED plan moves it to ACKNOWLEDGED at version three');
reset role;
select extensions.ok((select status='ACKNOWLEDGED' and version=3 from public.treatment_plans where id=(select id from d7_plans where seq=1)),'the plan is ACKNOWLEDGED at version three before generation');

-- generate_document TREATMENT_PLAN: the acknowledged plan is snapshotted with
-- its header, items, alternative, discussion, and drawing canvas.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true,'alternatives',true,'discussions',true,'drawing',true))),1,'a dentist generates the TREATMENT_PLAN document at version one');
reset role;
insert into d7_documents (seq, id)
select 1, doc.id
from public.documents as doc
where doc.organization_id='d7200000-0000-0000-0000-000000000001'
  and doc.document_type='TREATMENT_PLAN'
  and doc.patient_id='d7500000-0000-0000-0000-000000000001';
select extensions.ok((select data_snapshot->'plan'->>'title'='Full mouth restoration' and data_snapshot->'plan'->>'status'='ACKNOWLEDGED' and data_snapshot->'plan'->>'version'='3' and data_snapshot->'plan'->>'planId'=(select id from d7_plans where seq=1)::text from public.documents where id=(select id from d7_documents where seq=1)),'the snapshot carries the acknowledged plan header with title, status, version, and plan id');
select extensions.is((select jsonb_array_length(data_snapshot->'items') from public.documents where id=(select id from d7_documents where seq=1)),2,'the snapshot carries both plan items');
select extensions.ok((select data_snapshot->'items'->0->>'lineNo'='1' and data_snapshot->'items'->0->>'description'='Composite filling on 26.' and data_snapshot->'items'->0->>'toothCode'='26' and data_snapshot->'items'->0->>'estimatedFeeCentavos'='250000' and not (data_snapshot->'items'->0 ? 'estimatedFee') and data_snapshot->'items'->0->>'procedureId'='d9300000-0000-0000-0000-000000000001' from public.documents where id=(select id from d7_documents where seq=1)),'the items section carries line, description, tooth, and the exact centavo estimate only');
select extensions.is((select jsonb_array_length(data_snapshot->'alternatives') from public.documents where id=(select id from d7_documents where seq=1)),1,'the snapshot carries the alternative');
select extensions.ok((select data_snapshot->'alternatives'->0->>'summary'='Extraction and implant alternative.' from public.documents where id=(select id from d7_documents where seq=1)),'the alternatives section carries the bounded summary');
select extensions.is((select jsonb_array_length(data_snapshot->'discussions') from public.documents where id=(select id from d7_documents where seq=1)),1,'the snapshot carries the discussion');
select extensions.ok((select data_snapshot->'discussions'->0->>'context'='Case discussion' and data_snapshot->'discussions'->0->>'discussedBy'='d7100000-0000-0000-0000-000000000001' and data_snapshot->'discussions'->0->>'treatingProviderId'='d9200000-0000-0000-0000-000000000001' and data_snapshot->'discussions'->0->>'discussedAt' is not null from public.documents where id=(select id from d7_documents where seq=1)),'the discussion section carries dentist, time, and context');
select extensions.ok(not exists (select 1 from jsonb_array_elements((select data_snapshot->'discussions' from public.documents where id=(select id from d7_documents where seq=1))) as discussion where discussion ? 'notes'),'the discussion snapshot never carries free-form notes bodies');
select extensions.ok((select data_snapshot->'drawing'->'drawing'->'width' = '320' and data_snapshot->'drawing'->'drawing'->'strokes'->0->'points'->0->>'x' = '1' and data_snapshot->'drawing'->>'version' = '1' from public.documents where id=(select id from d7_documents where seq=1)),'the drawing canvas jsonb is included verbatim with its version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='d7200000-0000-0000-0000-000000000001' and action='document.generated' and metadata->>'document_type'='TREATMENT_PLAN' and metadata->'include_set'->>'planId'=(select id from d7_plans where seq=1)::text and metadata->'include_set'->>'items'='true'),1,'generation appends one audit event with the TREATMENT_PLAN document_type and include_set metadata');

-- Reproducibility: a second generation produces a byte-identical snapshot, and
-- generation never mutates the acknowledged plan.
select extensions.is((select version from public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true,'alternatives',true,'discussions',true,'drawing',true))),1,'a second generation reproduces the document at version one');
select extensions.ok((select first.data_snapshot = second.data_snapshot
  from public.documents as first
  join public.documents as second
    on second.id <> first.id
   and second.document_type = 'TREATMENT_PLAN'
   and second.patient_id = 'd7500000-0000-0000-0000-000000000001'
  where first.id = (select id from d7_documents where seq=1)),'a re-generation yields a jsonb-identical reproducible snapshot');
select extensions.ok((select status='ACKNOWLEDGED' and version=3 and title='Full mouth restoration' from public.treatment_plans where id=(select id from d7_plans where seq=1)),'generation leaves the acknowledged plan untouched');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='d7200000-0000-0000-0000-000000000001' and action like 'treatment.plan.%'),8,'generation appends no treatment-plan mutation audit event (the eight lifecycle audits from the fixture are unchanged)');
select extensions.throws_ok($$update public.treatment_plans set title='rewrite' where id=(select id from d7_plans where seq=1)$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','the acknowledged plan remains immutable under the database trigger even after being snapshotted');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='d7200000-0000-0000-0000-000000000001' and action='document.generated' and metadata->>'document_type'='TREATMENT_PLAN'),2,'two TREATMENT_PLAN generations append exactly two document.generated audit events');

-- The CHECK constraint admits all four document types directly.
insert into public.documents (id, organization_id, branch_id, patient_id, document_type, template_version, data_snapshot, include_set, status, generated_by) values
  ('d7600000-0000-0000-0000-000000000001'::uuid, 'd7200000-0000-0000-0000-000000000001'::uuid, 'd7300000-0000-0000-0000-000000000001'::uuid, 'd7500000-0000-0000-0000-000000000001'::uuid, 'PATIENT_RECORD_SUMMARY', 'v1', '{}'::jsonb, '{}'::jsonb, 'GENERATED', 'd7100000-0000-0000-0000-000000000001'::uuid),
  ('d7600000-0000-0000-0000-000000000002'::uuid, 'd7200000-0000-0000-0000-000000000001'::uuid, 'd7300000-0000-0000-0000-000000000001'::uuid, 'd7500000-0000-0000-0000-000000000001'::uuid, 'APPOINTMENT_SLIP', 'v1', '{}'::jsonb, '{}'::jsonb, 'GENERATED', 'd7100000-0000-0000-0000-000000000001'::uuid),
  ('d7600000-0000-0000-0000-000000000003'::uuid, 'd7200000-0000-0000-0000-000000000001'::uuid, 'd7300000-0000-0000-0000-000000000001'::uuid, 'd7500000-0000-0000-0000-000000000001'::uuid, 'REFERRAL_LETTER', 'v1', '{}'::jsonb, '{}'::jsonb, 'GENERATED', 'd7100000-0000-0000-0000-000000000001'::uuid),
  ('d7600000-0000-0000-0000-000000000004'::uuid, 'd7200000-0000-0000-0000-000000000001'::uuid, 'd7300000-0000-0000-0000-000000000001'::uuid, 'd7500000-0000-0000-0000-000000000001'::uuid, 'TREATMENT_PLAN', 'v1', '{}'::jsonb, '{}'::jsonb, 'GENERATED', 'd7100000-0000-0000-0000-000000000001'::uuid);
select extensions.is((select count(*)::integer from public.documents where id in (
  'd7600000-0000-0000-0000-000000000001','d7600000-0000-0000-0000-000000000002',
  'd7600000-0000-0000-0000-000000000003','d7600000-0000-0000-0000-000000000004')),4,'the documents CHECK admits all four document types including TREATMENT_PLAN');
select extensions.throws_ok($$insert into public.documents (id, organization_id, branch_id, patient_id, document_type, template_version, data_snapshot, include_set, status, generated_by) values ('d7600000-0000-0000-0000-000000000005','d7200000-0000-0000-0000-000000000001','d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','PRESCRIPTION','v1','{}'::jsonb,'{}'::jsonb,'GENERATED','d7100000-0000-0000-0000-000000000001')$$,'23514',null,'the documents CHECK still rejects an unapproved document type');

-- Section gating: generating with a subset of the include set omits the
-- unselected sections while the plan header is always present.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'drawing',true))),1,'a TREATMENT_PLAN document can be generated with a drawing-only include set');
reset role;
select extensions.ok((select data_snapshot ? 'plan' and data_snapshot ? 'drawing' and not (data_snapshot ? 'items') and not (data_snapshot ? 'alternatives') and not (data_snapshot ? 'discussions') from public.documents where document_type='TREATMENT_PLAN' and include_set ? 'drawing' and not (include_set ? 'items')),'unselected plan sections are absent from the snapshot while the plan header is always present');

-- generate_document validation for the TREATMENT_PLAN type.
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN','{"items":true}'::jsonb)$$,'22023','invalid input','a TREATMENT_PLAN include set without a planId is rejected');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'demographics',true))$$,'22023','invalid input','an unknown TREATMENT_PLAN include-set key is rejected');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items','yes'))$$,'22023','invalid input','a non-boolean TREATMENT_PLAN section value is rejected');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId','not-a-uuid','items',true))$$,'22023','invalid input','a malformed planId is rejected');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId','00000000-0000-0000-0000-000000000000','items',true))$$,'42501','not authorized','a plan id that does not exist in the tenant is denied');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000002','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true))$$,'42501','not authorized','a foreign-organization patient is denied on TREATMENT_PLAN generation');
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'billing',true))$$,'22023','invalid input','a billing section is not part of the TREATMENT_PLAN allowlist');

-- Permission denials: clinical-only and document.view-only users cannot
-- generate, and tenant isolation holds for the foreign dentist.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true))$$,'42501','not authorized','a clinical-read-only assistant without document.generate cannot generate the plan document');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true))$$,'42501','not authorized','a receptionist with document.view only cannot generate the plan document');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.generate_document('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001','TREATMENT_PLAN',jsonb_build_object('planId',(select id from d7_plans where seq=1),'items',true))$$,'42501','not authorized','a foreign-organization dentist cannot generate another tenant plan document');
reset role;

-- The TREATMENT_PLAN documents surface through the reviewed read boundary.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d7100000-0000-0000-0000-000000000001',true);
select extensions.is((select count(*)::integer from public.list_documents('d7300000-0000-0000-0000-000000000001','d7500000-0000-0000-0000-000000000001') where document_type='TREATMENT_PLAN'),4,'list_documents returns every generated TREATMENT_PLAN document without the snapshot body');
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
