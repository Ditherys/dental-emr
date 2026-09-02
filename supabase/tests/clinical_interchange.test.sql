-- Unified Clinical Chart workspace, task 15: the staged clinical interchange.
--
-- The one property this suite exists to prove is that PARSING IS NOT A CLINICAL
-- WRITE. Staging a batch creates tenant- and patient-scoped candidates and
-- nothing else: no encounter, no tooth entry, no chart change. Only a clinician
-- with an active provider link at the acting branch may then apply the
-- candidates they explicitly selected, through the existing managed-visit
-- writer, appending records and never replacing the chart.
--
-- Self-contained synthetic tenant; every row is rolled back.
begin;
select extensions.no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('1c100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','interchange-dentist@synthetic.test','',now(),'{}','{}',now(),now()),
 ('1c100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','interchange-owner@synthetic.test','',now(),'{}','{}',now(),now()),
 ('1c100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','interchange-reception@synthetic.test','',now(),'{}','{}',now(),now()),
 ('1c100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','interchange-foreign@synthetic.test','',now(),'{}','{}',now(),now()),
 ('1c100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','interchange-assistant@synthetic.test','',now(),'{}','{}',now(),now());

insert into public.organizations(id,legal_name,business_name,slug) values
 ('1c200000-0000-0000-0000-000000000001','Interchange Synthetic Inc','Interchange Synthetic','interchange-synthetic'),
 ('1c200000-0000-0000-0000-000000000002','Interchange Foreign Inc','Interchange Foreign','interchange-foreign');

insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values
 ('1c300000-0000-0000-0000-000000000001','1c200000-0000-0000-0000-000000000001','Interchange Main','interchange-main','IC1','1 Synthetic','Test','Test'),
 ('1c300000-0000-0000-0000-000000000002','1c200000-0000-0000-0000-000000000001','Interchange Second','interchange-second','IC2','2 Synthetic','Test','Test'),
 ('1c300000-0000-0000-0000-000000000003','1c200000-0000-0000-0000-000000000002','Foreign Main','foreign-main','FC1','3 Synthetic','Test','Test');

insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values
 ('1c400000-0000-0000-0000-000000000001','1c200000-0000-0000-0000-000000000001','1c100000-0000-0000-0000-000000000001','active',now()),
 ('1c400000-0000-0000-0000-000000000002','1c200000-0000-0000-0000-000000000001','1c100000-0000-0000-0000-000000000002','active',now()),
 ('1c400000-0000-0000-0000-000000000003','1c200000-0000-0000-0000-000000000001','1c100000-0000-0000-0000-000000000003','active',now()),
 ('1c400000-0000-0000-0000-000000000004','1c200000-0000-0000-0000-000000000002','1c100000-0000-0000-0000-000000000004','active',now()),
 ('1c400000-0000-0000-0000-000000000005','1c200000-0000-0000-0000-000000000001','1c100000-0000-0000-0000-000000000005','active',now());

insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values
 ('1c200000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000001','active'),
 ('1c200000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000002','1c400000-0000-0000-0000-000000000001','active'),
 ('1c200000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000002','active'),
 ('1c200000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000003','active'),
 ('1c200000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000005','active'),
 ('1c200000-0000-0000-0000-000000000002','1c300000-0000-0000-0000-000000000003','1c400000-0000-0000-0000-000000000004','active');

insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select '1c200000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000001',id,null,'1c100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='DENTIST';
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select '1c200000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000002',id,null,'1c100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='DENTIST';
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select '1c200000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000003',id,null,'1c100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='RECEPTIONIST';
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select '1c200000-0000-0000-0000-000000000001','1c400000-0000-0000-0000-000000000005',id,null,'1c100000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code='DENTAL_ASSISTANT';
insert into public.member_roles(organization_id,organization_member_id,role_id,branch_id,assigned_by)
select '1c200000-0000-0000-0000-000000000002','1c400000-0000-0000-0000-000000000004',id,null,'1c100000-0000-0000-0000-000000000004' from public.roles where organization_id is null and code='DENTIST';

