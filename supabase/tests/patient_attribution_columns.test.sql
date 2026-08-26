begin;

select extensions.no_plan();

-- Synthetic-only P5-02 graph. Attribution behavior rides on the P5-01 catalog
-- seeds plus these fixtures; every id below is deterministic and unused.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  actor.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  actor.email,
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"fixture":"p5-02-synthetic"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('b7100000-0000-0000-0000-000000000001'::uuid, 'receptionist-a@p502.example.test'),
  ('b7100000-0000-0000-0000-000000000002'::uuid, 'dentist-b@p502.example.test'),
  ('b7100000-0000-0000-0000-000000000003'::uuid, 'owner-a@p502.example.test')
) as actor(id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('b7200000-0000-0000-0000-000000000001', 'P502 Synthetic A Inc.', 'P502 Synthetic A', 'p502-synthetic-a'),
  ('b7200000-0000-0000-0000-000000000002', 'P502 Synthetic B Inc.', 'P502 Synthetic B', 'p502-synthetic-b');

insert into public.branches (
  id, organization_id, name, slug, code, address_line1, city, province
)
values
  ('b7300000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'P502 A Main', 'p502-a-main', 'P502-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('b7300000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000002', 'P502 B Main', 'p502-b-main', 'P502-B1', '2 Synthetic Street', 'Test City', 'Test Province');

insert into public.organization_members (
  id, organization_id, user_id, membership_status, joined_at
)
values
  ('b7400000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000002', 'b7100000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000003', 'b7200000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000003', 'active', statement_timestamp());

insert into public.branch_memberships (
  organization_id, branch_id, organization_member_id, access_status
)
values
  ('b7200000-0000-0000-0000-000000000001', 'b7300000-0000-0000-0000-000000000001', 'b7400000-0000-0000-0000-000000000001', 'active'),
  ('b7200000-0000-0000-0000-000000000002', 'b7300000-0000-0000-0000-000000000002', 'b7400000-0000-0000-0000-000000000002', 'active');

insert into public.member_roles (
  organization_id, organization_member_id, role_id, branch_id, assigned_by
)
select
  assignment.organization_id,
  assignment.organization_member_id,
  role.id,
  assignment.branch_id,
  assignment.user_id
from (values
  ('b7200000-0000-0000-0000-000000000001'::uuid, 'b7400000-0000-0000-0000-000000000001'::uuid, 'RECEPTIONIST'::text, 'b7300000-0000-0000-0000-000000000001'::uuid, 'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000002'::uuid, 'b7400000-0000-0000-0000-000000000002'::uuid, 'DENTIST'::text, 'b7300000-0000-0000-0000-000000000002'::uuid, 'b7100000-0000-0000-0000-000000000002'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid, 'b7400000-0000-0000-0000-000000000003'::uuid, 'OWNER'::text, null::uuid, 'b7100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

-- Custom sources: Org A active, Org B active, Org A retired probe.
insert into public.acquisition_sources (
  id, organization_id, code, name, category, is_active
)
values
  ('b7500000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'P502_CUSTOM', 'P502 Custom Source', 'OTHER', true),
  ('b7500000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000002', 'P502_CUSTOM_B', 'P502 Custom Source B', 'REFERRAL', true),
  ('b7500000-0000-0000-0000-000000000003', 'b7200000-0000-0000-0000-000000000001', 'P502_RETIRED', 'P502 Retired Source', 'OTHER', false);

-- Referrer-capable patients: two in Org A, one in Org B.
insert into public.patients (
  id, organization_id, patient_number, first_name, last_name,
  birth_date, preferred_branch_id
)
values
  ('b7700000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'P502-A-0001', 'Ana', 'Santos', date '1990-01-01', 'b7300000-0000-0000-0000-000000000001'),
  ('b7700000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000001', 'P502-A-0002', 'Bea', 'Rivera', date '1991-02-02', 'b7300000-0000-0000-0000-000000000001'),
  ('b7700000-0000-0000-0000-000000000003', 'b7200000-0000-0000-0000-000000000002', 'P502-B-0001', 'Carla', 'Lim', date '1992-03-03', 'b7300000-0000-0000-0000-000000000002');

select extensions.set_eq(
  $$select column_name from information_schema.columns
    where table_schema = 'public'
      and table_name = 'patients'
      and column_name in (
        'acquisition_source_id', 'referrer_patient_id',
        'external_referrer_name', 'external_referrer_organization',
        'external_referrer_contact', 'initial_booking_channel_code'
      )$$,
  array[
    'acquisition_source_id', 'referrer_patient_id',
    'external_referrer_name', 'external_referrer_organization',
    'external_referrer_contact', 'initial_booking_channel_code'
  ]::text[],
  'patients gains exactly the six P5-02 attribution columns'
);

select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname in (
        'patients_acquisition_source_id_fkey',
        'patients_initial_booking_channel_code_fkey',
        'patients_organization_referrer_patient_fk',
        'patients_single_referrer_kind_check',
        'patients_no_self_referral_check',
        'patients_external_referrer_name_bounded_check',
        'patients_external_referrer_organization_bounded_check',
        'patients_external_referrer_contact_bounded_check'
      )$$,
  array[
    'patients_acquisition_source_id_fkey',
    'patients_external_referrer_contact_bounded_check',
    'patients_external_referrer_name_bounded_check',
    'patients_external_referrer_organization_bounded_check',
    'patients_initial_booking_channel_code_fkey',
    'patients_no_self_referral_check',
    'patients_organization_referrer_patient_fk',
    'patients_single_referrer_kind_check'
  ]::text[],
  'patients carries the complete P5-02 attribution constraint set'
);

select extensions.is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    where procedure.oid =
      'private.ensure_patient_acquisition_scope()'::regprocedure
  ),
  array['search_path=""']::text[],
  'the attribution scope trigger function fixes an empty search path'
);

select extensions.ok(
  position(
    'for share' in pg_get_functiondef(
      'private.ensure_patient_acquisition_scope()'::regprocedure
    )
  ) > 0,
  'attribution validation holds a shared lock against source retirement'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      (0::oid),
      ((select oid from pg_roles where rolname = 'anon')),
      ((select oid from pg_roles where rolname = 'authenticated')),
      ((select oid from pg_roles where rolname = 'service_role'))
    ) as denied_role(role_oid)
    where has_function_privilege(
      denied_role.role_oid,
      'private.ensure_patient_acquisition_scope()',
      'execute'
    )
  ),
  'no browser-reachable or service role can execute the scope trigger function'
);

select extensions.is(
  (
    select namespace.nspname || '.' || procedure.proname
    from pg_trigger as trigger
    join pg_proc as procedure on procedure.oid = trigger.tgfoid
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where trigger.tgrelid = 'public.patients'::regclass
      and trigger.tgname = 'patients_validate_acquisition_scope'
      and not trigger.tgisinternal
  ),
  'private.ensure_patient_acquisition_scope',
  'the scope trigger guards patient inserts and attribution updates'
);

select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and indexname = 'patients_organization_acquisition_source_idx'
), 'the acquisition report access path has its dedicated index');
select extensions.is(
  (
    select pg_get_expr(index_metadata.indpred, index_metadata.indrelid)
    from pg_index as index_metadata
    where index_metadata.indexrelid =
      'public.patients_organization_acquisition_source_idx'::regclass
  ),
  '(acquisition_source_id IS NOT NULL)',
  'the reporting index covers attributed patients only'
);
select extensions.is(
  (
    select array_agg(attribute.attname order by index_key.ordinality)
    from pg_index as index_metadata
    cross join lateral unnest(index_metadata.indkey)
      with ordinality as index_key(attnum, ordinality)
    join pg_attribute as attribute
      on attribute.attrelid = index_metadata.indrelid
     and attribute.attnum = index_key.attnum
    where index_metadata.indexrelid =
      'public.patients_organization_acquisition_source_idx'::regclass
  ),
  array['organization_id', 'acquisition_source_id']::name[],
  'the reporting index is keyed by organization and source'
);

