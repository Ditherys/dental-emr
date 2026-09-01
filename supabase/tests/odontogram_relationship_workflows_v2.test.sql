begin;

select extensions.no_plan();

-- Synthetic-only Task 7 graph for the visit-bound relationship boundary.
--
-- Organization A holds a dentist with an active linked provider at A Main, an
-- owner with no provider link, and a receptionist. Organization B is foreign.
-- Fixture inserts run as postgres; every RPC call runs with
-- `set local role authenticated` plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('f7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@rel.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain-a@rel.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@rel.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f7100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@rel.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@rel.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('f7200000-0000-0000-0000-000000000001','REL Synthetic A Inc.','REL A','rel-a'),
  ('f7200000-0000-0000-0000-000000000002','REL Synthetic B Inc.','REL B','rel-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('f7300000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','REL A Main','rel-a-main','REL-A','1 Synthetic St','Test City','Test Province'),
  ('f7300000-0000-0000-0000-000000000003','f7200000-0000-0000-0000-000000000002','REL B Main','rel-b-main','REL-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('f7400000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('f7400000-0000-0000-0000-000000000002','f7200000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('f7400000-0000-0000-0000-000000000003','f7200000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('f7400000-0000-0000-0000-000000000004','f7200000-0000-0000-0000-000000000002','f7100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('f7400000-0000-0000-0000-000000000005','f7200000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('f7200000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7400000-0000-0000-0000-000000000001','active'),
  ('f7200000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7400000-0000-0000-0000-000000000002','active'),
  ('f7200000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7400000-0000-0000-0000-000000000003','active'),
  ('f7200000-0000-0000-0000-000000000002','f7300000-0000-0000-0000-000000000003','f7400000-0000-0000-0000-000000000004','active'),
  ('f7200000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('f7200000-0000-0000-0000-000000000001'::uuid,'f7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'f7100000-0000-0000-0000-000000000001'::uuid),
  ('f7200000-0000-0000-0000-000000000001'::uuid,'f7400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'f7100000-0000-0000-0000-000000000002'::uuid),
  ('f7200000-0000-0000-0000-000000000001'::uuid,'f7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'f7300000-0000-0000-0000-000000000001'::uuid,'f7100000-0000-0000-0000-000000000001'::uuid),
  ('f7200000-0000-0000-0000-000000000002'::uuid,'f7400000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,null::uuid,'f7100000-0000-0000-0000-000000000004'::uuid),
  ('f7200000-0000-0000-0000-000000000001'::uuid,'f7400000-0000-0000-0000-000000000005'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'f7100000-0000-0000-0000-000000000001'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('f7500000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','REL-A-1','Patient','A1',date '1990-01-01','f7300000-0000-0000-0000-000000000001'),
  ('f7500000-0000-0000-0000-000000000002','f7200000-0000-0000-0000-000000000001','REL-A-2','Patient','A2',date '1991-02-02','f7300000-0000-0000-0000-000000000001'),
  ('f7500000-0000-0000-0000-000000000003','f7200000-0000-0000-0000-000000000002','REL-B-1','Patient','B1',date '1992-03-03',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('f7600000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','f7100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('f7600000-0000-0000-0000-000000000002','f7200000-0000-0000-0000-000000000002','f7100000-0000-0000-0000-000000000004','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('f7200000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001',true),
  ('f7200000-0000-0000-0000-000000000002','f7600000-0000-0000-0000-000000000002','f7300000-0000-0000-0000-000000000003',true);
insert into public.procedures (id, organization_id, code, name, status) values
  ('f7700000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','REL_BRIDGE','Synthetic three-unit bridge','active'),
  ('f7700000-0000-0000-0000-000000000002','f7200000-0000-0000-0000-000000000001','REL_IMPLANT','Synthetic implant placement','active');

-- Charges are the canonical financial link a relationship references; the
-- browser never posts one from this boundary, it names one that already exists.
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, created_by) values
  ('f7800000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000001',9000000,current_date,'rel-bridge-charge','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000002','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000002',12000000,current_date,'rel-implant-charge','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000003','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000002','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000001',9000000,current_date,'rel-other-patient-charge','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000004','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000002',12000000,current_date,'rel-implant-charge-2','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000005','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000001',9000000,current_date,'rel-bridge-charge-2','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000006','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000002',12000000,current_date,'rel-implant-charge-3','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000007','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000002',12000000,current_date,'rel-implant-charge-4','f7100000-0000-0000-0000-000000000001'),
  ('f7800000-0000-0000-0000-000000000008','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000002','f7300000-0000-0000-0000-000000000001','f7600000-0000-0000-0000-000000000001','f7700000-0000-0000-0000-000000000002',12000000,current_date,'rel-implant-charge-a2','f7100000-0000-0000-0000-000000000001');

-- A foreign-tenant implant abutment. A staged chain in organization A must never
-- be able to attach to it.
insert into public.procedures (id, organization_id, code, name, status) values
  ('f7700000-0000-0000-0000-000000000003','f7200000-0000-0000-0000-000000000002','REL_IMPLANT_B','Synthetic implant B','active');
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, created_by) values
  ('f7800000-0000-0000-0000-00000000000b','f7200000-0000-0000-0000-000000000002','f7500000-0000-0000-0000-000000000003','f7300000-0000-0000-0000-000000000003','f7600000-0000-0000-0000-000000000002','f7700000-0000-0000-0000-000000000003',12000000,current_date,'rel-implant-charge-b','f7100000-0000-0000-0000-000000000004');
insert into public.dental_implant_components (id, organization_id, patient_id, tooth_fdi, ordinal, component_kind, record_kind, treating_provider_id, executed_at, charge_id, sealed_at, recorded_by, version) values
  ('f7a00000-0000-0000-0000-0000000000b1','f7200000-0000-0000-0000-000000000002','f7500000-0000-0000-0000-000000000003','36',1,'FIXTURE','CURRENT','f7600000-0000-0000-0000-000000000002',statement_timestamp(),'f7800000-0000-0000-0000-00000000000b',statement_timestamp(),'f7100000-0000-0000-0000-000000000004',1);
insert into public.dental_implant_components (id, organization_id, patient_id, tooth_fdi, ordinal, component_kind, record_kind, depends_on_component_id, treating_provider_id, executed_at, charge_id, sealed_at, recorded_by, version) values
  ('f7a00000-0000-0000-0000-0000000000b2','f7200000-0000-0000-0000-000000000002','f7500000-0000-0000-0000-000000000003','36',2,'ABUTMENT','CURRENT','f7a00000-0000-0000-0000-0000000000b1','f7600000-0000-0000-0000-000000000002',statement_timestamp(),'f7800000-0000-0000-0000-00000000000b',statement_timestamp(),'f7100000-0000-0000-0000-000000000004',1);

-- A historical relationship row recorded before this task. It must keep NULL
-- encounter/service-date/note: nothing is invented for it.
insert into public.dental_bridges (id, organization_id, patient_id, record_kind, support_kind, treating_provider_id, executed_at, charge_id, recorded_by, version, sealed_at) values
  ('f7900000-0000-0000-0000-000000000001','f7200000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000002','CURRENT','NATURAL_TOOTH','f7600000-0000-0000-0000-000000000001',statement_timestamp()-interval '400 days','f7800000-0000-0000-0000-000000000003','f7100000-0000-0000-0000-000000000001',1,null);
insert into public.dental_bridge_units (organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id) values
  ('f7200000-0000-0000-0000-000000000001','f7900000-0000-0000-0000-000000000001','34',1,'ABUTMENT','NATURAL_TOOTH',null),
  ('f7200000-0000-0000-0000-000000000001','f7900000-0000-0000-0000-000000000001','35',2,'PONTIC','NONE',null),
  ('f7200000-0000-0000-0000-000000000001','f7900000-0000-0000-0000-000000000001','36',3,'ABUTMENT','NATURAL_TOOTH',null);
update public.dental_bridges set sealed_at = statement_timestamp() - interval '400 days'
where id = 'f7900000-0000-0000-0000-000000000001';

create temp table rel_result (seq integer primary key, payload jsonb);
grant select, insert on rel_result to authenticated;

-- ---------------------------------------------------------------------------
-- Boundary
-- ---------------------------------------------------------------------------

select extensions.ok(
  has_function_privilege('authenticated','public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('public','public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute'),
  'only authenticated may execute the visit-bound bridge boundary'
);
select extensions.ok(
  has_function_privilege('authenticated','public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute')
  and not has_function_privilege('public','public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)','execute'),
  'only authenticated may execute the visit-bound implant boundary'
);
select extensions.ok(
  (select bool_and(proc.prosecdef and proc.proconfig = array['search_path=""']::text[])
   from pg_proc as proc
   where proc.oid in (
     'public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)'::regprocedure,
     'public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)'::regprocedure)),
  'both relationship boundaries are SECURITY DEFINER with an empty search path'
);
select extensions.ok(
  (select bool_and(proc.prosrc ~ 'start_or_resume_clinical_visit'
                and proc.prosrc ~ 'require_active_actor_provider'
                and proc.prosrc !~ 'p_treating_provider_id'
                and proc.prosrc !~ 'p_organization_id')
   from pg_proc as proc
   where proc.oid in (
     'public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)'::regprocedure,
     'public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)'::regprocedure)),
  'both boundaries derive the visit and the provider server-side and accept neither from a client'
);

-- ---------------------------------------------------------------------------
-- Forward-added linkage columns: nullable, and never invented for history
-- ---------------------------------------------------------------------------

select extensions.ok(
  (select bool_and(not attribute.attnotnull)
   from pg_attribute as attribute
   where attribute.attrelid in ('public.dental_bridges'::regclass,'public.dental_implant_components'::regclass)
     and attribute.attname in ('encounter_id','service_date','clinical_note')
     and not attribute.attisdropped),
  'the forward-added encounter, service-date and note columns are all nullable'
);
select extensions.is(
  (select count(*)::text from pg_attribute as attribute
   where attribute.attrelid in ('public.dental_bridges'::regclass,'public.dental_implant_components'::regclass)
     and attribute.attname in ('encounter_id','service_date','clinical_note')
     and not attribute.attisdropped),
  '6',
  'both relationship tables carry the three forward-added linkage columns'
);
select extensions.ok(
  (select bridge.encounter_id is null and bridge.service_date is null and bridge.clinical_note is null
   from public.dental_bridges as bridge where bridge.id='f7900000-0000-0000-0000-000000000001'),
  'a relationship recorded before this task keeps null linkage rather than an invented value'
);

-- ---------------------------------------------------------------------------
-- Refused input and refused authority, before any write
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000003',true);

select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-reception-bridge')$$,
  '42501','not authorized','a receptionist may not record a bridge relationship'
);
select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000002',null,'rel-reception-implant')$$,
  '42501','not authorized','a receptionist may not record an implant relationship'
);

select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-owner-bridge')$$,
  '42501','not authorized','an owner with no active provider link at the acting branch may not treat'
);

select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-foreign-bridge')$$,
  '42501','not authorized','a foreign-tenant dentist may not record at another organization''s branch'
);

select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000003','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-cross-tenant-bridge')$$,
  '42501','not authorized','a patient in another organization is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000003',null,'rel-mismatched-charge')$$,
  '42501','not authorized','a charge belonging to another patient is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-single-unit')$$,
  '22023','invalid input','a bridge of fewer than two units is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-supported-pontic')$$,
  '22023','invalid bridge span','a pontic carrying support is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"IMPLANT_COMPONENT","support_component_id":"f7f00000-0000-0000-0000-0000000000ff"},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000001',null,'rel-unknown-support')$$,
  '22023','invalid implant support','an implant-supported abutment naming an unknown component is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date + 1,'f7800000-0000-0000-0000-000000000001',null,'rel-future-date')$$,
  '22023','invalid input','a service date after the server clinical date is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_bridge_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date - 366,'f7800000-0000-0000-0000-000000000001',null,'rel-old-date')$$,
  '22023','invalid input','a service date beyond the one-year backdating window is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"16","ordinal":2,"component_kind":"CROWN","depends_on_ordinal":1}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000002',null,'rel-crown-on-fixture')$$,
  '22023','invalid implant chain','a crown depending directly on the fixture rather than an abutment is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"16","ordinal":1,"component_kind":"ABUTMENT"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000002',null,'rel-rootless-abutment')$$,
  '22023','invalid implant chain','an implant chain that does not begin with a fixture is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"17","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000002',null,'rel-mismatched-tooth')$$,
  '22023','invalid implant chain','an implant chain spanning two tooth positions is refused'
);
select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE","provenance":"PREEXISTING_EXTERNAL"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000002',null,'rel-external-implant')$$,
  '22023','invalid input','an external placeholder is not recorded from the visit-bound composer'
);

