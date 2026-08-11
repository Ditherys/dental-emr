begin;

select extensions.plan(23);

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
  ('10000000-0000-0000-0000-000000000001'::uuid, 'owner-a@example.test'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'admin-a@example.test'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'reception-a@example.test'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'invitee-a@example.test'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'bootstrap@example.test'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'expired@example.test'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'branch-admin@example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (
  id,
  legal_name,
  business_name,
  slug
)
values
  ('20000000-0000-0000-0000-000000000001', 'Synthetic Dental A Inc.', 'Synthetic Dental A', 'p108-test-a'),
  ('20000000-0000-0000-0000-000000000002', 'Synthetic Dental B Inc.', 'Synthetic Dental B', 'p108-test-b'),
  ('20000000-0000-0000-0000-000000000003', 'Synthetic Dental Bootstrap Inc.', 'Synthetic Dental Bootstrap', 'p108-test-bootstrap');

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
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Synthetic A Main',
    'main',
    'A-MAIN',
    '1 Synthetic Street',
    'Test City',
    'Test Province'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Synthetic B Main',
    'main',
    'B-MAIN',
    '2 Synthetic Street',
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
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'active',
    statement_timestamp()
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'active',
    statement_timestamp()
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'active',
    statement_timestamp()
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000007',
    'active',
    statement_timestamp()
  );

insert into public.branch_memberships (
  organization_id,
  branch_id,
  organization_member_id
)
values (
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000004'
);

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id
)
select
  '20000000-0000-0000-0000-000000000001',
  assignment.member_id,
  role.id
from (values
  ('40000000-0000-0000-0000-000000000001'::uuid, 'OWNER'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'ADMIN'),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'RECEPTIONIST')
) as assignment(member_id, role_code)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

insert into public.member_roles (
  organization_id,
  organization_member_id,
  role_id,
  branch_id
)
select
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000004',
  role.id,
  '30000000-0000-0000-0000-000000000001'
from public.roles as role
where role.organization_id is null
  and role.code = 'ADMIN';

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.prepare_workforce_invitation(uuid,uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot call the invitation preparation RPC'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.accept_workforce_invitation(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot call the elevated invitation acceptance RPC directly'
);

select extensions.ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated cannot access the private invitation schema'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      'blocked@example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'actor is not authorized to invite workforce users',
  'a receptionist cannot forge an invitation call'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000008',
      '10000000-0000-0000-0000-000000000007',
      '20000000-0000-0000-0000-000000000001',
      'branch-admin-invite@example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'actor is not authorized to invite workforce users',
  'a branch-scoped admin cannot exercise organization-wide invite authority'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'cross-tenant@example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '30000000-0000-0000-0000-000000000002'
    )
  $$,
  'P0001',
  'branch is not available for this organization',
  'an Org A owner cannot bind an Org B branch'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'owner-escalation@example.test',
      (select id from public.roles where organization_id is null and code = 'OWNER'),
      null
    )
  $$,
  'P0001',
  'actor may not assign this role',
  'an admin cannot invite an owner without role management permission'
);

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'invitee-a@example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  'an authorized owner can reserve a branch-scoped invitation'
);

select extensions.ok(
  public.finalize_workforce_invitation(
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004'
  ) is not null,
  'finalization creates the inactive member authorization rows'
);

select extensions.is(
  (
    select membership_status
    from public.organization_members
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000004'
  ),
  'invited',
  'a finalized invitation is not an active membership'
);

select extensions.ok(
  exists (
    select 1
    from public.branch_memberships as branch_membership
    join public.organization_members as organization_member
      on organization_member.id = branch_membership.organization_member_id
    where organization_member.user_id = '10000000-0000-0000-0000-000000000004'
      and branch_membership.organization_id = '20000000-0000-0000-0000-000000000001'
      and branch_membership.branch_id = '30000000-0000-0000-0000-000000000001'
  ),
  'finalization creates only the intended same-tenant branch membership'
);

select extensions.ok(
  exists (
    select 1
    from public.member_roles as member_role
    join public.organization_members as organization_member
      on organization_member.id = member_role.organization_member_id
    join public.roles as role
      on role.id = member_role.role_id
    where organization_member.user_id = '10000000-0000-0000-0000-000000000004'
      and role.code = 'RECEPTIONIST'
      and member_role.branch_id = '30000000-0000-0000-0000-000000000001'
  ),
  'finalization assigns only the intended role and scope'
);

select extensions.is(
  public.accept_workforce_invitation(
    '10000000-0000-0000-0000-000000000004',
    'Synthetic',
    'Invitee'
  ),
  'ACCEPTED',
  'the bound Auth identity can accept once'
);

select extensions.is(
  (
    select membership_status
    from public.organization_members
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000004'
  ),
  'active',
  'acceptance activates the invited membership'
);

select extensions.ok(
  exists (
    select 1
    from public.profiles
    where user_id = '10000000-0000-0000-0000-000000000004'
      and first_name = 'Synthetic'
      and last_name = 'Invitee'
  ),
  'acceptance creates the invited user profile'
);

select extensions.is(
  public.accept_workforce_invitation(
    '10000000-0000-0000-0000-000000000004',
    'Synthetic',
    'Invitee'
  ),
  'NOT_AVAILABLE',
  'an accepted invitation cannot be replayed'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and action in ('membership.invited', 'membership.activated')
      and entity_type = 'organization_member'
  ),
  2,
  'invitation and activation produce append-oriented audit events'
);

select extensions.lives_ok(
  $$
    select public.prepare_first_owner_invitation(
      '50000000-0000-0000-0000-000000000005',
      '20000000-0000-0000-0000-000000000003',
      'bootstrap@example.test'
    )
  $$,
  'first-owner bootstrap can reserve an empty organization once'
);

select extensions.throws_ok(
  $$
    select public.prepare_first_owner_invitation(
      '50000000-0000-0000-0000-000000000006',
      '20000000-0000-0000-0000-000000000003',
      'second-bootstrap@example.test'
    )
  $$,
  'P0001',
  'organization already has an active bootstrap invitation',
  'a second active first-owner bootstrap is rejected'
);

select extensions.ok(
  public.finalize_workforce_invitation(
    '50000000-0000-0000-0000-000000000005',
    null,
    '10000000-0000-0000-0000-000000000005'
  ) is not null,
  'first-owner finalization creates an invited owner without a forged actor'
);

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '50000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'expired@example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      null
    );
    select public.finalize_workforce_invitation(
      '50000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000006'
    );
    update private.workforce_invitations
    set created_at = statement_timestamp() - interval '3 days',
        expires_at = statement_timestamp() - interval '1 day'
    where id = '50000000-0000-0000-0000-000000000007';
  $$,
  'an invitation can reach an expired pending state'
);

select extensions.is(
  public.accept_workforce_invitation(
    '10000000-0000-0000-0000-000000000006',
    'Expired',
    'Invitee'
  ),
  'EXPIRED',
  'an expired invitation cannot activate membership'
);

select extensions.is(
  (
    select membership_status
    from public.organization_members
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000006'
  ),
  'removed',
  'expiration removes the inactive invited membership'
);

select * from extensions.finish();

rollback;