select extensions.lives_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id
    ) values (
      'b7700000-0000-0000-0000-000000000004',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0004', 'Cielo', 'Dizon',
      date '1992-03-03', 'b7300000-0000-0000-0000-000000000001'
    )$$,
  'a patient may register without any attribution data at all'
);
select extensions.ok(
  (
    select acquisition_source_id is null
       and referrer_patient_id is null
       and external_referrer_name is null
       and external_referrer_organization is null
       and external_referrer_contact is null
       and initial_booking_channel_code is null
    from public.patients
    where id = 'b7700000-0000-0000-0000-000000000004'
  ),
  'attribution columns stay nullable with no defaults or backfill'
);

select extensions.lives_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id,
      external_referrer_name, external_referrer_organization,
      external_referrer_contact, initial_booking_channel_code
    ) values (
      'b7700000-0000-0000-0000-000000000005',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0005', 'Marco', 'Reyes',
      date '1988-05-05', 'b7300000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000007',
      'Dr. Juan Dela Cruz', 'Sinag Dental Clinic', '(02) 8123-4567',
      'WALK_IN'
    )$$,
  'a global source, walk-in channel, and external referrer snapshot coexist'
);

select extensions.lives_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id,
      referrer_patient_id, initial_booking_channel_code
    ) values (
      'b7700000-0000-0000-0000-000000000006',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0006', 'Nica', 'Torres',
      date '1994-04-04', 'b7300000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000007',
      'b7700000-0000-0000-0000-000000000001',
      'FACEBOOK_MESSENGER'
    )$$,
  'Facebook discovery plus Messenger booking plus a same-org referring patient is representable together'
);

