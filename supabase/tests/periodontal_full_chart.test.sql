-- Unified Clinical Chart workspace, task 9: the canonical periodontal and
-- peri-implant measurement model.
--
-- Everything below is deterministic synthetic local fixture data. No real
-- patient, provider, or credential value appears in this file.
--
-- The suite covers, in order:
--   1. the boundary that must not move (RLS on, zero browser table grants);
--   2. the shape of every new canonical column;
--   3. the clinical bound of every new measurement;
--   4. natural-tooth versus peri-implant applicability;
--   5. six-site geometry including implant sites, and furcation never on an
--      implant;
--   6. derived CAL, including CAL when the gingival margin is unknown;
--   7. unknown/incomplete measurements represented distinctly from zero/false;
--   8. FINAL immutability extended to every new column;
--   9. amendment lineage: bounded reason, required reason, non-forking chain;
--  10. classification provenance: bounded domains, completeness, override
--      reason, and a measurement fingerprint that cannot be forged;
--  11. the indexes the patient-timeline and current-exam reads depend on;
--  12. negative authorization through the browser boundary.

begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Synthetic graph
--
-- Organization A holds a dentist with an active linked provider at A Main, an
-- owner with an active linked provider at A Main, an owner with no provider
-- link at all, and a receptionist. Organization B is foreign.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e9100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-dentist-a@pfc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e9100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-owner-provider-a@pfc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e9100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-owner-plain-a@pfc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e9100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-reception-a@pfc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e9100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-dentist-b@pfc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('e9200000-0000-0000-0000-000000000001','PFC Synthetic A Inc.','PFC A','pfc-a'),
  ('e9200000-0000-0000-0000-000000000002','PFC Synthetic B Inc.','PFC B','pfc-b');

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e9300000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','PFC A Main','pfc-a-main','PFC-A','1 Synthetic St','Test City','Test Province'),
  ('e9300000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000002','PFC B Main','pfc-b-main','PFC-B','2 Synthetic St','Test City','Test Province');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e9400000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e9400000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e9400000-0000-0000-0000-000000000003','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e9400000-0000-0000-0000-000000000004','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('e9400000-0000-0000-0000-000000000005','e9200000-0000-0000-0000-000000000002','e9100000-0000-0000-0000-000000000005','active',statement_timestamp());

insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e9200000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001','e9400000-0000-0000-0000-000000000001','active'),
  ('e9200000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001','e9400000-0000-0000-0000-000000000002','active'),
  ('e9200000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001','e9400000-0000-0000-0000-000000000003','active'),
  ('e9200000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001','e9400000-0000-0000-0000-000000000004','active'),
  ('e9200000-0000-0000-0000-000000000002','e9300000-0000-0000-0000-000000000002','e9400000-0000-0000-0000-000000000005','active');

insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e9200000-0000-0000-0000-000000000001'::uuid,'e9400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e9100000-0000-0000-0000-000000000001'::uuid),
  ('e9200000-0000-0000-0000-000000000001'::uuid,'e9400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'e9100000-0000-0000-0000-000000000002'::uuid),
  ('e9200000-0000-0000-0000-000000000001'::uuid,'e9400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'e9100000-0000-0000-0000-000000000003'::uuid),
  ('e9200000-0000-0000-0000-000000000001'::uuid,'e9400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'e9300000-0000-0000-0000-000000000001'::uuid,'e9100000-0000-0000-0000-000000000001'::uuid),
  ('e9200000-0000-0000-0000-000000000002'::uuid,'e9400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'e9100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e9500000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','PFC-A-1','Patient','A1',date '1980-01-01','e9300000-0000-0000-0000-000000000001'),
  ('e9500000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000002','PFC-B-1','Patient','B1',date '1981-01-01','e9300000-0000-0000-0000-000000000002');

insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('e9600000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('e9600000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000001','e9100000-0000-0000-0000-000000000002','Owner','A2','REGULAR','active'),
  ('e9600000-0000-0000-0000-000000000005','e9200000-0000-0000-0000-000000000002','e9100000-0000-0000-0000-000000000005','Dentist','B1','REGULAR','active');

insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e9200000-0000-0000-0000-000000000001','e9600000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001',true),
  ('e9200000-0000-0000-0000-000000000001','e9600000-0000-0000-0000-000000000002','e9300000-0000-0000-0000-000000000001',true),
  ('e9200000-0000-0000-0000-000000000002','e9600000-0000-0000-0000-000000000005','e9300000-0000-0000-0000-000000000002',true);

insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by) values
  ('e9700000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9600000-0000-0000-0000-000000000001','OPEN','e9100000-0000-0000-0000-000000000001'),
  ('e9700000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000002','e9300000-0000-0000-0000-000000000002','e9500000-0000-0000-0000-000000000002','e9600000-0000-0000-0000-000000000005','OPEN','e9100000-0000-0000-0000-000000000005');

-- Working examinations. Every one is DRAFT until a section finalizes it.
insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status) values
  ('e9800000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT'),
  ('e9800000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT'),
  ('e9800000-0000-0000-0000-000000000003','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT'),
  ('e9800000-0000-0000-0000-000000000004','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT'),
  ('e9800000-0000-0000-0000-000000000005','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT'),
  ('e9800000-0000-0000-0000-000000000006','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT');

-- ===========================================================================
-- 1. The boundary that must not move
-- ===========================================================================

select extensions.ok(
  not exists (
    select 1 from (values
      ('periodontal_examinations'),('periodontal_site_measurements'),
      ('periodontal_plaque_measurements'),('periodontal_tooth_measurements'),
      ('periodontal_furcation_measurements')
    ) as scoped(table_name)
    cross join (values ('anon'),('authenticated'),('service_role')) as role(role_name)
    where has_table_privilege(role.role_name,'public.'||scoped.table_name,'SELECT')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'INSERT')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'UPDATE')
       or has_table_privilege(role.role_name,'public.'||scoped.table_name,'DELETE')
  ),
  'the expanded periodontal tables still hold zero browser or service DML grants'
);

select extensions.ok(
  not exists (
    select 1 from (values
      ('periodontal_examinations'),('periodontal_site_measurements'),
      ('periodontal_plaque_measurements'),('periodontal_tooth_measurements'),
      ('periodontal_furcation_measurements')
    ) as scoped(table_name)
    join pg_class as c on c.relname = scoped.table_name and c.relnamespace = 'public'::regnamespace
    where not c.relrowsecurity
  ),
  'RLS remains enabled on every expanded periodontal table'
);

select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename like 'periodontal%'),
  0,
  'no browser RLS policy is introduced on the periodontal tables'
);

select extensions.ok(
  not has_function_privilege('authenticated','private.periodontal_measurement_digest(uuid,uuid)','execute')
  and not has_function_privilege('anon','private.periodontal_measurement_digest(uuid,uuid)','execute')
  and not has_function_privilege('service_role','private.periodontal_measurement_digest(uuid,uuid)','execute'),
  'the canonical measurement digest helper is not browser or service callable'
);

-- ===========================================================================
-- 2. Canonical column shape
-- ===========================================================================

select extensions.has_column('public','periodontal_plaque_measurements','plaque_index','surface Silness-Loe plaque index column exists');
select extensions.has_column('public','periodontal_plaque_measurements','gingival_index','surface Loe-Silness gingival index column exists');
select extensions.has_column('public','periodontal_plaque_measurements','modified_plaque_index','peri-implant modified plaque index column exists');
select extensions.has_column('public','periodontal_plaque_measurements','modified_bleeding_index','peri-implant modified bleeding index column exists');

select extensions.has_column('public','periodontal_tooth_measurements','keratinized_gingiva_mm','keratinized gingiva width column exists');
select extensions.has_column('public','periodontal_tooth_measurements','gingival_thickness_mm','gingival thickness column exists');
select extensions.has_column('public','periodontal_tooth_measurements','gingival_phenotype','gingival phenotype column exists');
select extensions.has_column('public','periodontal_tooth_measurements','miller_recession_class','Miller recession class column exists');
select extensions.has_column('public','periodontal_tooth_measurements','cej_visible','CEJ visibility column exists');
select extensions.has_column('public','periodontal_tooth_measurements','root_concavity','root concavity column exists');

select extensions.has_column('public','periodontal_examinations','age_years_snapshot','risk input: age snapshot exists');
select extensions.has_column('public','periodontal_examinations','smoking_status','risk input: smoking status exists');
select extensions.has_column('public','periodontal_examinations','cigarettes_per_day','risk input: cigarettes per day exists');
select extensions.has_column('public','periodontal_examinations','diabetes_status','risk input: diabetes status exists');
select extensions.has_column('public','periodontal_examinations','hba1c_percent','risk input: HbA1c exists');
select extensions.has_column('public','periodontal_examinations','teeth_lost_to_periodontitis','risk input: teeth lost to periodontitis exists');
select extensions.has_column('public','periodontal_examinations','radiographic_bone_loss_percent','risk input: radiographic bone loss exists');

