-- R5 — session-lifetime authorization boundaries.
--
-- The existing suites prove that a *fresh* session with the wrong authorization
-- is refused. This suite proves the complementary property, which is where real
-- systems leak: authorization that was valid when the session started must stop
-- being valid the instant it is withdrawn, with no re-login, no new JWT, and no
-- cache to wait out.
--
-- Every actor switch below changes ONLY the database session context. The
-- simulated JWT claims are re-set to exactly what they were before the
-- withdrawal, so a passing assertion means the boundary is evaluated per
-- statement rather than trusted from the session.
--
-- Covered here:
--   A. branch access revoked mid-session
--   B. organization-wide authorization revoked mid-session, then a real mutation
--   C. membership suspended mid-session, then a protected operation
--   D. invitation revocation lifecycle, including cross-tenant revocation
--   E. stale / downgraded / absent AAL claims
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
  ('81000000-0000-0000-0000-000000000001'::uuid, 'owner-a@p1r5.example.test'),
  ('81000000-0000-0000-0000-000000000002'::uuid, 'manager-a@p1r5.example.test'),
  ('81000000-0000-0000-0000-000000000003'::uuid, 'branch-user-a@p1r5.example.test'),
  ('81000000-0000-0000-0000-000000000004'::uuid, 'owner-b@p1r5.example.test'),
  ('81000000-0000-0000-0000-000000000005'::uuid, 'plain-a@p1r5.example.test'),
  ('81000000-0000-0000-0000-000000000006'::uuid, 'invitee-a@p1r5.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  (
    '82000000-0000-0000-0000-000000000001',
    'P1R5 Synthetic Dental A Inc.',
    'P1R5 Synthetic Dental A',
    'p1r5-synthetic-a'
  ),
  (
    '82000000-0000-0000-0000-000000000002',
    'P1R5 Synthetic Dental B Inc.',
    'P1R5 Synthetic Dental B',
    'p1r5-synthetic-b'
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
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    'P1R5 A Main',
    'p1r5-a-main',
    'P1R5-A1',
    '1 Synthetic Street',
    'Test City',
    'Test Province'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    'P1R5 A Second',
    'p1r5-a-second',
    'P1R5-A2',
    '2 Synthetic Street',
    'Test City',
    'Test Province'
  ),
  (
    '83000000-0000-0000-0000-000000000003',
    '82000000-0000-0000-0000-000000000002',
    'P1R5 B Main',
    'p1r5-b-main',
    'P1R5-B1',
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
    '84000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    'active',
    statement_timestamp()
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'active',
    statement_timestamp()
  ),
  (
    '84000000-0000-0000-0000-000000000003',
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000003',
    'active',
    statement_timestamp()
  ),
  (
    '84000000-0000-0000-0000-000000000004',
    '82000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000004',
    'active',
    statement_timestamp()
  ),
  (
    '84000000-0000-0000-0000-000000000005',
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000005',
    'active',
    statement_timestamp()
  );

-- The branch-scoped user's exact-branch access. A branch-scoped member_role may
-- only exist while this row exists (member_roles_branch_membership_fk), which is
-- exactly the coupling section A withdraws.
insert into public.branch_memberships (
  id,
  organization_id,
  branch_id,
  organization_member_id,
  access_status
)
values (
  '85000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000003',
  'active'
);

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  branch_id
)
values
  (
    '82000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    (select id from public.roles where organization_id is null and code = 'OWNER'),
    null
  ),
  (
    '82000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000002',
    (select id from public.roles where organization_id is null and code = 'ADMIN'),
    null
  ),
  (
    '82000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000003',
    (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
    '83000000-0000-0000-0000-000000000001'
  ),
  (
    '82000000-0000-0000-0000-000000000002',
    '84000000-0000-0000-0000-000000000004',
    (select id from public.roles where organization_id is null and code = 'OWNER'),
    null
  ),
  (
    '82000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000005',
    (select id from public.roles where organization_id is null and code = 'DENTIST'),
    null
  );

/* -------------------------------------------------------------------------- */
/* A. Branch access revoked while the session stays open                       */
/* -------------------------------------------------------------------------- */

-- The branch-scoped user's session. Note the claims set here are never changed
-- again in this section: the same session, the same JWT, throughout.
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.is(
  (select count(*)::integer from public.branches),
  1,
  'A0 control: the branch-scoped user starts able to see exactly their branch'
);

select extensions.ok(
  (select private.has_branch_access('83000000-0000-0000-0000-000000000001')),
  'A0 control: exact-branch access is held before revocation'
);

select extensions.ok(
  (select private.has_branch_permission(
    '83000000-0000-0000-0000-000000000001',
    'branch.read'
  )),
  'A0 control: the branch-scoped role confers branch.read before revocation'
);

-- An authorized organization-wide user manager revokes that access, at AAL2,
-- through the audited RPC — the real withdrawal path, not a direct UPDATE.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.set_branch_membership(
      '84000000-0000-0000-0000-000000000003',
      '83000000-0000-0000-0000-000000000001',
      'revoked'
    )
  $$,
  'A1 an authorized AAL2 user manager revokes exact-branch access'
);

