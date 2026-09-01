begin;

select extensions.no_plan();

-- Synthetic-only P14-03 graph, GUC-as-postgres. Owner/dentist A is the positive
-- writer; dental assistant A reads only; receptionist and billing A have no
-- clinical permission; dentist B is foreign. provider-a1 is active at A Main,
-- provider-a2 is active only at A Branch 2, provider-a3 is inactive, and
-- provider-b is foreign. Fixture inserts run as the owner; every browser-callable
-- RPC runs with set local role authenticated plus the request jwt claim. The
-- superseded `create_clinical_encounter_v2` is no longer browser-callable, so its
-- probes set only the jwt claim (see the note above encounter 1).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1403.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@p1403.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1403.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1403.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1403.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7200000-0000-0000-0000-000000000001','P1403 Synthetic A Inc.','P1403 A','p1403-a'),
  ('b7200000-0000-0000-0000-000000000002','P1403 Synthetic B Inc.','P1403 B','p1403-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1403 A Main','p1403-a-main','P1403-A','1 Synthetic St','Test City','Test Province'),
  ('b7300000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001','P1403 A Branch 2','p1403-a-2','P1403-A2','2 Synthetic St','Test City','Test Province'),
  ('b7300000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000002','P1403 B Main','p1403-b-main','P1403-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b7400000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000004','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000005','b7200000-0000-0000-0000-000000000002','b7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000001','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000002','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000003','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000004','active'),
  ('b7200000-0000-0000-0000-000000000002','b7300000-0000-0000-0000-000000000003','b7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'b7300000-0000-0000-0000-000000000001'::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000004'::uuid,'BILLING'::text,'b7300000-0000-0000-0000-000000000001'::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000002'::uuid,'b7400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7500000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1403-A-1','Patient','A',date '1990-01-01','b7300000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','P1403-B-1','Patient','B',date '1991-01-01',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('c9100000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('c9100000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001',null,'Dentist','A2','REGULAR','active'),
  ('c9100000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000001',null,'Dentist','A3','REGULAR','inactive'),
  ('c9100000-0000-0000-0000-000000000004','b7200000-0000-0000-0000-000000000002',null,'Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b7200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001',true),
  ('b7200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000002','b7300000-0000-0000-0000-000000000002',true),
  ('b7200000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000004','b7300000-0000-0000-0000-000000000003',true);
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, created_by) values
  ('b7600000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','b7100000-0000-0000-0000-000000000001'),
  ('b7600000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000002','2026-01-05 10:00:00+00','2026-01-05 10:30:00+00','SCHEDULED','b7100000-0000-0000-0000-000000000005');

create temp table p1403_encounters (seq integer primary key, id uuid);
create temp table p1403_notes (seq integer primary key, id uuid);
create temp table p1403_medical (seq integer primary key, id uuid);
create temp table p1403_prescriptions (seq integer primary key, id uuid);
grant select on p1403_encounters to authenticated;
grant select on p1403_notes to authenticated;
grant select on p1403_medical to authenticated;
grant select on p1403_prescriptions to authenticated;

