begin;

select extensions.no_plan();

-- Synthetic identities and tenant graph for P1-11 only. Every change rolls
-- back at the end of this test file.
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
  ('11000000-0000-0000-0000-000000000001'::uuid, 'owner-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000002'::uuid, 'admin-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000003'::uuid, 'reception-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000004'::uuid, 'branch-admin-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000005'::uuid, 'target-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000006'::uuid, 'suspended-a@p111.example.test'),
  ('11000000-0000-0000-0000-000000000007'::uuid, 'owner-b@p111.example.test'),
  ('11000000-0000-0000-0000-000000000008'::uuid, 'target-b@p111.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (
  id,
  legal_name,
  business_name,
  slug
)
values
  (
    '21000000-0000-0000-0000-000000000001',
    'P111 Synthetic Dental A Inc.',
    'P111 Synthetic Dental A',
    'p111-synthetic-a'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    'P111 Synthetic Dental B Inc.',
    'P111 Synthetic Dental B',
    'p111-synthetic-b'
  );

insert into public.branches (
  id,
  organization_id,
  name,
  slug,
  code,
  status,
  address_line1,
  city,
  province,
  archived_at
)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'P111 A Main',
    'main',
    'P111-A1',
    'active',
    '1 Synthetic Street',
    'Test City',
    'Test Province',
    null
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    'P111 A Second',
    'second',
    'P111-A2',
    'active',
    '2 Synthetic Street',
    'Test City',
    'Test Province',
    null
  ),
  (
    '31000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000001',
    'P111 A Archived',
    'archived',
    'P111-AA',
    'archived',
    '3 Synthetic Street',
    'Test City',
    'Test Province',
    statement_timestamp()
  ),
  (
    '31000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000002',
    'P111 B Main',
    'main',
    'P111-B1',
    'active',
    '4 Synthetic Street',
    'Test City',
    'Test Province',
    null
  );

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  membership_status,
  joined_at,
  suspended_at
)
values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000004', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000005', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000005', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000006', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000006', 'suspended', statement_timestamp(), statement_timestamp()),
  ('41000000-0000-0000-0000-000000000007', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000007', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000008', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000008', 'active', statement_timestamp(), null);

insert into public.profiles (
  user_id,
  display_name,
  first_name,
  last_name
)
select
  id,
  'P111 ' || row_number() over (order by id),
  'P111',
  'Synthetic'
from auth.users
where id::text like '11000000-0000-0000-0000-00000000000%';

insert into public.branch_memberships (
  organization_id,
  branch_id,
  organization_member_id
)
values
  ('21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003'),
  ('21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000004'),
  ('21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000006');

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  branch_id,
  assigned_by
)
select
  assignment.organization_id,
  assignment.organization_member_id,
  role.id,
  assignment.branch_id,
  assignment.assigned_by