-- The provider link exists only at Interchange Main. A clinician with the
-- clinical permission but no active provider link at the acting branch may
-- stage nothing that reaches the chart: apply must refuse them.
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values
 ('1c600000-0000-0000-0000-000000000001','1c200000-0000-0000-0000-000000000001','1c100000-0000-0000-0000-000000000001','Synthetic','Dentist','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values
 ('1c200000-0000-0000-0000-000000000001','1c600000-0000-0000-0000-000000000001','1c300000-0000-0000-0000-000000000001',true);

insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values
 ('1c500000-0000-0000-0000-000000000001','1c200000-0000-0000-0000-000000000001','IC/001 caries','Synthetic','Patient','1990-01-01','1c300000-0000-0000-0000-000000000001'),
 ('1c500000-0000-0000-0000-000000000002','1c200000-0000-0000-0000-000000000002','FC-001','Foreign','Patient','1990-01-01','1c300000-0000-0000-0000-000000000003');

create temp table interchange_result(
  seq integer primary key, batch_id uuid, staged_count integer, replayed boolean,
  applied_count integer, encounter_id uuid, export_id uuid, patient_code text, clinical_date date
);
grant select, insert on interchange_result to authenticated;

-- Candidate identifiers are read back through the authorized projection, never
-- from the staging table: a browser role holds no privilege on it at all, and a
-- suite that reached around that would be testing a door nobody has.
create temp table interchange_candidates(batch_seq integer, ordinal integer, candidate_id uuid, primary key (batch_seq, ordinal));
grant select, insert on interchange_candidates to authenticated;

-- ---------------------------------------------------------------------------
-- The browser boundary
-- ---------------------------------------------------------------------------

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.create_clinical_import_batch_v1(uuid,uuid,text,text,jsonb,uuid)','execute'),
  'authenticated may stage an import batch'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.get_clinical_import_batch_v1(uuid,uuid,uuid)','execute'),
  'authenticated may read a staged import batch'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)','execute'),
  'authenticated may apply a staged import batch'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.archive_clinical_import_batch_v1(uuid,uuid,uuid,text)','execute'),
  'authenticated may archive a staged import batch'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated','public.record_clinical_export_v1(uuid,uuid,text,text,uuid)','execute'),
  'authenticated may register an export'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('anon','public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)','execute'),
  'anon may not apply an import batch'
);
select extensions.ok(
  not pg_catalog.has_function_privilege('service_role','public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)','execute'),
  'service_role may not apply an import batch'
);