-- Back to the victim's ORIGINAL session context, unchanged.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.ok(
  not (select private.has_branch_access('83000000-0000-0000-0000-000000000001')),
  'A2 branch access is gone immediately in the still-open session'
);

select extensions.ok(
  not (select private.has_branch_permission(
    '83000000-0000-0000-0000-000000000001',
    'branch.read'
  )),
  'A3 the branch-scoped role confers nothing once branch access is revoked'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  0,
  'A4 the revoked branch disappears from the open session read surface'
);

-- Phase 1 has no branch-scoped write RPC; every mutation is organization-wide
-- permission gated. The direct-DML attempt below is therefore the only
-- branch-bound *write* a browser-reachable role can even express today, and it
-- must fail at the privilege layer, before RLS is consulted.
select extensions.throws_ok(
  $$
    update public.branches
    set name = 'Revoked User Rename'
    where id = '83000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'A5 a revoked branch user has no direct branch write privilege at all'
);

/* -------------------------------------------------------------------------- */
/* B. Organization-wide authorization revoked mid-session, then a mutation     */
/* -------------------------------------------------------------------------- */

-- manager-a holds ADMIN, which carries branch.manage. Their session is opened
-- once here and its claims are never refreshed.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Third',
      'p1r5-a-third',
      'P1R5-A3',
      '4 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'B0 control: the authorized manager can perform the branch mutation'
);

-- The owner withdraws the ADMIN assignment while that session is still open.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '84000000-0000-0000-0000-000000000002',
      (select id from public.roles where organization_id is null and code = 'ADMIN'),
      null,
      false
    )
  $$,
  'B1 an authorized AAL2 owner revokes the manager role assignment'
);

-- The manager's ORIGINAL session, unchanged, attempts the same mutation again.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Fourth',
      'p1r5-a-fourth',
      'P1R5-A4',
      '5 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'not authorized to create branch',
  'B2 the same open session cannot mutate after its authorization was revoked'
);

select extensions.is(
  (
    select count(*)::integer
    from public.branches
    where organization_id = '82000000-0000-0000-0000-000000000001'
      and code = 'P1R5-A4'
  ),
  0,
  'B3 the refused mutation wrote nothing'
);

/* -------------------------------------------------------------------------- */
/* C. Membership suspended mid-session, then a protected operation             */
/* -------------------------------------------------------------------------- */

-- Restore the manager's authorization so the suspension, not the missing role,
-- is what section C actually tests.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '84000000-0000-0000-0000-000000000002',
      (select id from public.roles where organization_id is null and code = 'ADMIN'),
      null,
      true
    )
  $$,
  'C0 setup: the manager role assignment is restored'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Fifth',
      'p1r5-a-fifth',
      'P1R5-A5',
      '6 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'C1 control: the reauthorized manager can mutate again'
);

-- The owner suspends the manager mid-session.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.update_organization_member_status(
      '84000000-0000-0000-0000-000000000002',
      'suspended'
    )
  $$,
  'C2 an authorized AAL2 owner suspends the manager'
);

-- The suspended manager's ORIGINAL session, unchanged.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Sixth',
      'p1r5-a-sixth',
      'P1R5-A6',
      '7 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'not authorized to create branch',
  'C3 a suspended member cannot mutate in a session opened while active'
);

select extensions.is(
  (select count(*)::integer from public.organizations),
  0,
  'C4 a suspended member reads no organization row in the open session'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  0,
  'C5 a suspended member reads no branch row in the open session'
);

select extensions.is(
  (select count(*)::integer from public.audit_events),
  0,
  'C6 a suspended member reads no audit history in the open session'
);

/* -------------------------------------------------------------------------- */
/* D. Invitation revocation lifecycle                                          */
/* -------------------------------------------------------------------------- */

-- The invitation RPCs are server-only (service_role EXECUTE, file 8). They are
-- invoked here in the elevated test context, exactly as the server action does.
reset role;

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '86000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000001',
      '82000000-0000-0000-0000-000000000001',
      'invitee-a@p1r5.example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '83000000-0000-0000-0000-000000000002'
    )
  $$,
  'D0 an authorized owner reserves a branch-scoped invitation'
);

select extensions.ok(
  public.finalize_workforce_invitation(
    '86000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000006'
  ) is not null,
  'D1 finalization binds the invitation to the Auth identity'
);

select extensions.is(
  (
    select status
    from private.workforce_invitations
    where id = '86000000-0000-0000-0000-000000000001'
  ),
  'pending',
  'D2 the bound invitation is pending'
);

