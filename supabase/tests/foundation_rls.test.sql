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
  ('11000000-0000-0000-0000-000000000008'::uuid, 'target-b@p111.example.test'),
  ('11000000-0000-0000-0000-000000000009'::uuid, 'role-manager-a@p111.example.test')
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
  ('41000000-0000-0000-0000-000000000008', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000008', 'active', statement_timestamp(), null),
  ('41000000-0000-0000-0000-000000000009', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000009', 'active', statement_timestamp(), null);

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
  ('51000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'P111_CUSTOM_B', 'P111 Custom B', false),
  ('51000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', 'P111_PERMISSIONLESS', 'P111 Permissionless', false),
  ('51000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', 'P111_ROLE_MANAGER', 'P111 Role Manager', false);

insert into public.role_permissions (role_id, permission_id)
select custom_role.id, permission.id
from public.roles as custom_role
join public.permissions as permission
  on permission.code = 'branch.read'
where custom_role.id in (
  '51000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000002'
);

insert into public.role_permissions (role_id, permission_id)
select '51000000-0000-0000-0000-000000000004', permission.id
from public.permissions as permission
where permission.code = 'role.manage';

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  assigned_by
)
values
  (
    '21000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000005',
    '51000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000001'
  ),
  (
    '21000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000009',
    '51000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000001'
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
  not has_column_privilege('authenticated', 'public.organizations', 'business_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.branches', 'name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.branches', 'organization_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.organization_members', 'membership_status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.role_permissions', 'role_id', 'INSERT')
  and not has_table_privilege('authenticated', 'public.member_roles', 'DELETE')
  and not has_table_privilege('authenticated', 'public.branch_memberships', 'DELETE')
  and not has_column_privilege('authenticated', 'public.branches', 'organization_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.member_roles', 'organization_id', 'UPDATE'),
  'authenticated has no direct administrative table-write privilege'
);

select extensions.ok(
  (
    select bool_and(prosecdef)
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname in (
        'create_branch',
        'set_role_permission',
        'set_member_role',
        'set_branch_membership',
        'update_organization_member_status'
      )
  ),
  'every authenticated administrative RPC is SECURITY DEFINER'
);

select extensions.ok(
  (
    select bool_and(
      coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    )
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname in (
        'create_branch',
        'set_role_permission',
        'set_member_role',
        'set_branch_membership',
        'update_organization_member_status'
      )
  ),
  'every authenticated administrative RPC has an empty search_path'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.set_role_permission(uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_role_permission(uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.set_role_permission(uuid,text,boolean)', 'EXECUTE'),
  'administrative RPC execution is granted only to authenticated user context'
);

-- Org A owner: organization-wide permission and strict tenant isolation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

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
  7,
  'Org A owner can manage only Org A membership rows'
);

select extensions.is(
  (select count(*)::integer from public.profiles),
  7,
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

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);

select extensions.is(
  (select count(*)::integer from public.branches),
  0,
  'a permissionless organization-wide custom role grants access to zero branches'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

select extensions.throws_ok(
  $$
    update public.organizations
    set business_name = 'P111 Synthetic Dental A Updated'
    where id = '21000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table organizations',
  'even an owner cannot bypass the audited boundary with a direct organization update'
);

select extensions.throws_ok(
  $$
    update public.organizations
    set business_name = 'Forged Org B Update'
    where id = '21000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'permission denied for table organizations',
  'Org A owner cannot directly update Org B'
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
      'P111 A New',
      'new',
      'P111-AN',
      '5 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'permission denied for table branches',
  'even an authorized owner cannot create a branch by direct table write'
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
  'permission denied for table branches',
  'Org A owner cannot forge organization_id while inserting a branch'
);

select extensions.lives_ok(
  $$
    select public.create_branch(
      '21000000-0000-0000-0000-000000000001',
      'P111 A New',
      'new',
      'P111-AN',
      '5 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'AAL2 owner creates a dynamic branch through the transactional RPC'
);

select extensions.throws_ok(
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
  '42501',
  'permission denied for table roles',
  'custom-role creation has no unaudited direct authenticated path'
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
  'permission denied for table roles',
  'Org A owner cannot create a custom role in Org B'
);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000005',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'RECEPTIONIST'
      ),
      null,
      true
    )
  $$,
  'AAL2 role manager can assign a delegable role to another Org A member'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000001',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'ADMIN'
      ),
      null,
      true
    )
  $$,
  '42501',
  'role assignment is not authorized',
  'a role manager cannot assign any role to themselves through the RPC'
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
  'permission denied for table member_roles',
  'direct member-role insertion cannot forge assigned_by'
);