-- The staging tables are never a browser-readable surface.
select extensions.ok(
  not pg_catalog.has_table_privilege('authenticated','public.clinical_import_batches','select'),
  'authenticated holds no direct read on staged import batches'
);
select extensions.ok(
  not pg_catalog.has_table_privilege('authenticated','public.clinical_import_candidates','select'),
  'authenticated holds no direct read on staged import candidates'
);
select extensions.ok(
  not pg_catalog.has_table_privilege('authenticated','public.clinical_export_records','select'),
  'authenticated holds no direct read on export records'
);
select extensions.is(
  (select bool_and(c.relrowsecurity) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public'
     and c.relname in ('clinical_import_batches','clinical_import_candidates','clinical_export_records')),
  true,
  'row level security is enabled on all three interchange tables'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- A canonical record the import must compare against and must never replace
-- ---------------------------------------------------------------------------

select recorded_count from public.record_visit_tooth_findings(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  array['16'],'CARIES',array['O'],'ACTIVE',
  (pg_catalog.timezone('Asia/Manila',pg_catalog.statement_timestamp()))::date,
  null,'1c900000-0000-0000-0000-000000000001'
);

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  1,
  'the patient starts with exactly one canonical entry'
);
create temp table interchange_baseline as
select id, tooth_code, clinical_code, version, encounter_id
from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- Staging: four candidates, no clinical write
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 1, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'EMR_JSON_V1',
  repeat('a',64),
  $j$[
    {"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"17","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":"Synthetic imported note"},
    {"kind":"TOOTH_FINDING","classification":"DUPLICATE","toothCode":"16","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null},
    {"kind":"TOOTH_FINDING","classification":"CONFLICT","toothCode":"16","clinicalCode":"RESTORATION","surfaces":["O"],"clinicalDate":"2026-08-01","note":null},
    {"kind":"UNSUPPORTED","classification":"UNSUPPORTED","resourceLabel":"Organization","reason":"UNSUPPORTED_RESOURCE"}
  ]$j$::jsonb,
  '1c900000-0000-0000-0000-000000000002'
);

select extensions.is(
  (select staged_count from interchange_result where seq=1), 4,
  'the batch stages every candidate, including the ones that cannot be applied'
);

insert into interchange_candidates(batch_seq, ordinal, candidate_id)
select 1, projected.ordinal, projected.candidate_id
from public.get_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=1)) as projected;

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  1,
  'staging a batch records no canonical clinical entry'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters where patient_id='1c500000-0000-0000-0000-000000000001'),
  1,
  'staging a batch opens no clinical encounter of its own'
);
select extensions.is(
  (select classification from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and ordinal=2),
  'DUPLICATE',
  'the database re-derives DUPLICATE from the canonical chart'
);
select extensions.is(
  (select classification from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and ordinal=3),
  'CONFLICT',
  'the database re-derives CONFLICT from the canonical chart'
);
select extensions.is(
  (select count(*)::integer from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and classification='UNSUPPORTED'),
  1,
  'an unsupported resource stays visible as a candidate'
);
select extensions.is(
  (select unsupported_label from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and ordinal=4),
  'Organization',
  'the unsupported candidate carries a bounded label and nothing else'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
    where action='clinical.import.staged'
      and entity_id=(select batch_id from interchange_result where seq=1)
      and metadata='{}'::jsonb),
  1,
  'staging is audited with no candidate payload in the metadata'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- The staging boundary refuses what the parser refuses
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"99","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}]'::jsonb,'1c900000-0000-0000-0000-000000000010')$$,
  '22023','invalid input','the database revalidates the tooth code even after the parser'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"11","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}]'::jsonb,'1c900000-0000-0000-0000-000000000011')$$,
  '22023','invalid input','the database revalidates surface anatomy: an anterior tooth has no occlusal table'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"17","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null,"__proto__":{"a":1}}]'::jsonb,'1c900000-0000-0000-0000-000000000012')$$,
  '22023','invalid input','a prototype-polluting key is refused at the database as well as at the parser'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"17","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null,"organizationId":"1c200000-0000-0000-0000-000000000002"}]'::jsonb,'1c900000-0000-0000-0000-000000000013')$$,
  '22023','invalid input','a candidate may not carry an embedded organization identifier'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"16","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}]'::jsonb,'1c900000-0000-0000-0000-000000000014')$$,
  '22023','invalid input','a candidate whose submitted classification disagrees with the canonical chart is refused'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','XML',repeat('a',64),'[]'::jsonb,'1c900000-0000-0000-0000-000000000015')$$,
  '22023','invalid input','only the two accepted interchange formats may be staged'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1','not-a-digest','[]'::jsonb,'1c900000-0000-0000-0000-000000000016')$$,
  '22023','invalid input','the source digest must be a sha-256 hex digest'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),(select jsonb_agg('{"kind":"UNSUPPORTED","classification":"UNSUPPORTED","resourceLabel":"Organization","reason":"UNSUPPORTED_RESOURCE"}'::jsonb) from generate_series(1,501)),'1c900000-0000-0000-0000-000000000017')$$,
  '22023','invalid input','more than five hundred candidates is refused'
);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000002','EMR_JSON_V1',repeat('a',64),'[]'::jsonb,'1c900000-0000-0000-0000-000000000018')$$,
  '42501','not authorized','a patient in another organization cannot be staged against'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000003','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[]'::jsonb,'1c900000-0000-0000-0000-000000000019')$$,
  '42501','not authorized','a branch in another organization cannot be used as acting context'
);

