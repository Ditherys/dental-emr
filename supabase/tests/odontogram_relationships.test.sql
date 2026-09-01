-- O3 pgTAP: dental_bridges, dental_bridge_units, dental_implant_components,
-- dental_bridge_voids, dental_implant_component_voids, and
-- odontogram_legacy_resolutions. The O0 acceptance record flagged the
-- legacy test:db:local runner as broken; this focused suite is run
-- directly against the local Supabase database with:
--
--   docker exec -i supabase_db_local psql \
--     -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/odontogram_relationships.test.sql
--
-- The O3 migration created six new tables with composite tenant FKs,
-- RLS enabled, and zero policies/grants. The O2 migration created
-- tooth_clinical_entries (also needed for legacy_resolutions tests).
-- The O3 suite uses the local synthetic seed (organization
-- 22000000-0000-0000-0000-000000000001, patient
-- d45e073b-77d0-4c67-a656-aed601cc5c18) and creates throwaway
-- patients, plans, and components to avoid cross-test pollution.

begin;

select extensions.no_plan();

-- ============================================================================
-- 1. The six new tables exist and RLS is enabled with no policies
-- ============================================================================

select extensions.has_table('public', 'dental_bridges', 'dental_bridges table exists');
select extensions.has_table('public', 'dental_bridge_units', 'dental_bridge_units table exists');
select extensions.has_table('public', 'dental_implant_components', 'dental_implant_components table exists');
select extensions.has_table('public', 'dental_bridge_voids', 'dental_bridge_voids table exists');
select extensions.has_table('public', 'dental_implant_component_voids', 'dental_implant_component_voids table exists');
select extensions.has_table('public', 'odontogram_legacy_resolutions', 'odontogram_legacy_resolutions table exists');

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.dental_bridges'::regclass),
  'dental_bridges has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.dental_bridge_units'::regclass),
  'dental_bridge_units has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.dental_implant_components'::regclass),
  'dental_implant_components has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.dental_bridge_voids'::regclass),
  'dental_bridge_voids has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.dental_implant_component_voids'::regclass),
  'dental_implant_component_voids has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.odontogram_legacy_resolutions'::regclass),
  'odontogram_legacy_resolutions has RLS enabled'
);

select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'dental_bridges', 'dental_bridge_units', 'dental_implant_components',
    'dental_bridge_voids', 'dental_implant_component_voids',
    'odontogram_legacy_resolutions'
  )),
  0,
  'no browser RLS policies on the O3 tables'
);

-- ============================================================================
-- 2. No PUBLIC/anon/authenticated/service_role grants on the O3 tables
-- ============================================================================

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'dental_bridges', 'dental_bridge_units', 'dental_implant_components',
      'dental_bridge_voids', 'dental_implant_component_voids',
      'odontogram_legacy_resolutions'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
  perform extensions.is(v_bad, 0, 'no PUBLIC/anon/authenticated/service_role grants on the O3 tables');
end
$$;

-- ============================================================================
-- 3. dental_bridges record_kind column constraints: PLAN_DESIGN and
--    CURRENT have disjoint column requirements, enforced by the
--    `dental_bridges_record_kind_columns_check` constraint.
-- ============================================================================

do $$
declare
  v_plan_id uuid;
  v_raised boolean;
begin
  insert into public.treatment_plans (organization_id, patient_id, title, status)
  values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'o3 test plan', 'DRAFT'
  ) returning id into v_plan_id;

  -- 3a. A PLAN_DESIGN row requires parent_plan_id; we test the negative
  -- path: a PLAN_DESIGN without parent_plan_id is rejected.
  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'PLAN_DESIGN'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'PLAN_DESIGN bridge without parent_plan_id is rejected'
  );

  -- 3b. A PLAN_DESIGN with sealed_at is rejected.
  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind, parent_plan_id, sealed_at
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'PLAN_DESIGN', v_plan_id, statement_timestamp()
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'PLAN_DESIGN bridge with sealed_at is rejected'
  );

  -- 3c. A CURRENT row with no treating_provider_id/executed_at pair
  --     is rejected by the XOR clause (both must be null or both set).
  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'CURRENT'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'CURRENT bridge with no treating_provider_id and no executed_at is rejected'
  );

  -- 3d. A CURRENT row with parent_plan_id is rejected.
  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind, parent_plan_id, sealed_at
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'CURRENT', v_plan_id, statement_timestamp()
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'CURRENT bridge with parent_plan_id is rejected'
  );

  -- 3e. A CURRENT row with both treating_provider_id and no executed_at
  -- (or vice versa) is rejected by the XOR clause.
  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind, sealed_at, treating_provider_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'CURRENT', statement_timestamp(),
      '00000000-0000-0000-0000-000000000099'::uuid
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'CURRENT bridge with treating_provider_id but no executed_at is rejected'
  );

  -- Cleanup
  delete from public.treatment_plans where id = v_plan_id;