select extensions.lives_ok(
  $$
    select public.set_branch_membership(
      '41000000-0000-0000-0000-000000000005',
      '31000000-0000-0000-0000-000000000002',
      'active'
    )
  $$,
  'AAL2 user manager can grant another Org A member exact-branch access'
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
  'permission denied for table branch_memberships',
  'direct branch-membership insertion is denied even for an owner'
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
  (select count(*)::integer from public.branches where slug = 'new'),
  0,
  'a newly created branch remains invisible until exact access is assigned'
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

select extensions.throws_ok(
  $$
    update public.branches
    set name = 'Unauthorized Reception Update'
    where id = '31000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table branches',
  'receptionist cannot directly update their assigned branch'
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

select extensions.throws_ok(
  $$
    update public.branches
    set name = 'P111 Branch Admin Updated'
    where id = '31000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table branches',
  'branch-scoped admin cannot bypass the RPC boundary with a direct update'
);

select extensions.throws_ok(
  $$
    update public.branches
    set name = 'Forged A2 Update'
    where id = '31000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'permission denied for table branches',
  'branch-scoped admin cannot directly manage an unrelated branch'
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
  'permission denied for table branches',
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

select extensions.throws_ok(
  $$
    update public.organizations
    set business_name = 'Unauthorized Admin Org Update'
    where id = '21000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table organizations',
  'ADMIN cannot directly update organization settings'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  4,
  'organization-wide branch.manage sees all Org A branches including the newly created branch'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  7,
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
  'permission denied for table member_roles',
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
  'permission denied for table branch_memberships',
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

-- AAL1 cannot invoke any privileged mutation boundary, even for an owner.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$
    select public.create_branch(
      '21000000-0000-0000-0000-000000000001',
      'AAL1 Denied',
      'aal1-denied',
      'P111-AAL1',
      '8 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'AAL2 required',
  'AAL1 cannot create a branch through the RPC'
);

select extensions.throws_ok(
  $$
    select public.set_role_permission(
      '51000000-0000-0000-0000-000000000001',
      'audit.read',
      true
    )
  $$,
  '42501',
  'AAL2 required',
  'AAL1 cannot change custom-role permissions'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000005',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'OWNER'
      ),
      null,
      true
    )
  $$,
  '42501',
  'AAL2 required',
  'AAL1 cannot assign a high-privilege role'
);

select extensions.throws_ok(
  $$
    select public.update_organization_member_status(
      '41000000-0000-0000-0000-000000000005',
      'suspended'
    )
  $$,
  '42501',
  'AAL2 required',
  'AAL1 cannot suspend an organization member'
);

select extensions.is(
  (select count(*)::integer from public.branches where slug = 'aal1-denied'),
  0,
  'failed AAL1 branch creation leaves no branch row'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_user_id = '11000000-0000-0000-0000-000000000001'
      and entity_type in ('branch', 'role', 'organization_member')
      and action in (
        'branch.created',
        'role.permission_granted',
        'member_role.assigned',
        'membership.suspended'
      )
      and entity_id in (
        '51000000-0000-0000-0000-000000000001',
        '41000000-0000-0000-0000-000000000005'
      )
  ),
  0,
  'failed AAL1 operations create no misleading success audit event'
);

-- A role.manage-only actor cannot change a role already assigned to themselves.
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000004', 'security.manage', true)$$,
  '42501',
  'cannot change permissions on an assigned role',
  'role manager cannot add security.manage to their assigned custom role'
);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000004', 'organization.manage', true)$$,
  '42501',
  'cannot change permissions on an assigned role',
  'role manager cannot add organization.manage to their assigned custom role'
);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000004', 'user.manage', true)$$,
  '42501',
  'cannot change permissions on an assigned role',
  'role manager cannot add user.manage to their assigned custom role'
);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000004', 'branch.manage', true)$$,
  '42501',
  'cannot change permissions on an assigned role',
  'role manager cannot add branch.manage to their assigned custom role'
);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000004', 'audit.read', true)$$,
  '42501',
  'cannot change permissions on an assigned role',
  'role manager cannot add audit.read to their assigned custom role'
);

select extensions.throws_ok(
  $$
    insert into public.role_permissions (role_id, permission_id)
    select
      '51000000-0000-0000-0000-000000000004',
      permission.id
    from public.permissions as permission
    where permission.code = 'security.manage'
  $$,
  '42501',
  'permission denied for table role_permissions',
  'role manager cannot bypass self-role protection with a direct grant'
);