select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[]'::jsonb,'1c900000-0000-0000-0000-000000000020')$$,
  '42501','not authorized','a receptionist cannot stage a clinical import'
);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.get_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000003','1c500000-0000-0000-0000-000000000002','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$')$$,
  '42501','not authorized','a clinician in another organization cannot read this batch'
);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- Reading the batch back: the success path of a RETURNS TABLE projection
-- ---------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from public.get_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=1))),
  4,
  'the projection returns one row per staged candidate'
);
select extensions.is(
  (select batch.batch_status from public.get_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=1)) as batch limit 1),
  'STAGED',
  'a freshly staged batch reads back as STAGED'
);
select extensions.is(
  (select batch.tooth_code from public.get_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=1)) as batch where batch.ordinal=1),
  '17',
  'the projection returns the normalized candidate the parser produced'
);

-- ---------------------------------------------------------------------------
-- Request-fingerprint idempotency
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 2, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'EMR_JSON_V1', repeat('a',64),
  $j$[{"kind":"UNSUPPORTED","classification":"UNSUPPORTED","resourceLabel":"Organization","reason":"UNSUPPORTED_RESOURCE"}]$j$::jsonb,
  '1c900000-0000-0000-0000-000000000002'
);
select extensions.is(
  (select batch_id from interchange_result where seq=2),
  (select batch_id from interchange_result where seq=1),
  'a replayed staging request returns the original batch rather than staging a second'
);
select extensions.ok(
  (select replayed from interchange_result where seq=2),
  'the replayed staging request says so'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.clinical_import_batches where patient_id='1c500000-0000-0000-0000-000000000001'),
  1,
  'a replayed staging request stages no second batch'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- Apply: selection is honoured and conflict is refused
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=1 and ordinal=3) || $$'::uuid],'1c900000-0000-0000-0000-000000000030')$$,
  'P0001','invalid state','a CONFLICT candidate cannot be applied until it is excluded'
);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=1 and ordinal=4) || $$'::uuid],'1c900000-0000-0000-0000-000000000031')$$,
  'P0001','invalid state','an UNSUPPORTED candidate cannot be applied'
);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['1c700000-0000-0000-0000-0000000000ff'::uuid],'1c900000-0000-0000-0000-000000000032')$$,
  '42501','not authorized','a candidate that is not in this batch cannot be applied through it'
);

select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=1 and ordinal=1) || $$'::uuid],'1c900000-0000-0000-0000-000000000033')$$,
  '42501','not authorized','a receptionist cannot apply a staged import'
);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=1 and ordinal=1) || $$'::uuid],'1c900000-0000-0000-0000-000000000034')$$,
  '42501','not authorized','a clinician with no active provider link at the acting branch cannot apply an import'
);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  1,
  'every refused apply left the canonical chart exactly as it was'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

insert into interchange_result(seq,applied_count,encounter_id,replayed)
select 3, applied_count, encounter_id, replayed from public.apply_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=1),
  array[(select candidate_id from interchange_candidates where batch_seq=1 and ordinal=1)],
  '1c900000-0000-0000-0000-000000000040'
);