-- A member with no user.invite permission cannot revoke it.
select extensions.throws_ok(
  $$
    select public.revoke_workforce_invitation(
      '81000000-0000-0000-0000-000000000005',
      '86000000-0000-0000-0000-000000000001'
    )
  $$,
  'actor is not authorized to revoke this invitation',
  'D3 a member without user.invite cannot revoke an invitation'
);

-- The Org B owner holds user.invite — in Org B. Cross-tenant revocation must be
-- refused on the invitation's organization, not on the actor's own.
select extensions.throws_ok(
  $$
    select public.revoke_workforce_invitation(
      '81000000-0000-0000-0000-000000000004',
      '86000000-0000-0000-0000-000000000001'
    )
  $$,
  'actor is not authorized to revoke this invitation',
  'D4 an Org B administrator cannot revoke an Org A invitation'
);

select extensions.is(
  (
    select status
    from private.workforce_invitations
    where id = '86000000-0000-0000-0000-000000000001'
  ),
  'pending',
  'D5 refused revocations changed nothing'
);

select extensions.ok(
  public.revoke_workforce_invitation(
    '81000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001'
  ),
  'D6 the authorized inviter revokes the invitation'
);

select extensions.is(
  (
    select status
    from private.workforce_invitations
    where id = '86000000-0000-0000-0000-000000000001'
  ),
  'revoked',
  'D7 revocation is recorded on the invitation'
);

select extensions.is(
  (
    select membership_status
    from public.organization_members
    where organization_id = '82000000-0000-0000-0000-000000000001'
      and user_id = '81000000-0000-0000-0000-000000000006'
  ),
  'removed',
  'D8 revocation removes the invited membership'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '82000000-0000-0000-0000-000000000001'
      and action = 'membership.invitation_revoked'
      and actor_user_id = '81000000-0000-0000-0000-000000000001'
  ),
  1,
  'D9 revocation writes exactly one audit event'
);

select extensions.is(
  public.accept_workforce_invitation(
    '81000000-0000-0000-0000-000000000006',
    'Synthetic',
    'Invitee'
  ),
  'NOT_AVAILABLE',
  'D10 a revoked invitation cannot be accepted by its bound identity'
);

select extensions.isnt(
  (
    select membership_status
    from public.organization_members
    where organization_id = '82000000-0000-0000-0000-000000000001'
      and user_id = '81000000-0000-0000-0000-000000000006'
  ),
  'active',
  'D11 the refused acceptance activated nothing'
);

select extensions.ok(
  not public.revoke_workforce_invitation(
    '81000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001'
  ),
  'D12 a revoked invitation cannot be revoked a second time'
);

select extensions.ok(
  not public.revoke_workforce_invitation(
    '81000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000009'
  ),
  'D13 revoking an unknown invitation reports no effect rather than failing open'
);

/* -------------------------------------------------------------------------- */
/* E. Stale, downgraded, and absent AAL claims                                 */
/* -------------------------------------------------------------------------- */

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Seventh',
      'p1r5-a-seventh',
      'P1R5-A7',
      '8 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  'E0 control: the AAL2 owner can perform a step-up-gated mutation'
);

-- The same session, downgraded. A step-up satisfied earlier must not carry.
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Eighth',
      'p1r5-a-eighth',
      'P1R5-A8',
      '9 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'AAL2 required',
  'E1 an earlier AAL2 operation does not carry the step-up forward'
);

select extensions.throws_ok(
  $$
    select public.set_branch_membership(
      '84000000-0000-0000-0000-000000000005',
      '83000000-0000-0000-0000-000000000001',
      'active'
    )
  $$,
  '42501',
  'AAL2 required',
  'E2 AAL1 cannot change branch membership'
);

-- An absent claim must fail closed, not be treated as "unknown, so allow".
select set_config('request.jwt.claims', '{}', true);

select extensions.throws_ok(
  $$
    select public.update_organization_member_status(
      '84000000-0000-0000-0000-000000000005',
      'suspended'
    )
  $$,
  '42501',
  'AAL2 required',
  'E3 a JWT with no aal claim at all is refused'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '84000000-0000-0000-0000-000000000005',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      null,
      true
    )
  $$,
  '42501',
  'AAL2 required',
  'E4 a JWT with no aal claim cannot assign a role'
);

-- A null-valued claim is likewise not aal2.
select set_config('request.jwt.claims', '{"aal":null}', true);

select extensions.throws_ok(
  $$
    select public.create_branch(
      '82000000-0000-0000-0000-000000000001',
      'P1R5 A Ninth',
      'p1r5-a-ninth',
      'P1R5-A9',
      '10 Synthetic Street',
      'Test City',
      'Test Province'
    )
  $$,
  '42501',
  'AAL2 required',
  'E5 a null aal claim is refused'
);

select extensions.is(
  (
    select count(*)::integer
    from public.branches
    where organization_id = '82000000-0000-0000-0000-000000000001'
      and code in ('P1R5-A4', 'P1R5-A6', 'P1R5-A8', 'P1R5-A9')
  ),
  0,
  'E6 no refused mutation in this suite created a branch'
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
