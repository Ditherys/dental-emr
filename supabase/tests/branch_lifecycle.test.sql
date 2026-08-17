-- H-5 — branch update/archive RPC authorization and business-rule tests.
--
-- Covers public.update_branch and public.archive_branch
-- (supabase/migrations/20260818010000_branch_update_and_archive.sql):
--   A. an authorized org-wide actor can update a branch, and the row/audit
--      event reflect it
--   B. cross-organization denial (not found/not authorized share one message)
--   C. denial without branch.manage
--   D. AAL2 is required
--   E. archiving sets status/archived_at and records an audit event
--   F. an archived branch cannot be updated
--   G. an already-archived branch cannot be archived again
--   H. the organization's only remaining branch cannot be archived
--
-- Synthetic data only. Everything rolls back.

begin;

select extensions.no_plan();

/* -------------------------------------------------------------------------- */
/* Synthetic tenant graph                                                      */
/* -------------------------------------------------------------------------- */

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  user_id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  email,
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('91000000-0000-0000-0000-000000000001'::uuid, 'owner-a@p1h5.example.test'),
  ('91000000-0000-0000-0000-000000000002'::uuid, 'dentist-a@p1h5.example.test'),
  ('91000000-0000-0000-0000-000000000003'::uuid, 'owner-b@p1h5.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  (
    '92000000-0000-0000-0000-000000000001',
    'P1H5 Synthetic Dental A Inc.',
    'P1H5 Synthetic Dental A',
    'p1h5-synthetic-a'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    'P1H5 Synthetic Dental B Inc.',
    'P1H5 Synthetic Dental B',
    'p1h5-synthetic-b'
  );

insert into public.branches (
  id,
  organization_id,
  name,
  slug,
  code,
  address_line1,
  city,
  province
)
values
  (
    '93000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'P1H5 A Main',
    'p1h5-a-main',
    'P1H5-A1',
    '1 Synthetic Street',
    'Test City',
    'Test Province'
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    'P1H5 A Second',
    'p1h5-a-second',
    'P1H5-A2',
    '2 Synthetic Street',
    'Test City',
    'Test Province'
  ),
  (
    '93000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000002',
    'P1H5 B Main',
    'p1h5-b-main',
    'P1H5-B1',
    '3 Synthetic Street',
    'Test City',
    'Test Province'
  );

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  membership_status,
  joined_at
)
values
  (
    '94000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'active',
    statement_timestamp()
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000002',
    'active',
    statement_timestamp()
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000003',
    'active',
    statement_timestamp()
  );

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  branch_id
)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    (select id from public.roles where organization_id is null and code = 'OWNER'),
    null
  ),
  (
    '92000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000002',
    (select id from public.roles where organization_id is null and code = 'DENTIST'),
    null
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '94000000-0000-0000-0000-000000000003',
    (select id from public.roles where organization_id is null and code = 'OWNER'),
    null
  );

/* -------------------------------------------------------------------------- */
/* A. An authorized org-wide actor updates a branch                           */
/* -------------------------------------------------------------------------- */

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.update_branch(
      '93000000-0000-0000-0000-000000000001',
      'P1H5 A Main Renamed',
      '1 Renamed Street',
      'Renamed City',
      'Test Province',
      '+63 2 8555 0100',
      'a-main@p1h5.example.test'
    )
  $$,
  'A0 an authorized org-wide OWNER can update a branch'
);

reset role;

select extensions.is(
  (select name from public.branches where id = '93000000-0000-0000-0000-000000000001'),
  'P1H5 A Main Renamed',
  'A1 the branch row reflects the update'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where entity_id = '93000000-0000-0000-0000-000000000001'
      and action = 'branch.updated'
  ),
  1,
  'A2 exactly one branch.updated audit event was recorded'
);

/* -------------------------------------------------------------------------- */
/* B. Cross-organization denial                                               */
/* -------------------------------------------------------------------------- */

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.update_branch(
      '93000000-0000-0000-0000-000000000001',
      'Hostile Rename',
      '1 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'not authorized to update branch',
  'B0 org B''s owner cannot update org A''s branch -- not found and not authorized share one message'
);

select extensions.throws_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000001')$$,
  '42501',
  'not authorized to archive branch',
  'B1 org B''s owner cannot archive org A''s branch'
);

reset role;

select extensions.is(
  (select name from public.branches where id = '93000000-0000-0000-0000-000000000001'),
  'P1H5 A Main Renamed',
  'B2 the refused cross-organization update wrote nothing'
);

/* -------------------------------------------------------------------------- */
/* C. Denial without branch.manage                                            */
/* -------------------------------------------------------------------------- */

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.update_branch(
      '93000000-0000-0000-0000-000000000001',
      'Dentist Rename',
      '1 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'not authorized to update branch',
  'C0 a DENTIST (no branch.manage) cannot update a branch in their own organization'
);

select extensions.throws_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000002')$$,
  '42501',
  'not authorized to archive branch',
  'C1 a DENTIST (no branch.manage) cannot archive a branch in their own organization'
);

/* -------------------------------------------------------------------------- */
/* D. AAL2 is required                                                        */
/* -------------------------------------------------------------------------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$
    select public.update_branch(
      '93000000-0000-0000-0000-000000000001',
      'AAL1 Rename',
      '1 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'AAL2 required',
  'D0 an AAL1 session cannot update a branch, even for an otherwise-authorized owner'
);

select extensions.throws_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000002')$$,
  '42501',
  'AAL2 required',
  'D1 an AAL1 session cannot archive a branch, even for an otherwise-authorized owner'
);

/* -------------------------------------------------------------------------- */
/* E. Archiving sets status/archived_at and records an audit event            */
/* -------------------------------------------------------------------------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000002')$$,
  'E0 an authorized org-wide OWNER can archive a branch, leaving one branch active'
);

reset role;

select extensions.is(
  (select status from public.branches where id = '93000000-0000-0000-0000-000000000002'),
  'archived',
  'E1 the archived branch''s status is archived'
);

select extensions.ok(
  (select archived_at from public.branches where id = '93000000-0000-0000-0000-000000000002') is not null,
  'E2 archived_at is set'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where entity_id = '93000000-0000-0000-0000-000000000002'
      and action = 'branch.archived'
  ),
  1,
  'E3 exactly one branch.archived audit event was recorded'
);

/* -------------------------------------------------------------------------- */
/* F. An archived branch cannot be updated                                    */
/* -------------------------------------------------------------------------- */

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.update_branch(
      '93000000-0000-0000-0000-000000000002',
      'Archived Rename',
      '2 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '22023',
  'cannot update an archived branch',
  'F0 an archived branch cannot be updated'
);

/* -------------------------------------------------------------------------- */
/* G. An already-archived branch cannot be archived again                     */
/* -------------------------------------------------------------------------- */

select extensions.throws_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000002')$$,
  '22023',
  'branch is already archived',
  'G0 an already-archived branch cannot be archived again'
);

/* -------------------------------------------------------------------------- */
/* H. The organization's only remaining branch cannot be archived             */
/* -------------------------------------------------------------------------- */

select extensions.throws_ok(
  $$select public.archive_branch('93000000-0000-0000-0000-000000000001')$$,
  '22023',
  'cannot archive the organization''s only remaining branch',
  'H0 the organization''s only remaining non-archived branch cannot be archived'
);

reset role;

select extensions.is(
  (select status from public.branches where id = '93000000-0000-0000-0000-000000000001'),
  'active',
  'H1 the refused archive attempt left the last branch active'
);

reset role;

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else string_agg(finish, E'\n')
end as p1_test_result
from test_failures;

rollback;