reset role;

select extensions.is(
  (select count(*)::text from public.dental_bridges as bridge
   where bridge.organization_id='f7200000-0000-0000-0000-000000000001' and bridge.patient_id='f7500000-0000-0000-0000-000000000001'),
  '0',
  'every refused bridge attempt left no relationship behind'
);
select extensions.is(
  (select count(*)::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'),
  '0',
  'every refused implant attempt left no component behind'
);
select extensions.is(
  (select count(*)::text from public.clinical_encounters as encounter
   where encounter.organization_id='f7200000-0000-0000-0000-000000000001'),
  '0',
  'a refused relationship never opened a clinical visit'
);

-- ---------------------------------------------------------------------------
-- The accepted implant chain: fixture, abutment, crown, visit-bound and dated
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

insert into rel_result (seq, payload)
select 1, pg_catalog.to_jsonb(result)
from public.record_visit_implant_component_v2(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001',
  '[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"16","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"16","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb,
  (timezone('Asia/Manila', statement_timestamp()))::date - 3,
  'f7800000-0000-0000-0000-000000000002',
  'Fixture placed, abutment and crown seated the same visit.',
  'rel-implant-ok'
) as result;

reset role;

select extensions.is(
  (select count(*)::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'
     and component.patient_id='f7500000-0000-0000-0000-000000000001'),
  '3',
  'the implant chain recorded a fixture, an abutment and a crown'
);
select extensions.ok(
  (select bool_and(component.record_kind='CURRENT'
                and component.sealed_at is not null
                and component.voided_at is null
                and component.treating_provider_id='f7600000-0000-0000-0000-000000000001'
                and component.encounter_id is not null
                and component.service_date=(timezone('Asia/Manila', statement_timestamp()))::date - 3
                and component.charge_id='f7800000-0000-0000-0000-000000000002')
   from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'),
  'every recorded component is sealed, visit-bound, dated and attributed to the signed-in dentist''s provider'
);
select extensions.ok(
  (select crown.depends_on_component_id = abutment.id and abutment.depends_on_component_id = fixture.id
      and fixture.depends_on_component_id is null
   from public.dental_implant_components as fixture
   join public.dental_implant_components as abutment
     on abutment.organization_id=fixture.organization_id and abutment.component_kind='ABUTMENT'
   join public.dental_implant_components as crown
     on crown.organization_id=fixture.organization_id and crown.component_kind='CROWN'
   where fixture.organization_id='f7200000-0000-0000-0000-000000000001' and fixture.component_kind='FIXTURE'),
  'the stored chain is fixture then abutment then crown, each depending on the one before it'
);
select extensions.is(
  (select count(distinct component.encounter_id)::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'),
  '1',
  'the whole chain is bound to one managed visit'
);
select extensions.is(
  (select encounter.status from public.clinical_encounters as encounter
   join public.dental_implant_components as component on component.encounter_id = encounter.id
   where component.organization_id='f7200000-0000-0000-0000-000000000001' limit 1),
  'OPEN',
  'the relationship resumed or started the managed OPEN visit'
);
select extensions.is(
  (select component.clinical_note from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001' and component.component_kind='FIXTURE'),
  'Fixture placed, abutment and crown seated the same visit.',
  'the submitted note is stored on the relationship record'
);

-- The idempotent retry: the same key returns the same identity and records
-- nothing a second time.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

insert into rel_result (seq, payload)
select 2, pg_catalog.to_jsonb(result)
from public.record_visit_implant_component_v2(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001',
  '[{"tooth_fdi":"16","ordinal":1,"component_kind":"FIXTURE"},{"tooth_fdi":"16","ordinal":2,"component_kind":"ABUTMENT","depends_on_ordinal":1},{"tooth_fdi":"16","ordinal":3,"component_kind":"CROWN","depends_on_ordinal":2}]'::jsonb,
  (timezone('Asia/Manila', statement_timestamp()))::date - 3,
  'f7800000-0000-0000-0000-000000000002',
  'Fixture placed, abutment and crown seated the same visit.',
  'rel-implant-ok'
) as result;

select extensions.is(
  (select (payload->>'component_id') from rel_result where seq=2),
  (select (payload->>'component_id') from rel_result where seq=1),
  'a replayed request key returns the original canonical component identity'
);
select extensions.is(
  (select (payload->>'replayed') from rel_result where seq=2),
  'true',
  'the replay is reported as a replay rather than a second write'
);
reset role;

select extensions.is(
  (select count(*)::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'),
  '3',
  'the replay created no second implant chain'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"26","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000004',null,'rel-implant-ok')$$,
  'P0001','idempotency conflict','the same request key carrying a different implant is refused rather than replayed'
);

-- ---------------------------------------------------------------------------
-- The accepted bridge: ordered span, abutment and pontic roles, connector
-- provenance derived from the canonical units
-- ---------------------------------------------------------------------------

insert into rel_result (seq, payload)
select 3, pg_catalog.to_jsonb(result)
from public.record_visit_bridge_v2(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001',
  '[{"tooth_fdi":"24","ordinal":1,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null},{"tooth_fdi":"25","ordinal":2,"role":"PONTIC","support_kind":"NONE","support_component_id":null},{"tooth_fdi":"26","ordinal":3,"role":"ABUTMENT","support_kind":"NATURAL_TOOTH","support_component_id":null}]'::jsonb,
  (timezone('Asia/Manila', statement_timestamp()))::date,
  'f7800000-0000-0000-0000-000000000001',
  'Three-unit bridge cemented.',
  'rel-bridge-ok'
) as result;

reset role;

select extensions.ok(
  (select bridge.record_kind='CURRENT' and bridge.support_kind='NATURAL_TOOTH'
      and bridge.sealed_at is not null and bridge.voided_at is null
      and bridge.treating_provider_id='f7600000-0000-0000-0000-000000000001'
      and bridge.encounter_id is not null
      and bridge.service_date=(timezone('Asia/Manila', statement_timestamp()))::date
   from public.dental_bridges as bridge
   where bridge.id=((select payload->>'bridge_id' from rel_result where seq=3))::uuid),
  'the bridge is a sealed CURRENT record, visit-bound, dated and provider-attributed'
);
select extensions.is(
  (select string_agg(unit.tooth_fdi || ':' || unit.role, ',' order by unit.ordinal)
   from public.dental_bridge_units as unit
   where unit.bridge_id=((select payload->>'bridge_id' from rel_result where seq=3))::uuid),
  '24:ABUTMENT,25:PONTIC,26:ABUTMENT',
  'the ordered span records abutment, pontic and abutment in unit order'
);
select extensions.is(
  (select (payload->>'encounter_id') from rel_result where seq=3),
  (select distinct component.encounter_id::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'),
  'a second relationship in the same day resumes the one managed visit rather than opening another'
);
select extensions.is(
  (select count(*)::text from public.clinical_encounters as encounter
   where encounter.organization_id='f7200000-0000-0000-0000-000000000001'),
  '1',
  'exactly one managed visit exists for the whole session'
);

-- The canonical current projection the chart reads.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

insert into rel_result (seq, payload)
select 4, projection.data
from public.get_patient_odontogram_v3(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001'
) as projection;

insert into rel_result (seq, payload)
select 5, public.get_clinical_composer_context('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001');

select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'bridges') from rel_result where seq=4),
  1,
  'the current projection carries exactly the one recorded bridge'
);
select extensions.is(
  (select payload->'bridges'->0->>'event_state' from rel_result where seq=4),
  'CURRENT',
  'the recorded bridge projects as CURRENT'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'implantChains') from rel_result where seq=4),
  1,
  'the current projection carries exactly the one recorded implant chain'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'implantChains'->0->'components') from rel_result where seq=4),
  3,
  'the projected chain keeps all three components'
);

