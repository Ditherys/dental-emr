begin;

select plan(8);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.tooth_clinical_entry_details'::regclass),
  'clinical details enforce RLS'
);

insert into public.organizations (id, legal_name, business_name, slug) values
  ('f3010000-0000-0000-0000-000000000001', 'Synthetic Details A Inc.', 'Synthetic Details A', 'synthetic-details-a'),
  ('f3010000-0000-0000-0000-000000000002', 'Synthetic Details B Inc.', 'Synthetic Details B', 'synthetic-details-b');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('f3020000-0000-0000-0000-000000000001', 'f3010000-0000-0000-0000-000000000001', 'DETAIL-A-001', 'Synthetic', 'Detail A', date '1990-01-01'),
  ('f3020000-0000-0000-0000-000000000002', 'f3010000-0000-0000-0000-000000000002', 'DETAIL-B-001', 'Synthetic', 'Detail B', date '1990-01-01');
insert into public.tooth_clinical_entries (id, organization_id, patient_id, tooth_code, kind, clinical_code, status, provenance) values
  ('f3030000-0000-0000-0000-000000000001', 'f3010000-0000-0000-0000-000000000001', 'f3020000-0000-0000-0000-000000000001', '16', 'FINDING', 'CARIES', 'ACTIVE', 'INTERNAL'),
  ('f3030000-0000-0000-0000-000000000002', 'f3010000-0000-0000-0000-000000000002', 'f3020000-0000-0000-0000-000000000002', '16', 'FINDING', 'CARIES', 'ACTIVE', 'INTERNAL');

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000002', 'ROOT_CANAL', '{"code":"ROOT_CANAL","state":"endo-filling"}')$$,
  '23503', null, 'cross-tenant detail linkage is rejected'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000001', 'CARIES', '{"code":"CARIES","depth":"DENTIN","icdas":7,"cars":null,"radiographicDepth":null}')$$,
  '23514', null, 'caries detail rejects an out-of-range ICDAS value'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000001', 'ROOT_CANAL', '{"code":"ROOT_CANAL","state":"none"}')$$,
  '23514', null, 'root canal detail rejects the non-clinical none state'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000001', 'CARIES', '{"code":"CARIES","depth":"DENTIN","icdas":3,"cars":null,"radiographicDepth":null,"forged":true}')$$,
  '23514', null, 'detail rejects unexpected keys'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000001', 'CARIES', '[]')$$,
  '23514', null, 'detail requires a JSON object'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('f3010000-0000-0000-0000-000000000001', 'f3030000-0000-0000-0000-000000000001', 'CARIES', '{"code":"ROOT_CANAL","state":"endo-filling"}')$$,
  '23514', null, 'feature code must match the discriminated detail code'
);

select extensions.throws_ok(
  $$insert into public.tooth_clinical_entry_details
      (organization_id, entry_id, feature_code, detail)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'CARIES', '{"code":"CARIES","depth":"DENTIN","icdas":3,"cars":null,"radiographicDepth":null}')$$,
  '23503', null, 'detail requires a real tenant-scoped entry'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;
rollback;
