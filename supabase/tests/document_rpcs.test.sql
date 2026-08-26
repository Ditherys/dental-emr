begin;

select extensions.no_plan();

-- Synthetic-only P11-03 graph. The document RPCs are SECURITY DEFINER and read
-- the actor from the request.jwt.claim.sub GUC, so the whole chain runs as
-- postgres with set_config-driven auth.uid(); base tables stay deny-by-default
-- and are never touched by the authenticated role. dentist-a is the positive
-- generator/viewer (DENTIST with document.generate + document.view at A Main);
-- receptionist-a holds document.view only (RECEPTIONIST); billing-a holds no
-- document permission; dentist-b is a foreign-organization DENTIST. patient-a
-- carries primary MOBILE + EMAIL contacts, one referral, and one appointment;
-- patient-b lives in Org B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1103.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1103.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1103.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1103.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e2000000-0000-0000-0000-000000000001','P1103 Synthetic A Inc.','P1103 A','p1103-a'),
  ('e2000000-0000-0000-0000-000000000002','P1103 Synthetic B Inc.','P1103 B','p1103-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1103 A Main','p1103-a-main','P1103-A','1 Synthetic St','Test City','Test Province'),
  ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1103 B Main','p1103-b-main','P1103-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e4000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e4000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e4000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e4000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','active'),
  ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000002','active'),
  ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000003','active'),
  ('e2000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000002','e4000000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e4000000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,'e3000000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000001'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e4000000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'e3000000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000002'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e4000000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'e3000000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000003'::uuid),
  ('e2000000-0000-0000-0000-000000000002'::uuid,'e4000000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,'e3000000-0000-0000-0000-000000000002'::uuid,'e1000000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e5000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1103-A-0001','Patient','A',date '1990-01-01','e3000000-0000-0000-0000-000000000001'),
  ('e5000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1103-B-0001','Patient','B',date '1991-01-01','e3000000-0000-0000-0000-000000000002');
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('e5100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','MOBILE','+639170000001',true,'active'),
  ('e5100000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','EMAIL','patient.a@example.test',true,'active');
insert into public.patient_referrals (id, org_id, patient_id, direction, status, required_specialty_id, external_party_name, external_party_organization, external_party_contact, notes) values
  ('e5200000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','OUT','ACTIVE',(select id from public.specialties where organization_id is null and code='ORTHODONTICS'),'Acme Dental Referral Center','Acme Inc.','+639199999999','For orthodontic evaluation.');
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status) values
  ('e8000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','PENDING');

-- Boundary assertions: four SECURITY DEFINER definers pin an empty search path,
-- only authenticated holds the three RPC grants, and the single private helper
-- is revoked from every browser and service role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.generate_document(uuid,uuid,text,jsonb)'::regprocedure,
  'public.list_documents(uuid,uuid,text)'::regprocedure,
  'public.get_document_snapshot(uuid,uuid)'::regprocedure,
  'private.has_document_permission_at_branch(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),4,'the four P11-03 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.generate_document(uuid,uuid,text,jsonb)','execute')
  and has_function_privilege('authenticated','public.list_documents(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.get_document_snapshot(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.generate_document(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.generate_document(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.list_documents(uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.get_document_snapshot(uuid,uuid)','execute'),
  'only authenticated has the three exact P11-03 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_document_permission_at_branch(uuid,text)')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the document permission helper is not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);