select extensions.lives_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id,
      external_referrer_organization, external_referrer_contact,
      initial_booking_channel_code
    ) values (
      'b7700000-0000-0000-0000-000000000007',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0007', 'Owen', 'Castro',
      date '1996-06-06', 'b7300000-0000-0000-0000-000000000001',
      'b7500000-0000-0000-0000-000000000001',
      repeat('x', 160), repeat('y', 200),
      'UNKNOWN'
    )$$,
  'a same-org custom source, unknown-but-valid channel code, and boundary-length snapshot fields are accepted'
);

select extensions.lives_ok(
  $$update public.patients
    set acquisition_source_id = 'a5000000-0000-0000-0000-000000000005',
        initial_booking_channel_code = 'PHONE',
        external_referrer_name = 'Dr. Ana Lim'
    where id = 'b7700000-0000-0000-0000-000000000004'$$,
  'an existing unattributed patient may gain valid attribution through UPDATE'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id
    ) values (
      'b7700000-0000-0000-0000-000000000010',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0010', 'Liza', 'Bautista',
      date '1995-06-06', 'b7300000-0000-0000-0000-000000000001',
      'b7500000-0000-0000-0000-000000000002'
    )$$,
  '23514',
  'patient acquisition source must be global or belong to the patient organization',
  'another organization''s custom source cannot be attributed to an Org A patient'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id
    ) values (
      'b7700000-0000-0000-0000-000000000011',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0011', 'Paolo', 'Mendoza',
      date '1997-07-07', 'b7300000-0000-0000-0000-000000000001',
      'b7500000-0000-0000-0000-000000000003'
    )$$,
  '23514',
  'inactive acquisition sources cannot be attributed to new patients',
  'an inactive same-org custom source is rejected by the scope trigger'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, acquisition_source_id
    ) values (
      'b7700000-0000-0000-0000-000000000012',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0012', 'Rosa', 'Villareal',
      date '1993-08-08', 'b7300000-0000-0000-0000-000000000001',
      'a5ffffff-0000-0000-0000-000000000001'
    )$$,
  '23503',
  'insert or update on table "patients" violates foreign key constraint "patients_acquisition_source_id_fkey"',
  'an unknown acquisition source id falls through to the plain foreign key'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, referrer_patient_id
    ) values (
      'b7700000-0000-0000-0000-000000000013',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0013', 'Sam', 'Galang',
      date '1998-09-09', 'b7300000-0000-0000-0000-000000000001',
      'b7700000-0000-0000-0000-000000000003'
    )$$,
  '23503',
  'insert or update on table "patients" violates foreign key constraint "patients_organization_referrer_patient_fk"',
  'a cross-organization referring patient is rejected by the composite foreign key'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, referrer_patient_id
    ) values (
      'b7700000-0000-0000-0000-000000000014',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0014', 'Tess', 'Alonzo',
      date '1999-10-10', 'b7300000-0000-0000-0000-000000000001',
      'b7700000-0000-0000-0000-000000000014'
    )$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_no_self_referral_check"',
  'a patient cannot refer themself'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, referrer_patient_id,
      external_referrer_name
    ) values (
      'b7700000-0000-0000-0000-000000000015',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0015', 'Ulysses', 'Padilla',
      date '2000-11-11', 'b7300000-0000-0000-0000-000000000001',
      'b7700000-0000-0000-0000-000000000001',
      'Dr. Cruz'
    )$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_single_referrer_kind_check"',
  'a patient referrer and an external referrer cannot both be recorded'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, initial_booking_channel_code
    ) values (
      'b7700000-0000-0000-0000-000000000016',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0016', 'Vera', 'Domingo',
      date '2001-12-12', 'b7300000-0000-0000-0000-000000000001',
      'CARRIER_PIGEON'
    )$$,
  '23503',
  'insert or update on table "patients" violates foreign key constraint "patients_initial_booking_channel_code_fkey"',
  'invented booking channel codes are rejected by the catalog foreign key'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, external_referrer_name
    ) values (
      'b7700000-0000-0000-0000-000000000017',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0017', 'Wally', 'Fernandez',
      date '1987-01-17', 'b7300000-0000-0000-0000-000000000001',
      '   '
    )$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_external_referrer_name_bounded_check"',
  'a whitespace-only external referrer name is rejected'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, external_referrer_organization
    ) values (
      'b7700000-0000-0000-0000-000000000018',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0018', 'Xander', 'Gonzales',
      date '1986-02-18', 'b7300000-0000-0000-0000-000000000001',
      repeat('x', 161)
    )$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_external_referrer_organization_bounded_check"',
  'an over-length external referrer organization is rejected'
);

select extensions.throws_ok(
  $$insert into public.patients (
      id, organization_id, patient_number, first_name, last_name,
      birth_date, preferred_branch_id, external_referrer_contact
    ) values (
      'b7700000-0000-0000-0000-000000000019',
      'b7200000-0000-0000-0000-000000000001', 'P502-A-0019', 'Ynah', 'Salazar',
      date '1985-03-19', 'b7300000-0000-0000-0000-000000000001',
      repeat('y', 201)
    )$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_external_referrer_contact_bounded_check"',
  'an over-length external referrer contact is rejected'
);

select extensions.throws_ok(
  $$update public.patients
    set organization_id = 'b7200000-0000-0000-0000-000000000002'
    where id = 'b7700000-0000-0000-0000-000000000007'$$,
  '23514',
  'patient acquisition source must be global or belong to the patient organization',
  'moving a patient between organizations cannot smuggle a custom source across tenants'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$update public.patients set external_referrer_name = 'Direct Write'
    where id = 'b7700000-0000-0000-0000-000000000004'$$,
  '42501', null,
  'authenticated direct patients DML stays privilege-denied despite the new columns'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
