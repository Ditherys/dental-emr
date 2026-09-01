-- O10 review regression: periodontal saves must honor the canonical current
-- odontogram state, not caller-supplied tooth_present/implant_context flags.
-- All identities and records below are deterministic synthetic local fixtures.

begin;

select extensions.no_plan();

insert into public.clinical_encounters (
  id, organization_id, branch_id, patient_id, treating_provider_id, status,
  created_by
) values (
  'e6100000-0000-0000-0000-000000000001'::uuid,
  '22000000-0000-0000-0000-000000000001'::uuid,
  '32000000-0000-0000-0000-000000000001'::uuid,
  'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
  '72000000-0000-0000-0000-000000000001'::uuid,
  'OPEN',
  '12000000-0000-0000-0000-000000000001'::uuid
);

-- A current canonical missing-tooth entry. No successor/void event exists.
insert into public.tooth_clinical_entries (
  id, organization_id, patient_id, tooth_code, kind, clinical_code, status,
  lifecycle, provenance, recorded_by
) values (
  'e6110000-0000-0000-0000-000000000001'::uuid,
  '22000000-0000-0000-0000-000000000001'::uuid,
  'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
  '13', 'FINDING', 'MISSING', 'ACTIVE', 'OPEN', 'INTERNAL',
  '12000000-0000-0000-0000-000000000001'::uuid
);

-- A current implant fixture chain root. PREEXISTING_EXTERNAL is the valid
-- charge-free synthetic provenance for a direct fixture fixture.
insert into public.dental_implant_components (
  id, organization_id, patient_id, tooth_fdi, ordinal, component_kind,
  record_kind, provenance, recorded_by
) values (
  'e6120000-0000-0000-0000-000000000001'::uuid,
  '22000000-0000-0000-0000-000000000001'::uuid,
  'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
  '14', 1, 'FIXTURE', 'CURRENT', 'PREEXISTING_EXTERNAL',
  '12000000-0000-0000-0000-000000000001'::uuid
);

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status
) values
  ('e6130000-0000-0000-0000-000000000001'::uuid,
   '22000000-0000-0000-0000-000000000001'::uuid,
   'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
   'e6100000-0000-0000-0000-000000000001'::uuid, 'INITIAL', 'DRAFT'),
  ('e6130000-0000-0000-0000-000000000002'::uuid,
   '22000000-0000-0000-0000-000000000001'::uuid,
   'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
   'e6100000-0000-0000-0000-000000000001'::uuid, 'INITIAL', 'DRAFT'),
  ('e6130000-0000-0000-0000-000000000003'::uuid,
   '22000000-0000-0000-0000-000000000001'::uuid,
   'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
   'e6100000-0000-0000-0000-000000000001'::uuid, 'INITIAL', 'DRAFT');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

select extensions.throws_ok(
  $$select * from public.save_periodontal_measurements(
    '32000000-0000-0000-0000-000000000001'::uuid,
    'e6130000-0000-0000-0000-000000000001'::uuid,
    '[{"tooth_fdi":"13","site":"B","probing_depth_mm":3,"tooth_present":true,"implant_context":false}]'::jsonb,
    '[{"tooth_fdi":"13","surface":"BUCCAL","plaque_present":true}]'::jsonb,
    '[{"tooth_fdi":"13","mobility_miller":"M0","tooth_present":true,"implant_context":false}]'::jsonb,
    '[{"tooth_fdi":"13","entrance":"buccal","grade":1}]'::jsonb
  )$$,
  '22023', 'invalid input',
  'save rejects a forged present/natural site for a current missing tooth'
);

reset role;