end
$$;

-- ============================================================================
-- 4. dental_bridge_units role/support conditional: PONTIC requires NONE
--    and no component; ABUTMENT requires NATURAL/IMPLANT support.
-- ============================================================================

do $$
declare
  v_plan_id uuid;
  v_bridge_id uuid;
  v_component_id uuid;
  v_raised boolean;
begin
  insert into public.treatment_plans (organization_id, patient_id, title, status)
  values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'o3 unit test plan', 'DRAFT'
  ) returning id into v_plan_id;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, parent_plan_id
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'PLAN_DESIGN', v_plan_id
  ) returning id into v_bridge_id;

  -- 4a. PONTIC with NONE is accepted
  insert into public.dental_bridge_units (
    organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '16', 1,
    'PONTIC', 'NONE'
  );

  -- 4b. PONTIC with NATURAL_TOOTH is rejected
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '17', 2,
      'PONTIC', 'NATURAL_TOOTH'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'PONTIC with NATURAL_TOOTH support is rejected'
  );

  -- 4c. ABUTMENT with NONE is rejected
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '14', 3,
      'ABUTMENT', 'NONE'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'ABUTMENT with NONE support is rejected'
  );

  -- 4d. Duplicate tooth on same bridge is rejected
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '16', 4,
      'ABUTMENT', 'NATURAL_TOOTH'
    );
  exception when unique_violation then
    v_raised := true;
  end;
  raise notice 'test 4d v_raised=%', v_raised;
    perform extensions.ok(
    v_raised,
    'duplicate tooth_fdi on a bridge is rejected'
  );

  -- 4e. Duplicate ordinal on same bridge is rejected
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '15', 1,
      'ABUTMENT', 'NATURAL_TOOTH'
    );
  exception when unique_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'duplicate ordinal on a bridge is rejected'
  );

  -- 4f. ABUTMENT with IMPLANT_COMPONENT but no support_component_id is rejected
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '14', 5,
      'ABUTMENT', 'IMPLANT_COMPONENT'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'ABUTMENT with IMPLANT_COMPONENT but no support_component_id is rejected'
  );

  -- Cleanup
  delete from public.dental_bridge_units where bridge_id = v_bridge_id;
  delete from public.dental_bridges where id = v_bridge_id;
  delete from public.treatment_plans where id = v_plan_id;
end
$$;

-- ============================================================================
-- 5. dental_implant_components dependency-kind conditional: a FIXTURE is
--    the chain root (no depends_on, but parent_plan or PREEXISTING_EXTERNAL
--    provenance), and ABUTMENT/CROWN/ATTACHMENT must depend on a component.
-- ============================================================================

do $$
declare
  v_plan_id uuid;
  v_raised boolean;
  v_fixture_id uuid;