select extensions.has_column('public','periodontal_examinations','derived_diagnosis','derived diagnosis exists');
select extensions.has_column('public','periodontal_examinations','derived_stage','derived stage exists');
select extensions.has_column('public','periodontal_examinations','derived_grade','derived grade exists');
select extensions.has_column('public','periodontal_examinations','derived_extent','derived extent exists');
select extensions.has_column('public','periodontal_examinations','derived_measurement_fingerprint','derived measurement fingerprint exists');
select extensions.has_column('public','periodontal_examinations','confirmed_diagnosis','clinician-confirmed diagnosis exists');
select extensions.has_column('public','periodontal_examinations','confirmed_stage','clinician-confirmed stage exists');
select extensions.has_column('public','periodontal_examinations','confirmed_grade','clinician-confirmed grade exists');
select extensions.has_column('public','periodontal_examinations','confirmed_extent','clinician-confirmed extent exists');
select extensions.has_column('public','periodontal_examinations','confirmed_measurement_fingerprint','confirmation-time measurement fingerprint exists');
select extensions.has_column('public','periodontal_examinations','confirmed_at','confirmation timestamp exists');
select extensions.has_column('public','periodontal_examinations','confirmed_by','confirming user exists');
select extensions.has_column('public','periodontal_examinations','confirmed_provider_id','confirming provider exists');
select extensions.has_column('public','periodontal_examinations','classification_override_reason','classification override reason exists');
select extensions.has_column('public','periodontal_examinations','amendment_reason','amendment reason exists');

-- Every new canonical column is nullable: an absent measurement stays absent.
select extensions.ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'periodontal_plaque_measurements' and column_name in (
          'plaque_present','plaque_index','gingival_index','modified_plaque_index','modified_bleeding_index'))
        or (table_name = 'periodontal_site_measurements' and column_name in (
          'gingival_margin_mm','bleeding_on_probing','suppuration'))
        or (table_name = 'periodontal_tooth_measurements' and column_name in (
          'keratinized_gingiva_mm','gingival_thickness_mm','gingival_phenotype',
          'miller_recession_class','cej_visible','root_concavity'))
        or (table_name = 'periodontal_examinations' and column_name in (
          'age_years_snapshot','smoking_status','cigarettes_per_day','diabetes_status',
          'hba1c_percent','teeth_lost_to_periodontitis','radiographic_bone_loss_percent',
          'derived_diagnosis','derived_stage','derived_grade','derived_extent',
          'derived_measurement_fingerprint','confirmed_diagnosis','confirmed_stage',
          'confirmed_grade','confirmed_extent','confirmed_measurement_fingerprint',
          'confirmed_at','confirmed_by','confirmed_provider_id',
          'classification_override_reason','amendment_reason'))
      )
      and (is_nullable = 'NO' or column_default is not null)
  ),
  'every canonical measurement column is nullable with no default, so unknown is not silently zero or false'
);

-- ===========================================================================
-- 3. Clinical bounds
-- ===========================================================================

select extensions.throws_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, plaque_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','16','MESIAL',4)$$,
  '23514',
  'new row for relation "periodontal_plaque_measurements" violates check constraint "perio_plaque_plaque_index_range"',
  'Silness-Loe plaque index 4 is out of the 0..3 range'
);

select extensions.throws_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, gingival_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','16','DISTAL',-1)$$,
  '23514',
  'new row for relation "periodontal_plaque_measurements" violates check constraint "perio_plaque_gingival_index_range"',
  'Loe-Silness gingival index -1 is out of the 0..3 range'
);

select extensions.throws_ok(
  $$insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, keratinized_gingiva_mm)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','23',16)$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_keratinized_gingiva_range"',
  'keratinized gingiva 16 mm is out of the 0..15 range'
);

select extensions.throws_ok(
  $$insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, gingival_thickness_mm)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','24',0.0)$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_gingival_thickness_range"',
  'gingival thickness 0.0 mm is rejected; a measured thickness is positive'
);

select extensions.throws_ok(
  $$insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, gingival_phenotype)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','25','MEDIUM')$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_gingival_phenotype_check"',
  'an unknown gingival phenotype is rejected'
);

select extensions.throws_ok(
  $$insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, miller_recession_class)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000001','26','V')$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_miller_recession_class_check"',
  'Miller recession class V does not exist'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set age_years_snapshot = 131
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_age_snapshot_range"',
  'an age snapshot of 131 years is rejected'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set smoking_status = 'SOMETIMES'
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_smoking_status_check"',
  'an unknown smoking status is rejected'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set smoking_status = 'FORMER', cigarettes_per_day = 10
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_cigarettes_current_smoker_check"',
  'cigarettes per day is only meaningful for a current smoker'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set diabetes_status = 'MAYBE'
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_diabetes_status_check"',
  'an unknown diabetes status is rejected'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set hba1c_percent = 21.0
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_hba1c_range"',
  'an HbA1c of 21.0 percent is out of the 3.0..20.0 range'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set teeth_lost_to_periodontitis = 33
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_teeth_lost_range"',
  'more than 32 teeth lost to periodontitis is rejected'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set radiographic_bone_loss_percent = 101
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_bone_loss_range"',
  'radiographic bone loss above 100 percent is rejected'
);