select extensions.throws_ok(
  $$
    select public.set_role_permission(
      '51000000-0000-0000-0000-000000000001',
      'security.manage',
      true
    )
  $$,
  '42501',
  'permission may not be delegated',
  'role manager cannot delegate a permission they do not hold to another role'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000009',
      '51000000-0000-0000-0000-000000000001',
      null,
      true
    )
  $$,
  '42501',
  'role assignment is not authorized',
  'role manager cannot combine roles by assigning another role to themselves'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000005',
      '51000000-0000-0000-0000-000000000001',
      null,
      true
    )
  $$,
  '42501',
  'role contains permissions the actor may not delegate',
  'role manager cannot build a permission union by assigning a role containing authority they lack'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'branch.created'
  ),
  1,
  'failed AAL1 branch creation adds no audit event beyond the earlier successful branch'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'role.permission_granted'
      and entity_id = '51000000-0000-0000-0000-000000000001'
  ),
  0,
  'failed AAL1 permission change creates no success audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'member_role.assigned'
  ),
  1,
  'failed AAL1 high-role assignment adds no event beyond the earlier successful role assignment'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'membership.suspended'
      and entity_id = '41000000-0000-0000-0000-000000000005'
  ),
  0,
  'failed AAL1 suspension creates no success audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions
    where role_id = '51000000-0000-0000-0000-000000000004'
  ),
  1,
  'failed self-escalation attempts leave the assigned role unchanged'
);

select extensions.is(
  private.has_org_permission('21000000-0000-0000-0000-000000000001', 'security.manage'),
  false,
  'role manager still lacks security.manage after failed grants'
);

select extensions.is(
  private.has_org_permission('21000000-0000-0000-0000-000000000001', 'organization.manage'),
  false,
  'role manager still lacks organization.manage after failed grants'
);

select extensions.is(
  private.has_org_permission('21000000-0000-0000-0000-000000000001', 'user.manage'),
  false,
  'role manager still lacks user.manage after failed grants'
);

select extensions.is(
  private.has_org_permission('21000000-0000-0000-0000-000000000001', 'branch.manage'),
  false,
  'role manager still lacks branch.manage after failed grants'
);

select extensions.is(
  private.has_org_permission('21000000-0000-0000-0000-000000000001', 'audit.read'),
  false,
  'role manager still lacks audit.read after failed grants'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

-- Cross-tenant requests fail inside every approved administrative boundary.
select extensions.throws_ok(
  $$select public.update_organization_member_status('41000000-0000-0000-0000-000000000008', 'suspended')$$,
  '42501',
  'membership status change is not authorized',
  'Org A owner cannot change an Org B membership through the RPC'
);

select extensions.throws_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000002', 'audit.read', true)$$,
  '42501',
  'role permission change is not authorized',
  'Org A owner cannot change an Org B custom role through the RPC'
);

select extensions.throws_ok(
  $$select public.set_branch_membership('41000000-0000-0000-0000-000000000008', '31000000-0000-0000-0000-000000000004', 'active')$$,
  '42501',
  'branch membership change is not authorized',
  'Org A owner cannot grant Org B branch access through the RPC'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000008',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'OWNER'
      ),
      null,
      true
    )
  $$,
  '42501',
  'role assignment is not authorized',
  'Org A owner cannot assign a role to an Org B member through the RPC'
);

select extensions.throws_ok(
  $$update public.organization_members set membership_status = 'suspended', suspended_at = statement_timestamp() where id = '41000000-0000-0000-0000-000000000008'$$,
  '42501',
  'permission denied for table organization_members',
  'Org A owner cannot directly mutate Org B membership state'
);

select extensions.throws_ok(
  $$
    insert into public.role_permissions (role_id, permission_id)
    select '51000000-0000-0000-0000-000000000002', permission.id
    from public.permissions as permission
    where permission.code = 'audit.read'
  $$,
  '42501',
  'permission denied for table role_permissions',
  'Org A owner cannot directly mutate Org B role permissions'
);

select extensions.throws_ok(
  $$
    insert into public.branch_memberships (organization_id, branch_id, organization_member_id)
    values (
      '21000000-0000-0000-0000-000000000002',
      '31000000-0000-0000-0000-000000000004',
      '41000000-0000-0000-0000-000000000008'
    )
  $$,
  '42501',
  'permission denied for table branch_memberships',
  'Org A owner cannot directly mutate Org B branch memberships'
);