select extensions.ok(
  has_function_privilege('authenticated','public.create_clinical_note(uuid,uuid,text,text)','execute')
  and has_function_privilege('authenticated','public.update_clinical_note(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.finalize_clinical_note(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.amend_clinical_note(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.finalize_clinical_encounter(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.create_patient_medical_record(uuid,uuid,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.void_patient_medical_record(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.list_clinical_encounters(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.get_clinical_encounter_detail(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.list_patient_medical_records(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.create_prescription(uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.finalize_prescription(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.create_clinical_encounter(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.create_clinical_encounter_v2(uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','public.create_clinical_encounter(uuid,uuid,uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.create_clinical_encounter(uuid,uuid,uuid,uuid)','execute'),
  'only authenticated has the twelve exact P14-03 RPC grants plus the managed visit lifecycle, and neither manual encounter-creation path is browser-callable'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_clinical_encounter_v2(uuid,uuid,uuid)'::regprocedure,'public.create_clinical_note(uuid,uuid,text,text)'::regprocedure,'public.update_clinical_note(uuid,uuid,integer,text)'::regprocedure,'public.finalize_clinical_note(uuid,uuid,integer)'::regprocedure,'public.amend_clinical_note(uuid,uuid,integer,text)'::regprocedure,'public.finalize_clinical_encounter(uuid,uuid,integer)'::regprocedure,'public.create_patient_medical_record(uuid,uuid,text,jsonb)'::regprocedure,'public.void_patient_medical_record(uuid,uuid,integer)'::regprocedure,'public.list_clinical_encounters(uuid,uuid)'::regprocedure,'public.get_clinical_encounter_detail(uuid,uuid)'::regprocedure,'public.list_patient_medical_records(uuid,uuid,text)'::regprocedure,'public.create_prescription(uuid,uuid,jsonb)'::regprocedure,'public.finalize_prescription(uuid,uuid,integer)'::regprocedure,'public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)'::regprocedure,'private.has_clinical_permission_at_branch(uuid,text)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),15,'the managed visit lifecycle, the actor-derived encounter RPC, and thirteen P14-03 definers pin an empty search path');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.has_clinical_permission_at_branch(uuid,text)'::regprocedure
    and (
      has_function_privilege('public','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('anon','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('authenticated','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('service_role','private.has_clinical_permission_at_branch(uuid,text)','execute')
    )
),'the clinical permission helper is revoked from every browser and service role');
select extensions.ok(
  private.audit_metadata_is_safe('{"parent_note_id":"b7600000-0000-0000-0000-000000000001"}'::jsonb)
  and private.audit_metadata_is_safe('{"record_type":"CONDITION"}'::jsonb)
  and private.audit_metadata_is_safe('{"dimension":"encounter_status","old_value":"IN_CHAIR","new_value":"COMPLETED"}'::jsonb)
  and not private.audit_metadata_is_safe('{"parent_note_id":"not-a-uuid"}'::jsonb)
  and not private.audit_metadata_is_safe('{"record_type":"LAB_RESULT"}'::jsonb)
  and not private.audit_metadata_is_safe('{"note_content":"synthetic clinical text"}'::jsonb),
  'the audit metadata allow-list extends to the bounded clinical parent_note_id/record_type keys and still rejects unknown keys'
);

-- Encounter 1: positive creation with an appointment and actor-derived provider link.
-- The managed visit lifecycle now owns the browser encounter-creation boundary, so
-- `create_clinical_encounter_v2` is no longer executable by `authenticated`. Its
-- internal tenant, provider, appointment, and role invariants are still exercised
-- here by invoking the SECURITY DEFINER body with the signed-in actor's JWT claim,
-- which is what `auth.uid()` reads; the grant boundary itself is asserted above.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','b7600000-0000-0000-0000-000000000001')),1,'dentist A opens an encounter linking the appointment and the signed-in dentist provider at version one');
reset role;
insert into p1403_encounters (seq, id)
select 1, encounter.id
from public.clinical_encounters as encounter
where encounter.organization_id='b7200000-0000-0000-0000-000000000001'
  and encounter.appointment_id='b7600000-0000-0000-0000-000000000001';
select extensions.ok((select status='OPEN' and treating_provider_id='c9100000-0000-0000-0000-000000000001' and patient_id='b7500000-0000-0000-0000-000000000001' and branch_id='b7300000-0000-0000-0000-000000000001' and version=1 and created_by='b7100000-0000-0000-0000-000000000001' from public.clinical_encounters where id=(select id from p1403_encounters where seq=1)),'create derives the tenant and persists the appointment/provider/patient links as OPEN');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.encounter.opened' and patient_id='b7500000-0000-0000-0000-000000000001' and entity_id=(select id from p1403_encounters where seq=1)),1,'create writes exactly one opaque clinical.encounter.opened audit event');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000002','b7600000-0000-0000-0000-000000000002')$$,'42501','not authorized','create safely denies a foreign patient');
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','b7600000-0000-0000-0000-000000000002')$$,'22023','invalid input','create rejects a foreign appointment');
reset role;
update public.providers set linked_user_id = null where id = 'c9100000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','create requires the signed-in dentist to have an active linked provider');
reset role;
update public.providers set linked_user_id = 'b7100000-0000-0000-0000-000000000001' where id = 'c9100000-0000-0000-0000-000000000001';
reset role;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','receptionist without clinical.write cannot open encounters');
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','billing without clinical.write cannot open encounters');
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','dental assistant with only clinical.read cannot open encounters');
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','a foreign branch acting user cannot open encounters for another tenant');
reset role;