select extensions.lives_ok(
  $$update public.periodontal_examinations
      set age_years_snapshot = 46, smoking_status = 'CURRENT', cigarettes_per_day = 12,
          diabetes_status = 'TYPE_2', hba1c_percent = 7.4,
          teeth_lost_to_periodontitis = 3, radiographic_bone_loss_percent = 41
    where id = 'e9800000-0000-0000-0000-000000000001'$$,
  'a complete in-range risk-input snapshot is accepted'
);

-- ===========================================================================
-- 4. Natural-tooth versus peri-implant applicability
-- ===========================================================================

-- Tooth 36 is an implant in examination 2; tooth 46 stays natural.
insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, implant_context) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36',true);
insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, implant_context) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','46',false);

select extensions.throws_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, plaque_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','BUCCAL',2)$$,
  '23514',
  'peri-implant surfaces use the modified plaque and bleeding indices',
  'the Silness-Loe plaque index is refused on a peri-implant surface'
);

select extensions.throws_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, modified_bleeding_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','46','BUCCAL',2)$$,
  '23514',
  'modified plaque and bleeding indices apply only to peri-implant surfaces',
  'the modified bleeding index is refused on a natural-tooth surface'
);

select extensions.lives_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, modified_plaque_index, modified_bleeding_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','BUCCAL',1,2)$$,
  'the modified plaque and bleeding indices are accepted on a peri-implant surface'
);

select extensions.lives_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, plaque_index, gingival_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','46','BUCCAL',1,2)$$,
  'the Silness-Loe and Loe-Silness indices are accepted on a natural-tooth surface'
);

select extensions.throws_ok(
  $$insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface, plaque_index, modified_plaque_index)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','46','LINGUAL',1,1)$$,
  '23514',
  'new row for relation "periodontal_plaque_measurements" violates check constraint "perio_plaque_index_family_check"',
  'a surface may not carry both the natural-tooth and the peri-implant index family'
);

-- The inverse hole: scoring a natural tooth and then flipping it to an implant
-- would otherwise leave Silness-Loe scores on a peri-implant sulcus.
select extensions.throws_ok(
  $$update public.periodontal_tooth_measurements set implant_context = true
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '46'$$,
  '23514',
  'peri-implant surfaces use the modified plaque and bleeding indices',
  'a tooth already scored with the natural-tooth index family cannot be flipped to an implant'
);

select extensions.throws_ok(
  $$update public.periodontal_tooth_measurements set implant_context = false
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'$$,
  '23514',
  'modified plaque and bleeding indices apply only to peri-implant surfaces',
  'an implant already scored with the modified index family cannot be flipped to a natural tooth'
);

select extensions.throws_ok(
  $$update public.periodontal_tooth_measurements set miller_recession_class = 'I'
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_implant_property_check"',
  'Miller recession class is refused on an implant, which has no root or interdental attachment'
);

select extensions.throws_ok(
  $$update public.periodontal_tooth_measurements set cej_visible = true
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_implant_property_check"',
  'CEJ visibility is refused on an implant, which has no cemento-enamel junction'
);

select extensions.throws_ok(
  $$update public.periodontal_tooth_measurements set root_concavity = true
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'$$,
  '23514',
  'new row for relation "periodontal_tooth_measurements" violates check constraint "perio_tooth_implant_property_check"',
  'root concavity is refused on an implant, which has no root'
);

select extensions.lives_ok(
  $$update public.periodontal_tooth_measurements
      set keratinized_gingiva_mm = 2, gingival_thickness_mm = 1.2, gingival_phenotype = 'THIN'
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'$$,
  'keratinized mucosa width, thickness, and phenotype remain valid peri-implant measurements'
);

select extensions.lives_ok(
  $$update public.periodontal_tooth_measurements
      set miller_recession_class = 'II', cej_visible = true, root_concavity = false
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '46'$$,
  'Miller recession class, CEJ visibility, and root concavity are accepted on a natural tooth'
);

-- ===========================================================================
-- 5. Six-site geometry, implant sites, and furcation applicability
-- ===========================================================================

select extensions.lives_ok(
  $$insert into public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi, site, probing_depth_mm, implant_context)
    values
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','MB',3,true),
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','B',3,true),
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','DB',4,true),
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','ML',3,true),
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','L',3,true),
      ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','DL',5,true)$$,
  'all six peri-implant sites MB/B/DB/ML/L/DL are accepted on an implant'
);

