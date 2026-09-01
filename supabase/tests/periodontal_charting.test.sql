-- O4 pgTAP: periodontal examination schema and engine. The fork
-- persists six-site probing depth, signed gingival margin (positive =
-- recession), derived CAL = PD + GM, BOP, suppuration, four-surface
-- O'Leary plaque, mobility, and I-IV furcation grade per anatomically
-- valid entrance. O4 transplants that as a relational append-only
-- state machine: a DRAFT examination accepts measurements; a FINAL
-- examination is immutable; an amendment is a new DRAFT row pointing
-- at the FINAL predecessor.
--
-- The test runs against the local Supabase database with:
--
--   docker exec -i supabase_db_local psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/periodontal_charting.test.sql
--
-- The local seed provides org 22000000-…-001, patient d45e073b-…-c18,
-- branch 32000000-…-001, and provider 72000000-…-002. The test
-- creates a synthetic encounter and amendment predecessor for the
-- amendment-path test; everything else rolls back with the test
-- transaction.

begin;

select extensions.no_plan();

-- ============================================================================
-- 1. The five new tables exist and RLS is enabled with no policies
-- ============================================================================

select extensions.has_table('public', 'periodontal_examinations', 'periodontal_examinations table exists');
select extensions.has_table('public', 'periodontal_site_measurements', 'periodontal_site_measurements table exists');
select extensions.has_table('public', 'periodontal_plaque_measurements', 'periodontal_plaque_measurements table exists');
select extensions.has_table('public', 'periodontal_tooth_measurements', 'periodontal_tooth_measurements table exists');
select extensions.has_table('public', 'periodontal_furcation_measurements', 'periodontal_furcation_measurements table exists');

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.periodontal_examinations'::regclass),
  'periodontal_examinations has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.periodontal_site_measurements'::regclass),
  'periodontal_site_measurements has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.periodontal_plaque_measurements'::regclass),
  'periodontal_plaque_measurements has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.periodontal_tooth_measurements'::regclass),
  'periodontal_tooth_measurements has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.periodontal_furcation_measurements'::regclass),
  'periodontal_furcation_measurements has RLS enabled'
);

select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'periodontal_examinations', 'periodontal_site_measurements',
    'periodontal_plaque_measurements', 'periodontal_tooth_measurements',
    'periodontal_furcation_measurements'
  )),
  0,
  'no browser RLS policies on the O4 tables'
);

-- ============================================================================
-- 2. No PUBLIC/anon/authenticated/service_role grants on the O4 tables
-- ============================================================================

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'periodontal_examinations', 'periodontal_site_measurements',
      'periodontal_plaque_measurements', 'periodontal_tooth_measurements',
      'periodontal_furcation_measurements'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
  perform extensions.is(v_bad, 0, 'no PUBLIC/anon/authenticated/service_role grants on the O4 tables');
end
$$;

-- ============================================================================
-- 3. Setup: create a synthetic encounter for the test
-- ============================================================================

do $$
declare
  v_encounter_id uuid;
begin
  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, treating_provider_id, status
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    '32000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    '72000000-0000-0000-0000-000000000001'::uuid,
    'OPEN'
  ) returning id into v_encounter_id;
  perform extensions.ok(true, 'synthetic encounter created for perio test');
end
$$;

-- ============================================================================
-- 4. Site measurements: six-site geometry, PD/GM/CAL, BOP/supp, implant
-- ============================================================================

do $$
declare
  v_encounter_id uuid;
  v_exam_id uuid;
  v_raised boolean;