-- Note lifecycle on encounter 1: create DRAFT, update, finalize, immutable, amend.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),'PROGRESS','Initial exam note')),1,'dentist A creates a DRAFT progress note at version one');
reset role;
insert into p1403_notes (seq, id)
select 1, note.id
from public.clinical_notes as note
where note.organization_id='b7200000-0000-0000-0000-000000000001'
  and note.encounter_id=(select id from p1403_encounters where seq=1)
  and note.note_type='PROGRESS'
  and note.content='Initial exam note';
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.created' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'create note writes exactly one clinical.note.created audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.update_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_notes where seq=1),1,'Updated exam note')),2,'a DRAFT note updates with an optimistic version bump');
reset role;
select extensions.ok((select content='Updated exam note' and status='DRAFT' and version=2 from public.clinical_notes where id=(select id from p1403_notes where seq=1)),'update persists the new content and version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.updated' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'update writes exactly one clinical.note.updated audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.finalize_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_notes where seq=1),2)),3,'a DRAFT note finalizes with finalized_at and a version bump');
reset role;
select extensions.ok((select status='FINALIZED' and finalized_at is not null and version=3 from public.clinical_notes where id=(select id from p1403_notes where seq=1)),'finalize persists FINALIZED status and finalized_at');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'finalize writes exactly one clinical.note.finalized audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.update_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_notes where seq=1),3,'rewrite')$$,'P0001','invalid state','update rejects a FINALIZED note');
reset role;
select extensions.throws_ok($$update public.clinical_notes set content='rewrite' where id=(select id from p1403_notes where seq=1)$$,'23514','finalized clinical notes are immutable; create an amendment','the immutable trigger rejects the direct UPDATE of a FINALIZED note');
select extensions.throws_ok($$delete from public.clinical_notes where id=(select id from p1403_notes where seq=1)$$,'23514','finalized clinical notes are immutable; create an amendment','the immutable trigger rejects the direct DELETE of a FINALIZED note');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.amend_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_notes where seq=1),3,'Corrected the dosage advice.')),1,'amending a FINALIZED note creates a FINALIZED AMENDMENT child at version one');
reset role;
insert into p1403_notes (seq, id)
select 2, note.id
from public.clinical_notes as note
where note.organization_id='b7200000-0000-0000-0000-000000000001'
  and note.note_type='AMENDMENT'
  and note.parent_note_id=(select id from p1403_notes where seq=1);
select extensions.ok((select status='FINALIZED' and finalized_at is not null and content='Corrected the dosage advice.' from public.clinical_notes where id=(select id from p1403_notes where seq=2)),'the AMENDMENT child is finalized directly with the amendment content');
select extensions.ok((select content='Updated exam note' and status='FINALIZED' from public.clinical_notes where id=(select id from p1403_notes where seq=1)),'the amended original note is preserved unchanged');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.amended' and patient_id='b7500000-0000-0000-0000-000000000001' and metadata->>'parent_note_id'=(select id::text from p1403_notes where seq=1)),1,'amend writes exactly one clinical.note.amended audit event with the parent link');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),'PROGRESS','Draft note for amendment rejection')),1,'a third DRAFT note is created for the amend-on-draft probe');
reset role;
insert into p1403_notes (seq, id)
select 3, note.id
from public.clinical_notes as note
where note.organization_id='b7200000-0000-0000-0000-000000000001'
  and note.encounter_id=(select id from p1403_encounters where seq=1)
  and note.note_type='PROGRESS'
  and note.content='Draft note for amendment rejection';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.amend_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_notes where seq=3),1,'amend a draft')$$,'P0001','invalid state','amending a DRAFT parent is rejected');
select extensions.is((select version from public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),'PROGRESS','Note to be finalized with the encounter')),1,'a fourth DRAFT note is created before the encounter is finalized');
reset role;
insert into p1403_notes (seq, id)
select 4, note.id
from public.clinical_notes as note
where note.organization_id='b7200000-0000-0000-0000-000000000001'
  and note.encounter_id=(select id from p1403_encounters where seq=1)
  and note.note_type='PROGRESS'
  and note.content='Note to be finalized with the encounter';

