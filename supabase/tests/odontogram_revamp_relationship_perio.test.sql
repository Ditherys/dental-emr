-- O3/O4 revamp regression: keep relationship and periodontal persistence
-- guarded by the already-applied forward migrations. This suite intentionally
-- adds no direct clinical mutation path; the narrow audited RPCs remain the
-- only browser-reachable write surface.
begin;

select extensions.no_plan();

select extensions.ok(
  exists (
    select 1 from pg_constraint
    where conname = 'dental_bridge_units_organization_support_component_fk'
      and conrelid = 'public.dental_bridge_units'::regclass
  ),
  'bridge implant support uses a composite organization-scoped foreign key'
);

select extensions.ok(
  exists (
    select 1 from pg_constraint
    where conname = 'dental_implant_components_organization_depends_on_fk'
      and conrelid = 'public.dental_implant_components'::regclass
  ),
  'implant dependencies use a composite organization-scoped foreign key'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid in (
      'public.dental_bridge_units'::regclass,
      'public.dental_implant_components'::regclass,
      'public.periodontal_site_measurements'::regclass,
      'public.periodontal_plaque_measurements'::regclass,
      'public.periodontal_tooth_measurements'::regclass,
      'public.periodontal_furcation_measurements'::regclass
    )
      and tgname in (
        'dental_bridge_units_sealed_check',
        'dental_implant_components_append_only_check',
        'periodontal_site_measurements_final_check',
        'periodontal_plaque_measurements_final_check',
        'periodontal_tooth_measurements_final_check',
        'periodontal_furcation_measurements_final_check'
      )
  ),
  6,
  'sealed/current relationships and FINAL periodontal children retain mutation guards'
);

select extensions.is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'dental_bridges', 'dental_bridge_units', 'dental_implant_components',
        'periodontal_examinations', 'periodontal_site_measurements',
        'periodontal_plaque_measurements', 'periodontal_tooth_measurements',
        'periodontal_furcation_measurements'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  0,
  'relationship and periodontal base tables have no browser grants'
);

select extensions.ok(
  exists (
    select 1 from pg_constraint
    where conname = 'periodontal_examinations_organization_predecessor_fk'
      and conrelid = 'public.periodontal_examinations'::regclass
  ),
  'periodontal amendments retain organization-scoped predecessor lineage'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