begin
  select id into v_encounter_id
    from public.clinical_encounters
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
      and patient_id = 'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid
    limit 1;

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
    v_encounter_id, 'INITIAL', 'DRAFT'
  ) returning id into v_exam_id;

  -- 4a. PD 0 is invalid (zero probing depth is invalid)
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'B', 0
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'PD 0 is rejected');

  -- 4b. PD 16 is out of range
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'B', 16
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'PD 16 (out of range) is rejected');

  -- 4c. GM -11 is out of range
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site,
      probing_depth_mm, gingival_margin_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'B', 3, -11
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'GM -11 (out of range) is rejected');

  -- 4d. GM 21 is out of range
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site,
      probing_depth_mm, gingival_margin_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'B', 3, 21
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'GM 21 (out of range) is rejected');

  -- 4e. Unknown site 'X' is rejected
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'X', 3
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'unknown site X is rejected');

  -- 4f. CAL is generated: PD 3 + GM -2 = CAL 1
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site,
    probing_depth_mm, gingival_margin_mm
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    v_exam_id, '16', 'B', 3, -2
  );
  perform extensions.is(
    (select cal_mm from public.periodontal_site_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '16' and site = 'B'),
    1,
    'CAL is generated as PD + GM (3 + -2 = 1)'
  );

  -- 4g. CAL is generated: PD 4 + GM 3 (recession) = CAL 7
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site,
    probing_depth_mm, gingival_margin_mm
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    v_exam_id, '16', 'MB', 4, 3
  );
  perform extensions.is(
    (select cal_mm from public.periodontal_site_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '16' and site = 'MB'),
    7,
    'CAL is generated as PD + GM (4 + 3 = 7) for recession case'
  );

  -- 4h. Duplicate (examination_id, tooth_fdi, site) is rejected
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '16', 'B', 5
    );
  exception when unique_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'duplicate (exam, tooth, site) is rejected');

  -- 4i. Invalid tooth FDI is rejected
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '99', 'B', 3
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'invalid FDI 99 is rejected');

  -- 4j. CAL range is enforced: PD 15 + GM 20 = 35 (boundary)
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site,
    probing_depth_mm, gingival_margin_mm
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid,
    v_exam_id, '17', 'B', 15, 20
  );
  perform extensions.is(
    (select cal_mm from public.periodontal_site_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '17' and site = 'B'),
    35,
    'CAL boundary case PD 15 + GM 20 = 35 is accepted'
  );

  -- 4k. CAL out-of-range: PD 15 + GM 21 would be 36, but GM 21 already
  -- rejected in 4d. So 4k tests PD 15 + GM -10 = 5 (PD 15 GM -10
  -- passes the GM check, CAL = 5 in range).
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site,
      probing_depth_mm, gingival_margin_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '17', 'MB', 15, -10
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.is(
    (select cal_mm from public.periodontal_site_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '17' and site = 'MB'),
    5,
    'CAL boundary case PD 15 + GM -10 = 5 is accepted (lower bound)'
  );

  -- 4l. Six-site coverage: all six sites can be inserted on one tooth
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'MB', 3),
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'B', 2),
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'DB', 3),
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'ML', 4),
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'L', 3),
      ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '21', 'DL', 4);
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(
    not v_raised,
    'six-site coverage accepts MB/B/DB/ML/L/DL on one tooth'
  );
  perform extensions.is(
    (select count(*)::integer from public.periodontal_site_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '21'),
    6,
    'all six sites on tooth 21 are persisted'
  );
end
$$;

-- ============================================================================
-- 5. Plaque measurements: four-surface O'Leary geometry
-- ============================================================================

do $$
declare
  v_encounter_id uuid;
  v_exam_id uuid;
  v_raised boolean;
begin
  select id into v_encounter_id
    from public.clinical_encounters
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
      and patient_id = 'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid
    limit 1;
  select id into v_exam_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;

  -- 5a. MESIAL/DISTAL/BUCCAL/LINGUAL accepted
  insert into public.periodontal_plaque_measurements (
    organization_id, examination_id, tooth_fdi, surface, plaque_present
  ) values
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'MESIAL', true),
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'DISTAL', false),
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'BUCCAL', true),
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'LINGUAL', true);
  perform extensions.is(
    (select count(*)::integer from public.periodontal_plaque_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '16'),
    4,
    'four plaque surfaces are accepted on one tooth'
  );

  -- 5b. Duplicate surface rejected
  v_raised := false;
  begin
    insert into public.periodontal_plaque_measurements (
      organization_id, examination_id, tooth_fdi, surface, plaque_present
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'MESIAL', true
    );
  exception when unique_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'duplicate (tooth, surface) plaque is rejected');

  -- 5c. Unknown plaque surface rejected
  v_raised := false;
  begin
    insert into public.periodontal_plaque_measurements (
      organization_id, examination_id, tooth_fdi, surface, plaque_present
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'OCCLUSAL', true
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'unknown plaque surface OCCLUSAL is rejected');
end
$$;

-- ============================================================================
-- 6. Tooth measurements: mobility M0..M3, implant context, duplicate rejected
-- ============================================================================

do $$
declare
  v_exam_id uuid;
  v_raised boolean;
begin
  select id into v_exam_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;

  -- 6a. Mobility M2 accepted
  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, mobility_miller
  ) values (
    '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'M2'
  );
  perform extensions.is(
    (select mobility_miller from public.periodontal_tooth_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '16'),
    'M2',
    'mobility M2 is accepted'
  );

  -- 6b. Unknown mobility rejected
  v_raised := false;
  begin
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, mobility_miller
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '17', 'M4'
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'mobility M4 is rejected');

  -- 6c. Duplicate tooth rejected
  v_raised := false;
  begin
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, mobility_miller
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'M1'
    );
  exception when unique_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'duplicate (exam, tooth) tooth measurement is rejected');
