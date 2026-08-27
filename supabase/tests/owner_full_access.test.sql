begin;

select extensions.no_plan();

-- Synthetic-only graph for the OWNER full-access contract (ADR-025).
-- Org A owner is an organization-wide OWNER with no explicit branch
-- membership; that must be enough for full clinical and administrative access
-- across every Org A branch, while Org B remains fully isolated. Admin,
-- dentist, receptionist, and assistant fixtures pin the unchanged scopes.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('c0010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('c0010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('c0010000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-a@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('c0010000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reception-a@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('c0010000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant-a@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('c0010000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@p025.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('c0020000-0000-0000-0000-000000000001', 'P025 Synthetic A Inc.', 'P025 Synthetic A', 'p025-a'),
  ('c0020000-0000-0000-0000-000000000002', 'P025 Synthetic B Inc.', 'P025 Synthetic B', 'p025-b');

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('c0030000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'A Main', 'p025-a-main', 'P025-A1', '1 Test St', 'Test', 'Test'),
  ('c0030000-0000-0000-0000-000000000002', 'c0020000-0000-0000-0000-000000000001', 'A Second', 'p025-a-second', 'P025-A2', '2 Test St', 'Test', 'Test'),
  ('c0030000-0000-0000-0000-000000000003', 'c0020000-0000-0000-0000-000000000002', 'B Main', 'p025-b-main', 'P025-B1', '3 Test St', 'Test', 'Test');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('c0040000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'c0010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('c0040000-0000-0000-0000-000000000002', 'c0020000-0000-0000-0000-000000000001', 'c0010000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('c0040000-0000-0000-0000-000000000003', 'c0020000-0000-0000-0000-000000000001', 'c0010000-0000-0000-0000-000000000003', 'active', statement_timestamp()),
  ('c0040000-0000-0000-0000-000000000004', 'c0020000-0000-0000-0000-000000000001', 'c0010000-0000-0000-0000-000000000004', 'active', statement_timestamp()),
  ('c0040000-0000-0000-0000-000000000005', 'c0020000-0000-0000-0000-000000000001', 'c0010000-0000-0000-0000-000000000005', 'active', statement_timestamp()),
  ('c0040000-0000-0000-0000-000000000006', 'c0020000-0000-0000-0000-000000000002', 'c0010000-0000-0000-0000-000000000006', 'active', statement_timestamp());

insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('c0020000-0000-0000-0000-000000000001', 'c0030000-0000-0000-0000-000000000001', 'c0040000-0000-0000-0000-000000000003', 'active'),
  ('c0020000-0000-0000-0000-000000000001', 'c0030000-0000-0000-0000-000000000002', 'c0040000-0000-0000-0000-000000000004', 'active'),
  ('c0020000-0000-0000-0000-000000000001', 'c0030000-0000-0000-0000-000000000001', 'c0040000-0000-0000-0000-000000000005', 'active');

insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('c0020000-0000-0000-0000-000000000001'::uuid, 'c0040000-0000-0000-0000-000000000001'::uuid, null::uuid, 'c0010000-0000-0000-0000-000000000001'::uuid, 'OWNER'::text),
  ('c0020000-0000-0000-0000-000000000001'::uuid, 'c0040000-0000-0000-0000-000000000002'::uuid, null::uuid, 'c0010000-0000-0000-0000-000000000001'::uuid, 'ADMIN'::text),
  ('c0020000-0000-0000-0000-000000000001'::uuid, 'c0040000-0000-0000-0000-000000000003'::uuid, 'c0030000-0000-0000-0000-000000000001'::uuid, 'c0010000-0000-0000-0000-000000000001'::uuid, 'DENTIST'::text),
  ('c0020000-0000-0000-0000-000000000001'::uuid, 'c0040000-0000-0000-0000-000000000004'::uuid, 'c0030000-0000-0000-0000-000000000002'::uuid, 'c0010000-0000-0000-0000-000000000001'::uuid, 'RECEPTIONIST'::text),
  ('c0020000-0000-0000-0000-000000000001'::uuid, 'c0040000-0000-0000-0000-000000000005'::uuid, 'c0030000-0000-0000-0000-000000000001'::uuid, 'c0010000-0000-0000-0000-000000000001'::uuid, 'DENTAL_ASSISTANT'::text),
  ('c0020000-0000-0000-0000-000000000002'::uuid, 'c0040000-0000-0000-0000-000000000006'::uuid, null::uuid, 'c0010000-0000-0000-0000-000000000006'::uuid, 'OWNER'::text)
) as assignment(organization_id, member_id, branch_id, user_id, role_code)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('c0050000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'P025-A-1', 'Synthetic', 'One', date '1980-01-01', 'c0030000-0000-0000-0000-000000000001'),
  ('c0050000-0000-0000-0000-000000000002', 'c0020000-0000-0000-0000-000000000001', 'P025-A-2', 'Synthetic', 'Two', date '1980-01-01', 'c0030000-0000-0000-0000-000000000002'),
  ('c0050000-0000-0000-0000-000000000003', 'c0020000-0000-0000-0000-000000000002', 'P025-B-1', 'Synthetic', 'Foreign', date '1980-01-01', 'c0030000-0000-0000-0000-000000000003');

-- The centralized contract: OWNER carries every permission in the catalog, so
-- current and future organization-scoped modules resolve for the owner without
-- a per-module rule.
select extensions.ok(
  not exists (
    select 1
    from public.permissions as permission
    where not exists (
      select 1
      from public.role_permissions as role_permission
      join public.roles as role on role.id = role_permission.role_id
      where role.organization_id is null
        and role.is_system
        and role.code = 'OWNER'
        and role_permission.permission_id = permission.id
    )
  ),
  'every permission in the catalog is granted to the system OWNER role'
);

select extensions.ok(
  private.user_has_permission('c0010000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'patient.demographics.read')
  and private.user_has_permission('c0010000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'patient.demographics.write')
  and private.user_has_permission('c0010000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'patient.clinical.read')
  and private.user_has_permission('c0010000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000001', 'patient.clinical.write'),
  'the owner resolves the full clinical and demographic permission set without a dentist role'
);

select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000001', true);

select extensions.ok(
  private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000001', 'patient.demographics.read')
  and private.has_patient_permission_at_branch('c0030000-0000-0000-0000-000000000001', 'patient.demographics.read')
  and private.has_patient_permission_at_branch('c0030000-0000-0000-0000-000000000001', 'patient.demographics.write')
  and private.has_patient_permission_at_branch('c0030000-0000-0000-0000-000000000002', 'patient.demographics.read')
  and private.has_patient_permission_at_branch('c0030000-0000-0000-0000-000000000002', 'patient.demographics.write'),
  'organization-wide owner authority works at every active branch without explicit branch membership'
);

-- Cross-tenant isolation for the owner's full access.
select extensions.ok(
  not private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000002', 'patient.demographics.read')
  and not private.has_patient_permission_at_branch('c0030000-0000-0000-0000-000000000003', 'patient.demographics.read')
  and not private.user_has_permission('c0010000-0000-0000-0000-000000000001', 'c0020000-0000-0000-0000-000000000002', 'patient.demographics.read'),
  'full owner authority never crosses into another organization'
);

-- Other roles keep their scopes under live authenticated sessions.
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000002', true);
select extensions.ok(
  not private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000001', 'patient.demographics.read'),
  'ADMIN is unchanged and still lacks patient demographics'
);
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000005', true);
select extensions.ok(
  not private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000001', 'patient.demographics.read'),
  'DENTAL_ASSISTANT is unchanged and still lacks patient demographics'
);
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000003', true);
select extensions.ok(
  private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000001', 'patient.demographics.read'),
  'DENTIST retains its demographics scope'
);
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000004', true);
select extensions.ok(
  private.has_shared_patient_permission('c0020000-0000-0000-0000-000000000001', 'patient.demographics.read'),
  'RECEPTIONIST retains its demographics scope'
);
reset role;

-- RLS-level directory access and cross-tenant denial under the authenticated
-- owner session.
grant select on public.patients to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000001', true);
select extensions.is((select count(*)::integer from public.patients where organization_id = 'c0020000-0000-0000-0000-000000000001'), 2, 'the owner reads every Org A patient row');
select extensions.is((select count(*)::integer from public.patients where organization_id = 'c0020000-0000-0000-0000-000000000002'), 0, 'the owner reads zero Org B patient rows');

select extensions.ok(
  public.search_patients('c0030000-0000-0000-0000-000000000001', 'synthetic', null, null, 'name_asc', 1, 25)
    @> '{"total":2,"page":1,"pageSize":25}'::jsonb,
  'the owner searches the shared directory at one Org A branch'
);
select extensions.ok(
  public.search_patients('c0030000-0000-0000-0000-000000000002', 'synthetic', null, null, 'name_asc', 1, 25)
    @> '{"total":2,"page":1,"pageSize":25}'::jsonb,
  'the owner searches the shared directory at every Org A branch without branch membership'
);
select extensions.throws_ok(
  $$select public.search_patients('c0030000-0000-0000-0000-000000000003', 'synthetic', null, null, 'name_asc', 1, 25)$$,
  '42501', 'not authorized', 'the owner cannot search a foreign organization directory'
);
select extensions.ok(
  public.get_patient_detail('c0030000-0000-0000-0000-000000000001', 'c0050000-0000-0000-0000-000000000001') @> '{"patientNumber":"P025-A-1"}'::jsonb,
  'the owner opens a patient detail at a valid acting branch'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.audit_events where organization_id = 'c0020000-0000-0000-0000-000000000001' and patient_id = 'c0050000-0000-0000-0000-000000000001' and action = 'patient.viewed'),
  1,
  'a privileged owner clinical read still records an audit event'
);

-- No owner bypass: direct base-table DML stays privilege-denied, audit history
-- stays append-only, and AAL2 remains mandatory for sensitive assignments.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values ('c0050000-0000-0000-0000-000000000099', 'c0020000-0000-0000-0000-000000000001', 'P025-A-9', 'Forge', 'Direct', date '1980-01-01')$$,
  '42501', null, 'full access does not grant direct base-table patient DML'
);
select extensions.throws_ok(
  $$update public.audit_events set metadata = '{}'::jsonb where organization_id = 'c0020000-0000-0000-0000-000000000001'$$,
  '42501', null, 'the owner cannot rewrite audit history by direct update'
);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.set_member_role('c0040000-0000-0000-0000-000000000003', (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'), 'c0030000-0000-0000-0000-000000000001', true)$$,
  '42501', 'AAL2 required', 'a sensitive role assignment still requires AAL2 even for the owner'
);
reset role;

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;