select extensions.is(
  (select count(*)::integer from public.periodontal_site_measurements
    where examination_id = 'e9800000-0000-0000-0000-000000000002' and tooth_fdi = '36'),
  6,
  'exactly six peri-implant sites persist'
);

select extensions.throws_ok(
  $$insert into public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi, site, probing_depth_mm, implant_context)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','B',4,true)$$,
  '23505',
  'duplicate key value violates unique constraint "periodontal_site_measurements_unique_tooth_site"',
  'a seventh row on an existing tooth/site pair is refused'
);

select extensions.throws_ok(
  $$insert into public.periodontal_furcation_measurements (organization_id, examination_id, tooth_fdi, entrance, grade)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','36','buccal',2)$$,
  '23514',
  'implant tooth cannot have furcation',
  'furcation is never recorded on an implant'
);

select extensions.lives_ok(
  $$insert into public.periodontal_furcation_measurements (organization_id, examination_id, tooth_fdi, entrance, grade)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000002','46','buccal',2)$$,
  'furcation is accepted on an anatomically valid natural-tooth entrance'
);

-- ===========================================================================
-- 6 and 7. Derived CAL, and unknown represented distinctly from zero/false
-- ===========================================================================

insert into public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi, site, probing_depth_mm, gingival_margin_mm) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000003','16','B',4,2);

select extensions.is(
  (select cal_mm from public.periodontal_site_measurements
    where examination_id = 'e9800000-0000-0000-0000-000000000003' and tooth_fdi = '16' and site = 'B'),
  6,
  'CAL is derived as probing depth plus signed gingival margin'
);

-- The gingival margin is omitted entirely: it is unknown, not zero.
insert into public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi, site, probing_depth_mm) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000003','16','MB',4);

select extensions.ok(
  (select gingival_margin_mm is null and cal_mm is null
     from public.periodontal_site_measurements
    where examination_id = 'e9800000-0000-0000-0000-000000000003' and tooth_fdi = '16' and site = 'MB'),
  'an unrecorded gingival margin stays null and leaves derived CAL unknown rather than defaulting to the probing depth'
);

select extensions.ok(
  (select bleeding_on_probing is null and suppuration is null
     from public.periodontal_site_measurements
    where examination_id = 'e9800000-0000-0000-0000-000000000003' and tooth_fdi = '16' and site = 'MB'),
  'an unassessed site records bleeding and suppuration as unknown rather than as absent'
);

insert into public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi, surface) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000003','16','BUCCAL');

select extensions.ok(
  (select plaque_present is null from public.periodontal_plaque_measurements
    where examination_id = 'e9800000-0000-0000-0000-000000000003' and tooth_fdi = '16' and surface = 'BUCCAL'),
  'an unassessed surface records plaque presence as unknown rather than as absent'
);

-- ===========================================================================
-- 8. FINAL immutability extended to every new column
-- ===========================================================================

update public.periodontal_examinations
  set status = 'FINAL',
      examined_at = statement_timestamp(),
      examined_by = 'e9100000-0000-0000-0000-000000000001',
      examined_provider_id = 'e9600000-0000-0000-0000-000000000001',
      finalized_at = statement_timestamp(),
      finalized_by = 'e9100000-0000-0000-0000-000000000001',
      finalized_provider_id = 'e9600000-0000-0000-0000-000000000001'
  where id = 'e9800000-0000-0000-0000-000000000003';

select extensions.throws_ok(
  $$update public.periodontal_examinations set radiographic_bone_loss_percent = 55
    where id = 'e9800000-0000-0000-0000-000000000003'$$,
  'P0001',
  'finalized periodontal examinations are immutable; create an AMENDMENT examination',
  'a FINAL examination refuses a new risk input'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set confirmed_diagnosis = 'PERIODONTITIS'
    where id = 'e9800000-0000-0000-0000-000000000003'$$,
  'P0001',
  'finalized periodontal examinations are immutable; create an AMENDMENT examination',
  'a FINAL examination refuses a new confirmed classification'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_measurement_fingerprint = null
    where id = 'e9800000-0000-0000-0000-000000000003'$$,
  'P0001',
  'finalized periodontal examinations are immutable; create an AMENDMENT examination',
  'a FINAL examination refuses a fingerprint rewrite'
);

select extensions.throws_ok(
  $$update public.periodontal_site_measurements set suppuration = true
    where examination_id = 'e9800000-0000-0000-0000-000000000003'$$,
  'P0001',
  'periodontal child tables are immutable on a FINAL examination; create an AMENDMENT examination',
  'a FINAL examination refuses a site suppuration edit'
);