end
$$;

-- ============================================================================
-- 7. Furcation measurements: I-IV per anatomically valid entrance
-- ============================================================================

do $$
declare
  v_exam_id uuid;
  v_raised boolean;
begin
  select id into v_exam_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;

  -- 7a. Grade 1..4 on upper-molar entrances (mesial/distal/buccal)
  insert into public.periodontal_furcation_measurements (
    organization_id, examination_id, tooth_fdi, entrance, grade
  ) values
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'mesial', 1),
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'distal', 2),
    ('22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'buccal', 3);
  perform extensions.is(
    (select count(*)::integer from public.periodontal_furcation_measurements
     where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
       and examination_id = v_exam_id and tooth_fdi = '16'),
    3,
    'three upper-molar furcation entrances are accepted'
  );

  -- 7b. Grade out of range
  v_raised := false;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '17', 'mesial', 0
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'grade 0 is rejected');

  -- 7c. Unknown entrance
  v_raised := false;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '17', 'palatal', 1
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'entrance palatal is rejected');

  -- 7d. Duplicate entrance rejected
  v_raised := false;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid, v_exam_id, '16', 'mesial', 4
    );
  exception when unique_violation then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'duplicate (tooth, entrance) furcation is rejected');
end
$$;

-- ============================================================================
-- 7b. Task 9: an omitted measurement is unknown, not zero or false
--
-- 20260901010200 dropped the NOT NULL DEFAULT on the gingival margin, bleeding
-- on probing, suppuration, and plaque presence. Nothing above is weakened: the
-- assertions in section 4 all pass an explicit gingival margin and still derive
-- the same CAL. This section pins the new semantics for the rows that omit one,
-- so a future migration cannot quietly reintroduce a default that turns an
-- unassessed site into a healthy one.
-- ============================================================================

do $$
declare
  v_exam_id uuid;
begin
  select id into v_exam_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;

  -- Section 4l inserted the six sites of tooth 21 with no gingival margin.
  perform extensions.is(
    (select count(*)::integer from public.periodontal_site_measurements
      where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
        and examination_id = v_exam_id and tooth_fdi = '21'
        and gingival_margin_mm is null and cal_mm is null),
    6,
    'an omitted gingival margin stays unknown and leaves derived CAL unknown'
  );

  perform extensions.is(
    (select count(*)::integer from public.periodontal_site_measurements
      where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
        and examination_id = v_exam_id and tooth_fdi = '21'
        and bleeding_on_probing is null and suppuration is null),
    6,
    'an unassessed site records bleeding and suppuration as unknown, not as absent'
  );

  -- Section 5a scored plaque explicitly, so those rows keep their booleans.
  perform extensions.is(
    (select count(*)::integer from public.periodontal_plaque_measurements
      where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
        and examination_id = v_exam_id and tooth_fdi = '16'
        and plaque_present is not null),
    4,
    'an explicitly scored plaque surface still records a true or false answer'
  );
end
$$;

-- ============================================================================
-- 8. FINAL immutability: child table INSERT/UPDATE/DELETE all rejected
-- ============================================================================

do $$
declare
  v_exam_id uuid;
  v_raised boolean;
