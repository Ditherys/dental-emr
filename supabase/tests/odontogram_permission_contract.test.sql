begin;
select extensions.no_plan();

select extensions.ok(
  not exists (
    select 1 from (values
      ('tooth_clinical_entries'),('tooth_clinical_entry_surfaces'),
      ('dental_bridges'),('dental_bridge_units'),('dental_implant_components'),
      ('periodontal_examinations'),('periodontal_site_measurements'),
      ('periodontal_plaque_measurements'),('periodontal_tooth_measurements'),
      ('periodontal_furcation_measurements'),('treatment_plan_item_executions'),
      ('treatment_plan_item_execution_events'),('odontogram_legacy_resolutions')
    ) as scoped(table_name)
    cross join (values ('anon'),('authenticated'),('service_role')) role(role_name)
    where has_table_privilege(role.role_name,'public.'||scoped.table_name,'SELECT')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'INSERT')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'UPDATE')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'DELETE')
  ),
  'odontogram, periodontal, relationship, resolution, and execution base tables have zero browser/service DML grants'
);

select extensions.ok(
  not exists (
    select 1 from (values
      ('tooth_clinical_entries'),('tooth_clinical_entry_surfaces'),
      ('dental_bridges'),('dental_bridge_units'),('dental_implant_components'),
      ('periodontal_examinations'),('periodontal_site_measurements'),
      ('periodontal_plaque_measurements'),('periodontal_tooth_measurements'),
      ('periodontal_furcation_measurements'),('treatment_plan_item_executions'),
      ('treatment_plan_item_execution_events'),('odontogram_legacy_resolutions')
    ) as scoped(table_name)
    join pg_class c on c.relname=scoped.table_name and c.relnamespace='public'::regnamespace
    where not c.relrowsecurity
  ),
  'every exposed tenant table in the O5/O8 boundary has RLS enabled'
);

select extensions.ok(
  has_function_privilege('authenticated','public.get_patient_odontogram(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)','execute')
  and has_function_privilege('authenticated','public.void_tooth_clinical_entry(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text)','execute')
  and has_function_privilege('authenticated','public.amend_current_bridge(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.void_current_bridge(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.create_plan_implant_design(uuid,uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text)','execute')
  and has_function_privilege('authenticated','public.amend_current_implant_component(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.void_current_implant_component(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.create_periodontal_examination(uuid,uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute')
  and has_function_privilege('authenticated','public.finalize_periodontal_examination(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.amend_periodontal_examination(uuid,uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)','execute')
  and has_function_privilege('authenticated','public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)','execute')
  and has_function_privilege('authenticated','public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)','execute'),
  'authenticated receives every reviewed O5/O8 signature'
);

-- The O5 direct entry path could record a finding with neither an encounter nor
-- a treating provider. The visit-bound composer replaced it, so browser execute
-- moved from one to the other rather than being held by both.
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)',
    'execute'
  ),
  'the superseded provider-free entry path is revoked and the visit-bound composer replaces it'
);

select extensions.ok(
  not has_function_privilege('authenticated','public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text)','execute'),
  'authenticated is denied the retired five-argument implant v3 overload'
);

select extensions.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'get_patient_odontogram','get_patient_odontogram_v3','record_tooth_clinical_entry_v3','amend_tooth_clinical_entry',
      'void_tooth_clinical_entry','resolve_legacy_odontogram_entry','create_plan_bridge_design',
      'update_draft_plan_bridge_design','record_current_bridge_v3','amend_current_bridge',
      'void_current_bridge','create_plan_implant_design','update_draft_plan_implant_design',
      'record_current_implant_component_v3','amend_current_implant_component','void_current_implant_component',
      'create_periodontal_examination','save_periodontal_measurements','finalize_periodontal_examination',
      'amend_periodontal_examination','transition_treatment_plan_item_execution',
      'complete_treatment_plan_item_with_charge','correct_treatment_plan_item_execution'
    ) and (
      not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]
      or has_function_privilege('public',p.oid,'execute')
      or has_function_privilege('anon',p.oid,'execute')
      or has_function_privilege('service_role',p.oid,'execute')
    )
  ),
  'all public O5/O8 functions are empty-search-path definers denied to PUBLIC, anon, and service_role'
);

select extensions.set_eq(
  $$select r.code from public.permissions p
    join public.role_permissions rp on rp.permission_id=p.id
    join public.roles r on r.id=rp.role_id
    where p.code='patient.clinical.correct' and r.organization_id is null$$,
  $$values ('OWNER'::text),('ADMIN'::text)$$,
  'patient.clinical.correct defaults only to OWNER and ADMIN'
);

select extensions.ok(
  not has_function_privilege('authenticated','private.validate_bridge_units_payload(uuid,uuid,text,uuid,jsonb)','execute')
  and not has_function_privilege('service_role','private.validate_bridge_units_payload(uuid,uuid,text,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','private.validate_treatment_execution_projection()','execute'),
  'authorization and invariant helpers are not browser/service callable'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
