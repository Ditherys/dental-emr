-- O13 compatibility contract for the retired Phase-15 table.
begin;
select extensions.no_plan();

select extensions.has_table('public', 'tooth_conditions', 'legacy tooth_conditions remains available for preserved history');
select extensions.columns_are(
  'public', 'tooth_conditions',
  array['id','organization_id','patient_id','tooth_code','surface','status','finding_type','notes','recorded_by','recorded_at','voided_at','version','created_at','updated_at','migrated_to_clinical_entry_id'],
  'legacy schema is preserved with only the forward migration pointer added'
);
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.tooth_conditions'::regclass),'legacy table retains RLS');
select extensions.ok(
  not exists (
    select 1
    from (values (0::oid), ((select oid from pg_roles where rolname='anon')), ((select oid from pg_roles where rolname='authenticated')), ((select oid from pg_roles where rolname='service_role'))) as role(role_oid)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name)
    where has_table_privilege(role.role_oid, 'public.tooth_conditions', privilege.name)
  ),
  'legacy table has zero browser/service base privileges'
);
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='tooth_conditions'),0,'legacy table remains deny-by-default');
select extensions.ok(
  not has_function_privilege('authenticated','public.create_tooth_condition(uuid,uuid,text,text,text,text,text)','execute')
  and not has_function_privilege('authenticated','public.void_tooth_condition(uuid,uuid,integer,text)','execute')
  and not has_function_privilege('authenticated','public.list_tooth_conditions(uuid,uuid,boolean)','execute'),
  'obsolete Phase-15 mutation and read RPCs are revoked from authenticated'
);
select extensions.ok(not exists (select 1 from public.tooth_conditions where migrated_to_clinical_entry_id is null),'every preserved legacy row points to its canonical backfill');
select extensions.ok(
  not exists (
    select 1
    from public.tooth_conditions as legacy
    left join public.tooth_clinical_entries as entry
      on entry.organization_id = legacy.organization_id
     and entry.id = legacy.migrated_to_clinical_entry_id
     and entry.legacy_tooth_condition_id = legacy.id
    where entry.id is null
       or entry.patient_id is distinct from legacy.patient_id
       or entry.tooth_code is distinct from legacy.tooth_code
       or entry.clinical_code is distinct from legacy.finding_type
       or entry.notes is distinct from legacy.notes
       or entry.recorded_by is distinct from legacy.recorded_by
       or entry.recorded_at is distinct from legacy.recorded_at
       or entry.voided_at is distinct from legacy.voided_at
  ),
  'legacy identity, clinical code, narrative, recorder, and timestamps survive backfill'
);
select extensions.ok(
  not exists (
    select 1
    from public.tooth_conditions as legacy
    join public.tooth_clinical_entries as entry
      on entry.organization_id = legacy.organization_id and entry.id = legacy.migrated_to_clinical_entry_id
    join public.tooth_clinical_entry_surfaces as surface
      on surface.organization_id = entry.organization_id and surface.entry_id = entry.id
    where legacy.surface = 'FULL'
  ),
  'legacy FULL remains whole-tooth and has no invented surface rows'
);
select extensions.throws_ok(
  $$insert into public.tooth_conditions (organization_id, patient_id, tooth_code) values ('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','26')$$,
  'P0001', null,
  'direct legacy inserts are retired'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
