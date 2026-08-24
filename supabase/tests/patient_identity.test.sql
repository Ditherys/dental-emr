begin;

select extensions.no_plan();

-- Actors: Org A owner, dentist, branch receptionist, visiting specialist,
-- suspended dentist; Org B receptionist. All addresses are reserved synthetic
-- .example.test values and the transaction rolls back.
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
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('a2010000-0000-0000-0000-000000000001'::uuid, 'owner-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000002'::uuid, 'dentist-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000003'::uuid, 'reception-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000004'::uuid, 'visitor-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000005'::uuid, 'suspended-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000006'::uuid, 'reception-b@p202.example.test')
) as actor(id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('a2020000-0000-0000-0000-000000000001', 'P202 Synthetic A Inc.', 'P202 Synthetic A', 'p202-synthetic-a'),
  ('a2020000-0000-0000-0000-000000000002', 'P202 Synthetic B Inc.', 'P202 Synthetic B', 'p202-synthetic-b');

insert into public.branches (
  id, organization_id, name, slug, code, address_line1, city, province
)
values
  ('a2030000-0000-0000-0000-000000000001', 'a2020000-0000-0000-0000-000000000001', 'P202 A Main', 'p202-a-main', 'P202-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('a2030000-0000-0000-0000-000000000002', 'a2020000-0000-0000-0000-000000000001', 'P202 A Other', 'p202-a-other', 'P202-A2', '2 Synthetic Street', 'Test City', 'Test Province'),
  ('a2030000-0000-0000-0000-000000000003', 'a2020000-0000-0000-0000-000000000002', 'P202 B Main', 'p202-b-main', 'P202-B1', '3 Synthetic Street', 'Test City', 'Test Province');

insert into public.organization_members (
  id, organization_id, user_id, membership_status, joined_at, suspended_at
)
values
  ('a2040000-0000-0000-0000-000000000001', 'a2020000-0000-0000-0000-000000000001', 'a2010000-0000-0000-0000-000000000001', 'active', statement_timestamp(), null),
  ('a2040000-0000-0000-0000-000000000002', 'a2020000-0000-0000-0000-000000000001', 'a2010000-0000-0000-0000-000000000002', 'active', statement_timestamp(), null),
  ('a2040000-0000-0000-0000-000000000003', 'a2020000-0000-0000-0000-000000000001', 'a2010000-0000-0000-0000-000000000003', 'active', statement_timestamp(), null),
  ('a2040000-0000-0000-0000-000000000004', 'a2020000-0000-0000-0000-000000000001', 'a2010000-0000-0000-0000-000000000004', 'active', statement_timestamp(), null),
  ('a2040000-0000-0000-0000-000000000005', 'a2020000-0000-0000-0000-000000000001', 'a2010000-0000-0000-0000-000000000005', 'suspended', statement_timestamp(), statement_timestamp()),
  ('a2040000-0000-0000-0000-000000000006', 'a2020000-0000-0000-0000-000000000002', 'a2010000-0000-0000-0000-000000000006', 'active', statement_timestamp(), null);

insert into public.branch_memberships (
  organization_id, branch_id, organization_member_id, access_status
)
values
  ('a2020000-0000-0000-0000-000000000001', 'a2030000-0000-0000-0000-000000000001', 'a2040000-0000-0000-0000-000000000003', 'active'),
  ('a2020000-0000-0000-0000-000000000002', 'a2030000-0000-0000-0000-000000000003', 'a2040000-0000-0000-0000-000000000006', 'active');

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
  ('a2020000-0000-0000-0000-000000000001'::uuid, 'a2040000-0000-0000-0000-000000000001'::uuid, 'OWNER'::text, null::uuid, 'a2010000-0000-0000-0000-000000000001'::uuid),
  ('a2020000-0000-0000-0000-000000000001'::uuid, 'a2040000-0000-0000-0000-000000000002'::uuid, 'DENTIST'::text, null::uuid, 'a2010000-0000-0000-0000-000000000002'::uuid),
  ('a2020000-0000-0000-0000-000000000001'::uuid, 'a2040000-0000-0000-0000-000000000003'::uuid, 'RECEPTIONIST'::text, 'a2030000-0000-0000-0000-000000000001'::uuid, 'a2010000-0000-0000-0000-000000000003'::uuid),
  ('a2020000-0000-0000-0000-000000000001'::uuid, 'a2040000-0000-0000-0000-000000000004'::uuid, 'VISITING_SPECIALIST'::text, null::uuid, 'a2010000-0000-0000-0000-000000000004'::uuid),
  ('a2020000-0000-0000-0000-000000000001'::uuid, 'a2040000-0000-0000-0000-000000000005'::uuid, 'DENTIST'::text, null::uuid, 'a2010000-0000-0000-0000-000000000005'::uuid),
  ('a2020000-0000-0000-0000-000000000002'::uuid, 'a2040000-0000-0000-0000-000000000006'::uuid, 'RECEPTIONIST'::text, 'a2030000-0000-0000-0000-000000000003'::uuid, 'a2010000-0000-0000-0000-000000000006'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

-- These rows are fixtures for the desired schema. P2-02's migration creates
-- this relation; before it lands, reaching this statement is the intentional
-- RED outcome for this suite.
insert into public.patients (
  id, organization_id, patient_number, first_name, last_name, birth_date,
  preferred_branch_id
)
values
  ('a2050000-0000-0000-0000-000000000001', 'a2020000-0000-0000-0000-000000000001', 'P202-A-0001', 'Ana', 'Santos', date '1990-01-01', 'a2030000-0000-0000-0000-000000000001'),
  ('a2050000-0000-0000-0000-000000000002', 'a2020000-0000-0000-0000-000000000001', 'P202-A-0002', 'Ana', 'Santos', date '1990-01-01', 'a2030000-0000-0000-0000-000000000002'),
  ('a2050000-0000-0000-0000-000000000003', 'a2020000-0000-0000-0000-000000000002', 'P202-B-0001', 'Bea', 'Rivera', date '1991-02-02', 'a2030000-0000-0000-0000-000000000003');

select extensions.ok(to_regclass('public.patients') is not null, 'patients exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.patients'::regclass),
  'patients has RLS enabled'
);
select extensions.is(
  private.normalize_patient_name('  MARÍA—De   León  '),
  'maría de león',
  'normalization applies NFKC/lowercase and collapses punctuation/space runs'
);
select extensions.is(
  (select count(*)::integer from public.patients
   where organization_id = 'a2020000-0000-0000-0000-000000000001'
     and normalized_first_name = private.normalize_patient_name('Ana')
     and normalized_last_name = private.normalize_patient_name('Santos')
     and birth_date = date '1990-01-01'),
  2,
  'name plus birth date is deliberately not unique'
);
select extensions.ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'patients_organization_normalized_name_birth_date_idx'
  ),
  'normalized tenant name/birth-date index exists'
);