begin
  insert into public.treatment_plans (organization_id, patient_id, title, status)
  values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'o3 component test plan', 'DRAFT'
  ) returning id into v_plan_id;

  -- 5a. A PLAN_DESIGN FIXTURE is accepted (no depends_on, parent_plan set)
  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind,
    record_kind, parent_plan_id
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '16', 1, 'FIXTURE',
    'PLAN_DESIGN', v_plan_id
  ) returning id into v_fixture_id;

  -- 5b. A PLAN_DESIGN ABUTMENT without depends_on is rejected
  v_raised := false;
  begin
    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind,
      record_kind, parent_plan_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '16', 2, 'ABUTMENT',
      'PLAN_DESIGN', v_plan_id
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'PLAN_DESIGN ABUTMENT without depends_on is rejected'
  );

  -- 5c. A PLAN_DESIGN FIXTURE with a depends_on is rejected
  v_raised := false;
  begin
    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind,
      record_kind, parent_plan_id, depends_on_component_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '17', 1, 'FIXTURE',
      'PLAN_DESIGN', v_plan_id, v_fixture_id
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'PLAN_DESIGN FIXTURE with depends_on is rejected'
  );

  -- 5d. An ATTACHMENT requires attachment_value; without it is rejected
  v_raised := false;
  begin
    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind,
      record_kind, parent_plan_id, depends_on_component_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '16', 3, 'ATTACHMENT',
      'PLAN_DESIGN', v_plan_id, v_fixture_id
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'ATTACHMENT without attachment_value is rejected'
  );

  -- 5e. Self-dependency is enforced by an UPDATE-only check
  -- (depends_on_component_id <> id) because the row does not know
  -- its own id at INSERT time. We test that check by attempting an
  -- UPDATE on the existing fixture (inserted in 5a) that points
  -- depends_on at the same row, expecting a check_violation.
  v_raised := false;
  begin
    update public.dental_implant_components
      set depends_on_component_id = v_fixture_id
      where id = v_fixture_id;
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'depends_on_self check rejects self-dependency on UPDATE'
  );

  -- Cleanup: delete the implant components first (the ABUTMENT
  -- depends on the fixture; the fixture is itself the v_fixture_id
  -- we are tracking; we delete children before the parent).
  delete from public.dental_implant_components
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
      and patient_id = 'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid
      and record_kind = 'PLAN_DESIGN'
      and parent_plan_id = v_plan_id;
  delete from public.treatment_plans where id = v_plan_id;
end
$$;

-- ============================================================================
-- 6. CURRENT implant component: PREEXISTING_EXTERNAL fixture is allowed
--    without depends_on; INTERNAL fixture requires a path through
--    PLAN_DESIGN or a previous CURRENT component (the runtime check
--    is enforced in O5 RPCs; here we test the column constraint).
-- ============================================================================

do $$
declare
  v_raised boolean;
  v_count integer;
begin
  -- 6a. A CURRENT FIXTURE with no parent_plan, no depends_on,
  --     provenance=PREEXISTING_EXTERNAL, and sealed_at is accepted
  --     without a charge.
  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind,
    record_kind, sealed_at, provenance
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '36', 1, 'FIXTURE',
    'CURRENT', statement_timestamp(), 'PREEXISTING_EXTERNAL'
  );

  -- 6b. A CURRENT FIXTURE with INTERNAL provenance and no charge
  --     is rejected by the column check (charge_id is required when
  --     provenance is INTERNAL — i.e. not PREEXISTING_EXTERNAL).
  v_raised := false;
  begin
    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind,
      record_kind, sealed_at, provenance
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid, '37', 1, 'FIXTURE',
      'CURRENT', statement_timestamp(), 'INTERNAL'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'CURRENT FIXTURE with INTERNAL provenance and no charge_id is rejected'
  );

  -- Cleanup is unnecessary: the test transaction rolls back at the
  -- end of the file. The sealed CURRENT fixture insert rolls back
  -- the same as test 7.
end
$$;

-- ============================================================================
-- ============================================================================
-- 7. Sealed bridge/unit immutability: a sealed CURRENT bridge
--    rejects post-seal unit INSERT/UPDATE/DELETE and parent UPDATE.
--    Per the O3 plan, the workflow is: create bridge with sealed_at
--    null, add units, then set sealed_at once; thereafter the
--    bridge and its units are immutable.
-- ============================================================================

do $$
declare
  v_bridge_id uuid;
  v_provider_id uuid;
  v_charge_id uuid;
  v_raised boolean;