select extensions.is(
  (select applied_count from interchange_result where seq=3), 1,
  'exactly the one selected candidate is applied'
);

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  2,
  'apply appends one entry: the unselected DUPLICATE was not written'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
    where patient_id='1c500000-0000-0000-0000-000000000001' and tooth_code='17' and clinical_code='CARIES'),
  1,
  'the applied candidate is the one the clinician selected'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries as entry
    join interchange_baseline as baseline on baseline.id=entry.id
   where entry.version=baseline.version and entry.clinical_code=baseline.clinical_code),
  1,
  'the pre-existing canonical entry is untouched: an import appends, it never replaces'
);
select extensions.is(
  (select entry.treating_provider_id from public.tooth_clinical_entries as entry
    where entry.patient_id='1c500000-0000-0000-0000-000000000001' and entry.tooth_code='17'),
  '1c600000-0000-0000-0000-000000000001'::uuid,
  'the applied entry is attributed to the provider derived from the signed-in clinician'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries as entry
    where entry.patient_id='1c500000-0000-0000-0000-000000000001' and entry.tooth_code='17'
      and entry.encounter_id=(select encounter_id from interchange_result where seq=3)),
  1,
  'the applied entry is bound to the managed visit the apply used'
);
select extensions.is(
  (select batch_status from public.clinical_import_batches where id=(select batch_id from interchange_result where seq=1)),
  'APPLIED',
  'the batch moves to APPLIED'
);
select extensions.ok(
  (select applied_at is not null from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and ordinal=1),
  'the applied candidate records when it was applied'
);
select extensions.ok(
  (select applied_at is null from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=1) and ordinal=2),
  'the candidate the clinician did not select records no application'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
    where action='clinical.import.applied'
      and entity_id=(select batch_id from interchange_result where seq=1)
      and metadata='{}'::jsonb),
  1,
  'the apply is audited with no clinical content in the metadata'
);
select extensions.throws_ok(
  $$update public.clinical_import_candidates set tooth_code='18' where ordinal=1$$,
  '42501','import candidates are append-only',
  'a stored candidate cannot be rewritten after the fact'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- Replay, then the closed batch
insert into interchange_result(seq,applied_count,encounter_id,replayed)
select 4, applied_count, encounter_id, replayed from public.apply_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=1),
  array[(select candidate_id from interchange_candidates where batch_seq=1 and ordinal=1)],
  '1c900000-0000-0000-0000-000000000040'
);
select extensions.ok(
  (select replayed from interchange_result where seq=4),
  'a replayed apply reports itself as a replay'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  2,
  'a replayed apply writes no second clinical entry'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=1 and ordinal=2) || $$'::uuid],'1c900000-0000-0000-0000-000000000041')$$,
  'P0001','invalid state','an applied batch cannot be applied a second time under a new request key'
);
select extensions.throws_ok(
  $$select public.archive_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$','Changed my mind')$$,
  'P0001','invalid state','an applied batch cannot be archived'
);

-- ---------------------------------------------------------------------------
-- Archive
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 5, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'FHIR_R4_BUNDLE', repeat('b',64),
  $j$[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"27","clinicalCode":"SEALANT","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}]$j$::jsonb,
  '1c900000-0000-0000-0000-000000000050'
);
insert into interchange_candidates(batch_seq, ordinal, candidate_id)
select 5, projected.ordinal, projected.candidate_id
from public.get_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=5)) as projected;

select extensions.is(
  (select batch_status from public.archive_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=5),'Wrong patient file')),
  'ARCHIVED',
  'a staged batch can be abandoned'
);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=5) || $$',array['$$ || (select candidate_id::text from interchange_candidates where batch_seq=5 and ordinal=1) || $$'::uuid],'1c900000-0000-0000-0000-000000000051')$$,
  'P0001','invalid state','an abandoned batch can never reach the chart'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries where patient_id='1c500000-0000-0000-0000-000000000001'),
  2,
  'an abandoned batch changed no overlay'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- REVIEW ROUND 1, item 4a: the same organization, the wrong branch