-- generate_document positive: a dentist generates a full patient record summary.
select extensions.is((select version from public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','{"demographics":true,"referrals":true,"appointments":true}'::jsonb)),1,'a dentist generates a patient record summary at version one');
select extensions.is((select count(*)::integer from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),1,'the patient record summary row is stored');
select extensions.ok((select data_snapshot->'demographics'->>'firstName'='Patient' and data_snapshot->'demographics'->>'lastName'='A' and data_snapshot->'demographics'->>'patientNumber'='P1103-A-0001' from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),'the demographics section carries the patient identity');
select extensions.is((select jsonb_array_length(data_snapshot->'demographics'->'contacts') from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),2,'the demographics section carries the active contacts');
select extensions.is((select jsonb_array_length(data_snapshot->'referrals') from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),1,'the patient record summary snapshot carries the patient referral');
select extensions.ok((select data_snapshot->'referrals'->0->>'externalPartyName'='Acme Dental Referral Center' and data_snapshot->'referrals'->0->>'direction'='OUT' from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),'the referral section carries the external party');
select extensions.is((select jsonb_array_length(data_snapshot->'appointments') from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),1,'the patient record summary snapshot carries the bounded appointment list');
select extensions.ok((select data_snapshot->'appointments'->0->>'schedulingStatus'='SCHEDULED' and data_snapshot->'appointments'->0->>'branchId'='e3000000-0000-0000-0000-000000000001' from public.documents where document_type='PATIENT_RECORD_SUMMARY' and patient_id='e5000000-0000-0000-0000-000000000001'),'the appointments section carries a bounded appointment projection');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='document.generated' and metadata->>'document_type'='PATIENT_RECORD_SUMMARY' and metadata->'include_set'->>'demographics'='true' and metadata->'include_set'->>'referrals'='true' and metadata->'include_set'->>'appointments'='true'),1,'generation appends one audit event with document_type and include_set metadata');
select extensions.ok((select entity_type='document' and entity_id is not null and patient_id='e5000000-0000-0000-0000-000000000001' and result='SUCCESS' and actor_user_id='e1000000-0000-0000-0000-000000000001' from public.audit_events where action='document.generated' and metadata->>'document_type'='PATIENT_RECORD_SUMMARY'),'the document audit event links actor, document entity, and patient');

-- generate_document positive for the remaining two types and per-type section
-- allowlists.
select extensions.is((select version from public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','APPOINTMENT_SLIP','{"demographics":true,"appointments":true}'::jsonb)),1,'a dentist generates an appointment slip at version one');
select extensions.ok((select (data_snapshot ? 'demographics') and (data_snapshot ? 'appointments') and not (data_snapshot ? 'referrals') from public.documents where document_type='APPOINTMENT_SLIP' and include_set ? 'demographics' and include_set ? 'appointments'),'the appointment slip snapshot includes demographics and appointments and excludes referrals');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='document.generated' and metadata->>'document_type'='APPOINTMENT_SLIP'),1,'appointment slip generation appends one audit event');
select extensions.is((select version from public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','REFERRAL_LETTER','{"demographics":true,"referrals":true}'::jsonb)),1,'a dentist generates a referral letter at version one');
select extensions.ok((select (data_snapshot ? 'demographics') and (data_snapshot ? 'referrals') and not (data_snapshot ? 'appointments') from public.documents where document_type='REFERRAL_LETTER'),'the referral letter snapshot includes demographics and referrals and excludes appointments');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='document.generated' and metadata->>'document_type'='REFERRAL_LETTER'),1,'referral letter generation appends one audit event');