select extensions.throws_ok(
  $$update public.periodontal_plaque_measurements set plaque_index = 3
    where examination_id = 'e9800000-0000-0000-0000-000000000003'$$,
  'P0001',
  'periodontal child tables are immutable on a FINAL examination; create an AMENDMENT examination',
  'a FINAL examination refuses a surface index edit'
);

select extensions.throws_ok(
  $$insert into public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi, gingival_phenotype)
    values ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000003','17','THICK')$$,
  'P0001',
  'periodontal child tables are immutable on a FINAL examination; create an AMENDMENT examination',
  'a FINAL examination refuses a new tooth property row'
);

-- ===========================================================================
-- 9. Amendment lineage
-- ===========================================================================

select extensions.throws_ok(
  $$insert into public.periodontal_examinations (organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id, amendment_reason)
    values ('e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','AMENDMENT','DRAFT','e9800000-0000-0000-0000-000000000003','   ')$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_amendment_reason_bounded_check"',
  'a blank amendment reason is refused'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set amendment_reason = 'reason without a predecessor'
    where id = 'e9800000-0000-0000-0000-000000000004'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_amendment_reason_scope_check"',
  'an amendment reason without a predecessor is refused'
);

insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id, amendment_reason) values
  ('e9800000-0000-0000-0000-000000000007','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','AMENDMENT','DRAFT','e9800000-0000-0000-0000-000000000003','Probing depths on tooth 16 were transcribed from the wrong quadrant.');

select extensions.is(
  (select amendment_reason from public.periodontal_examinations where id = 'e9800000-0000-0000-0000-000000000007'),
  'Probing depths on tooth 16 were transcribed from the wrong quadrant.',
  'an amendment records why it replaces its predecessor'
);

select extensions.throws_ok(
  $$insert into public.periodontal_examinations (organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id, amendment_reason)
    values ('e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','AMENDMENT','DRAFT','e9800000-0000-0000-0000-000000000003','A competing second successor.')$$,
  '23505',
  'duplicate key value violates unique constraint "periodontal_examinations_one_amendment_idx"',
  'a supersession chain cannot fork into two successors of one FINAL examination'
);

-- An unexplained amendment may exist as a DRAFT but may never become the
-- authoritative FINAL record.
insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status) values
  ('e9800000-0000-0000-0000-000000000008','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','INITIAL','DRAFT');

update public.periodontal_examinations
  set status = 'FINAL',
      examined_at = statement_timestamp(),
      examined_by = 'e9100000-0000-0000-0000-000000000001',
      examined_provider_id = 'e9600000-0000-0000-0000-000000000001',
      finalized_at = statement_timestamp(),
      finalized_by = 'e9100000-0000-0000-0000-000000000001',
      finalized_provider_id = 'e9600000-0000-0000-0000-000000000001'
  where id = 'e9800000-0000-0000-0000-000000000008';

insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status, predecessor_examination_id) values
  ('e9800000-0000-0000-0000-000000000009','e9200000-0000-0000-0000-000000000001','e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001','AMENDMENT','DRAFT','e9800000-0000-0000-0000-000000000008');

select extensions.throws_ok(
  $$update public.periodontal_examinations
      set status = 'FINAL',
          examined_at = statement_timestamp(),
          examined_by = 'e9100000-0000-0000-0000-000000000001',
          examined_provider_id = 'e9600000-0000-0000-0000-000000000001',
          finalized_at = statement_timestamp(),
          finalized_by = 'e9100000-0000-0000-0000-000000000001',
          finalized_provider_id = 'e9600000-0000-0000-0000-000000000001'
    where id = 'e9800000-0000-0000-0000-000000000009'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_final_amendment_reason_check"',
  'an amendment cannot be finalized without recording why it supersedes its predecessor'
);

-- ===========================================================================
-- 10. Classification provenance
-- ===========================================================================

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'BAD_GUMS', derived_measurement_fingerprint = repeat('a',64)
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_derived_diagnosis_check"',
  'a diagnosis outside the canonical set is refused'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'PERIODONTITIS', derived_stage = 'V', derived_measurement_fingerprint = repeat('a',64)
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_derived_stage_check"',
  'a stage outside I..IV is refused'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'GINGIVITIS', derived_stage = 'II', derived_measurement_fingerprint = repeat('a',64)
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_derived_stageable_check"',
  'gingivitis is never staged'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'PERIODONTITIS'
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_derived_complete_check"',
  'a derived classification without the measurement fingerprint it came from is refused'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'PERIODONTITIS', derived_measurement_fingerprint = 'not-a-digest'
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_derived_fingerprint_check"',
  'a measurement fingerprint that is not a 64-character lowercase hex digest is refused'
);