--
-- The dentist has an active branch membership at Interchange Second and the
-- DENTIST role is organization-wide, so has_clinical_permission_at_branch is
-- satisfied there. What must still refuse is the batch itself: it belongs to
-- Interchange Main, and every boundary matches batch.branch_id to the acting
-- branch. Tenancy is not the only scope that has to hold.
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.get_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000002','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=1) || $$')$$,
  '42501','not authorized',
  'a batch staged at another branch of the same organization cannot be read through this one'
);
select extensions.throws_ok(
  $$select public.archive_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000002','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=5) || $$','Wrong branch')$$,
  '42501','not authorized',
  'a batch staged at another branch of the same organization cannot be archived through this one'
);

-- ---------------------------------------------------------------------------
-- REVIEW ROUND 1, item 3: the confirmed review can go stale, and apply says so
--
-- A candidate is staged NEW. Another clinician then charts the same tooth with
-- a different code, which makes that candidate a CONFLICT. The classification
-- stored at stage time still says NEW; the apply must re-derive it against the
-- chart as it stands now and refuse, rather than append against a review that
-- is no longer true.
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 8, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'EMR_JSON_V1', repeat('c',64),
  $j$[{"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"37","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}]$j$::jsonb,
  '1c900000-0000-0000-0000-000000000080'
);
insert into interchange_candidates(batch_seq, ordinal, candidate_id)
select 8, projected.ordinal, projected.candidate_id
from public.get_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=8)) as projected;

-- Another clinician charts tooth 37 in the meantime.
select recorded_count from public.record_visit_tooth_findings(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  array['37'],'RESTORATION',array['O'],'ACTIVE',
  (pg_catalog.timezone('Asia/Manila',pg_catalog.statement_timestamp()))::date,
  null,'1c900000-0000-0000-0000-000000000081'
);

select extensions.is(
  (select projected.classification from public.get_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=8)) as projected where projected.ordinal=1),
  'NEW',
  'the classification stored at stage time still reads NEW'
);
select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=8) || $$',array['$$ ||
  (select candidate_id::text from interchange_candidates where batch_seq=8 and ordinal=1) || $$'::uuid],'1c900000-0000-0000-0000-000000000082')$$,
  'P0001','invalid state',
  'a candidate that became a conflict since the review is refused, not appended'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
    where patient_id='1c500000-0000-0000-0000-000000000001' and tooth_code='37'),
  1,
  'the stale candidate appended nothing: only the other clinician''s entry is on the tooth'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- REVIEW ROUND 1, item 4b: one transaction, or nothing
--
-- The single-transaction design exists so a failure part way through an apply
-- leaves the chart exactly as it was. Nothing in the boundary can be made to
-- fail mid-loop on purpose - every gate runs before it - so the failure is
-- injected: a trigger refuses one specific tooth. The first group is written,
-- the second raises, and the assertions below are that NOTHING survived: no
-- entry, no applied_at, and the batch still STAGED and still appliable.
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 9, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'EMR_JSON_V1', repeat('d',64),
  $j$[
    {"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"46","clinicalCode":"CARIES","surfaces":["O"],"clinicalDate":"2026-08-01","note":null},
    {"kind":"TOOTH_FINDING","classification":"NEW","toothCode":"47","clinicalCode":"SEALANT","surfaces":["O"],"clinicalDate":"2026-08-01","note":null}
  ]$j$::jsonb,
  '1c900000-0000-0000-0000-000000000090'
);
insert into interchange_candidates(batch_seq, ordinal, candidate_id)
select 9, projected.ordinal, projected.candidate_id
from public.get_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  (select batch_id from interchange_result where seq=9)) as projected;

set local role postgres;
create function pg_temp.refuse_tooth_47() returns trigger language plpgsql as $fn$
begin
  if new.tooth_code = '47' then
    raise exception using errcode='55000', message='synthetic mid-apply failure';
  end if;
  return new;