select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.patients'::regclass
    and conname = 'patients_organization_id_id_key' and contype = 'u'
), 'patients has a tenant-safe organization/id unique key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.patients'::regclass
    and conname = 'patients_organization_patient_number_key' and contype = 'u'
), 'patients has a tenant-scoped patient-number unique key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.patients'::regclass
    and conname = 'patients_organization_preferred_branch_fk' and contype = 'f'
), 'preferred branch is protected by a composite tenant foreign key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.audit_events'::regclass
    and conname = 'audit_events_organization_patient_fk' and contype = 'f'
), 'audit patient link is protected by a composite tenant foreign key');
select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public' and indexname = 'patients_organization_birth_date_idx'
), 'tenant birth-date index exists');
select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public' and indexname = 'audit_events_organization_patient_occurred_at_idx'
), 'tenant audit patient/time index exists');

select extensions.is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'patients'
     and column_name in (
       'normalized_first_name', 'normalized_middle_name',
       'normalized_last_name', 'normalized_full_name'
     ) and is_generated = 'ALWAYS'),
  4,
  'all four normalized patient columns are stored generated columns'
);
select extensions.ok(exists (
  select 1 from pg_trigger as trigger
  join pg_proc as procedure on procedure.oid = trigger.tgfoid
  join pg_namespace as procedure_schema on procedure_schema.oid = procedure.pronamespace
  where trigger.tgrelid = 'public.patients'::regclass
    and trigger.tgname = 'patients_set_updated_at'
    and not trigger.tgisinternal
    and procedure_schema.nspname = 'private'
    and procedure.proname = 'set_updated_at'
), 'patient timestamps use the shared updated-at trigger');