-- Finalize the whole encounter.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.finalize_clinical_encounter('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),1)),2,'finalizing the encounter bumps its version');
reset role;
select extensions.ok((select status='FINALIZED' and finalized_at is not null and version=2 from public.clinical_encounters where id=(select id from p1403_encounters where seq=1)),'finalizing the encounter marks it FINALIZED');
select extensions.ok((select status='FINALIZED' and finalized_at is not null from public.clinical_notes where id=(select id from p1403_notes where seq=4)),'finalizing the encounter finalizes its remaining DRAFT notes');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.encounter.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'finalize encounter writes exactly one clinical.encounter.finalized audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),'PROGRESS','Too late')$$,'22023','invalid input','notes cannot be added to a FINALIZED encounter');
select extensions.throws_ok($$select public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1),'[{"medicationName":"Late"}]'::jsonb)$$,'22023','invalid input','prescriptions cannot be created on a FINALIZED encounter');
reset role;

-- Medical / allergy / medication records.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','CONDITION','{"conditionName":"Hypertension","status":"active","notes":"Managed by primary dentist."}'::jsonb)),1,'a medical condition is recorded at version one');
select extensions.is((select version from public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','ALLERGY','{"allergen":"Penicillin","severity":"SEVERE","reaction":"Anaphylaxis"}'::jsonb)),1,'an allergy is recorded at version one');
select extensions.is((select version from public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','MEDICATION','{"medicationName":"Metformin","dose":"500mg","frequency":"twice daily"}'::jsonb)),1,'a medication is recorded at version one');
reset role;
insert into p1403_medical (seq, id)
select 1, condition.id from public.patient_medical_conditions as condition
where condition.organization_id='b7200000-0000-0000-0000-000000000001' and condition.condition_name='Hypertension';
insert into p1403_medical (seq, id)
select 2, allergy.id from public.patient_allergies as allergy
where allergy.organization_id='b7200000-0000-0000-0000-000000000001' and allergy.allergen='Penicillin';
insert into p1403_medical (seq, id)
select 3, medication.id from public.patient_medications as medication
where medication.organization_id='b7200000-0000-0000-0000-000000000001' and medication.medication_name='Metformin';
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.medical_record.created' and patient_id='b7500000-0000-0000-0000-000000000001'),3,'each medical/allergy/medication create writes one audit event with the record type');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.void_patient_medical_record('b7300000-0000-0000-0000-000000000001',(select id from p1403_medical where seq=1),1)),2,'voiding a record bumps its version');
reset role;
select extensions.ok((select status='voided' and voided_at is not null and version=2 from public.patient_medical_conditions where id=(select id from p1403_medical where seq=1)),'void stamps voided_at and flips status while preserving the row');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.medical_record.voided' and patient_id='b7500000-0000-0000-0000-000000000001' and metadata->>'record_type'='CONDITION'),1,'void writes exactly one clinical.medical_record.voided audit event with the record type');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','LAB_RESULT','{"label":"x"}'::jsonb)$$,'22023','invalid input','unknown record types are rejected');
select extensions.throws_ok($$select public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','CONDITION','{"conditionName":"Hypertension","organizationId":"b7200000-0000-0000-0000-000000000001"}'::jsonb)$$,'22023','invalid input','tenant mass assignment in a medical payload is rejected');
select extensions.throws_ok($$select public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000002','CONDITION','{"conditionName":"Foreign"}'::jsonb)$$,'42501','not authorized','foreign patients are denied medical records');
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.create_patient_medical_record('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','CONDITION','{"conditionName":"Denied"}'::jsonb)$$,'42501','not authorized','a read-only assistant cannot write medical records');
select extensions.throws_ok($$select public.void_patient_medical_record('b7300000-0000-0000-0000-000000000001',(select id from p1403_medical where seq=2),1)$$,'42501','not authorized','a read-only assistant cannot void records');
reset role;

-- Prescriptions on a fresh OPEN encounter.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)),1,'a second OPEN encounter is created for the prescription flow');
reset role;
insert into p1403_encounters (seq, id)
select 2, encounter.id
from public.clinical_encounters as encounter
where encounter.organization_id='b7200000-0000-0000-0000-000000000001'
  and encounter.patient_id='b7500000-0000-0000-0000-000000000001'
  and encounter.appointment_id is null
  and encounter.status='OPEN';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2),'[{"medicationName":"Amoxicillin","dosage":"500mg","frequency":"3x daily"}]'::jsonb)),1,'a DRAFT prescription is created at version one');