end;
$fn$;
create trigger interchange_rollback_probe
before insert on public.tooth_clinical_entries
for each row execute function pg_temp.refuse_tooth_47();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select public.apply_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','$$ ||
  (select batch_id::text from interchange_result where seq=9) || $$',array['$$ ||
  (select candidate_id::text from interchange_candidates where batch_seq=9 and ordinal=1) || $$'::uuid,'$$ ||
  (select candidate_id::text from interchange_candidates where batch_seq=9 and ordinal=2) || $$'::uuid],'1c900000-0000-0000-0000-000000000091')$$,
  '55000','synthetic mid-apply failure',
  'a failure part way through an apply propagates rather than being swallowed'
);

set local role postgres;
drop trigger interchange_rollback_probe on public.tooth_clinical_entries;

select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
    where patient_id='1c500000-0000-0000-0000-000000000001' and tooth_code in ('46','47')),
  0,
  'the candidate written before the failure was rolled back with it'
);
select extensions.is(
  (select count(*)::integer from public.clinical_import_candidates
    where batch_id=(select batch_id from interchange_result where seq=9) and applied_at is not null),
  0,
  'no candidate in the failed batch records an application'
);
select extensions.is(
  (select batch_status from public.clinical_import_batches
    where id=(select batch_id from interchange_result where seq=9)),
  'STAGED',
  'the batch that failed part way through is still STAGED'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
    where action='clinical.import.applied'
      and entity_id=(select batch_id from interchange_result where seq=9)),
  0,
  'a failed apply writes no audit event claiming it happened'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- The same batch still applies once the fault is gone, which is the other half
-- of the guarantee: a rolled-back apply left nothing behind that blocks a retry.
select extensions.is(
  (select applied_count from public.apply_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=9),
    array[
      (select candidate_id from interchange_candidates where batch_seq=9 and ordinal=1),
      (select candidate_id from interchange_candidates where batch_seq=9 and ordinal=2)
    ],
    '1c900000-0000-0000-0000-000000000092')),
  2,
  'the batch that rolled back applies cleanly on retry'
);

-- ---------------------------------------------------------------------------
-- REVIEW ROUND 1, item 2: the ceiling is the default path, so prove the ceiling
--
-- Five hundred candidates - the staging maximum, and what the dialog selects by
-- default. Twenty posterior teeth repeated twenty-five times, so the grouping
-- has to survive both the 32-tooth writer ceiling and the same tooth appearing
-- many times in one batch.
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,batch_id,staged_count,replayed)
select 10, batch_id, staged_count, replayed from public.create_clinical_import_batch_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'EMR_JSON_V1', repeat('e',64),
  (select jsonb_agg(jsonb_build_object(
     'kind','TOOTH_FINDING','classification','NEW',
     'toothCode',tooth.code,'clinicalCode','FRACTURE',
     'surfaces',jsonb_build_array('B'),'clinicalDate','2026-08-01','note',null
   ))
   from generate_series(1,25) as repetition
   cross join (values ('14'),('15'),('16'),('17'),('18'),('24'),('25'),('26'),('27'),('28'),
                      ('34'),('35'),('36'),('37'),('38'),('44'),('45'),('46'),('47'),('48')
   ) as tooth(code)),
  '1c900000-0000-0000-0000-0000000000a0'
);
select extensions.is(
  (select staged_count from interchange_result where seq=10), 500,
  'the staging ceiling of five hundred candidates is reachable'
);

set local role postgres;
create temp table interchange_bulk_before as
select count(*)::integer as entries from public.tooth_clinical_entries
where patient_id='1c500000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select applied_count from public.apply_clinical_import_batch_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    (select batch_id from interchange_result where seq=10),
    (select pg_catalog.array_agg(projected.candidate_id)
     from public.get_clinical_import_batch_v1(
       '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
       (select batch_id from interchange_result where seq=10)) as projected),
    '1c900000-0000-0000-0000-0000000000a1')),
  500,
  'a full five-hundred-candidate batch applies completely in one call'
);

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
    where patient_id='1c500000-0000-0000-0000-000000000001')
    - (select entries from interchange_bulk_before),
  500,
  'every one of the five hundred candidates is appended, including the repeats'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
    where patient_id='1c500000-0000-0000-0000-000000000001'
      and clinical_code='FRACTURE' and tooth_code='16'),
  25,
  'the same finding asserted twenty-five times on one tooth is appended twenty-five times'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