select extensions.throws_ok(
  $$
    insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
    select
      '21000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000008',
      role.id,
      '11000000-0000-0000-0000-000000000001'
    from public.roles as role
    where role.organization_id is null
      and role.code = 'OWNER'
  $$,
  '42501',
  'permission denied for table member_roles',
  'Org A owner cannot directly mutate Org B member roles'
);

-- Legitimate AAL2 mutations succeed and produce one minimal, scoped event.
select extensions.lives_ok(
  $$select public.set_role_permission('51000000-0000-0000-0000-000000000001', 'audit.read', true)$$,
  'AAL2 owner may delegate a permission they hold to an unassigned custom role'
);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000005',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'OWNER'
      ),
      null,
      true
    )
  $$,
  'AAL2 owner may assign a high-privilege role they are authorized to delegate'
);

select extensions.lives_ok(
  $$select public.update_organization_member_status('41000000-0000-0000-0000-000000000005', 'suspended')$$,
  'AAL2 owner may suspend another high-privilege member'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events as audit_event
    join public.branches as branch
      on branch.id = audit_event.entity_id
    where branch.slug = 'new'
      and audit_event.organization_id = '21000000-0000-0000-0000-000000000001'
      and audit_event.branch_id = branch.id
      and audit_event.actor_user_id = '11000000-0000-0000-0000-000000000001'
      and audit_event.action = 'branch.created'
      and audit_event.entity_type = 'branch'
      and audit_event.result = 'SUCCESS'
      and audit_event.metadata = '{}'::jsonb
  ),
  1,
  'branch creation inserts exactly one correctly scoped minimal audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '21000000-0000-0000-0000-000000000001'
      and actor_user_id = '11000000-0000-0000-0000-000000000001'
      and action = 'role.permission_granted'
      and entity_type = 'role'
      and entity_id = '51000000-0000-0000-0000-000000000001'
      and metadata = '{"permission_code":"audit.read"}'::jsonb
  ),
  1,
  'permission grant inserts exactly one correctly scoped minimal audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events as audit_event
    join public.member_roles as member_role
      on member_role.id = audit_event.entity_id
    join public.roles as role
      on role.id = member_role.role_id
    where member_role.organization_member_id = '41000000-0000-0000-0000-000000000005'
      and role.code = 'OWNER'
      and audit_event.organization_id = '21000000-0000-0000-0000-000000000001'
      and audit_event.actor_user_id = '11000000-0000-0000-0000-000000000001'
      and audit_event.action = 'member_role.assigned'
      and audit_event.entity_type = 'member_role'
      and audit_event.metadata = '{}'::jsonb
  ),
  1,
  'high-privilege role assignment inserts exactly one scoped minimal audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '21000000-0000-0000-0000-000000000001'
      and actor_user_id = '11000000-0000-0000-0000-000000000001'
      and action = 'membership.suspended'
      and entity_type = 'organization_member'
      and entity_id = '41000000-0000-0000-0000-000000000005'
      and metadata = '{}'::jsonb
  ),
  1,
  'membership suspension inserts exactly one scoped minimal audit event'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events as audit_event
    join public.branch_memberships as branch_membership
      on branch_membership.id = audit_event.entity_id
    where branch_membership.organization_member_id = '41000000-0000-0000-0000-000000000005'
      and branch_membership.branch_id = '31000000-0000-0000-0000-000000000002'
      and audit_event.organization_id = '21000000-0000-0000-0000-000000000001'
      and audit_event.branch_id = '31000000-0000-0000-0000-000000000002'
      and audit_event.actor_user_id = '11000000-0000-0000-0000-000000000001'
      and audit_event.action = 'branch_membership.granted'
      and audit_event.metadata = '{}'::jsonb
  ),
  1,
  'branch-access grant inserts exactly one scoped minimal audit event'
);

-- A failed audit write rolls the administrative mutation back with it.
reset role;

create function private.p111_reject_branch_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'branch.created' then
    raise exception 'synthetic audit sink failure';
  end if;
  return new;
end;
$$;

create trigger p111_reject_branch_audit
before insert on public.audit_events
for each row execute function private.p111_reject_branch_audit();

set local role authenticated;

