-- Task 14: the RADIOGRAPH clinical photo category is added forward-compatibly.
--
-- A radiograph is a distinct clinical artefact from a clinical DIAGNOSTIC
-- photograph, so it becomes its own category alongside the existing seven
-- rather than replacing any of them. Every category the record already carries
-- must keep working, historical rows must be untouched, and the new category
-- must inherit exactly the same tenancy, permission and archive contract as the
-- rest — a new label is not a new authorization path.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- The canonical category envelope is additive
-- ---------------------------------------------------------------------------

select extensions.ok(
  (select pg_catalog.pg_get_constraintdef(oid) like '%RADIOGRAPH%'
   from pg_constraint
   where conrelid = 'public.clinical_photographs'::regclass
     and conname = 'clinical_photographs_category_check'),
  'the canonical category constraint admits RADIOGRAPH'
);

select extensions.ok(
  (select bool_and(pg_catalog.pg_get_constraintdef(oid) like '%' || legacy || '%')
   from pg_constraint,
     unnest(array['BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER']) as legacy
   where conrelid = 'public.clinical_photographs'::regclass
     and conname = 'clinical_photographs_category_check'),
  'no existing clinical photo category is removed'
);

insert into public.file_objects(id,organization_id,patient_id,object_key,mime_type,size_bytes,checksum_sha256,uploaded_by,status)
values
 ('e6210000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/files/e6210000-0000-0000-0000-000000000001','image/jpeg',100,null,'12000000-0000-0000-0000-000000000001','available'),
 ('e6210000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/files/e6210000-0000-0000-0000-000000000002','image/jpeg',100,null,'12000000-0000-0000-0000-000000000001','available'),
 ('e6210000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','org/22000000-0000-0000-0000-000000000001/patients/d45e073b-77d0-4c67-a656-aed601cc5c18/files/e6210000-0000-0000-0000-000000000003','image/jpeg',100,null,'12000000-0000-0000-0000-000000000001','available');

-- A pre-existing DIAGNOSTIC row proves the widened constraint validates against
-- the rows already stored rather than only against new writes.
insert into public.clinical_photographs(id,organization_id,patient_id,source_file_id,category,display_filename,original_client_filename,capture_at,created_by)
values('c9210000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6210000-0000-0000-0000-000000000003','DIAGNOSTIC','historical.jpg','camera-original.jpg','2026-08-30T09:00:00+08:00','12000000-0000-0000-0000-000000000001');

select extensions.throws_ok(
  $$insert into public.clinical_photographs(organization_id,patient_id,source_file_id,category,display_filename,original_client_filename,capture_at,created_by)
    values('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6210000-0000-0000-0000-000000000002','MRI','unknown.jpg','camera-original.jpg','2026-08-30T09:00:00+08:00','12000000-0000-0000-0000-000000000001')$$,
  '23514',
  'new row for relation "clinical_photographs" violates check constraint "clinical_photographs_category_check"',
  'an unknown category is still rejected by the widened constraint'
);

create temp table radiograph_encounter_baseline(encounters integer) on commit drop;
insert into radiograph_encounter_baseline(encounters)
select count(*)::integer from public.clinical_encounters where patient_id='d45e073b-77d0-4c67-a656-aed601cc5c18';

-- ---------------------------------------------------------------------------
-- The authorized clinical write path accepts the new category
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal2"}',true);

create temp table radiograph_ids(photo_id uuid, category text) on commit drop;
insert into radiograph_ids(photo_id,category)
select photo_id, category from public.create_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6210000-0000-0000-0000-000000000001',null,'RADIOGRAPH','periapical-11.jpg','camera-original.jpg','2026-08-30T11:00:00+08:00','{"11"}','{}','synthetic radiograph');

select extensions.is(
  (select category from radiograph_ids),
  'RADIOGRAPH',
  'an authorized dentist may record a radiograph through the canonical RPC'
);

select extensions.is(
  (select count(*)::integer from public.list_clinical_photos('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18') where category='RADIOGRAPH'),
  1,
  'the radiograph is returned by the ordinary gallery list'
);

select extensions.is(
  (select count(*)::integer from public.list_clinical_photos('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18') where category='DIAGNOSTIC'),
  1,
  'the pre-existing diagnostic photograph is unaffected by the widened category'
);