from (values
  ('21000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, 'OWNER', null::uuid, '11000000-0000-0000-0000-000000000001'::uuid),
  ('21000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000002'::uuid, 'ADMIN', null::uuid, '11000000-0000-0000-0000-000000000001'::uuid),
  ('21000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000003'::uuid, 'RECEPTIONIST', '31000000-0000-0000-0000-000000000001'::uuid, '11000000-0000-0000-0000-000000000001'::uuid),
  ('21000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000004'::uuid, 'ADMIN', '31000000-0000-0000-0000-000000000001'::uuid, '11000000-0000-0000-0000-000000000001'::uuid),
  ('21000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000006'::uuid, 'OWNER', null::uuid, '11000000-0000-0000-0000-000000000001'::uuid),
  ('21000000-0000-0000-0000-000000000002'::uuid, '41000000-0000-0000-0000-000000000007'::uuid, 'OWNER', null::uuid, '11000000-0000-0000-0000-000000000007'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, assigned_by)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

insert into public.roles (
  id,
  organization_id,
  code,
  name,
  is_system
)
values
  ('51000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'P111_CUSTOM_A', 'P111 Custom A', false),
  ('51000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'P111_CUSTOM_B', 'P111 Custom B', false);

insert into public.role_permissions (role_id, permission_id)
select custom_role.id, permission.id
from public.roles as custom_role
join public.permissions as permission
  on permission.code = 'branch.read'
where custom_role.id in (
  '51000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000002'
);

insert into public.audit_events (
  id,
  organization_id,
  branch_id,
  actor_user_id,
  actor_type,
  category,
  action,
  entity_type,
  result
)
values
  ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', null, '11000000-0000-0000-0000-000000000001', 'USER', 'SECURITY', 'p111.org_a', 'organization', 'SUCCESS'),
  ('61000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'USER', 'SECURITY', 'p111.branch_a1', 'branch', 'SUCCESS'),
  ('61000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'USER', 'SECURITY', 'p111.branch_a2', 'branch', 'SUCCESS'),
  ('61000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000007', 'USER', 'SECURITY', 'p111.branch_b1', 'branch', 'SUCCESS');

-- Structural security checks.
select extensions.set_eq(
  $$
    select relname::text
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and relname in (
        'organizations',
        'branches',
        'profiles',
        'organization_members',
        'roles',
        'permissions',
        'role_permissions',
        'branch_memberships',
        'member_roles',
        'audit_events'
      )
      and relrowsecurity
  $$,
  array[
    'organizations',
    'branches',
    'profiles',
    'organization_members',
    'roles',
    'permissions',
    'role_permissions',
    'branch_memberships',
    'member_roles',
    'audit_events'
  ]::text[],
  'RLS is enabled on every exposed foundation application table'
);

select extensions.is(
  (
    select count(*)::integer
    from (values
      ('organizations'),
      ('branches'),
      ('profiles'),
      ('organization_members'),
      ('roles'),
      ('permissions'),
      ('role_permissions'),
      ('branch_memberships'),
      ('member_roles'),
      ('audit_events')
    ) as application_table(table_name)
    where has_table_privilege(
      'anon',
      'public.' || application_table.table_name,
      'SELECT'
    )
       or has_table_privilege(
         'anon',
         'public.' || application_table.table_name,
         'INSERT'
       )
       or has_table_privilege(
         'anon',
         'public.' || application_table.table_name,
         'UPDATE'
       )
       or has_table_privilege(
         'anon',
         'public.' || application_table.table_name,
         'DELETE'
       )
  ),
  0,
  'anon has no direct privileges on foundation application tables'
);

select extensions.ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated cannot use the private schema as a Data API surface'
);

select extensions.ok(
  (
    select bool_and(prosecdef)
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'private'
      and pg_proc.proname in (
        'is_active_org_member',
        'has_org_permission',
        'has_branch_access',
        'has_branch_permission',
        'is_own_organization_member'
      )
  ),
  'every P1-11 RLS helper is SECURITY DEFINER'
);

select extensions.ok(
  (
    select bool_and(
      coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    )
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'private'
      and pg_proc.proname in (
        'is_active_org_member',
        'has_org_permission',
        'has_branch_access',
        'has_branch_permission',
        'is_own_organization_member'
      )
  ),
  'every P1-11 RLS helper has an empty search_path'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'private.has_org_permission(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.has_org_permission(uuid,text)',
    'EXECUTE'
  ),
  'only authenticated Data API requests can execute the stored RLS helper expression'
);

select extensions.ok(
  has_column_privilege('authenticated', 'public.organizations', 'business_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.organizations', 'id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.branches', 'organization_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.member_roles', 'organization_id', 'UPDATE'),
  'column grants prevent tenant-key and assignment rewrites'
);

-- Org A owner: organization-wide permission and strict tenant isolation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.is(
  (select count(*)::integer from public.organizations),
  1,
  'Org A owner sees exactly one organization'
);

select extensions.is(
  (select count(*)::integer from public.organizations where id = '21000000-0000-0000-0000-000000000002'),
  0,
  'Org A owner cannot read Org B'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  3,
  'organization-wide branch manager sees active and archived branches only in Org A'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  6,
  'Org A owner can manage only Org A membership rows'
);

select extensions.is(
  (select count(*)::integer from public.profiles),
  6,
  'Org A owner can read profiles only for current Org A members'
);

select extensions.is(
  (select count(*)::integer from public.roles where id = '51000000-0000-0000-0000-000000000002'),
  0,
  'Org A owner cannot read an Org B custom role'
);

select extensions.is(
  (select count(*)::integer from public.role_permissions where role_id = '51000000-0000-0000-0000-000000000002'),
  0,
  'Org A owner cannot read Org B custom role grants'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  3,
  'Org A audit reader cannot read Org B audit events'
);

select extensions.results_eq(
  $$
    update public.organizations
    set business_name = 'P111 Synthetic Dental A Updated'
    where id = '21000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  array[1]::integer[],
  'Org A owner can update an allowed Org A setting'
);

select extensions.results_eq(
  $$
    update public.organizations
    set business_name = 'Forged Org B Update'
    where id = '21000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  array[]::integer[],
  'Org A owner cannot update Org B'
);

select extensions.lives_ok(
  $$
    insert into public.branches (
      organization_id,
      name,
      slug,
      code,
      address_line1,
      city,
      province
    ) values (
      '21000000-0000-0000-0000-000000000001',
      'P111 A New',
      'new',
      'P111-AN',
      '5 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'Org A owner can add a dynamic branch inside Org A'
);

select extensions.throws_ok(
  $$
    insert into public.branches (
      organization_id,
      name,
      slug,
      code,
      address_line1,
      city,
      province
    ) values (
      '21000000-0000-0000-0000-000000000002',
      'Forged Org B Branch',
      'forged',
      'P111-BF',
      '6 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "branches"',
  'Org A owner cannot forge organization_id while inserting a branch'
);

select extensions.lives_ok(
  $$
    insert into public.roles (
      organization_id,
      code,
      name
    ) values (
      '21000000-0000-0000-0000-000000000001',
      'P111_OWNER_CREATED',
      'P111 Owner Created'
    )
  $$,
  'Org A owner can create a custom role only in Org A'
);

select extensions.throws_ok(
  $$
    insert into public.roles (
      organization_id,
      code,
      name
    ) values (
      '21000000-0000-0000-0000-000000000002',
      'P111_FORGED_B',
      'P111 Forged B'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "roles"',
  'Org A owner cannot create a custom role in Org B'
);

select extensions.lives_ok(
  $$
    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      assigned_by
    )
    select
      '21000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000005',
      role.id,
      '11000000-0000-0000-0000-000000000001'
    from public.roles as role
    where role.organization_id is null
      and role.code = 'RECEPTIONIST'
  $$,
  'role manager can assign a role to another Org A member'
);

select extensions.throws_ok(
  $$
    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      assigned_by
    )
    select
      '21000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000001',
      role.id,
      '11000000-0000-0000-0000-000000000001'
    from public.roles as role
    where role.organization_id is null
      and role.code = 'ADMIN'
  $$,
  '42501',
  'new row violates row-level security policy for table "member_roles"',
  'a role manager cannot assign a role to themselves'
);

select extensions.throws_ok(
  $$
    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      assigned_by
    )
    select
      '21000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000005',
      role.id,
      '11000000-0000-0000-0000-000000000002'
    from public.roles as role
    where role.organization_id is null
      and role.code = 'DENTIST'
  $$,
  '42501',
  'new row violates row-level security policy for table "member_roles"',
  'a role manager cannot forge assigned_by'
);

select extensions.lives_ok(
  $$
    insert into public.branch_memberships (
      organization_id,
      branch_id,
      organization_member_id
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000005'
    )
  $$,
  'user manager can grant another Org A member branch access'
);

select extensions.throws_ok(
  $$
    insert into public.branch_memberships (
      organization_id,
      branch_id,
      organization_member_id
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "branch_memberships"',
  'a user manager cannot grant themselves branch access'
);

-- Org A receptionist: exact-branch visibility and no management authority.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);

select extensions.is(
  (select count(*)::integer from public.organizations),
  1,
  'branch-scoped receptionist can read their active organization'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  1,
  'branch-scoped receptionist sees only the assigned active branch'
);

select extensions.is(
  (select count(*)::integer from public.branches where id = '31000000-0000-0000-0000-000000000002'),
  0,
  'branch-scoped receptionist cannot forge access to another Org A branch'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  1,
  'receptionist sees only their own organization membership'
);

select extensions.is(
  (select count(*)::integer from public.profiles),
  1,
  'receptionist sees only their own profile'
);

select extensions.is(
  (select count(*)::integer from public.branch_memberships),
  1,
  'receptionist sees only their own branch access row'
);

select extensions.is(
  (select count(*)::integer from public.member_roles),
  1,
  'receptionist sees only their own role assignment'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  0,
  'receptionist cannot read audit events'
);

select extensions.results_eq(
  $$
    update public.branches
    set name = 'Unauthorized Reception Update'
    where id = '31000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  array[]::integer[],
  'receptionist cannot update their assigned branch without branch.manage'
);

select extensions.results_eq(
  $$
    update public.profiles
    set display_name = 'P111 Reception Updated'
    where user_id = '11000000-0000-0000-0000-000000000003'
    returning 1
  $$,
  array[1]::integer[],
  'a user can update allowed columns on their own profile'
);

select extensions.results_eq(
  $$
    update public.profiles
    set display_name = 'Forged Owner Profile Update'
    where user_id = '11000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  array[]::integer[],
  'a user cannot update another profile'
);

select extensions.throws_ok(
  $$
    insert into public.audit_events (
      organization_id,
      actor_type,
      category,
      action,
      entity_type,
      result
    ) values (
      '21000000-0000-0000-0000-000000000001',
      'USER',
      'SECURITY',
      'p111.forged',
      'organization',
      'SUCCESS'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'normal authenticated users cannot forge audit history'
);

-- Branch-scoped ADMIN: exact-branch permission, never tenant-wide promotion.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);

select extensions.is(
  (select count(*)::integer from public.branches),
  1,
  'branch-scoped admin sees only the assigned branch'
);

select extensions.results_eq(
  $$
    update public.branches
    set name = 'P111 Branch Admin Updated'
    where id = '31000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  array[1]::integer[],
  'branch-scoped admin can manage the exact authorized branch'
);

select extensions.results_eq(
  $$
    update public.branches
    set name = 'Forged A2 Update'
    where id = '31000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  array[]::integer[],
  'branch-scoped admin cannot manage an unrelated branch'
);

select extensions.throws_ok(
  $$
    insert into public.branches (
      organization_id,
      name,
      slug,
      code,
      address_line1,
      city,
      province
    ) values (
      '21000000-0000-0000-0000-000000000001',
      'Branch Admin Forged New',
      'branch-admin-forged',
      'P111-BAF',
      '7 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "branches"',
  'branch-scoped branch.manage is not promoted to organization-wide branch creation'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  1,
  'branch-scoped audit.read exposes only the exact authorized branch audit subset'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  1,
  'branch-scoped user.manage is not promoted to tenant-wide membership reads'
);

-- Org A ADMIN: management is bounded by the permission catalog.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);

select extensions.results_eq(
  $$
    update public.organizations
    set business_name = 'Unauthorized Admin Org Update'
    where id = '21000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  array[]::integer[],
  'ADMIN lacks organization.manage and cannot update organization settings'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  6,
  'organization-wide ADMIN can read Org A members through user.manage'
);

select extensions.is(
  (select count(*)::integer from public.member_roles),
  1,
  'ADMIN without role.manage cannot enumerate other members role assignments'
);

select extensions.throws_ok(
  $$
    insert into public.member_roles (
      organization_id,
      organization_member_id,
      role_id,
      assigned_by
    )
    select
      '21000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000005',
      role.id,
      '11000000-0000-0000-0000-000000000002'
    from public.roles as role
    where role.organization_id is null
      and role.code = 'DENTIST'
  $$,
  '42501',
  'new row violates row-level security policy for table "member_roles"',
  'ADMIN without role.manage cannot assign roles'
);

select extensions.throws_ok(
  $$
    insert into public.branch_memberships (
      organization_id,
      branch_id,
      organization_member_id
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "branch_memberships"',
  'ADMIN with user.manage cannot grant themselves branch access'
);

-- Suspended users fail closed across tenant, branch, role, and audit data.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000006', true);

select extensions.is(
  (select count(*)::integer from public.organizations),
  0,
  'suspended member cannot read their organization'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  0,
  'suspended member cannot read branches despite an active branch row and OWNER assignment'
);

select extensions.is(
  (select count(*)::integer from public.roles),
  0,
  'suspended member cannot read the role catalog'
);

select extensions.is(
  (select count(*)::integer from public.permissions),
  0,
  'suspended member cannot read the permission catalog'
);

select extensions.is(
  (select count(*)::integer from public.branch_memberships),
  0,
  'suspended member cannot read branch assignments'
);

select extensions.is(
  (select count(*)::integer from public.member_roles),
  0,
  'suspended member cannot read role assignments'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  0,
  'suspended member cannot read audit history'
);

select extensions.is(
  (select membership_status from public.organization_members where user_id = '11000000-0000-0000-0000-000000000006'),
  'suspended',
  'suspended member can read only their own membership state for fail-closed UI handling'
);

-- Org B owner sees only Org B, proving isolation in the reverse direction.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000007', true);

select extensions.is(
  (select count(*)::integer from public.organizations where id = '21000000-0000-0000-0000-000000000001'),
  0,
  'Org B owner cannot read Org A'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  1,
  'Org B owner sees only the Org B branch'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  1,
  'Org B owner sees only Org B audit events'
);

reset role;

select * from extensions.finish();

rollback;