-- A fingerprint must actually be the digest of the examination's measurements.
select extensions.throws_ok(
  $$update public.periodontal_examinations set derived_diagnosis = 'PERIODONTITIS', derived_measurement_fingerprint = repeat('a',64)
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'derived measurement fingerprint does not match the examination measurements',
  'a forged derived fingerprint is refused'
);

insert into public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi, site, probing_depth_mm, gingival_margin_mm, bleeding_on_probing) values
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005','16','B',7,2,true),
  ('e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005','16','MB',8,3,true);

select extensions.lives_ok(
  $$update public.periodontal_examinations
      set derived_diagnosis = 'PERIODONTITIS', derived_stage = 'III', derived_grade = 'B',
          derived_extent = 'LOCALIZED',
          derived_measurement_fingerprint = private.periodontal_measurement_digest(
            'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  'a derived classification carrying the true measurement digest is accepted'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations
      set confirmed_diagnosis = 'PERIODONTITIS', confirmed_stage = 'IV', confirmed_grade = 'B',
          confirmed_extent = 'LOCALIZED', confirmed_at = statement_timestamp(),
          confirmed_by = 'e9100000-0000-0000-0000-000000000001',
          confirmed_provider_id = 'e9600000-0000-0000-0000-000000000001',
          confirmed_measurement_fingerprint = private.periodontal_measurement_digest(
            'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_override_reason_required_check"',
  'a confirmed classification that differs from the derived one requires a stated reason'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations
      set confirmed_diagnosis = 'PERIODONTITIS', confirmed_stage = 'III', confirmed_grade = 'B',
          confirmed_extent = 'LOCALIZED', confirmed_at = statement_timestamp(),
          confirmed_by = 'e9100000-0000-0000-0000-000000000001',
          confirmed_measurement_fingerprint = private.periodontal_measurement_digest(
            'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "perio_exam_confirmed_complete_check"',
  'a confirmation without the confirming provider is refused'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations
      set confirmed_diagnosis = 'PERIODONTITIS', confirmed_stage = 'III', confirmed_grade = 'B',
          confirmed_extent = 'LOCALIZED', confirmed_at = statement_timestamp(),
          confirmed_by = 'e9100000-0000-0000-0000-000000000001',
          confirmed_provider_id = 'e9600000-0000-0000-0000-000000000005',
          confirmed_measurement_fingerprint = private.periodontal_measurement_digest(
            'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23503',
  'insert or update on table "periodontal_examinations" violates foreign key constraint "perio_exam_organization_confirmed_provider_fk"',
  'a confirming provider from another organization is refused by the tenant-safe foreign key'
);

select extensions.throws_ok(
  $$update public.periodontal_examinations
      set confirmed_diagnosis = 'PERIODONTITIS', confirmed_stage = 'III', confirmed_grade = 'B',
          confirmed_extent = 'LOCALIZED', confirmed_at = statement_timestamp(),
          confirmed_by = 'e9100000-0000-0000-0000-000000000001',
          confirmed_provider_id = 'e9600000-0000-0000-0000-000000000001',
          confirmed_measurement_fingerprint = repeat('b',64)
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  '23514',
  'confirmed measurement fingerprint does not match the examination measurements',
  'a forged confirmation fingerprint is refused'
);

select extensions.lives_ok(
  $$update public.periodontal_examinations
      set confirmed_diagnosis = 'PERIODONTITIS', confirmed_stage = 'III', confirmed_grade = 'B',
          confirmed_extent = 'LOCALIZED', confirmed_at = statement_timestamp(),
          confirmed_by = 'e9100000-0000-0000-0000-000000000001',
          confirmed_provider_id = 'e9600000-0000-0000-0000-000000000001',
          confirmed_measurement_fingerprint = private.periodontal_measurement_digest(
            'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  'a confirmation that agrees with the derived classification needs no override reason'
);

select extensions.lives_ok(
  $$update public.periodontal_examinations
      set confirmed_stage = 'IV',
          classification_override_reason = 'Radiographic bone loss exceeds the probing-derived stage.'
    where id = 'e9800000-0000-0000-0000-000000000005'$$,
  'a clinician override is accepted once the reason is recorded'
);

select extensions.ok(
  (select derived_stage = 'III' and confirmed_stage = 'IV'
     from public.periodontal_examinations where id = 'e9800000-0000-0000-0000-000000000005'),
  'the derived and the clinician-confirmed classification are stored separately'
);

-- The digest actually tracks the measurements it covers.
select extensions.isnt(
  (select private.periodontal_measurement_digest(
     'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')),
  (select private.periodontal_measurement_digest(
     'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000006')),
  'the measurement digest distinguishes two examinations with different measurements'
);

select extensions.is(
  (select private.periodontal_measurement_digest(
     'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')),
  (select private.periodontal_measurement_digest(
     'e9200000-0000-0000-0000-000000000001','e9800000-0000-0000-0000-000000000005')),
  'the measurement digest is deterministic'
);

-- ===========================================================================
-- 11. Read indexes
-- ===========================================================================

select extensions.has_index('public','periodontal_examinations','periodontal_examinations_one_amendment_idx','the supersession chain is backed by a partial unique index on the predecessor');
select extensions.has_index('public','periodontal_examinations','perio_exam_org_encounter_idx','the visit-scoped examination read is indexed');
select extensions.has_index('public','periodontal_examinations','perio_exam_org_patient_draft_idx','the resumable draft examination read is indexed');
select extensions.has_index('public','periodontal_examinations','periodontal_examinations_organization_patient_recorded_idx','the patient timeline read is indexed');
select extensions.has_index('public','periodontal_examinations','periodontal_examinations_organization_patient_final_idx','the finalized patient timeline read is indexed');

-- ===========================================================================
-- 12. Negative authorization at the browser boundary
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9100000-0000-0000-0000-000000000004',true);

select extensions.throws_ok(
  $$select * from public.create_periodontal_examination(
      'e9300000-0000-0000-0000-000000000001'::uuid,
      'e9500000-0000-0000-0000-000000000001'::uuid,
      'e9700000-0000-0000-0000-000000000001'::uuid,
      'INITIAL')$$,
  '42501','not authorized',
  'a receptionist may not create a periodontal examination'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9100000-0000-0000-0000-000000000005',true);

select extensions.throws_ok(
  $$select * from public.create_periodontal_examination(
      'e9300000-0000-0000-0000-000000000001'::uuid,
      'e9500000-0000-0000-0000-000000000001'::uuid,
      'e9700000-0000-0000-0000-000000000001'::uuid,
      'INITIAL')$$,
  '42501','not authorized',
  'a dentist from another organization may not create a periodontal examination for a foreign patient'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9100000-0000-0000-0000-000000000002',true);

select extensions.lives_ok(
  $$select * from public.create_periodontal_examination(
      'e9300000-0000-0000-0000-000000000001'::uuid,
      'e9500000-0000-0000-0000-000000000001'::uuid,
      'e9700000-0000-0000-0000-000000000001'::uuid,
      'INITIAL')$$,
  'an owner who holds an active provider link at the acting branch may create a periodontal examination'
);

reset role;

select extensions.ok(
  (select examined_provider_id = 'e9600000-0000-0000-0000-000000000002'
     from public.periodontal_examinations
    where organization_id = 'e9200000-0000-0000-0000-000000000001'
      and examined_by = 'e9100000-0000-0000-0000-000000000002'),
  'the treating provider is derived from the signed-in owner, never supplied by the caller'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9100000-0000-0000-0000-000000000003',true);

select extensions.lives_ok(
  $$select * from public.create_periodontal_examination(
      'e9300000-0000-0000-0000-000000000001'::uuid,
      'e9500000-0000-0000-0000-000000000001'::uuid,
      'e9700000-0000-0000-0000-000000000001'::uuid,
      'INITIAL')$$,
  'an owner without a provider link may open a draft examination'
);

reset role;

select extensions.ok(
  (select examined_provider_id is null
     from public.periodontal_examinations
    where organization_id = 'e9200000-0000-0000-0000-000000000001'
      and examined_by = 'e9100000-0000-0000-0000-000000000003'),
  'an actor with no active provider link is attributed to no provider rather than to somebody else'
);

-- The same draft, given a stable identity so the finalize attempt below does
-- not have to read a tenant table from the browser role.
insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'e980000a-0000-0000-0000-00000000000a','e9200000-0000-0000-0000-000000000001',
  'e9500000-0000-0000-0000-000000000001','e9700000-0000-0000-0000-000000000001',
  'INITIAL','DRAFT', statement_timestamp(), 'e9100000-0000-0000-0000-000000000003', null
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e9100000-0000-0000-0000-000000000003',true);

select extensions.throws_ok(
  $$select * from public.finalize_periodontal_examination(
      'e9300000-0000-0000-0000-000000000001'::uuid,
      'e980000a-0000-0000-0000-00000000000a'::uuid,
      1)$$,
  '23514',
  'new row for relation "periodontal_examinations" violates check constraint "periodontal_examinations_finalized_state_check"',
  'an owner without an active provider link cannot finalize a periodontal examination'
);

reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