reset role;
insert into p1403_prescriptions (seq, id)
select 1, prescription.id
from public.prescriptions as prescription
where prescription.organization_id='b7200000-0000-0000-0000-000000000001'
  and prescription.items @> '[{"medicationName":"Amoxicillin"}]'::jsonb;
select extensions.ok((select status='DRAFT' and patient_id='b7500000-0000-0000-0000-000000000001' and provider_id='c9100000-0000-0000-0000-000000000001' and encounter_id=(select id from p1403_encounters where seq=2) from public.prescriptions where id=(select id from p1403_prescriptions where seq=1)),'create derives patient and provider from the encounter');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.prescription.created' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'create prescription writes exactly one clinical.prescription.created audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.finalize_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_prescriptions where seq=1),1)),2,'finalizing the prescription bumps its version');
reset role;
select extensions.ok((select status='FINALIZED' and finalized_at is not null and version=2 from public.prescriptions where id=(select id from p1403_prescriptions where seq=1)),'finalize marks the prescription FINALIZED');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.prescription.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'finalize prescription writes exactly one clinical.prescription.finalized audit event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.finalize_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_prescriptions where seq=1),2)$$,'P0001','invalid state','an already-FINALIZED prescription rejects further finalization');
select extensions.throws_ok($$select public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2),'{"medicationName":"Not an array"}'::jsonb)$$,'22023','invalid input','prescription items must be a JSON array');
select extensions.throws_ok($$select public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2),'[{"medicationName":"Amoxicillin","doseAmount":500}]'::jsonb)$$,'22023','invalid input','unknown item keys are rejected');
select extensions.throws_ok($$select public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2),'[{"medicationName":"   "}]'::jsonb)$$,'22023','invalid input','blank medication names are rejected');
select extensions.throws_ok($$select public.create_prescription('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2),('[' || repeat('{"medicationName":"A"},',1200) || '{"medicationName":"B"}]')::jsonb)$$,'22023','invalid input','oversized item arrays are rejected');
reset role;
select extensions.throws_ok($$update public.prescriptions set items='[{"medicationName":"Other"}]'::jsonb where id=(select id from p1403_prescriptions where seq=1)$$,'23514','finalized prescriptions are immutable; create a new prescription','the immutable trigger rejects the direct UPDATE of a FINALIZED prescription');
select extensions.throws_ok($$delete from public.prescriptions where id=(select id from p1403_prescriptions where seq=1)$$,'23514','finalized prescriptions are immutable; create a new prescription','the immutable trigger rejects the direct DELETE of a FINALIZED prescription');

-- Reads: dental assistant may read, reception may not, tenant isolation holds,
-- and read projections write no audit events.
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b7500000-0000-0000-0000-000000000001'),15,'audit count is 15 before the read probes');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.list_clinical_encounters('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001')),2,'a dental assistant can list both branch encounters without note bodies');
select extensions.is((select status from public.list_clinical_encounters('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001') where encounter_id=(select id from p1403_encounters where seq=1)),'FINALIZED','list projects the bounded encounter fields');
select extensions.is((select jsonb_array_length(public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1)) -> 'notes')),4,'encounter detail returns the full note history in amendment-chain order');
select extensions.ok((select (public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1)) #>> '{encounter,status}')='FINALIZED'),'encounter detail returns the encounter projection');
select extensions.ok((select exists (select 1 from jsonb_array_elements(public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1)) -> 'notes') as note where note->>'noteType'='AMENDMENT' and note->>'parentNoteId'=(select id::text from p1403_notes where seq=1) and note->>'content'='Corrected the dosage advice.')),'the amendment child appears after its unchanged parent in the detail');
select extensions.is((select jsonb_array_length(public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=2)) -> 'prescriptions')),1,'encounter detail returns the encounter prescriptions');
select extensions.is((select count(*)::integer from public.list_patient_medical_records('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)),3,'a dental assistant can list all medical history rows including voided ones');
select extensions.is((select count(*)::integer from public.list_patient_medical_records('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','ALLERGY')),1,'the record-type filter narrows the medical history');
select extensions.ok((select (record->>'recordId')=(select id::text from p1403_medical where seq=1) and (record->>'status')='voided' from public.list_patient_medical_records('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null) where record_type='CONDITION'),'the voided condition remains visible as preserved history');
select extensions.throws_ok($$select public.list_patient_medical_records('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','LAB')$$,'22023','invalid input','an unknown record-type filter is rejected');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b7500000-0000-0000-0000-000000000001'),15,'read probes leave the audit count unchanged');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_clinical_encounters('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001')$$,'42501','not authorized','receptionist without clinical.read cannot list encounters');
select extensions.throws_ok($$select public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=1))$$,'42501','not authorized','receptionist cannot read encounter detail');
select extensions.throws_ok($$select public.list_patient_medical_records('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','receptionist cannot read medical history');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.list_clinical_encounters('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign branch user cannot read another tenant clinical data');
select extensions.throws_ok($$select public.get_clinical_encounter_detail('b7300000-0000-0000-0000-000000000003',(select id from p1403_encounters where seq=1))$$,'42501','not authorized','foreign tenant encounter detail is denied');
reset role;

-- Exactly-one-audit-per-mutation and audit-rollback (blocked audit rolls back).
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.encounter.opened' and patient_id='b7500000-0000-0000-0000-000000000001'),2,'exactly two encounter.opened audits for the two successful encounters');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.created' and patient_id='b7500000-0000-0000-0000-000000000001'),3,'exactly three note.created audits for the three notes created so far');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.updated' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one note.updated audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one note.finalized audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.amended' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one note.amended audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.medical_record.created' and patient_id='b7500000-0000-0000-0000-000000000001'),3,'exactly three medical_record.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.medical_record.voided' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one medical_record.voided audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.prescription.created' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one prescription.created audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.prescription.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'exactly one prescription.finalized audit');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_encounter_v2('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',null)),1,'a third OPEN encounter is created for the audit-rollback probe');
reset role;
insert into p1403_encounters (seq, id)
select 3, encounter.id
from public.clinical_encounters as encounter
where encounter.organization_id='b7200000-0000-0000-0000-000000000001'
  and encounter.patient_id='b7500000-0000-0000-0000-000000000001'
  and encounter.appointment_id is null
  and encounter.status='OPEN'
  and not exists (select 1 from p1403_encounters where p1403_encounters.id = encounter.id);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=3),'PROGRESS','Draft on encounter three')),1,'a DRAFT note is created on the rollback probe encounter');