begin
  select id into v_exam_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;

  -- 8a. Finalize the examination
  update public.periodontal_examinations
    set status = 'FINAL',
        finalized_at = statement_timestamp(),
        finalized_by = '12000000-0000-0000-0000-000000000002'::uuid,
        finalized_provider_id = '72000000-0000-0000-0000-000000000001'::uuid,
        examined_at = statement_timestamp(),
        examined_by = '12000000-0000-0000-0000-000000000002'::uuid,
        examined_provider_id = '72000000-0000-0000-0000-000000000001'::uuid
    where id = v_exam_id;
  perform extensions.is(
    (select status from public.periodontal_examinations where id = v_exam_id),
    'FINAL',
    'examination transitions to FINAL'
  );

  -- 8b. New site INSERT on a FINAL examination is rejected
  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '26', 'B', 3
    );
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'site INSERT on FINAL examination is rejected');

  -- 8c. New plaque INSERT on a FINAL examination is rejected
  v_raised := false;
  begin
    insert into public.periodontal_plaque_measurements (
      organization_id, examination_id, tooth_fdi, surface, plaque_present
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '26', 'MESIAL', true
    );
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'plaque INSERT on FINAL examination is rejected');

  -- 8d. New tooth INSERT on a FINAL examination is rejected
  v_raised := false;
  begin
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, mobility_miller
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '26', 'M0'
    );
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'tooth INSERT on FINAL examination is rejected');

  -- 8e. New furcation INSERT on a FINAL examination is rejected
  v_raised := false;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      v_exam_id, '26', 'mesial', 1
    );
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'furcation INSERT on FINAL examination is rejected');

  -- 8f. UPDATE on existing site is rejected
  v_raised := false;
  begin
    update public.periodontal_site_measurements
      set probing_depth_mm = 9
      where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
        and examination_id = v_exam_id
        and tooth_fdi = '16' and site = 'B';
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'site UPDATE on FINAL examination is rejected');

  -- 8g. DELETE on existing site is rejected
  v_raised := false;
  begin
    delete from public.periodontal_site_measurements
      where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
        and examination_id = v_exam_id
        and tooth_fdi = '16' and site = 'B';
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'site DELETE on FINAL examination is rejected');

  -- 8h. UPDATE on the FINAL examination itself is rejected
  v_raised := false;
  begin
    update public.periodontal_examinations
      set notes = 'amendment attempt'
      where id = v_exam_id;
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'examination UPDATE on FINAL is rejected');

  -- 8i. DELETE on the FINAL examination is rejected
  v_raised := false;
  begin
    delete from public.periodontal_examinations where id = v_exam_id;
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(v_raised, 'examination DELETE on FINAL is rejected');
end
$$;

-- ============================================================================
-- 9. Amendment: a new DRAFT row pointing at the FINAL predecessor is
-- accepted; a non-FINAL predecessor is rejected; a foreign patient
-- is rejected.
-- ============================================================================

do $$
declare
  v_encounter_id uuid;
  v_pred_id uuid;
  v_raised boolean;
begin
  select id into v_encounter_id
    from public.clinical_encounters
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
    limit 1;
  select id into v_pred_id
    from public.periodontal_examinations
    where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
      and status = 'FINAL'
    limit 1;

  -- 9a. AMENDMENT with FINAL predecessor is accepted
  v_raised := false;
  begin
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind,
      status, predecessor_examination_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      v_encounter_id, 'AMENDMENT', 'DRAFT', v_pred_id
    );
  exception when others then
    v_raised := true;
  end;
  perform extensions.ok(
    not v_raised,
    'AMENDMENT with FINAL predecessor is accepted'
  );

  -- 9b. INITIAL with a predecessor is rejected (amendment_consistency check)
  v_raised := false;
  begin
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind,
      status, predecessor_examination_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      v_encounter_id, 'INITIAL', 'DRAFT', v_pred_id
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(
    v_raised,
    'INITIAL with a predecessor is rejected by amendment_consistency'
  );

  -- 9c. AMENDMENT with no predecessor is rejected
  v_raised := false;
  begin
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind, status
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      v_encounter_id, 'AMENDMENT', 'DRAFT'
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(
    v_raised,
    'AMENDMENT without a predecessor is rejected'
  );

  -- 9d. AMENDMENT with a DRAFT predecessor is rejected (validate_perio_amendment_scope)
  v_raised := false;
  begin
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind, status
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      v_encounter_id, 'INITIAL', 'DRAFT'
    );
    insert into public.periodontal_examinations (
      organization_id, patient_id, encounter_id, examination_kind,
      status, predecessor_examination_id
    ) values (
      '22000000-0000-0000-0000-000000000001'::uuid,
      'd45e073b-77d0-4c67-a656-aed601cc5c18'::uuid,
      v_encounter_id, 'AMENDMENT', 'DRAFT',
      (select id from public.periodontal_examinations
        where organization_id = '22000000-0000-0000-0000-000000000001'::uuid
          and examination_kind = 'INITIAL'
          and status = 'DRAFT'
        limit 1)
    );
  exception when check_violation then
    v_raised := true;
  end;
  perform extensions.ok(
    v_raised,
    'AMENDMENT pointing at a DRAFT predecessor is rejected'
  );
end
$$;

-- ============================================================================
-- 10. Migration number recorded; later approved odontogram migrations applied
-- ============================================================================

select extensions.ok(
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828020200'
  ),
  'migration 20260828020200 is recorded'
);

select extensions.is(
  (select count(*)::integer from supabase_migrations.schema_migrations
   where version in (
      '20260828020300','20260828020350',
      '20260828020400','20260828020401','20260828020500'
    )),
  5,
  'approved O5-O13 odontogram migrations are recorded'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