-- ---------------------------------------------------------------------------
-- Recording photo metadata is not a clinical encounter
-- ---------------------------------------------------------------------------

set local role postgres;
select extensions.is(
  (select count(*)::integer from public.clinical_encounters where patient_id='d45e073b-77d0-4c67-a656-aed601cc5c18'),
  (select encounters from radiograph_encounter_baseline),
  'recording photo metadata opens no clinical encounter on its own'
);
set local role authenticated;
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal2"}',true);

-- ---------------------------------------------------------------------------
-- A display rename never touches the stored original
-- ---------------------------------------------------------------------------

set local role postgres;
create temp table radiograph_source_before(source_file_id uuid, object_key text, size_bytes bigint, checksum text) on commit drop;
insert into radiograph_source_before(source_file_id,object_key,size_bytes,checksum)
select p.source_file_id, f.object_key, f.size_bytes, f.checksum_sha256
from public.clinical_photographs p
join public.file_objects f on f.organization_id=p.organization_id and f.id=p.source_file_id
where p.id=(select photo_id from radiograph_ids);
set local role authenticated;
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal2"}',true);

select extensions.is(
  (select display_filename from public.rename_clinical_photo('32000000-0000-0000-0000-000000000001',(select photo_id from radiograph_ids),1,'periapical-11-retake.jpg')),
  'periapical-11-retake.jpg',
  'a radiograph display filename may be corrected'
);

set local role postgres;
select extensions.ok(
  (select p.source_file_id=b.source_file_id and f.object_key=b.object_key
      and f.size_bytes is not distinct from b.size_bytes
      and f.checksum_sha256 is not distinct from b.checksum
   from public.clinical_photographs p
   join public.file_objects f on f.organization_id=p.organization_id and f.id=p.source_file_id
   cross join radiograph_source_before b
   where p.id=(select photo_id from radiograph_ids)),
  'renaming the display label leaves the stored object key and original bytes untouched'
);
set local role authenticated;
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal2"}',true);

-- ---------------------------------------------------------------------------
-- Archive, never delete
-- ---------------------------------------------------------------------------

select extensions.is(
  (select public.archive_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18',(select photo_id from radiograph_ids),2,'Synthetic retake supersedes this radiograph')),
  true,
  'an authorized dentist archives a radiograph'
);

set local role postgres;
select extensions.ok(
  (select archived_at is not null and archive_reason is not null
   from public.clinical_photographs where id=(select photo_id from radiograph_ids)),
  'the archived radiograph row is retained rather than deleted'
);
select extensions.is(
  (select source_file_id from public.clinical_photographs where id=(select photo_id from radiograph_ids)),
  (select source_file_id from radiograph_source_before),
  'archiving keeps the original source object attached to the clinical record'
);
set local role authenticated;
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal2"}',true);

select extensions.is(
  (select count(*)::integer from public.list_clinical_photos('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18') where category='RADIOGRAPH'),
  0,
  'an archived radiograph leaves the active gallery'
);

-- ---------------------------------------------------------------------------
-- Tenancy and permission are unchanged by the new category
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select public.create_clinical_photo('32000000-0000-0000-0000-000000000003','d45e073b-77d0-4c67-a656-aed601cc5c18','e6210000-0000-0000-0000-000000000002',null,'RADIOGRAPH','foreign-branch.jpg','camera-original.jpg','2026-08-30T12:00:00+08:00')$$,
  '42501',
  'not authorized',
  'a foreign branch cannot record a radiograph'
);

select extensions.throws_ok(
  $$select public.create_clinical_photo('32000000-0000-0000-0000-000000000001','b00d4420-f029-4dd1-8e11-c416fcb72d2c','e6210000-0000-0000-0000-000000000002',null,'RADIOGRAPH','foreign-tenant.jpg','camera-original.jpg','2026-08-30T12:00:00+08:00')$$,
  '42501',
  'not authorized',
  'a foreign organization patient cannot be given a radiograph'
);

select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select public.create_clinical_photo('32000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','e6210000-0000-0000-0000-000000000002',null,'RADIOGRAPH','receptionist.jpg','camera-original.jpg','2026-08-30T12:00:00+08:00')$$,
  '42501',
  'not authorized',
  'a receptionist gains no clinical write authority from the new category'
);

reset role;

with test_failures as (select finish from extensions.finish() where finish not like '1..%')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\\n') end as p1_test_result from test_failures;
rollback;
