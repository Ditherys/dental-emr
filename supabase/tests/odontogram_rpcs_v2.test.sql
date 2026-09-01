begin;
select extensions.no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('e5010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@o5.synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
 ('e5010000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception@o5.synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
 ('e5010000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist@o5.synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
 ('e5010000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-no-branch@o5.synthetic.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations(id,legal_name,business_name,slug) values
 ('e5020000-0000-0000-0000-000000000001','O5 Synthetic A Inc','O5 Synthetic A','o5-synthetic-a'),
 ('e5020000-0000-0000-0000-000000000002','O5 Synthetic B Inc','O5 Synthetic B','o5-synthetic-b');
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values
 ('e5030000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','A Main','o5-a-main','O5A','1 Synthetic','Test City','Test Province'),
 ('e5030000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000002','B Main','o5-b-main','O5B','2 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values
 ('e5040000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000001','active',statement_timestamp()),
 ('e5040000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000002','active',statement_timestamp()),
 ('e5040000-0000-0000-0000-000000000003','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000003','active',statement_timestamp()),
 ('e5040000-0000-0000-0000-000000000004','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values
 ('e5020000-0000-0000-0000-000000000001','e5030000-0000-0000-0000-000000000001','e5040000-0000-0000-0000-000000000001','active'),
 ('e5020000-0000-0000-0000-000000000001','e5030000-0000-0000-0000-000000000001','e5040000-0000-0000-0000-000000000002','active'),
 ('e5020000-0000-0000-0000-000000000001','e5030000-0000-0000-0000-000000000001','e5040000-0000-0000-0000-000000000003','active');
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select 'e5020000-0000-0000-0000-000000000001',assignment.member_id,role.id,assignment.branch_id,assignment.user_id
from (values
 ('e5040000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,null::uuid,'e5010000-0000-0000-0000-000000000001'::uuid),
 ('e5040000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'e5030000-0000-0000-0000-000000000001'::uuid,'e5010000-0000-0000-0000-000000000001'::uuid),
 ('e5040000-0000-0000-0000-000000000003'::uuid,'DENTIST'::text,'e5030000-0000-0000-0000-000000000001'::uuid,'e5010000-0000-0000-0000-000000000001'::uuid),
 ('e5040000-0000-0000-0000-000000000004'::uuid,'ADMIN'::text,null::uuid,'e5010000-0000-0000-0000-000000000001'::uuid)
) assignment(member_id,role_code,branch_id,user_id)
join public.roles role on role.organization_id is null and role.code=assignment.role_code;
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values
 ('e5050000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','O5-A-1','Synthetic','Patient A','1990-01-01','e5030000-0000-0000-0000-000000000001'),
 ('e5050000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000002','O5-B-1','Synthetic','Patient B','1991-01-01','e5030000-0000-0000-0000-000000000002');
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values
 ('e5060000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000001','Synthetic','Dentist','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values
 ('e5020000-0000-0000-0000-000000000001','e5060000-0000-0000-0000-000000000001','e5030000-0000-0000-0000-000000000001',true);
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values
 ('e5060000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000001','e5010000-0000-0000-0000-000000000003','Linked','Dentist','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values
 ('e5020000-0000-0000-0000-000000000001','e5060000-0000-0000-0000-000000000002','e5030000-0000-0000-0000-000000000001',true);
insert into public.procedures(id,organization_id,code,name,status) values
 ('e5070000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','O5_CROWN','Synthetic Crown','active');
insert into public.treatment_plans(id,organization_id,patient_id,title,status,version,created_by) values
 ('e5080000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','Synthetic acknowledged plan','DRAFT',1,'e5010000-0000-0000-0000-000000000001'),
 ('e5080000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','Synthetic bridge draft','DRAFT',1,'e5010000-0000-0000-0000-000000000001'),
 ('e5080000-0000-0000-0000-000000000003','e5020000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','Synthetic implant draft','DRAFT',1,'e5010000-0000-0000-0000-000000000001');
insert into public.treatment_plan_items(id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values
 ('e5090000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',1,'e5070000-0000-0000-0000-000000000001','26','Synthetic crown',100000),
 ('e5090000-0000-0000-0000-000000000002','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',2,'e5070000-0000-0000-0000-000000000001','27','Synthetic cancellation',100000),
 ('e5090000-0000-0000-0000-000000000003','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',3,'e5070000-0000-0000-0000-000000000001','28','Synthetic extraction',100000),
 ('e5090000-0000-0000-0000-000000000004','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',4,'e5070000-0000-0000-0000-000000000001','25','Synthetic root canal',100000),
 ('e5090000-0000-0000-0000-000000000005','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',5,'e5070000-0000-0000-0000-000000000001','24','Synthetic bridge',100000),
 ('e5090000-0000-0000-0000-000000000006','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',6,'e5070000-0000-0000-0000-000000000001','23','Synthetic implant',100000),
 ('e5090000-0000-0000-0000-000000000007','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000001',7,'e5070000-0000-0000-0000-000000000001','22','Synthetic rollback',100000),
 ('e5090000-0000-0000-0000-000000000008','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000002',1,'e5070000-0000-0000-0000-000000000001','14','Synthetic bridge design',100000),
 ('e5090000-0000-0000-0000-000000000009','e5020000-0000-0000-0000-000000000001','e5080000-0000-0000-0000-000000000003',1,'e5070000-0000-0000-0000-000000000001','36','Synthetic implant design',100000);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is(
  (select patient_id from public.create_plan_bridge_design(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000005',
    '[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb
  )),
  'e5050000-0000-0000-0000-000000000001'::uuid,
  'bridge design binds to the immutable treatment item and returns patient identity'
);
select extensions.is(
  (select version from public.create_plan_bridge_design(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000007',
    '[{"tooth_fdi":"21","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"22","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"23","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb
  )),
  1,
  'rollback fixture has its own item-bound frozen bridge design'
);
select extensions.is(
  (select patient_id from public.create_plan_implant_design(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000006',
    '[{"tooth_fdi":"23","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"23","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"23","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb
  )),
  'e5050000-0000-0000-0000-000000000001'::uuid,
  'implant plan design persists one complete graph and returns patient identity'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000006' and record_kind='PLAN_DESIGN'),
  3,
  'implant plan design persists fixture, abutment, and crown'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is(
  (select version from public.create_plan_implant_design(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000009',
    '[{"tooth_fdi":"36","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"36","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"36","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb
  )),
  1,
  'standalone draft implant graph is created at version one'
);
reset role;
create temp table o5_plan_implant_root(component_id uuid);
insert into o5_plan_implant_root
select id from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000009' and component_kind='FIXTURE';
grant select on o5_plan_implant_root to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is(
  (select version from public.update_draft_plan_implant_design(
    'e5030000-0000-0000-0000-000000000001',
    (select component_id from o5_plan_implant_root),
    1,
    '[{"tooth_fdi":"36","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"36","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"36","ordinal":3,"component_kind":"ATTACHMENT","attachment_value":"locator","depends_on_ordinal":2}]'::jsonb
  )),
  2,
  'draft implant update atomically replaces the entire graph'
);
reset role;
truncate o5_plan_implant_root;
insert into o5_plan_implant_root
select id from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000009' and component_kind='FIXTURE';
select extensions.ok(
  (select count(*)=3 and bool_and(version=2) and count(*) filter(where component_kind='ATTACHMENT' and attachment_value='locator')=1
   from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000009'),
  'draft implant update leaves exactly the replacement full chain'
);
update public.treatment_plans set status='ACKNOWLEDGED',version=2 where id='e5080000-0000-0000-0000-000000000001';

select extensions.is((select count(*)::integer from public.treatment_plan_item_executions where organization_id='e5020000-0000-0000-0000-000000000001'),9,'item creation atomically bootstraps one PROPOSED projection per item');
select extensions.ok(not exists(select 1 from public.treatment_plan_item_executions e join public.treatment_plan_item_execution_events v on v.organization_id=e.organization_id and v.id=e.current_event_id where e.current_state<>v.to_state or e.item_id<>v.item_id or e.plan_id<>v.plan_id),'projection agrees with its current event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.get_patient_odontogram('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001')$$,'42501','not authorized','receptionist cannot read clinical DTO');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o5-reception-forge')$$,'42501','not authorized','receptionist cannot mutate treatment execution');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.correct_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',1,'PROPOSED','Forged correction','o5-dentist-correct')$$,'42501','not authorized','ordinary dentist lacks patient.clinical.correct');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.get_patient_odontogram('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001')$$,'42501','not authorized','admin without acting-branch patient access is denied');
reset role;

-- The v3 direct entry path is no longer browser-callable: see
-- odontogram_permission_contract.test.sql, which asserts the revoke, and
-- clinical_record_composer.test.sql for the visit-bound replacement. The two
-- calls below still exercise entry, idempotency and lineage mechanics that the
-- retained definition implements, so execute is restored for the duration of
-- this rolled-back transaction only and withdrawn again immediately after.
grant execute on function public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.get_patient_odontogram('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000002')$$,'42501','not authorized','same-branch actor cannot forge a foreign-organization patient');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-00000000ffff',1,'ACCEPTED',null,'o5-foreign-item')$$,'42501','not authorized','unknown or foreign treatment item is safely denied');
select extensions.ok((select data ?& array['entries','bridges','implantChains','periodontalExaminations','legacyReconciliationFlags','treatmentExecutions'] from public.get_patient_odontogram('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001')),'DTO includes every bounded domain family');

select extensions.is((select version from public.record_tooth_clinical_entry_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','16',array['O'],'FINDING','CARIES','EXISTING','{"code":"CARIES","depth":"DENTIN","icdas":null,"cars":null,"radiographicDepth":null}','Synthetic',null,'o5-clinical-entry-0001')),1,'owner records a scoped clinical entry');
reset role;
create temp table o5_initial(entry_id uuid);
insert into o5_initial select entry_id from private.tooth_clinical_entry_record_idempotency where idempotency_key='o5-clinical-entry-0001';
grant select on o5_initial to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is((select entry_id from public.record_tooth_clinical_entry_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','16',array['O'],'FINDING','CARIES','EXISTING','{"code":"CARIES","depth":"DENTIN","icdas":null,"cars":null,"radiographicDepth":null}','Synthetic',null,'o5-clinical-entry-0001')),(select entry_id from o5_initial),'same idempotency key returns the existing non-null clinical entry');
reset role;
revoke execute on function public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) from authenticated;
create temp table o5_clinical(entry_id uuid);
insert into o5_clinical select id from public.tooth_clinical_entries where organization_id='e5020000-0000-0000-0000-000000000001' and tooth_code='16' and supersedes_entry_id is null;
grant select on o5_clinical to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.amend_tooth_clinical_entry('e5030000-0000-0000-0000-000000000001',(select entry_id from o5_clinical),1,'16',array['O','M'],'Synthetic amendment')),2,'amendment creates a version-two successor');
reset role;
select extensions.ok((select count(*)=2 and count(*) filter(where supersedes_entry_id=(select entry_id from o5_clinical))=1 from public.tooth_clinical_entries where organization_id='e5020000-0000-0000-0000-000000000001' and patient_id='e5050000-0000-0000-0000-000000000001' and tooth_code='16'),'clinical amendment preserves byte-identical predecessor and successor-side lineage');
select extensions.throws_ok($$delete from public.tooth_clinical_entry_surfaces where organization_id='e5020000-0000-0000-0000-000000000001' and entry_id=(select entry_id from o5_clinical)$$,'P0001',null,'historical clinical surfaces cannot be deleted directly');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is((select execution_state from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o5-accept-1')),'ACCEPTED','PROPOSED advances to ACCEPTED');
select extensions.is((select execution_state from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',1,'ACCEPTED',null,'o5-accept-1')),'ACCEPTED','duplicate idempotency returns the existing transition despite stale supplied version');
select extensions.throws_ok($$select public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',1,'IN_PROGRESS',null,'o5-start-stale')$$,'P0001','stale version','a distinct stale transition is rejected');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',2,'IN_PROGRESS',null,'o5-start-1')),3,'ACCEPTED advances to IN_PROGRESS');
select extensions.ok((select charge_id is not null and clinical_entry_id is not null from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',3,125000,'CLINICAL','{"tooth_code":"26","clinical_code":"CROWN","surfaces":[]}'::jsonb,'o5-complete-1')),'completion returns its charge and clinical links');
reset role;
create temp table o5_completion_charge(charge_id uuid);
insert into o5_completion_charge
select completion_charge_id
from public.treatment_plan_item_executions
where item_id='e5090000-0000-0000-0000-000000000001';
grant select on o5_completion_charge to authenticated;
select extensions.ok((select e.current_state='COMPLETED' and e.completion_clinical_entry_id is not null and e.completion_charge_id is not null and c.provider_id='e5060000-0000-0000-0000-000000000001' from public.treatment_plan_item_executions e join public.charges c on c.id=e.completion_charge_id where e.item_id='e5090000-0000-0000-0000-000000000001'),'atomic completion links clinical entry and server-resolved provider charge');
select extensions.is((select count(*)::integer from public.charges where organization_id='e5020000-0000-0000-0000-000000000001' and treatment_plan_item_id='e5090000-0000-0000-0000-000000000001'),1,'completion idempotency creates one charge');
select extensions.ok((select e.clinical_code='CROWN' and e.status='COMPLETED' and not exists(select 1 from public.tooth_clinical_entry_surfaces s where s.organization_id=e.organization_id and s.entry_id=e.id) from public.tooth_clinical_entries e where e.id=(select completion_clinical_entry_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000001')),'whole-tooth crown completion stores zero surface rows');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000003',1,'ACCEPTED',null,'o5-extract-accept')),2,'extraction item is accepted');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000003',2,'IN_PROGRESS',null,'o5-extract-start')),3,'extraction item starts');
select extensions.is((select clinical_entry_id is not null and charge_id is not null from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000003',3,50000,'CLINICAL','{"tooth_code":"28","clinical_code":"EXTRACTION","surfaces":[]}'::jsonb,'o5-extract-complete')),true,'extraction completion atomically returns clinical and charge links');
select extensions.is((select version from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000003',3,50000,'CLINICAL','{"tooth_code":"28","clinical_code":"EXTRACTION","surfaces":[]}'::jsonb,'o5-extract-complete')),4,'duplicate extraction completion returns the existing terminal result');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000004',1,'ACCEPTED',null,'o5-root-accept')),2,'root-canal item is accepted');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000004',2,'IN_PROGRESS',null,'o5-root-start')),3,'root-canal item starts');
select extensions.is((select execution_state from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000004',3,75000,'CLINICAL','{"tooth_code":"25","clinical_code":"ROOT_CANAL","surfaces":[]}'::jsonb,'o5-root-complete')),'COMPLETED','root-canal completion reaches COMPLETED');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000005',1,'ACCEPTED',null,'o5-bridge-accept')),2,'bridge item is accepted');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000005',2,'IN_PROGRESS',null,'o5-bridge-start')),3,'bridge item starts');
select extensions.ok((select bridge_id is not null and charge_id is not null and clinical_entry_id is null and implant_component_id is null from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000005',3,200000,'BRIDGE','{"units":[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]}'::jsonb,'o5-bridge-complete')),'bridge completion returns only bridge and charge relationship links');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000006',1,'ACCEPTED',null,'o5-implant-accept')),2,'implant item is accepted');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000006',2,'IN_PROGRESS',null,'o5-implant-start')),3,'implant item starts');
select extensions.ok((select implant_component_id is not null and charge_id is not null and clinical_entry_id is null and bridge_id is null from public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000006',3,300000,'IMPLANT','{"components":[{"tooth_fdi":"23","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"23","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"23","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]}'::jsonb,'o5-implant-complete')),'implant completion returns root fixture and charge links');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000007',1,'ACCEPTED',null,'o5-rollback-accept')),2,'rollback item is accepted');
select extensions.is((select version from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000007',2,'IN_PROGRESS',null,'o5-rollback-start')),3,'rollback item starts');
select extensions.throws_ok($$select public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000007',3,200000,'BRIDGE','{"units":[{"tooth_fdi":"21","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"22","ordinal":2,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]}'::jsonb,'o5-bridge-mismatch')$$,'22023','completion does not match immutable item design','bridge completion rejects payload drift from the frozen item design');
select extensions.throws_ok($$select public.complete_treatment_plan_item_with_charge('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000007',3,200000,'IMPLANT','{"components":[{"tooth_fdi":"22","ordinal":1,"component_kind":"FIXTURE"}]}'::jsonb,'o5-kind-mismatch')$$,'22023','completion does not match immutable item design','completion kind cannot diverge from its frozen relationship design');
reset role;

insert into public.payments(id,organization_id,patient_id,branch_id,payment_method_id,amount_centavos,reference,idempotency_key)
values('e50a0000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5030000-0000-0000-0000-000000000001',(select id from public.payment_methods where organization_id='e5020000-0000-0000-0000-000000000001' and code='CASH'),50000,'Synthetic terminal guard','o5-terminal-payment');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.ok((select allocation_id is not null from public.allocate_payment('e5030000-0000-0000-0000-000000000001','e50a0000-0000-0000-0000-000000000001',(select charge_id from o5_completion_charge),'e5050000-0000-0000-0000-000000000001',50000,'o5-terminal-allocation')),'completed charge receives a synthetic allocation');
reset role;
insert into public.provider_earning_entries(id,organization_id,provider_id,charge_id,allocation_id,entry_type,cause,eligible_basis_centavos,rate_bps,earning_centavos,idempotency_key)
select 'e50b0000-0000-0000-0000-000000000001','e5020000-0000-0000-0000-000000000001','e5060000-0000-0000-0000-000000000001',a.charge_id,a.id,'ACCRUAL','ATTRIBUTION',a.amount_centavos,1000,5000,'o5-terminal-earning'
from public.payment_allocations a where a.organization_id='e5020000-0000-0000-0000-000000000001' and a.payment_id='e50a0000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.correct_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000001',4,'ACCEPTED','Cannot rewrite terminal completion','o5-terminal-correct')$$,'P0001','invalid state','terminal completion cannot be corrected');
select extensions.is((select execution_state from public.transition_treatment_plan_item_execution('e5030000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000002',1,'CANCELLED','Patient declined synthetic plan','o5-cancel-1')),'CANCELLED','PROPOSED can be cancelled with reason');
select extensions.throws_ok($$select public.create_plan_bridge_design('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5090000-0000-0000-0000-000000000008','[{"tooth_fdi":"14","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"16","ordinal":2,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb)$$,'22023','invalid bridge span','gapped plan bridge is rejected by the authoritative group validator');
reset role;
select extensions.ok((select current_state='COMPLETED' and version=4 and completion_charge_id is not null from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000001'),'terminal correction rejection preserves COMPLETED projection and links');
select extensions.ok((select count(*)=1 and sum(amount_centavos)=50000 from public.payment_allocations where organization_id='e5020000-0000-0000-0000-000000000001' and payment_id='e50a0000-0000-0000-0000-000000000001'),'terminal correction rejection preserves charge allocation history');
select extensions.ok((select count(*)=1 and sum(earning_centavos)=5000 from public.provider_earning_entries where id='e50b0000-0000-0000-0000-000000000001'),'terminal correction rejection preserves provider earning history');
select extensions.ok((select e.clinical_code='EXTRACTION' and not exists(select 1 from public.tooth_clinical_entry_surfaces s where s.organization_id=e.organization_id and s.entry_id=e.id) from public.tooth_clinical_entries e where e.id=(select completion_clinical_entry_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000003')),'whole-tooth extraction completion stores zero surface rows');
select extensions.ok((select e.clinical_code='ROOT_CANAL' and not exists(select 1 from public.tooth_clinical_entry_surfaces s where s.organization_id=e.organization_id and s.entry_id=e.id) from public.tooth_clinical_entries e where e.id=(select completion_clinical_entry_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000004')),'whole-tooth root-canal completion stores zero surface rows');
select extensions.ok((select count(*)=3 and count(*) filter(where current_u.role='PONTIC')=1 from public.treatment_plan_item_executions x join public.dental_bridges current_b on current_b.organization_id=x.organization_id and current_b.id=x.completion_bridge_id join public.dental_bridge_units current_u on current_u.organization_id=current_b.organization_id and current_u.bridge_id=current_b.id where x.item_id='e5090000-0000-0000-0000-000000000005'),'bridge completion materializes every frozen unit');
select extensions.ok(not exists(
  (select tooth_fdi,ordinal,role,support_kind,support_component_id from public.dental_bridge_units where bridge_id=(select id from public.dental_bridges where parent_plan_item_id='e5090000-0000-0000-0000-000000000005' and record_kind='PLAN_DESIGN'))
  except
  (select tooth_fdi,ordinal,role,support_kind,support_component_id from public.dental_bridge_units where bridge_id=(select completion_bridge_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000005'))
),'completed bridge units are identical to the frozen design');
select extensions.ok((select count(*)=3 and count(*) filter(where component_kind='FIXTURE' and depends_on_component_id is null)=1 and count(*) filter(where component_kind='ABUTMENT' and depends_on_component_id is not null)=1 and count(*) filter(where component_kind='CROWN' and depends_on_component_id is not null)=1 from public.dental_implant_components where charge_id=(select completion_charge_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000006') and record_kind='CURRENT'),'implant completion persists the full fixture-abutment-crown dependency graph');
select extensions.ok((select component_kind='FIXTURE' and depends_on_component_id is null from public.dental_implant_components where id=(select completion_implant_component_id from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000006')),'implant execution projection links the root fixture');
select extensions.ok((select current_state='IN_PROGRESS' and version=3 and completion_charge_id is null and completion_bridge_id is null and completion_implant_component_id is null from public.treatment_plan_item_executions where item_id='e5090000-0000-0000-0000-000000000007'),'failed design mismatch leaves execution unchanged');
select extensions.is((select count(*)::integer from public.charges where treatment_plan_item_id='e5090000-0000-0000-0000-000000000007'),0,'failed design mismatch leaves no partial charge');
select extensions.is((select count(*)::integer from public.treatment_plan_item_execution_events where item_id='e5090000-0000-0000-0000-000000000007'),3,'failed design mismatch leaves no completion event');
select extensions.is((select count(*)::integer from public.dental_bridges where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000008'),0,'failed bridge validation leaves no partial group');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.is(
  (select component_id is not null from public.record_current_implant_component_v3(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001',
    '[{"tooth_fdi":"37","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"37","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"37","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb,
    '2026-08-30T00:00:00+00'::timestamptz,(select charge_id from o5_completion_charge),'o5-current-implant-v3'
  )),
  true,
  'standalone current implant RPC persists and returns the scoped patient'
);
set local role authenticated;
reset role;
select extensions.ok(
  (select count(*)=3 and bool_and(version=1) and count(*) filter(where depends_on_component_id is null)=1
   from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and tooth_fdi='37' and record_kind='CURRENT'),
  'standalone current implant persists the complete dependency graph'
);
reset role;
create temp table o5_current_fixture(component_id uuid);
insert into o5_current_fixture
select id
from public.dental_implant_components
where organization_id='e5020000-0000-0000-0000-000000000001'
  and tooth_fdi='37' and record_kind='CURRENT' and component_kind='FIXTURE' and version=1;
grant select on o5_current_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.is(
  (select component_id from public.record_current_implant_component_v3(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001',
    '[{"tooth_fdi":"37","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"37","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"37","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb,
    '2026-08-30T00:00:00+00'::timestamptz,(select charge_id from o5_completion_charge),'o5-current-implant-v3'
  )),
  (select component_id from o5_current_fixture),
  'same implant idempotency key returns the canonical component identity'
);
set local role authenticated;
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.throws_ok(
  $$select public.record_current_implant_component_v3(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001',
    '[{"tooth_fdi":"36","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,
    statement_timestamp(),(select charge_id from o5_completion_charge),'o5-current-implant-v3'
  )$$,
  'P0001','idempotency conflict','changed implant request fingerprint conflicts without a second graph'
);
set local role authenticated;
select extensions.is(
  (select version from public.amend_current_implant_component(
    'e5030000-0000-0000-0000-000000000001',
    (select component_id from o5_current_fixture),
    1,
    '[{"tooth_fdi":"37","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"37","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"37","ordinal":3,"component_kind":"ATTACHMENT","attachment_value":"bar","depends_on_ordinal":2}]'::jsonb
  )),
  2,
  'current implant amendment appends a full successor graph'
);
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.throws_ok(
  $$select public.record_current_implant_component_v3(
    'e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001',
    '[{"tooth_fdi":"38","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"38","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"38","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":1}]'::jsonb,
    statement_timestamp(),(select charge_id from o5_completion_charge),'o5-invalid-current-implant-v3'
  )$$,
  '22023','invalid implant chain','invalid standalone implant dependency rolls back the whole graph'
);
set local role authenticated;
reset role;
select extensions.ok(
  (select count(*)=6 and count(*) filter(where version=1)=3 and count(*) filter(where version=2)=3 and count(*) filter(where supersedes_component_id is not null)=3
   from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and tooth_fdi='37' and record_kind='CURRENT'),
  'current implant amendment preserves the three predecessors and appends three successors'
);
select extensions.ok(
  not exists(
    select 1 from public.dental_implant_components successor
    left join public.dental_implant_components predecessor
      on predecessor.organization_id=successor.organization_id and predecessor.id=successor.supersedes_component_id
    where successor.organization_id='e5020000-0000-0000-0000-000000000001'
      and successor.tooth_fdi='37' and successor.version=2
      and (predecessor.id is null or predecessor.tooth_fdi<>successor.tooth_fdi or predecessor.ordinal<>successor.ordinal)
  ),
  'every current implant successor maps to the same ordinal predecessor'
);
select extensions.is((select count(*)::integer from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and tooth_fdi='38'),0,'invalid standalone graph leaves no component rows');

update public.treatment_plans set status='PRESENTED',version=2 where id='e5080000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select public.update_draft_plan_implant_design(
    'e5030000-0000-0000-0000-000000000001',
    (select component_id from o5_plan_implant_root),
    2,
    '[{"tooth_fdi":"36","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"36","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"36","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb
  )$$,
  'P0001','invalid state','presented implant design graph is frozen'
);
reset role;
select extensions.ok((select count(*)=3 and bool_and(version=2) from public.dental_implant_components where organization_id='e5020000-0000-0000-0000-000000000001' and parent_plan_item_id='e5090000-0000-0000-0000-000000000009'),'failed frozen design update preserves the complete draft graph');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000001',true);
select extensions.ok((select (data->'entries') @> '[{"clinical_code":"EXTRACTION"}]'::jsonb and (data->'entries') @> '[{"clinical_code":"ROOT_CANAL"}]'::jsonb and jsonb_array_length(data->'treatmentExecutions')>=7 from public.get_patient_odontogram('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001')),'DTO reload exposes completed whole-tooth history and execution projections');
reset role;

-- O5 revamp regression fixture: a real DENTIST is linked to the provider
-- resolved by the v3 boundary.  These assertions exercise the function body,
-- rather than merely inspecting grants.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.record_direct_treatment_with_charge('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5070000-0000-0000-0000-000000000001',10000,'{}','o5-rv-reception')$$,'42501','not authorized','receptionist cannot use the provider-derived treatment writer');
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000004',true);
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.throws_ok($$select public.record_current_bridge_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[]',statement_timestamp(),(select charge_id from o5_completion_charge),'o5-rv-unassigned')$$,'42501','not authorized','unassigned specialist/admin cannot use the provider-derived bridge writer');
set local role authenticated;
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.record_direct_treatment_with_charge('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000002','e5070000-0000-0000-0000-000000000001',10000,'{}','o5-rv-foreign-patient')$$,'42501','not authorized','linked Organization A dentist cannot write Organization B patient');
select extensions.throws_ok($$select public.record_current_bridge('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[]','e5060000-0000-0000-0000-000000000001',statement_timestamp(),null)$$,'42501',null,'superseded bridge provider-picker signature is denied to a dentist');
select extensions.throws_ok($$select public.record_current_implant_component('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','{}','e5060000-0000-0000-0000-000000000001',statement_timestamp(),null)$$,'42501',null,'superseded implant provider-picker signature is denied to a dentist');
create temp table o5_revamp_direct(event_id uuid, version integer, charge_id uuid);
grant select on o5_revamp_direct to authenticated;
insert into o5_revamp_direct(event_id,version) select event_id,version from public.record_direct_treatment_with_charge('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5070000-0000-0000-0000-000000000001',10000,'{"notes":"synthetic"}','o5-rv-direct-once');
reset role;
update o5_revamp_direct set charge_id=c.charge_id from public.procedure_case_events e join public.procedure_cases c on c.organization_id=e.organization_id and c.id=e.procedure_case_id where e.id=o5_revamp_direct.event_id;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000003',true);
select extensions.ok((select event_id is not null and charge_id is not null from o5_revamp_direct),'linked dentist records direct treatment with a canonical charge');
select extensions.is((select event_id from public.record_direct_treatment_with_charge('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','e5070000-0000-0000-0000-000000000001',99999,'{"notes":"changed"}','o5-rv-direct-once')),(select event_id from o5_revamp_direct),'duplicate direct-treatment key returns the same event');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where entity_id=(select event_id from o5_revamp_direct) and action='procedure.case.direct_treatment.recorded'),1,'duplicate direct-treatment key leaves one audit event');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000003',true);
create temp table o5_revamp_bridge(bridge_id uuid,version integer); grant select on o5_revamp_bridge to authenticated;
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
insert into o5_revamp_bridge select bridge_id,version from public.record_current_bridge_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[{"tooth_fdi":"41","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"},{"tooth_fdi":"42","ordinal":2,"role":"PONTIC","support_kind":"NONE"},{"tooth_fdi":"43","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"}]','2030-01-01T00:00:00Z',(select charge_id from o5_completion_charge),'o5-rv-bridge-once');
set local role authenticated;
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.is((select bridge_id from public.record_current_bridge_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[{"tooth_fdi":"41","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"},{"tooth_fdi":"42","ordinal":2,"role":"PONTIC","support_kind":"NONE"},{"tooth_fdi":"43","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"}]','2030-01-01T00:00:00Z',(select charge_id from o5_completion_charge),'o5-rv-bridge-once')),(select bridge_id from o5_revamp_bridge),'duplicate bridge key returns the same bridge');
set local role authenticated;
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.throws_ok($$select public.record_current_bridge_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[{"tooth_fdi":"44","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"},{"tooth_fdi":"45","ordinal":2,"role":"PONTIC","support_kind":"NONE"}]',statement_timestamp(),(select charge_id from o5_completion_charge),'o5-rv-bridge-once')$$,'P0001','idempotency conflict','changed bridge payload under the same key conflicts');
set local role authenticated;
reset role;
select extensions.is((select count(*)::integer from public.audit_events where entity_id=(select bridge_id from o5_revamp_bridge) and action='clinical.bridge.current.recorded'),1,'duplicate bridge key leaves one canonical audit event');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e5010000-0000-0000-0000-000000000003',true);
-- Task 7 retired the browser grant on both six-argument v3 relationship writers. Their behaviour below is still proved, now as postgres; that the browser role can no longer reach them is asserted in odontogram_permission_contract.test.sql.
set local role postgres;
select extensions.throws_ok($$select public.record_current_bridge_v3('e5030000-0000-0000-0000-000000000001','e5050000-0000-0000-0000-000000000001','[{"tooth_fdi":"31","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH"},{"tooth_fdi":"31","ordinal":2,"role":"PONTIC","support_kind":"NONE"}]',statement_timestamp(),(select charge_id from o5_completion_charge),'o5-rv-invalid')$$,'22023','invalid bridge span','invalid bridge downstream write fails');
set local role authenticated;
reset role;
select extensions.is((select count(*)::integer from public.dental_bridges where organization_id='e5020000-0000-0000-0000-000000000001' and patient_id='e5050000-0000-0000-0000-000000000001' and id not in (select bridge_id from o5_revamp_bridge) and charge_id=(select charge_id from o5_revamp_direct)),0,'failed bridge write rolls back without a partial canonical bridge');
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
