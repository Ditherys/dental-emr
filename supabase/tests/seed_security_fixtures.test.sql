begin;

select extensions.no_plan();

-- This suite verifies the committed P1-12 seed after it has been loaded into a
-- designated non-production database. It never creates login credentials and
-- every assertion is limited to the deterministic P1-12 UUID namespace.
select extensions.set_eq(
  $$
    select business_name
    from public.organizations
    where id in (
      '22000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000002'
    )
  $$,
  array['SmileLab Demo Dental', 'Other Dental Demo']::text[],
  'the seed contains both required synthetic tenant boundaries'
);

select extensions.set_eq(
  $$
    select organization_id::text || ':' || name
    from public.branches
    where id::text like '32000000-0000-0000-0000-00000000000%'
  $$,
  array[
    '22000000-0000-0000-0000-000000000001:Demo Main',
    '22000000-0000-0000-0000-000000000001:Demo Second',
    '22000000-0000-0000-0000-000000000002:Demo Branch'
  ]::text[],
  'the seed contains two Org A branches and one Org B branch'
);

select extensions.is(
  (
    select count(*)::integer
    from auth.users
    where id::text like '12000000-0000-0000-0000-00000000000%'
      and email like '%@p112.example.test'
      and encrypted_password = ''
      and email_confirmed_at is null
      and raw_user_meta_data ->> 'fixture' = 'p1-12-synthetic'
  ),
  9,
  'all nine personas use synthetic non-login Auth placeholders'
);

select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where user_id::text like '12000000-0000-0000-0000-00000000000%'
      and display_name like '%(Synthetic)'
  ),
  9,
  'all nine personas have visibly synthetic profiles'
);

select extensions.set_eq(
  $$
    select
      profile.display_name || ':' ||
      organization_member.membership_status || ':' ||
      role.code || ':' ||
      coalesce(branch.name, 'ALL')
    from public.organization_members as organization_member
    join public.profiles as profile
      on profile.user_id = organization_member.user_id
    join public.member_roles as member_role
      on member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
    left join public.branches as branch
      on branch.id = member_role.branch_id
    where organization_member.id::text like
      '42000000-0000-0000-0000-00000000000%'
  $$,
  array[
    'Org A Owner (Synthetic):active:OWNER:ALL',
    'Org A Admin (Synthetic):active:ADMIN:ALL',
    'Org A Dentist (Synthetic):active:DENTIST:Demo Main',
    'Org A Receptionist (Synthetic):active:RECEPTIONIST:Demo Main',
    'Org A Assistant (Synthetic):active:DENTAL_ASSISTANT:Demo Main',
    'Org A Visiting Specialist (Synthetic):active:VISITING_SPECIALIST:Demo Second',
    'Org B Owner (Synthetic):active:OWNER:ALL',
    'Org B Dentist (Synthetic):active:DENTIST:Demo Branch',
    'Suspended Org A User (Synthetic):suspended:DENTIST:Demo Main'
  ]::text[],
  'every required persona has the intended role and scope fixture'
);

select extensions.is(
  (
    select count(*)::integer
    from public.branch_memberships as branch_membership
    join public.branches as branch
      on branch.id = branch_membership.branch_id
    join public.organization_members as organization_member
      on organization_member.id = branch_membership.organization_member_id
    where branch_membership.id::text like
      '52000000-0000-0000-0000-00000000000%'
      and (
        branch.organization_id <> branch_membership.organization_id
        or organization_member.organization_id <>
          branch_membership.organization_id
      )
  ),
  0,
  'every branch access fixture is tenant-consistent'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.set_eq(
  $$ select business_name from public.organizations $$,
  array['SmileLab Demo Dental']::text[],
  'Org A owner cannot read Org B'
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Main', 'Demo Second']::text[],
  'Org A owner sees both Org A branches and no Org B branch'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  7,
  'Org A owner can manage only the seven Org A memberships'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000002',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Main', 'Demo Second']::text[],
  'Org A admin has organization-wide branch visibility without cross-tenant access'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000003',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Main']::text[],
  'Org A dentist is restricted to the exact assigned branch'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000004',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Main']::text[],
  'Org A receptionist is restricted to the exact assigned branch'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000005',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Main']::text[],
  'Org A assistant is restricted to the exact assigned branch'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000006',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Second']::text[],
  'Org A visiting specialist is restricted to the second branch'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000007',
  true
);

select extensions.set_eq(
  $$ select business_name from public.organizations $$,
  array['Other Dental Demo']::text[],
  'Org B owner cannot read Org A'
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Branch']::text[],
  'Org B owner sees only the Org B branch'
);

select extensions.is(
  (select count(*)::integer from public.organization_members),
  2,
  'Org B owner can manage only the two Org B memberships'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000008',
  true
);

select extensions.set_eq(
  $$ select name from public.branches $$,
  array['Demo Branch']::text[],
  'Org B dentist is restricted to the exact Org B branch'
);

select set_config(
  'request.jwt.claim.sub',
  '12000000-0000-0000-0000-000000000009',
  true
);

select extensions.is(
  (select count(*)::integer from public.organizations),
  0,
  'suspended Org A user cannot read the organization'
);

select extensions.is(
  (select count(*)::integer from public.branches),
  0,
  'suspended Org A user cannot read a branch despite retained fixture assignments'
);

select extensions.is(
  (
    select count(*)::integer
    from public.organization_members
    where membership_status = 'suspended'
  ),
  1,
  'suspended user can see only their own suspended membership record'
);

reset role;

select extensions.ok(
  not has_table_privilege('anon', 'public.organizations', 'SELECT'),
  'anonymous access remains fail-closed at the grant layer with the seed loaded'
);

select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from extensions.finish();

rollback;