select extensions.is(
  (select count(*)::integer from public.periodontal_site_measurements where examination_id = 'e6130000-0000-0000-0000-000000000001'::uuid),
  0,
  'missing-tooth rejection leaves no periodontal site child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_tooth_measurements where examination_id = 'e6130000-0000-0000-0000-000000000001'::uuid),
  0,
  'missing-tooth rejection leaves no periodontal tooth child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_plaque_measurements where examination_id = 'e6130000-0000-0000-0000-000000000001'::uuid),
  0,
  'missing-tooth rejection leaves no periodontal plaque child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_furcation_measurements where examination_id = 'e6130000-0000-0000-0000-000000000001'::uuid),
  0,
  'missing-tooth rejection leaves no periodontal furcation child'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where entity_id = 'e6130000-0000-0000-0000-000000000001'::uuid and action = 'clinical.perio.measurements.saved'),
  0,
  'missing-tooth rejection leaves no periodontal audit row'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.save_periodontal_measurements(
    '32000000-0000-0000-0000-000000000001'::uuid,
    'e6130000-0000-0000-0000-000000000002'::uuid,
    '[{"tooth_fdi":"14","site":"B","probing_depth_mm":3,"tooth_present":true,"implant_context":false}]'::jsonb,
    '[{"tooth_fdi":"14","surface":"BUCCAL","plaque_present":true}]'::jsonb,
    '[{"tooth_fdi":"14","mobility_miller":"M0","tooth_present":true,"implant_context":false}]'::jsonb,
    '[{"tooth_fdi":"14","entrance":"buccal","grade":1}]'::jsonb
  )$$,
  '22023', 'invalid input',
  'save rejects a forged natural site for a current implant chain'
);

reset role;

select extensions.is(
  (select count(*)::integer from public.periodontal_site_measurements where examination_id = 'e6130000-0000-0000-0000-000000000002'::uuid),
  0,
  'implant rejection leaves no periodontal site child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_tooth_measurements where examination_id = 'e6130000-0000-0000-0000-000000000002'::uuid),
  0,
  'implant rejection leaves no periodontal tooth child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_plaque_measurements where examination_id = 'e6130000-0000-0000-0000-000000000002'::uuid),
  0,
  'implant rejection leaves no periodontal plaque child'
);
select extensions.is(
  (select count(*)::integer from public.periodontal_furcation_measurements where examination_id = 'e6130000-0000-0000-0000-000000000002'::uuid),
  0,
  'implant rejection leaves no periodontal furcation child'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where entity_id = 'e6130000-0000-0000-0000-000000000002'::uuid and action = 'clinical.perio.measurements.saved'),
  0,
  'implant rejection leaves no periodontal audit row'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select saved_sites from public.save_periodontal_measurements(
    '32000000-0000-0000-0000-000000000001'::uuid,
    'e6130000-0000-0000-0000-000000000003'::uuid,
    '[{"tooth_fdi":"15","site":"B","probing_depth_mm":3,"tooth_present":true,"implant_context":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )),
  1,
  'ordinary natural tooth site save remains accepted'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.periodontal_site_measurements where examination_id = 'e6130000-0000-0000-0000-000000000003'::uuid and tooth_fdi = '15' and site = 'B'),
  1,
  'natural tooth site child is persisted'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where entity_id = 'e6130000-0000-0000-0000-000000000003'::uuid and action = 'clinical.perio.measurements.saved'),
  1,
  'natural tooth save writes exactly one periodontal audit row'
);

-- Task 9 made the gingival margin, bleeding on probing, and suppuration
-- nullable so an unassessed site is distinguishable from a healthy one, and
-- task 10 carried NULL through every calculation. This assertion previously
-- pinned the OPPOSITE: that this boundary kept coalescing an omitted margin to
-- 0 and an omitted bleeding or suppuration answer to false. That coalescing was
-- the one place a browser could destroy the distinction, inventing a healthy
-- reading for a site nobody assessed, so task 11 removed it and INVERTED this
-- assertion rather than extending it. An omitted measurement now stays unknown.
select extensions.ok(
  (select gingival_margin_mm is null and bleeding_on_probing is null and suppuration is null
     from public.periodontal_site_measurements
    where examination_id = 'e6130000-0000-0000-0000-000000000003'::uuid
      and tooth_fdi = '15' and site = 'B'),
  'an omitted margin, bleeding, or suppuration answer stays unknown instead of becoming an invented zero or false'
);

-- The derived clinical attachment level follows the margin: unknown, not equal
-- to the probing depth.
select extensions.ok(
  (select cal_mm is null
     from public.periodontal_site_measurements
    where examination_id = 'e6130000-0000-0000-0000-000000000003'::uuid
      and tooth_fdi = '15' and site = 'B'),
  'an unknown gingival margin leaves the derived attachment level unknown'
);

reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
