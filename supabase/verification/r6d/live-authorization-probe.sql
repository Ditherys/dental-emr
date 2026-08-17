-- R6-D live authorization probe — PASSES against a fresh, empty Cloud TEST
-- project in both `--mode=file` and `--mode=statement` (see docs/AI_HANDOFF.md's
-- current checkpoint; control 1b's schema-USAGE bug, found on the first real
-- `--mode=file` run, is fixed).
--
-- Catalog inspection proves what the ACLs say. This file proves what a real
-- session can do. It runs entirely inside one transaction and ends in ROLLBACK.
--
-- THE POINT OF THE MEANINGFULNESS CONTROLS
--
-- A probe that shows "the user could not insert into role_permissions" proves
-- nothing on its own: a user with no permissions would also fail, and so would a
-- session whose identity was never bound. The probe would then pass against a
-- vulnerable database and be silently worthless.
--
-- So the synthetic actor is deliberately privileged. It holds the system OWNER
-- role, which carries every Phase 1 organization permission including
-- role.manage, user.manage, branch.manage, organization.manage, and
-- security.manage. Under the SUPERSEDED migration chain, at boundaries 9 and 10,
-- exactly this actor WOULD have been allowed to perform every prohibited
-- operation below: the `*_manager` mutation policies were gated on
-- private.has_org_permission(...), which returns true for this actor.
--
-- Section 1 must pass before section 2 means anything:
--   1a. the session identity is genuinely bound (RLS returns the actor's rows);
--   1b. the actor genuinely holds each management permission;
--   1c. the approved AAL2 RPC path genuinely succeeds for this actor;
--   1d. the AAL2 gate is genuinely live (the same call fails at AAL1).
--
-- Section 2 then shows that every direct administrative table mutation is
-- refused with 42501 — not because the actor is powerless, but because no
-- browser-reachable role holds the table privilege at any baseline boundary.
--
-- SYNTHETIC DATA ONLY. Every identity, name, and address below is invented for
-- this test. This file must never run against a project holding real data.

begin;

select extensions.no_plan();

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
  ('91000000-0000-0000-0000-000000000001'::uuid, 'r6d-privileged@r6d.example.test'),
  ('91000000-0000-0000-0000-000000000002'::uuid, 'r6d-target@r6d.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values (
  '92000000-0000-0000-0000-000000000001',
  'R6D Synthetic Dental Inc.',
  'R6D Synthetic Dental',
  'r6d-synthetic'
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
  province
)
values (
  '93000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'R6D Main',
  'main',
  'R6D-1',
  'active',
  '1 Synthetic Street',
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
  );

insert into public.profiles (user_id, display_name, first_name, last_name)
values
  ('91000000-0000-0000-0000-000000000001', 'R6D Privileged', 'R6D', 'Privileged'),
  ('91000000-0000-0000-0000-000000000002', 'R6D Target', 'R6D', 'Target');

-- The actor holds the system OWNER role: every Phase 1 organization permission.
insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  branch_id,
  assigned_by
)
select
  '92000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  role.id,
  null,
  '91000000-0000-0000-0000-000000000001'
from public.roles as role
where role.organization_id is null
  and role.code = 'OWNER';

insert into public.branch_memberships (
  organization_id,
  branch_id,
  organization_member_id
)
values (
  '92000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002'
);

-- An unassigned organization-owned role, so the approved RPC control is not
-- blocked by the anti-self-escalation rule.
insert into public.roles (id, organization_id, code, name, is_system)
values (
  '95000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'R6D_CUSTOM',
  'R6D Custom Role',
  false
);