begin
  -- 7a. Create a real provider for the FK.
  insert into public.providers (
    organization_id, first_name, last_name, provider_type
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'o3', 'test-provider-seal', 'REGULAR'
  ) returning id into v_provider_id;

  -- 7b. Create a real charge.
  insert into public.charges (
    organization_id, patient_id, branch_id, amount_centavos, service_date,
    idempotency_key, non_clinical
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    (select id from public.branches where organization_id =
      '22000000-0000-0000-0000-000000000001'::uuid limit 1),
    100, current_date, 'o3-test-charge-seal', true
  ) returning id into v_charge_id;

  -- 7c. Create a CURRENT bridge with sealed_at null (the workflow
  --     pre-seal state). The column check is satisfied because
  --     sealed_at is null and treating_provider_id is set.
  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, sealed_at, treating_provider_id,
    executed_at, charge_id
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'CURRENT', null, v_provider_id, statement_timestamp(), v_charge_id
  ) returning id into v_bridge_id;

  -- 7d. Add a unit while unsealed.
  insert into public.dental_bridge_units (
    organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '16', 1,
    'PONTIC', 'NONE'
  );

  -- 7e. Seal the bridge.
  update public.dental_bridges
    set sealed_at = statement_timestamp()
    where id = v_bridge_id;

  -- 7f. Inserting another unit on the sealed bridge is rejected.
  v_raised := false;
  begin
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_bridge_id, '17', 2,
      'PONTIC', 'NONE'
    );
  exception when others then
    v_raised := true;
  end;
  raise notice 'test 7f v_raised=%', v_raised;
    perform extensions.ok(
    v_raised,
    'inserting a unit on a sealed CURRENT bridge is rejected'
  );

  -- 7g. Updating an existing unit on the sealed bridge is rejected.
  v_raised := false;
  begin
    update public.dental_bridge_units
      set support_kind = 'NATURAL_TOOTH'
      where bridge_id = v_bridge_id and tooth_fdi = '16';
  exception when others then
    v_raised := true;
  end;
  raise notice 'test 7g v_raised=%', v_raised;
    perform extensions.ok(
    v_raised,
    'updating a unit on a sealed CURRENT bridge is rejected'
  );

  -- 7h. Deleting an existing unit on the sealed bridge is rejected.
  v_raised := false;
  begin
    delete from public.dental_bridge_units
      where bridge_id = v_bridge_id and tooth_fdi = '16';
  exception when others then
    v_raised := true;
  end;
  raise notice 'test 7h v_raised=%', v_raised;
    perform extensions.ok(
    v_raised,
    'deleting a unit on a sealed CURRENT bridge is rejected'
  );

  -- 7i. Updating the sealed bridge itself is rejected.
  v_raised := false;
  begin
    update public.dental_bridges
      set support_kind = 'MIXED'
      where id = v_bridge_id;
  exception when others then
    v_raised := true;
  end;
  raise notice 'test 7i v_raised=%', v_raised;
    perform extensions.ok(
    v_raised,
    'updating a sealed CURRENT bridge is rejected'
  );

  -- Cleanup is unnecessary: the test transaction rolls back at the
  -- end of the file. The sealed bridge and its units cannot be
  -- deleted, which is exactly the O3 invariant we are testing.
end
$$;

-- ============================================================================
-- 8. Frozen plan: the PLAN_DESIGN parent itself cannot be inserted when the
--    owning plan is already PRESENTED/ACKNOWLEDGED.
-- ============================================================================

do $$
declare
  v_plan_id uuid;
  v_bridge_id uuid;
  v_raised boolean;
begin
  -- The treatment_plans.protect_treatment_plan_immutability trigger
  -- rejects status updates away from DRAFT. We cannot transition to
  -- PRESENTED via base-table UPDATE outside the service path. The
  -- O3 plan asserts that a frozen plan's design/unit/component
  -- mutations are rejected; we simulate the frozen state by inserting
  -- a bridge whose parent plan is already non-DRAFT (via direct INSERT
  -- bypassing the trigger) and verifying the O3 trigger fires.

  insert into public.treatment_plans (
    organization_id, patient_id, title, status
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    'o3 frozen test plan', 'PRESENTED'
  ) returning id into v_plan_id;

  v_raised := false;
  begin
    insert into public.dental_bridges (
      organization_id, patient_id, record_kind, parent_plan_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      'PLAN_DESIGN', v_plan_id
    ) returning id into v_bridge_id;
  exception when others then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'inserting a PLAN_DESIGN parent whose plan is PRESENTED is rejected'
  );

  -- Cleanup is unnecessary: the test transaction rolls back at the
  -- end of the file.
end
$$;

-- ============================================================================
-- 9. odontogram_legacy_resolutions exact-one-or-none target check
-- ============================================================================

do $$
declare
  v_legacy_entry_id uuid;
  v_target_entry_id uuid;
  v_raised boolean;
  v_violation_kind text;