reset role;
insert into p1403_notes (seq, id)
select 5, note.id
from public.clinical_notes as note
where note.organization_id='b7200000-0000-0000-0000-000000000001'
  and note.encounter_id=(select id from p1403_encounters where seq=3)
  and note.content='Draft on encounter three';

create function private.p1403_block_clinical_audit() returns trigger language plpgsql as $$begin if new.action in ('clinical.note.created','clinical.encounter.finalized') then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p1403_block_clinical_audit before insert on public.audit_events for each row execute function private.p1403_block_clinical_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_clinical_note('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=3),'PROGRESS','Note with blocked audit')$$,'P0001','audit blocked','a failing clinical.note.created audit event rejects the note');
select extensions.throws_ok($$select public.finalize_clinical_encounter('b7300000-0000-0000-0000-000000000001',(select id from p1403_encounters where seq=3),1)$$,'P0001','audit blocked','a failing clinical.encounter.finalized audit event rejects the finalization');
reset role;
select extensions.ok(not exists (select 1 from public.clinical_notes where organization_id='b7200000-0000-0000-0000-000000000001' and content='Note with blocked audit'),'a blocked audit rolls back the new note row entirely');
select extensions.ok((select status='OPEN' and version=1 from public.clinical_encounters where id=(select id from p1403_encounters where seq=3)),'a blocked audit rolls back the encounter finalization');
select extensions.ok((select status='DRAFT' from public.clinical_notes where id=(select id from p1403_notes where seq=5)),'a blocked audit keeps the encounter notes DRAFT');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.note.created' and patient_id='b7500000-0000-0000-0000-000000000001'),4,'a blocked audit rolls back its own audit row, leaving four note.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.encounter.finalized' and patient_id='b7500000-0000-0000-0000-000000000001'),1,'a blocked audit rolls back its own audit row, leaving one encounter.finalized audit');
drop trigger p1403_block_clinical_audit on public.audit_events;
drop function private.p1403_block_clinical_audit();

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
