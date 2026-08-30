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

-- These probes deliberately use direct table writes inside this rolled-back
-- test transaction. Production browser roles retain no table grants; direct
-- probes are the only practical way to prove the database constraints and
-- immutable-record triggers themselves, rather than merely their names.
do $$
declare
  v_org_a constant uuid := '22000000-0000-0000-0000-000000000001'::uuid;
  v_org_b constant uuid := '22000000-0000-0000-0000-000000000002'::uuid;
  v_patient_a uuid;
  v_patient_b uuid;
  v_plan_a uuid;
  v_bridge_a uuid;
  v_external_component_b uuid;
  v_fixture_a uuid;
  v_state text;
begin
  select id into v_patient_a from public.patients where organization_id = v_org_a order by id limit 1;
  select id into v_patient_b from public.patients where organization_id = v_org_b order by id limit 1;
  if v_patient_b is null then
    insert into public.patients (
      organization_id, patient_number, first_name, last_name, birth_date, status
    ) values (
      v_org_b, 'TASK5-SYNTHETIC-B', 'Task', 'Five Tenant B', date '2000-01-01', 'active'
    ) returning id into v_patient_b;
  end if;

  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind, record_kind,
    provenance, sealed_at
  ) values (
    v_org_b, v_patient_b, '11', 1, 'FIXTURE', 'CURRENT',
    'PREEXISTING_EXTERNAL', statement_timestamp()
  ) returning id into v_external_component_b;

  insert into public.treatment_plans (organization_id, patient_id, title, status)
  values (v_org_a, v_patient_a, 'Task 5 synthetic plan', 'DRAFT')
  returning id into v_plan_a;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, parent_plan_id
  ) values (v_org_a, v_patient_a, 'PLAN_DESIGN', v_plan_a)
  returning id into v_bridge_a;

  v_state := null;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
    ) values (v_org_a, v_bridge_a, '11', 1, 'ABUTMENT', 'IMPLANT_COMPONENT', v_external_component_b);
  exception when others then
    v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'cross-tenant bridge implant support is rejected by relationship scope validation');
  perform extensions.is(
    (select count(*)::integer from public.dental_bridge_units where bridge_id = v_bridge_a),
    0,
    'cross-tenant bridge support rejection leaves no bridge unit'
  );

  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind, record_kind, parent_plan_id
  ) values (v_org_a, v_patient_a, '11', 1, 'FIXTURE', 'PLAN_DESIGN', v_plan_a)
  returning id into v_fixture_a;

  v_state := null;
  begin
    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind, depends_on_component_id,
      record_kind, parent_plan_id
    ) values (
      v_org_a, v_patient_a, '11', 2, 'ABUTMENT', v_external_component_b,
      'PLAN_DESIGN', v_plan_a
    );
  exception when others then
    v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'cross-tenant implant dependency is rejected by relationship scope validation');
  perform extensions.is(
    (select count(*)::integer from public.dental_implant_components where id = v_fixture_a),
    1,
    'cross-tenant implant dependency rejection leaves the valid predecessor unchanged'
  );
end
$$;

do $$
declare
  v_org constant uuid := '22000000-0000-0000-0000-000000000001'::uuid;
  v_patient uuid;
  v_branch uuid;
  v_provider uuid;
  v_encounter uuid;
  v_final_exam uuid;
  v_amendment uuid;
  v_draft_exam uuid;
  v_missing_exam uuid;
  v_implant_exam uuid;
  v_state text;
  v_site_count integer;