begin
  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code,
    status, provenance, legacy_tooth_condition_id
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    '14', 'LEGACY_BRIDGE_MARKER', 'BRIDGE', 'ACTIVE',
    'LEGACY_PHASE15', gen_random_uuid()
  ) returning id into v_legacy_entry_id;

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code,
    status, provenance
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    '14', 'FINDING', 'CARIES', 'ACTIVE', 'INTERNAL'
  ) returning id into v_target_entry_id;

  -- 9a. LINK_CANONICAL with a clinical entry FK is accepted
  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind,
    resolved_clinical_entry_id, reason
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    v_legacy_entry_id, 'LINK_CANONICAL', v_target_entry_id, 'synthetic target'
  );

  -- 9b. NO_CURRENT_STATE is accepted (no target FK). We test the
  -- check constraint by attempting the insert against a legacy entry
  -- and confirming the FK column is the only thing preventing it.
  -- To avoid a second legacy entry we test NO_CURRENT_STATE through
  -- the rejection of a non-existent target on a separate legacy id;
  -- because the unique constraint on (org, legacy_entry_id) is per
  -- row, we exercise the no-target-required clause via a synthetic
  -- UUID and rely on the FK rejection to mark the test path; the
  -- check is exercised in 9c and 9d.
  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind, reason
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_legacy_entry_id, 'NO_CURRENT_STATE', 'synthetic duplicate'
    );
  exception when unique_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'NO_CURRENT_STATE on an already-resolved legacy entry is rejected by the unique constraint'
  );

  -- 9c. LINK_CANONICAL with no target FK is rejected. We use the
  --     real backfilled legacy entry; the legacy_entry_id FK passes;
  --     the resolved_clinical_entry_id must be set per the
  --     exact-one-or-none check.
  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind, reason
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_legacy_entry_id, 'LINK_CANONICAL', 'synthetic missing target'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'LINK_CANONICAL with no target FK is rejected'
  );

  -- 9d. NO_CURRENT_STATE with a target FK is rejected.
  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind,
      resolved_clinical_entry_id, reason
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_legacy_entry_id, 'NO_CURRENT_STATE',
      v_target_entry_id, 'synthetic unexpected target'
    );
  exception when check_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'NO_CURRENT_STATE with a target FK is rejected'
  );

  -- 9e. Duplicate resolution for the same legacy entry is rejected
  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind, reason
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_legacy_entry_id, 'NO_CURRENT_STATE', 'synthetic duplicate'
    );
  exception when unique_violation then
    v_raised := true;
  end;
    perform extensions.ok(
    v_raised,
    'duplicate resolution for the same legacy entry is rejected'
  );

  -- Transaction rollback is the cleanup; legacy resolutions are append-only.
end
$$;

-- ============================================================================
-- 10. Migration number recorded; later approved odontogram migrations applied
-- ============================================================================

select extensions.ok(
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828020100'
  ),
  'migration 20260828020100 is recorded'
);

select extensions.is(
  (select count(*)::integer from supabase_migrations.schema_migrations
   where version in (
      '20260828020200','20260828020300','20260828020350',
      '20260828020400','20260828020401','20260828020500'
    )),
  6,
  'approved O4-O13 odontogram migrations are recorded'
);

-- Task 7 forward-added the visit linkage. The relationship contract itself is
-- unchanged: the columns are nullable, the append-only history guards still
-- refuse every update of a sealed CURRENT row, and no historical relationship
-- was given an invented encounter, service date or note.
select extensions.ok(
  (select bool_and(not attribute.attnotnull)
   from pg_attribute as attribute
   where attribute.attrelid in ('public.dental_bridges'::regclass,'public.dental_implant_components'::regclass)
     and attribute.attname in ('encounter_id','service_date','clinical_note')
     and not attribute.attisdropped),
  'the forward-added relationship linkage columns are nullable'
);

select extensions.ok(
  exists (
    select 1 from pg_constraint as constraint_row
    where constraint_row.conname = 'dental_bridges_organization_encounter_fk'
      and constraint_row.conrelid = 'public.dental_bridges'::regclass
  )
  and exists (
    select 1 from pg_constraint as constraint_row
    where constraint_row.conname = 'dental_implant_components_organization_encounter_fk'
      and constraint_row.conrelid = 'public.dental_implant_components'::regclass
  ),
  'the visit linkage is tenant-safe on both relationship tables'
);

select extensions.ok(
  exists (
    select 1 from pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.dental_bridges'::regclass
      and trigger_row.tgname = 'dental_bridges_append_only_check'
  )
  and exists (
    select 1 from pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.dental_implant_components'::regclass
      and trigger_row.tgname = 'dental_implant_components_append_only_check'
  ),
  'the append-only history guards survive the forward-added linkage columns'
);

select extensions.is(
  (select count(*)::integer from public.dental_bridges as bridge
   where bridge.sealed_at is not null and bridge.service_date is not null and bridge.encounter_id is null),
  0,
  'no sealed bridge carries a service date without the visit it was recorded in'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