-- include_set is respected exactly: an appointment slip generated without the
-- demographics section carries no demographics data.
select extensions.is((select version from public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','APPOINTMENT_SLIP','{"appointments":true}'::jsonb)),1,'a dentist generates an appointments-only appointment slip');
select extensions.ok((select not (data_snapshot ? 'demographics') and (data_snapshot ? 'appointments') from public.documents where document_type='APPOINTMENT_SLIP' and include_set ? 'appointments' and not (include_set ? 'demographics')),'sections excluded from the include set are absent from the snapshot');

-- A default (empty) include set produces an empty snapshot: never a blind full
-- export of the patient record.
select extensions.is((select version from public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY')),1,'a dentist generates a patient record summary with the default include set');
select extensions.ok((select data_snapshot='{}'::jsonb and include_set='{}'::jsonb from public.documents where document_type='PATIENT_RECORD_SUMMARY' and include_set='{}'::jsonb),'a default include set yields an empty snapshot rather than a blind export');

-- generate_document validation: type allowlist, include-set allowlist, value
-- types, and tenant scope.
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PRESCRIPTION','{"demographics":true}'::jsonb)$$,'22023','invalid input','unknown document types are rejected');
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','{"medicalHistory":true}'::jsonb)$$,'22023','invalid input','an unknown include-set key is rejected for the type');
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','REFERRAL_LETTER','{"appointments":true}'::jsonb)$$,'22023','invalid input','a section not allowed for the type is rejected');
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','{"demographics":"yes"}'::jsonb)$$,'22023','invalid input','non-boolean include-set values are rejected');
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','[]'::jsonb)$$,'22023','invalid input','a non-object include set is rejected');
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000002','PATIENT_RECORD_SUMMARY','{"demographics":true}'::jsonb)$$,'42501','not authorized','a foreign-organization patient is denied');

-- document.view-only users can read but cannot generate; a user with no
-- document permission can do neither.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','{"demographics":true}'::jsonb)$$,'42501','not authorized','a document.view-only receptionist cannot generate documents');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.generate_document('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PATIENT_RECORD_SUMMARY','{"demographics":true}'::jsonb)$$,'42501','not authorized','a billing user without document permission cannot generate documents');
select extensions.throws_ok($$select public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user without document permission cannot list documents');
select extensions.throws_ok($$select public.get_document_snapshot('e3000000-0000-0000-0000-000000000001',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals'))$$,'42501','not authorized','a billing user without document permission cannot read a snapshot');

-- list_documents: bounded projection without the snapshot body, type filter,
-- and tenant isolation.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
select extensions.ok((select pg_proc.proargnames::text[] from pg_proc where pg_proc.oid='public.list_documents(uuid,uuid,text)'::regprocedure) @> array['document_id','document_type','template_version','include_set','generated_by','generated_at','version'],'list_documents exposes only the approved projection');
select extensions.throws_ok($$select listed.data_snapshot from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001') as listed$$,'42703',null,'list never exposes the data snapshot body');
select extensions.is((select count(*)::integer from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001')),5,'list returns every generated document for the acting branch and patient');
select extensions.is((select count(*)::integer from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','APPOINTMENT_SLIP')),2,'list filters by document type');
select extensions.is((select count(*)::integer from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','REFERRAL_LETTER')),1,'list filters to the referral letter');
select extensions.is((select document_type from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001') where document_type='PATIENT_RECORD_SUMMARY' and include_set='{}'::jsonb),'PATIENT_RECORD_SUMMARY','list renders the include set of a generated document');
select extensions.throws_ok($$select public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','PRESCRIPTION')$$,'22023','invalid input','list rejects an unknown document type');
select extensions.throws_ok($$select public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000002')$$,'42501','not authorized','a foreign-organization patient is denied on list');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001')),5,'a document.view-only receptionist can list generated documents');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.list_documents('e3000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization dentist cannot list Org A documents');

-- get_document_snapshot: reproducible re-render, tenant isolation, and
-- document.view-only read access.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
select extensions.ok(
  (select snapshot.data_snapshot = doc.data_snapshot
   from public.get_document_snapshot('e3000000-0000-0000-0000-000000000001',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals')) as snapshot
   join public.documents as doc on doc.id = snapshot.document_id),
  'get_document_snapshot reproduces the exact stored snapshot (jsonb equality)'
);
select extensions.ok(
  (select snapshot.data_snapshot::text = doc.data_snapshot::text
   from public.get_document_snapshot('e3000000-0000-0000-0000-000000000001',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals')) as snapshot
   join public.documents as doc on doc.id = snapshot.document_id),
  'a re-render from the RPC is byte-identical to the stored snapshot'
);
select extensions.is((select version from public.get_document_snapshot('e3000000-0000-0000-0000-000000000001',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals'))),1,'get_document_snapshot returns the stored version');
select extensions.throws_ok($$select public.get_document_snapshot('e3000000-0000-0000-0000-000000000002',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals'))$$,'42501','not authorized','a document from another branch is not readable through the acting branch');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
select extensions.is((select version from public.get_document_snapshot('e3000000-0000-0000-0000-000000000001',(select id from public.documents where document_type='PATIENT_RECORD_SUMMARY' and data_snapshot ? 'referrals'))),1,'a document.view-only receptionist can read a generated document snapshot');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;