-- ---------------------------------------------------------------------------
-- Staged implant placement across visits, and the one-fixture-per-tooth guard
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000001',true);

-- Visit one on tooth 26: the fixture alone.
insert into rel_result (seq, payload)
select 10, pg_catalog.to_jsonb(result)
from public.record_visit_implant_component_v2(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001',
  '[{"tooth_fdi":"26","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,
  (timezone('Asia/Manila', statement_timestamp()))::date - 120,
  'f7800000-0000-0000-0000-000000000006',
  'Fixture placed; abutment deferred for osseointegration.',
  'rel-staged-fixture'
) as result;

-- A second fixture on the same tooth is refused by the database, not by the
-- browser's stage picker.
select extensions.throws_ok(
  $q$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"26","ordinal":1,"component_kind":"FIXTURE"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000007',null,'rel-second-fixture')$q$,
  '23505','tooth already carries a current implant fixture',
  'a second current fixture on an already-implanted tooth is refused in the database'
);

-- A staged continuation may not name a component belonging to another patient.
select extensions.throws_ok(
  format($q$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000002','[{"tooth_fdi":"26","ordinal":1,"component_kind":"ABUTMENT","depends_on_component_id":"%s"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000008',null,'rel-cross-patient-parent')$q$,
    (select payload->>'component_id' from rel_result where seq=10)),
  '22023','invalid implant chain',
  'a staged component naming another patient''s fixture is refused'
);

-- Nor one belonging to another tenant.
select extensions.throws_ok(
  $q$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"36","ordinal":1,"component_kind":"CROWN","depends_on_component_id":"f7a00000-0000-0000-0000-0000000000b2"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000007',null,'rel-cross-tenant-parent')$q$,
  '22023','invalid implant chain',
  'a staged component naming another tenant''s abutment is refused'
);

-- Nor may it skip a stage: a crown may not sit directly on a fixture.
select extensions.throws_ok(
  format($q$select public.record_visit_implant_component_v2('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001','[{"tooth_fdi":"26","ordinal":1,"component_kind":"CROWN","depends_on_component_id":"%s"}]'::jsonb,(timezone('Asia/Manila', statement_timestamp()))::date,'f7800000-0000-0000-0000-000000000007',null,'rel-staged-skip')$q$,
    (select payload->>'component_id' from rel_result where seq=10)),
  '22023','invalid implant chain',
  'a staged crown may not sit directly on the fixture'
);

-- Visit two on tooth 26: the abutment, attached to the fixture placed months
-- earlier. This is the submission the form now offers and could never honour.
insert into rel_result (seq, payload)
select 11, pg_catalog.to_jsonb(result)
from public.record_visit_implant_component_v2(
  'f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001',
  format('[{"tooth_fdi":"26","ordinal":1,"component_kind":"ABUTMENT","depends_on_component_id":"%s"}]',
    (select payload->>'component_id' from rel_result where seq=10))::jsonb,
  (timezone('Asia/Manila', statement_timestamp()))::date,
  'f7800000-0000-0000-0000-000000000007',
  'Abutment connected after osseointegration.',
  'rel-staged-abutment'
) as result;

reset role;

select extensions.is(
  (select count(*)::text from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'
     and component.tooth_fdi='26'),
  '2',
  'tooth 26 carries exactly the fixture and the abutment staged onto it'
);
select extensions.is(
  (select component.depends_on_component_id::text
   from public.dental_implant_components as component
   where component.organization_id='f7200000-0000-0000-0000-000000000001'
     and component.tooth_fdi='26' and component.component_kind='ABUTMENT'),
  (select payload->>'component_id' from rel_result where seq=10),
  'the staged abutment depends on the fixture recorded at the earlier visit'
);
-- Each staged component keeps the date the work was actually done, and each is
-- bound to a managed visit. The two components share one encounter here only
-- because a pgTAP transaction is a single clinical day; the visit boundary
-- resumes the day's managed visit rather than opening a second one.
select extensions.ok(
  (select earlier.service_date < later.service_date
      and earlier.encounter_id is not null
      and later.encounter_id is not null
   from public.dental_implant_components as earlier
   join public.dental_implant_components as later
     on later.organization_id = earlier.organization_id
    and later.tooth_fdi = earlier.tooth_fdi
    and later.component_kind = 'ABUTMENT'
   where earlier.organization_id='f7200000-0000-0000-0000-000000000001'
     and earlier.tooth_fdi='26' and earlier.component_kind='FIXTURE'),
  'each staged component keeps its own service date and is bound to a managed visit'
);

-- ---------------------------------------------------------------------------
-- The composer context projection: what makes the shared forms reachable
-- ---------------------------------------------------------------------------

select extensions.ok(
  has_function_privilege('authenticated','public.get_clinical_composer_context(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.get_clinical_composer_context(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.get_clinical_composer_context(uuid,uuid)','execute')
  and not has_function_privilege('public','public.get_clinical_composer_context(uuid,uuid)','execute'),
  'only authenticated may execute the composer context projection'
);
select extensions.ok(
  (select proc.prosecdef and proc.proconfig = array['search_path=""']::text[] and proc.provolatile = 's'
   from pg_proc as proc
   where proc.oid = 'public.get_clinical_composer_context(uuid,uuid)'::regprocedure),
  'the composer context projection is a stable SECURITY DEFINER read with an empty search path'
);
select extensions.ok(
  (select proc.prosrc !~ 'insert into' and proc.prosrc !~ 'update ' and proc.prosrc !~ 'delete from'
   from pg_proc as proc
   where proc.oid = 'public.get_clinical_composer_context(uuid,uuid)'::regprocedure),
  'the composer context projection writes nothing at all, so opening the composer opens no visit'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'procedures') from rel_result where seq=5),
  2,
  'the projection carries the organization''s active procedure catalogue'
);
select extensions.is(
  (select payload->>'patient_identifier' from rel_result where seq=5),
  'REL-A-1 · A1, Patient',
  'the projection names the patient the confirmation dialog must state'
);
select extensions.ok(
  (select pg_catalog.jsonb_array_length(payload->'charge_choices') >= 2 from rel_result where seq=5),
  'a dentist holding billing.charge is offered the charges a relationship may reference'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'support_components') from rel_result where seq=5),
  1,
  'the recorded implant abutment is offered as bridge support, and nothing else is'
);
select extensions.is(
  (select payload->'implant_stage_by_tooth'->>'16' from rel_result where seq=5),
  'CROWN',
  'the projection reports the stage tooth 16 has actually reached'
);
select extensions.is(
  (select payload->'implant_tip_by_tooth'->'16'->>'stage' from rel_result where seq=5),
  'CROWN',
  'the tip projection agrees with the stage projection'
);
select extensions.ok(
  (select (payload->'implant_tip_by_tooth'->'16'->>'component_id') is not null from rel_result where seq=5),
  'the tip projection names the component a staged continuation would attach to'
);

-- The money gate. A dental assistant holds patient.clinical.read but neither
-- billing.charge nor payment.record, so the projection offers no charge to link
-- a relationship to and no method to take payment with, while still returning
-- the clinical content the composer needs.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000005',true);
insert into rel_result (seq, payload)
select 20, public.get_clinical_composer_context('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001');

select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'charge_choices') from rel_result where seq=20),
  0,
  'a caller without billing.charge is offered no charge to link a relationship to'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'payment_methods') from rel_result where seq=20),
  0,
  'a caller without payment.record is offered no payment method'
);
select extensions.is(
  (select pg_catalog.jsonb_array_length(payload->'procedures') from rel_result where seq=20),
  (select pg_catalog.jsonb_array_length(payload->'procedures') from rel_result where seq=5),
  'the clinical half of the projection is unaffected by the money gate'
);

reset role;

select extensions.throws_ok(
  $$select public.get_clinical_composer_context('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000003')$$,
  '42501','not authorized','the composer context refuses a patient in another organization'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.get_clinical_composer_context('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','a foreign-tenant dentist reads no composer context at another organization''s branch'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.get_clinical_composer_context('f7300000-0000-0000-0000-000000000001','f7500000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','a receptionist reads no clinical composer context at all'
);

reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