select extensions.throws_ok(
  $$
    select public.create_branch(
      '21000000-0000-0000-0000-000000000001',
      'Audit Failure',
      'audit-failure',
      'P111-AF',
      '9 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'P0001',
  'synthetic audit sink failure',
  'branch creation fails when its audit insert fails'
);

reset role;
drop trigger p111_reject_branch_audit on public.audit_events;
drop function private.p111_reject_branch_audit();
set local role authenticated;

select extensions.is(
  (select count(*)::integer from public.branches where slug = 'audit-failure'),
  0,
  'audit failure rolls back the branch mutation'
);

select extensions.is(
  (select count(*)::integer from public.audit_events where action = 'branch.created' and entity_id is null),
  0,
  'audit failure does not leave a misleading success event'
);

select extensions.throws_ok(
  $$update public.audit_events set result = 'FAILED' where action = 'p111.org_a'$$,
  '42501',
  'permission denied for table audit_events',
  'authenticated UPDATE against audit history fails'
);

select extensions.throws_ok(
  $$delete from public.audit_events where action = 'p111.org_a'$$,
  '42501',
  'permission denied for table audit_events',
  'authenticated DELETE against audit history fails'
);

reset role;

-- A member with any current organization-wide sensitive authority is a
-- sensitive principal. Even an ordinary grant or revocation requires the
-- actor to hold security.manage.
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
values (
  '11000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'sensitive-target-a@p111.example.test',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  membership_status,
  joined_at
)
values (
  '41000000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000010',
  'active',
  statement_timestamp()
);

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  assigned_by
)
select
  '21000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000010',
  role.id,
  '11000000-0000-0000-0000-000000000001'
from public.roles as role
where role.organization_id is null
  and role.code in ('OWNER', 'RECEPTIONIST');

insert into public.role_permissions (role_id, permission_id)
select
  '51000000-0000-0000-0000-000000000004',
  permission.id
from public.permissions as permission
where permission.code = 'branch.read'
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000010',
      '51000000-0000-0000-0000-000000000003',
      null,
      true
    )
  $$,
  '42501',
  'sensitive member role changes require security.manage',
  'role manager without security.manage cannot grant an ordinary role to an organization-wide sensitive member'
);

select extensions.is(
  (
    select count(*)::integer
    from public.member_roles
    where organization_member_id = '41000000-0000-0000-0000-000000000010'
      and role_id = '51000000-0000-0000-0000-000000000003'
      and branch_id is null
  ),
  0,
  'denied ordinary grant leaves the sensitive member assignments unchanged'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000010',
      (
        select role.id
        from public.roles as role
        where role.organization_id is null
          and role.code = 'RECEPTIONIST'
      ),
      null,
      false
    )
  $$,
  '42501',
  'sensitive member role changes require security.manage',
  'role manager without security.manage cannot revoke an ordinary role from an organization-wide sensitive member'
);

select extensions.is(
  (
    select count(*)::integer
    from public.member_roles as member_role
    join public.roles as role
      on role.id = member_role.role_id
    where member_role.organization_member_id = '41000000-0000-0000-0000-000000000010'
      and role.code = 'RECEPTIONIST'
      and member_role.branch_id is null
  ),
  1,
  'denied ordinary revocation leaves the sensitive member assignment intact'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_user_id = '11000000-0000-0000-0000-000000000009'
      and action in ('member_role.assigned', 'member_role.revoked')
  ),
  0,
  'denied sensitive-target mutations create no success audit event'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '41000000-0000-0000-0000-000000000010',
      '51000000-0000-0000-0000-000000000003',
      null,
      true
    )
  $$,
  'actor with security.manage can grant an ordinary role to a sensitive member'
);

select extensions.is(
  (
    select count(*)::integer
    from public.member_roles
    where organization_member_id = '41000000-0000-0000-0000-000000000010'
      and role_id = '51000000-0000-0000-0000-000000000003'
      and branch_id is null
  ),
  1,
  'authorized sensitive-target mutation creates the requested assignment once'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events as audit_event
    join public.member_roles as member_role
      on member_role.id = audit_event.entity_id
    where audit_event.organization_id = '21000000-0000-0000-0000-000000000001'
      and audit_event.actor_user_id = '11000000-0000-0000-0000-000000000001'
      and audit_event.action = 'member_role.assigned'
      and audit_event.entity_type = 'member_role'
      and audit_event.metadata = '{}'::jsonb
      and member_role.organization_member_id = '41000000-0000-0000-0000-000000000010'
      and member_role.role_id = '51000000-0000-0000-0000-000000000003'
  ),
  1,
  'authorized sensitive-target mutation writes exactly one sanitized audit event'
);

reset role;

select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from extensions.finish();

rollback;