begin
  select id into v_patient from public.patients where organization_id = v_org order by id limit 1;
  select id into v_branch from public.branches where organization_id = v_org and status = 'active' order by id limit 1;
  select id into v_provider from public.providers where organization_id = v_org and status = 'active' order by id limit 1;
  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, treating_provider_id, status
  ) values (v_org, v_branch, v_patient, v_provider, 'OPEN')
  returning id into v_encounter;

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (v_org, v_patient, v_encounter, 'INITIAL', 'DRAFT')
  returning id into v_final_exam;
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site, probing_depth_mm
  ) values (v_org, v_final_exam, '11', 'B', 3);
  update public.periodontal_examinations
  set status = 'FINAL', finalized_at = statement_timestamp(), finalized_by = '12000000-0000-0000-0000-000000000002'::uuid,
      finalized_provider_id = v_provider, examined_at = statement_timestamp(), examined_by = '12000000-0000-0000-0000-000000000002'::uuid,
      examined_provider_id = v_provider
  where id = v_final_exam;

  v_state := null;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (v_org, v_final_exam, '11', 'MB', 4);
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, 'P0001', 'post-FINAL periodontal child INSERT is denied');

  v_state := null;
  begin
    update public.periodontal_site_measurements set probing_depth_mm = 9
    where organization_id = v_org and examination_id = v_final_exam and tooth_fdi = '11' and site = 'B';
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, 'P0001', 'post-FINAL periodontal child UPDATE is denied');

  v_state := null;
  begin
    delete from public.periodontal_site_measurements
    where organization_id = v_org and examination_id = v_final_exam and tooth_fdi = '11' and site = 'B';
  exception when others then v_state := sqlstate;
  end;
  select count(*) into v_site_count from public.periodontal_site_measurements
  where organization_id = v_org and examination_id = v_final_exam and tooth_fdi = '11' and site = 'B';
  perform extensions.is(v_state, 'P0001', 'post-FINAL periodontal child DELETE is denied');
  perform extensions.is(v_site_count, 1, 'post-FINAL child denials leave the recorded site unchanged');

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id
  ) values (v_org, v_patient, v_encounter, 'AMENDMENT', 'DRAFT', v_final_exam)
  returning id into v_amendment;
  perform extensions.is(
    (select predecessor_examination_id from public.periodontal_examinations where id = v_amendment),
    v_final_exam,
    'a DRAFT AMENDMENT retains its FINAL predecessor lineage'
  );
  perform extensions.is(
    (select status from public.periodontal_examinations where id = v_final_exam),
    'FINAL',
    'creating an amendment leaves its FINAL predecessor unchanged'
  );

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (v_org, v_patient, v_encounter, 'INITIAL', 'DRAFT')
  returning id into v_draft_exam;
  v_state := null;
  begin
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id
    ) values (v_org, v_patient, v_encounter, 'AMENDMENT', 'DRAFT', v_draft_exam);
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'AMENDMENT with a non-FINAL predecessor is denied');
  perform extensions.is(
    (select count(*)::integer from public.periodontal_examinations where predecessor_examination_id = v_draft_exam),
    0,
    'invalid amendment predecessor leaves no successor record'
  );

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (v_org, v_patient, v_encounter, 'INITIAL', 'DRAFT')
  returning id into v_missing_exam;
  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, tooth_present
  ) values (v_org, v_missing_exam, '12', false);
  v_state := null;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (v_org, v_missing_exam, '12', 'B', 3);
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'periodontal measurement for a missing tooth is denied');
  perform extensions.is(
    (select count(*)::integer from public.periodontal_site_measurements where examination_id = v_missing_exam),
    0,
    'missing-tooth denial leaves no periodontal site measurement'
  );

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (v_org, v_patient, v_encounter, 'INITIAL', 'DRAFT')
  returning id into v_implant_exam;
  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, implant_context
  ) values (v_org, v_implant_exam, '13', true);
  v_state := null;
  begin
    update public.periodontal_tooth_measurements set mobility_miller = 'M1'
    where organization_id = v_org and examination_id = v_implant_exam and tooth_fdi = '13';
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'implant-context Miller mobility write is denied');
  v_state := null;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (v_org, v_implant_exam, '13', 'buccal', 1);
  exception when others then v_state := sqlstate;
  end;
  perform extensions.is(v_state, '23514', 'implant-context furcation write is denied');
  perform extensions.is(
    (select mobility_miller from public.periodontal_tooth_measurements where organization_id = v_org and examination_id = v_implant_exam and tooth_fdi = '13'),
    null::text,
    'implant mobility denial leaves the canonical tooth measurement unchanged'
  );
  perform extensions.is(
    (select count(*)::integer from public.periodontal_furcation_measurements where examination_id = v_implant_exam),
    0,
    'implant furcation denial leaves no furcation measurement'
  );
end
$$;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