-- CONTROL 1b calls a private helper by schema-qualified name as an ad hoc
-- statement. A real authenticated session never does this directly — RLS
-- policies embed an already-resolved reference to the helper, so evaluating a
-- policy only ever re-checks EXECUTE on that function, never schema USAGE on
-- `private`. But control 1b's raw SQL text requires fresh name resolution
-- under whichever role runs it, which needs schema USAGE — correctly absent
-- for `authenticated` (ADR-017: `private` is not browser-reachable in any
-- form). This ephemeral wrapper is created while still connected as the
-- initial role (which does have access to `private`), so control 1b can
-- prove the actor holds each permission without granting the probe's session
-- role any capability the real production baseline does not already grant.
-- `pg_temp` is always reachable by the owning backend regardless of the
-- current role, so the later role switch below does not affect this.
create function pg_temp.r6d_probe_has_org_permission(
  target_organization_id uuid,
  target_permission_code text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.has_org_permission(target_organization_id, target_permission_code);
$$;

-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default (the
-- same fact the baseline itself revokes adjacent to every CREATE — see
-- ADR-017 section 2). Without this revoke, anon and every other role sharing
-- this backend would also be able to call the wrapper, which is broader than
-- what this probe is testing and broader than what the comment above claims.
revoke all on function pg_temp.r6d_probe_has_org_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function pg_temp.r6d_probe_has_org_permission(uuid, text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

-- =========================================================================
-- SECTION 1 — MEANINGFULNESS CONTROLS. If any of these fails, the prohibited
-- operations in section 2 prove nothing and the whole run must be discarded.
-- =========================================================================

-- 1a. The session identity is genuinely bound to the synthetic actor.
select extensions.is(
  (select count(*)::integer from public.organizations),
  1,
  'CONTROL 1a: the probe session is genuinely bound to the synthetic actor'
);

-- 1b. The actor genuinely holds every management permission the superseded
--     chain's mutation policies were gated on.
select extensions.ok(
  (select pg_temp.r6d_probe_has_org_permission('92000000-0000-0000-0000-000000000001', 'role.manage')),
  'CONTROL 1b: actor holds role.manage, so the superseded chain would have allowed role_permissions DML'
);

select extensions.ok(
  (select pg_temp.r6d_probe_has_org_permission('92000000-0000-0000-0000-000000000001', 'user.manage')),
  'CONTROL 1b: actor holds user.manage, so the superseded chain would have allowed organization_members DML'
);

select extensions.ok(
  (select pg_temp.r6d_probe_has_org_permission('92000000-0000-0000-0000-000000000001', 'branch.manage')),
  'CONTROL 1b: actor holds branch.manage, so the superseded chain would have allowed branches DML'
);

select extensions.ok(
  (select pg_temp.r6d_probe_has_org_permission('92000000-0000-0000-0000-000000000001', 'organization.manage')),
  'CONTROL 1b: actor holds organization.manage, so the superseded chain would have allowed organizations DML'
);

select extensions.ok(
  (select pg_temp.r6d_probe_has_org_permission('92000000-0000-0000-0000-000000000001', 'security.manage')),
  'CONTROL 1b: actor holds security.manage, the highest Phase 1 authority'
);

-- 1c. The approved administrative path genuinely works for this actor, so a
--     refusal in section 2 is a privilege boundary and not a broken fixture.
select extensions.lives_ok(
  $$
    select public.set_role_permission(
      '95000000-0000-0000-0000-000000000001',
      'branch.read',
      true
    )
  $$,
  'CONTROL 1c: the approved AAL2-gated RPC path succeeds for this actor'
);

select extensions.lives_ok(
  $$
    select public.create_branch(
      '92000000-0000-0000-0000-000000000001',
      'R6D Control Branch',
      'r6d-control',
      'R6D-C',
      '2 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'CONTROL 1c: the approved branch creation RPC succeeds for this actor'
);

-- 1d. The AAL2 gate is live, so 1c did not succeed by accident.
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$
    select public.set_role_permission(
      '95000000-0000-0000-0000-000000000001',
      'audit.read',
      true
    )
  $$,
  '42501',
  'AAL2 required',
  'CONTROL 1d: the same RPC is refused at AAL1, so the step-up gate is live'
);

select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

-- =========================================================================
-- SECTION 2 — PROHIBITED DIRECT ADMINISTRATIVE MUTATIONS.
-- Every one of these is exactly what the superseded chain allowed this actor to
-- do at boundaries 9 and 10, at AAL1, without an audit record.
-- =========================================================================

select extensions.throws_ok(
  $$
    insert into public.role_permissions (role_id, permission_id)
    select '95000000-0000-0000-0000-000000000001', permission.id
    from public.permissions as permission
    where permission.code = 'security.manage'
  $$,
  '42501',
  'permission denied for table role_permissions',
  'direct INSERT into role_permissions is refused'
);

select extensions.throws_ok(
  $$
    update public.role_permissions
    set permission_id = permission_id
    where role_id = '95000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table role_permissions',
  'direct UPDATE of role_permissions is refused'
);

select extensions.throws_ok(
  $$
    delete from public.role_permissions
    where role_id = '95000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table role_permissions',
  'direct DELETE from role_permissions is refused'
);

select extensions.throws_ok(
  $$
    update public.member_roles
    set branch_id = null
    where organization_member_id = '94000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'permission denied for table member_roles',
  'direct UPDATE of member_roles is refused'
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
      '92000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000002',
      role.id,
      '91000000-0000-0000-0000-000000000001'
    from public.roles as role
    where role.organization_id is null and role.code = 'OWNER'
  $$,
  '42501',
  'permission denied for table member_roles',
  'direct INSERT into member_roles is refused'
);

select extensions.throws_ok(
  $$
    update public.organizations
    set business_name = 'R6D Renamed'
    where id = '92000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table organizations',
  'direct UPDATE of organizations is refused'
);

select extensions.throws_ok(
  $$
    insert into public.branches (
      organization_id,
      name,
      slug,
      code,
      status,
      address_line1,
      city,
      province
    )
    values (
      '92000000-0000-0000-0000-000000000001',
      'R6D Direct',
      'r6d-direct',
      'R6D-D',
      'active',
      '3 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'permission denied for table branches',
  'direct INSERT into branches is refused'
);

select extensions.throws_ok(
  $$
    update public.organization_members
    set membership_status = 'suspended'
    where id = '94000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'permission denied for table organization_members',
  'direct UPDATE of organization_members is refused'
);

select extensions.throws_ok(
  $$
    delete from public.branch_memberships
    where organization_member_id = '94000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'permission denied for table branch_memberships',
  'direct DELETE from branch_memberships is refused'
);

select extensions.throws_ok(
  $$
    insert into public.roles (organization_id, code, name, is_system)
    values ('92000000-0000-0000-0000-000000000001', 'R6D_FORGED', 'Forged', false)
  $$,
  '42501',
  'permission denied for table roles',
  'direct INSERT into roles is refused'
);

select extensions.throws_ok(
  $$
    update public.permissions
    set description = 'tampered'
    where code = 'security.manage'
  $$,
  '42501',
  'permission denied for table permissions',
  'direct UPDATE of the permission catalog is refused'
);

select extensions.throws_ok(
  $$
    insert into public.audit_events (
      organization_id,
      actor_user_id,
      actor_type,
      category,
      action,
      entity_type,
      entity_id,
      result
    )
    values (
      '92000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001',
      'USER',
      'ADMINISTRATION',
      'forged.event',
      'organization',
      '92000000-0000-0000-0000-000000000001',
      'SUCCESS'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'direct INSERT into audit_events is refused'
);

-- The one self-service write path must stay column-scoped.
select extensions.lives_ok(
  $$
    update public.profiles
    set display_name = 'R6D Renamed Self'
    where user_id = '91000000-0000-0000-0000-000000000001'
  $$,
  'the approved self-service profile column remains writable'
);

select extensions.throws_ok(
  $$
    update public.profiles
    set user_id = '91000000-0000-0000-0000-000000000002'
    where user_id = '91000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table profiles',
  'a profile column outside the approved self-service set is refused'
);

-- =========================================================================
-- SECTION 3 — the refusals left no state and no misleading audit record.
-- =========================================================================

reset role;

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where action = 'forged.event'
  ),
  0,
  'no forged audit event was written'
);

select extensions.is(
  (
    select count(*)::integer
    from public.branches
    where slug in ('r6d-direct')
  ),
  0,
  'the refused direct branch insert left no row'
);

select extensions.is(
  (
    select count(*)::integer
    from public.roles
    where code = 'R6D_FORGED'
  ),
  0,
  'the refused direct role insert left no row'
);

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