-- ---------------------------------------------------------------------------
-- Export registration
-- ---------------------------------------------------------------------------

insert into interchange_result(seq,export_id,patient_code,clinical_date,replayed)
select 6, export_id, patient_code, clinical_date, replayed from public.record_clinical_export_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'FHIR_R4_BUNDLE','CHART_AND_PROGRESS','1c900000-0000-0000-0000-000000000060'
);
select extensions.is(
  (select patient_code from interchange_result where seq=6),
  'IC001caries',
  'the export returns a synthetic-safe patient code with no separator or clinical text'
);
select extensions.is(
  (select clinical_date from interchange_result where seq=6),
  (pg_catalog.timezone('Asia/Manila',pg_catalog.statement_timestamp()))::date,
  'the export is dated on the Philippine clinical date, not a UTC server day'
);
set local role postgres;
select extensions.is(
  (select count(*)::integer from public.audit_events
    where action='clinical.export.recorded'
      and entity_id=(select export_id from interchange_result where seq=6)
      and metadata='{}'::jsonb),
  1,
  'the export is audited with no exported clinical content in the metadata'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000001',true);

insert into interchange_result(seq,export_id,patient_code,clinical_date,replayed)
select 7, export_id, patient_code, clinical_date, replayed from public.record_clinical_export_v1(
  '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
  'FHIR_R4_BUNDLE','CHART_AND_PROGRESS','1c900000-0000-0000-0000-000000000060'
);
select extensions.is(
  (select export_id from interchange_result where seq=7),
  (select export_id from interchange_result where seq=6),
  'a replayed export registration returns the original record'
);

select extensions.throws_ok(
  $$select public.record_clinical_export_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','DOCX','CHART_CURRENT','1c900000-0000-0000-0000-000000000061')$$,
  '22023','invalid input','only an allowlisted export format may be registered'
);
select extensions.throws_ok(
  $$select public.record_clinical_export_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','PDF','EVERYTHING','1c900000-0000-0000-0000-000000000062')$$,
  '22023','invalid input','only an allowlisted export scope may be registered'
);
select extensions.throws_ok(
  $$select public.record_clinical_export_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000002','PDF','CHART_CURRENT','1c900000-0000-0000-0000-000000000063')$$,
  '42501','not authorized','a patient in another organization cannot be exported'
);

select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select public.record_clinical_export_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','PDF','CHART_CURRENT','1c900000-0000-0000-0000-000000000064')$$,
  '42501','not authorized','a receptionist holds no clinical read and cannot export a chart'
);

-- A dental assistant holds patient.clinical.read and may export, but the
-- provider-bound apply path stays closed to them.
select set_config('request.jwt.claim.sub','1c100000-0000-0000-0000-000000000005',true);
select extensions.ok(
  (select export_id is not null from public.record_clinical_export_v1(
    '1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001',
    'PDF','CHART_CURRENT','1c900000-0000-0000-0000-000000000065')),
  'a clinical reader may register an export'
);
select extensions.throws_ok(
  $$select public.create_clinical_import_batch_v1('1c300000-0000-0000-0000-000000000001','1c500000-0000-0000-0000-000000000001','EMR_JSON_V1',repeat('a',64),'[]'::jsonb,'1c900000-0000-0000-0000-000000000066')$$,
  '42501','not authorized','a clinical reader cannot stage an import'
);

reset role;

with test_failures as (select finish from extensions.finish() where finish not like '1..%')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\\n') end as p1_test_result from test_failures;
rollback;
