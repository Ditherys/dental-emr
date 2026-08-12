begin;

select extensions.plan(4);

select extensions.set_eq(
  $$
    select table_schema || '.' || table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and (
        (table_schema = 'public' and table_name in (
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
        ))
        or (table_schema = 'private' and table_name = 'workforce_invitations')
      )
  $$,
  array[
    'private.workforce_invitations',
    'public.audit_events',
    'public.branch_memberships',
    'public.branches',
    'public.member_roles',
    'public.organization_members',
    'public.organizations',
    'public.permissions',
    'public.profiles',
    'public.role_permissions',
    'public.roles'
  ]::text[],
  'every Phase 1 foundation table exists in its intended schema'
);

select extensions.set_eq(
  $$
    select constraint_schema || '.' || constraint_name
    from information_schema.table_constraints
    where constraint_type = 'FOREIGN KEY'
      and constraint_name in (
        'branches_organization_id_fkey',
        'organization_members_organization_id_fkey',
        'organization_members_user_id_fkey',
        'branch_memberships_organization_branch_fk',
        'branch_memberships_organization_member_fk',
        'member_roles_organization_member_fk',
        'member_roles_organization_branch_fk',
        'member_roles_branch_membership_fk',
        'audit_events_organization_branch_fk',
        'workforce_invitations_organization_branch_fk'
      )
  $$,
  array[
    'private.workforce_invitations_organization_branch_fk',
    'public.audit_events_organization_branch_fk',
    'public.branch_memberships_organization_branch_fk',
    'public.branch_memberships_organization_member_fk',
    'public.branches_organization_id_fkey',
    'public.member_roles_branch_membership_fk',
    'public.member_roles_organization_branch_fk',
    'public.member_roles_organization_member_fk',
    'public.organization_members_organization_id_fkey',
    'public.organization_members_user_id_fkey'
  ]::text[],
  'key identity and tenant-sensitive foreign keys exist'
);

select extensions.set_eq(
  $$
    select constraint_schema || '.' || constraint_name
    from information_schema.table_constraints
    where constraint_type = 'UNIQUE'
      and constraint_name in (
        'branches_organization_slug_key',
        'branches_organization_code_key',
        'branches_organization_id_id_key',
        'organization_members_organization_user_key',
        'organization_members_organization_id_id_key',
        'branch_memberships_branch_member_key',
        'member_roles_assignment_key'
      )
  $$,
  array[
    'public.branch_memberships_branch_member_key',
    'public.branches_organization_code_key',
    'public.branches_organization_id_id_key',
    'public.branches_organization_slug_key',
    'public.member_roles_assignment_key',
    'public.organization_members_organization_id_id_key',
    'public.organization_members_organization_user_key'
  ]::text[],
  'tenant-scoped uniqueness constraints exist'
);

select extensions.set_eq(
  $$
    select pg_namespace.nspname || '.' || pg_class.relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind = 'r'
      and pg_class.relname in (
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
      and pg_class.relrowsecurity
  $$,
  array[
    'public.audit_events',
    'public.branch_memberships',
    'public.branches',
    'public.member_roles',
    'public.organization_members',
    'public.organizations',
    'public.permissions',
    'public.profiles',
    'public.role_permissions',
    'public.roles'
  ]::text[],
  'RLS is enabled on every exposed foundation table'
);

select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from extensions.finish();

rollback;
