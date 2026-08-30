-- O12 clinical photo metadata and private derivative contract.
begin;
select extensions.no_plan();

select extensions.has_table('public','clinical_photographs','clinical photographs table exists');
select extensions.has_table('public','clinical_photo_pairings','photo pairing table exists');
select extensions.has_table('public','clinical_photo_derivatives','photo derivative table exists');
select extensions.ok((select relrowsecurity from pg_class where oid='public.clinical_photographs'::regclass),'photo metadata has RLS');
select extensions.ok((select relrowsecurity from pg_class where oid='public.clinical_photo_pairings'::regclass),'photo pairings have RLS');
select extensions.ok((select relrowsecurity from pg_class where oid='public.clinical_photo_derivatives'::regclass),'photo derivatives have RLS');
select extensions.is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name like 'clinical_photo%' and grantee in ('PUBLIC','anon','authenticated','service_role')),0,'photo tables expose no base grants');

insert into public.file_objects(id,organization_id,patient_id,object_key,mime_type,size_bytes,checksum_sha256,uploaded_by,status)
values('e6200000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/files/e6200000-0000-0000-0000-000000000001','image/jpeg',100,null,'12000000-0000-0000-0000-000000000001','available');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);

create temp table clinical_photo_test_ids(photo_id uuid) on commit drop;
insert into clinical_photo_test_ids(photo_id)
select photo_id from public.create_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6200000-0000-0000-0000-000000000001',null,'BEFORE','before.jpg','camera-original.jpg','2026-08-30T10:00:00+08:00','{"11"}','{"O"}','synthetic image');
select extensions.is((select count(*)::integer from clinical_photo_test_ids),1,'authorized photo metadata creation succeeds');
select extensions.is((select count(*)::integer from public.audit_events where action='clinical.photo.created' and entity_id=(select photo_id from clinical_photo_test_ids)),1,'photo creation is audited');
select extensions.throws_ok($$select public.create_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6200000-0000-0000-0000-000000000001',null,'BEFORE','null-tooth.jpg','camera-original.jpg','2026-08-30T10:01:00+08:00',array[null::text],array[]::text[],null)$$,'22023','invalid input','NULL tooth links are rejected');
select extensions.is((select count(*)::integer from public.list_clinical_photos('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18')),1,'authorized list returns the patient photo');
select extensions.is((select (to_jsonb(photo) ? 'original_client_filename')::integer from public.list_clinical_photos('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18') as photo),0,'ordinary list omits the original client filename');
select extensions.throws_ok($$select public.pair_clinical_photos('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),(select photo_id from clinical_photo_test_ids))$$,'22023','invalid input','self pairing is rejected');
select extensions.throws_ok($$select public.record_clinical_photo_derivatives('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),repeat('a',64),100,jsonb_build_array(jsonb_build_object('variant','thumbnail','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/thumbnail.png','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','preview','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/preview.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','display','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/display.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64))))$$,'22023','invalid input','derivative object keys keep the approved extension');
select extensions.is((select public.record_clinical_photo_derivatives('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),repeat('a',64),100,jsonb_build_array(jsonb_build_object('variant','thumbnail','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/thumbnail.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','preview','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/preview.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','display','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/display.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64))))),true,'authorized derivative completion succeeds');
set local role postgres;
select extensions.is((select source_checksum_sha256 from public.clinical_photographs where id=(select photo_id from clinical_photo_test_ids)),repeat('a',64),'processor checksum is preserved on the clinical photo');
set local role authenticated;
select extensions.is((select public.record_clinical_photo_derivatives('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),repeat('a',64),100,jsonb_build_array(jsonb_build_object('variant','thumbnail','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/thumbnail.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','preview','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/preview.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64)),jsonb_build_object('variant','display','object_key','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/clinical-photos/'||(select photo_id from clinical_photo_test_ids)||'/display.jpg','mime_type','image/jpeg','width',10,'height',10,'size_bytes',100,'checksum_sha256',repeat('b',64))))),true,'derivative completion is idempotent');
select extensions.throws_ok($$select public.rename_clinical_photo('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),2,'renamed.png')$$,'22023','invalid input','rename preserves the source extension');
set local role postgres;
update public.file_objects set mime_type='application/pdf' where id='e6200000-0000-0000-0000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.rename_clinical_photo('32000000-0000-0000-0000-000000000001',(select photo_id from clinical_photo_test_ids),2,'renamed.pdf')$$,'22023','invalid input','rename rejects unsupported source MIME types');
set local role postgres;
update public.file_objects set mime_type='image/jpeg' where id='e6200000-0000-0000-0000-000000000001';
set local role authenticated;

select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.create_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6200000-0000-0000-0000-000000000001',null,'BEFORE','receptionist.jpg','camera-original.jpg','2026-08-30T10:05:00+08:00')$$,'42501','not authorized','receptionist cannot upload clinical photos');

reset role;
select extensions.is((select count(*)::integer from public.audit_events where action='clinical.photo.renamed'),0,'no rename audit is emitted without rename');

with test_failures as (select finish from extensions.finish() where finish not like '1..%')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\\n') end as p1_test_result from test_failures;
rollback;