select extensions.throws_ok(
  $$insert into public.patients (
      organization_id, patient_number, first_name, last_name, birth_date
    ) values (
      'a2020000-0000-0000-0000-000000000001',
      'P202-FUTURE', 'Future', 'Synthetic', current_date + 1
    )$$,
  '22023',
  'invalid patient birth date',
  'future birth dates fail closed without echoing PII'
);
select extensions.throws_ok(
  $$insert into public.patients (
      organization_id, patient_number, first_name, last_name, birth_date,
      preferred_branch_id
    ) values (
      'a2020000-0000-0000-0000-000000000001',
      'P202-CROSS-BRANCH', 'Cross', 'Tenant', date '2000-01-01',
      'a2030000-0000-0000-0000-000000000003'
    )$$,
  '23503',
  null,
  'patient cannot reference another organization preferred branch'
);
select extensions.throws_ok(
  $$insert into public.audit_events (
      organization_id, actor_type, category, action, entity_type, result,
      patient_id
    ) values (
      'a2020000-0000-0000-0000-000000000001', 'SYSTEM', 'PATIENT',
      'patient.tested', 'patient', 'SUCCESS',
      'a2050000-0000-0000-0000-000000000003'
    )$$,
  '23503',
  null,
  'audit event cannot link to another organization patient'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-BLANK', ' ', 'Bound', date '2000-01-01')$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_first_name_bounded_check"',
  'blank patient names fail the named bounded-text invariant'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-LONG', 'Bound', repeat('x', 121), date '2000-01-01')$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_last_name_bounded_check"',
  'overlong patient names fail the named bounded-text invariant'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-OLD', 'Old', 'Bound', date '1899-12-31')$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_birth_date_minimum_check"',
  'birth dates before 1900 fail the named lower-bound invariant'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date, sex_at_registration)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-SEX', 'Sex', 'Bound', date '2000-01-01', 'invalid')$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_sex_at_registration_check"',
  'registration sex is limited to the approved allowlist'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date, version)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-ZERO', 'Version', 'Bound', date '2000-01-01', 0)$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_version_positive_check"',
  'patient version must remain positive'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date, status, archived_at)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-ARCHIVE-A', 'Archive', 'Bound', date '2000-01-01', 'archived', null)$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_archive_state_check"',
  'archived status requires an archive timestamp'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date, status, archived_at)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-ARCHIVE-B', 'Archive', 'Bound', date '2000-01-01', 'active', statement_timestamp())$$,
  '23514',
  'new row for relation "patients" violates check constraint "patients_archive_state_check"',
  'non-archived status cannot carry an archive timestamp'
);
select extensions.throws_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date)
    values ('a2020000-0000-0000-0000-000000000001', 'P202-A-0001', 'Duplicate', 'Number', date '2000-01-01')$$,
  '23505',
  'duplicate key value violates unique constraint "patients_organization_patient_number_key"',
  'patient number cannot be reused within its organization'
);
select extensions.lives_ok(
  $$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date)
    values ('a2020000-0000-0000-0000-000000000002', 'P202-A-0001', 'Reuse', 'Allowed', date '2000-01-01')$$,
  'patient number may be reused by another organization'
);

select extensions.ok(
  not has_table_privilege('PUBLIC', 'public.patients', 'SELECT')
  and not has_table_privilege('anon', 'public.patients', 'SELECT')
  and not has_table_privilege('authenticated', 'public.patients', 'SELECT')
  and not has_table_privilege('service_role', 'public.patients', 'SELECT'),
  'no public, browser, or service role has direct patient SELECT'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.patients', 'INSERT')
  and not has_table_privilege('authenticated', 'public.patients', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.patients', 'DELETE')
  and not has_table_privilege('service_role', 'public.patients', 'INSERT')
  and not has_table_privilege('service_role', 'public.patients', 'UPDATE')
  and not has_table_privilege('service_role', 'public.patients', 'DELETE'),
  'direct patient DML remains ungranted'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  ),
  'only authenticated may execute the private RLS helper'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok($$select * from public.patients$$, '42501', null, 'direct patient SELECT is privilege-denied before the test-only grant');
select extensions.throws_ok($$insert into public.patients (organization_id, patient_number, first_name, last_name, birth_date) values ('a2020000-0000-0000-0000-000000000001', 'P202-DML-I', 'Denied', 'Insert', date '2000-01-01')$$, '42501', null, 'direct patient INSERT is privilege-denied');
select extensions.throws_ok($$update public.patients set status = 'inactive' where id = 'a2050000-0000-0000-0000-000000000001'$$, '42501', null, 'direct patient UPDATE is privilege-denied');
select extensions.throws_ok($$delete from public.patients where id = 'a2050000-0000-0000-0000-000000000001'$$, '42501', null, 'direct patient DELETE is privilege-denied');
reset role;

-- This SELECT grant exists only to make the RLS policy independently testable.
-- rollback removes it, so no committed browser table privilege is introduced.
grant select on public.patients to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000001'), 2, 'Org A organization dentist reads both Org A patients');
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000002'), 0, 'Org A organization dentist cannot read Org B patients');

select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000003', true);
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000001'), 2, 'Org A branch receptionist reads the shared Org A directory');
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000002'), 0, 'Org A branch receptionist cannot read Org B patients');

select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000001', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'Org A owner has no patient directory access');
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000004', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'Org A visiting specialist has no patient directory access');
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000005', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'Org A suspended dentist has no patient directory access');
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000006', true);
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000001'), 0, 'Org B branch receptionist cannot read Org A patients');
select extensions.is((select count(*)::integer from public.patients where organization_id = 'a2020000-0000-0000-0000-000000000002'), 1, 'Org B branch receptionist reads its one Org B patient');
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000099', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'an absent or forged JWT user UUID has no patient directory access');
reset role;

update public.branch_memberships
set access_status = 'revoked', revoked_at = statement_timestamp()
where organization_member_id = 'a2040000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'revoking reception branch membership removes directory access on the next statement');
reset role;

update public.branch_memberships
set access_status = 'active', revoked_at = null
where organization_member_id = 'a2040000-0000-0000-0000-000000000003';
update public.branches
set status = 'archived', archived_at = statement_timestamp()
where id = 'a2030000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2010000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is((select count(*)::integer from public.patients), 0, 'archiving reception branch removes directory access on the next statement');

reset role;

select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from extensions.finish();

rollback;
