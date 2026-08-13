-- P1-12 synthetic foundation seed.
--
-- These records are fictional, deterministic, and limited to the two-tenant
-- security graph approved by the Phase 1 plan. Auth rows are deliberately
-- non-login placeholders for database/RLS testing: they have no password,
-- confirmed email, session, factor, or auth identity.

begin;

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
  updated_at,
  -- Supabase Auth (GoTrue) scans these columns into non-nullable Go strings.
  -- A NULL in any of them makes the Admin API fail with "Database error
  -- finding users" for the WHOLE project, not just for the offending row —
  -- which breaks user listing, the invitation admin calls, and the E2E
  -- identity provisioning script. Empty string is what GoTrue itself writes.
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
select
  synthetic_user.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  synthetic_user.email,
  '',
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"fixture":"p1-12-synthetic"}'::jsonb,
  '2026-01-01 00:00:00+08'::timestamptz,
  '2026-01-01 00:00:00+08'::timestamptz,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ''
from (values
  ('12000000-0000-0000-0000-000000000001'::uuid, 'org-a-owner@p112.example.test'),
  ('12000000-0000-0000-0000-000000000002'::uuid, 'org-a-admin@p112.example.test'),
  ('12000000-0000-0000-0000-000000000003'::uuid, 'org-a-dentist@p112.example.test'),
  ('12000000-0000-0000-0000-000000000004'::uuid, 'org-a-receptionist@p112.example.test'),
  ('12000000-0000-0000-0000-000000000005'::uuid, 'org-a-assistant@p112.example.test'),
  ('12000000-0000-0000-0000-000000000006'::uuid, 'org-a-visiting-specialist@p112.example.test'),
  ('12000000-0000-0000-0000-000000000007'::uuid, 'org-b-owner@p112.example.test'),
  ('12000000-0000-0000-0000-000000000008'::uuid, 'org-b-dentist@p112.example.test'),
  ('12000000-0000-0000-0000-000000000009'::uuid, 'org-a-suspended@p112.example.test')
) as synthetic_user(id, email)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at,
  -- Repairs a project already seeded before this was fixed.
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change = excluded.email_change,
  email_change_token_new = excluded.email_change_token_new,
  email_change_token_current = excluded.email_change_token_current,
  phone_change = excluded.phone_change,
  phone_change_token = excluded.phone_change_token,
  reauthentication_token = excluded.reauthentication_token;

insert into public.organizations (
  id,
  legal_name,
  business_name,
  slug,
  status,
  country_code,
  default_timezone,
  default_currency
)
values
  (
    '22000000-0000-0000-0000-000000000001',
    'SmileLab Demo Dental (Synthetic)',
    'SmileLab Demo Dental',
    'smilelab-demo-dental',
    'active',
    'PH',
    'Asia/Manila',
    'PHP'
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    'Other Dental Demo (Synthetic)',
    'Other Dental Demo',
    'other-dental-demo',
    'active',
    'PH',
    'Asia/Manila',
    'PHP'
  )
on conflict (id) do update
set
  legal_name = excluded.legal_name,
  business_name = excluded.business_name,
  slug = excluded.slug,
  status = excluded.status,
  country_code = excluded.country_code,
  default_timezone = excluded.default_timezone,
  default_currency = excluded.default_currency,
  archived_at = null;

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
  country_code,
  timezone,
  website_visible
)
values
  (
    '32000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Demo Main',
    'demo-main',
    'DEMO-A1',
    'active',
    '100 Example Avenue',
    'Synthetic City',
    'Demo Province',
    'PH',
    'Asia/Manila',
    true
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000001',
    'Demo Second',
    'demo-second',
    'DEMO-A2',
    'active',
    '200 Example Avenue',
    'Synthetic City',
    'Demo Province',
    'PH',
    'Asia/Manila',
    true
  ),
  (
    '32000000-0000-0000-0000-000000000003',
    '22000000-0000-0000-0000-000000000002',
    'Demo Branch',
    'demo-branch',
    'DEMO-B1',
    'active',
    '300 Example Avenue',
    'Synthetic City',
    'Demo Province',
    'PH',
    'Asia/Manila',
    true
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  slug = excluded.slug,
  code = excluded.code,
  status = excluded.status,
  address_line1 = excluded.address_line1,
  city = excluded.city,
  province = excluded.province,
  country_code = excluded.country_code,
  timezone = excluded.timezone,
  website_visible = excluded.website_visible,
  archived_at = null;

insert into public.profiles (
  user_id,
  display_name,
  first_name,
  last_name
)
values
  ('12000000-0000-0000-0000-000000000001', 'Org A Owner (Synthetic)', 'Org A', 'Owner'),
  ('12000000-0000-0000-0000-000000000002', 'Org A Admin (Synthetic)', 'Org A', 'Admin'),
  ('12000000-0000-0000-0000-000000000003', 'Org A Dentist (Synthetic)', 'Org A', 'Dentist'),
  ('12000000-0000-0000-0000-000000000004', 'Org A Receptionist (Synthetic)', 'Org A', 'Receptionist'),
  ('12000000-0000-0000-0000-000000000005', 'Org A Assistant (Synthetic)', 'Org A', 'Assistant'),
  ('12000000-0000-0000-0000-000000000006', 'Org A Visiting Specialist (Synthetic)', 'Org A', 'Visiting Specialist'),
  ('12000000-0000-0000-0000-000000000007', 'Org B Owner (Synthetic)', 'Org B', 'Owner'),
  ('12000000-0000-0000-0000-000000000008', 'Org B Dentist (Synthetic)', 'Org B', 'Dentist'),
  ('12000000-0000-0000-0000-000000000009', 'Suspended Org A User (Synthetic)', 'Suspended Org A', 'User')
on conflict (user_id) do update
set
  display_name = excluded.display_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name;

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  membership_status,
  joined_at,
  suspended_at
)
values
  ('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000003', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000004', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000005', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000006', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000007', '22000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000007', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000008', '22000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000008', 'active', '2026-01-01 00:00:00+08', null),
  ('42000000-0000-0000-0000-000000000009', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000009', 'suspended', '2026-01-01 00:00:00+08', '2026-01-02 00:00:00+08')
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  user_id = excluded.user_id,
  membership_status = excluded.membership_status,
  joined_at = excluded.joined_at,
  suspended_at = excluded.suspended_at;

insert into public.branch_memberships (
  id,
  organization_id,
  branch_id,
  organization_member_id,
  access_status,
  granted_at,
  revoked_at
)
values
  ('52000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000003', 'active', '2026-01-01 00:00:00+08', null),
  ('52000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000004', 'active', '2026-01-01 00:00:00+08', null),
  ('52000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000005', 'active', '2026-01-01 00:00:00+08', null),
  ('52000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000006', 'active', '2026-01-01 00:00:00+08', null),
  ('52000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000008', 'active', '2026-01-01 00:00:00+08', null),
  ('52000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000009', 'active', '2026-01-01 00:00:00+08', null)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  branch_id = excluded.branch_id,
  organization_member_id = excluded.organization_member_id,
  access_status = excluded.access_status,
  granted_at = excluded.granted_at,
  revoked_at = excluded.revoked_at;

insert into public.member_roles (
  id,
  organization_id,
  organization_member_id,
  role_id,
  branch_id,
  assigned_by,
  assigned_at
)
select
  assignment.id,
  assignment.organization_id,
  assignment.organization_member_id,
  role.id,
  assignment.branch_id,
  assignment.assigned_by,
  '2026-01-01 00:00:00+08'::timestamptz
from (values
  ('62000000-0000-0000-0000-000000000001'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000001'::uuid, 'OWNER', null::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000002'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000002'::uuid, 'ADMIN', null::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000003'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000003'::uuid, 'DENTIST', '32000000-0000-0000-0000-000000000001'::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000004'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000004'::uuid, 'RECEPTIONIST', '32000000-0000-0000-0000-000000000001'::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000005'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000005'::uuid, 'DENTAL_ASSISTANT', '32000000-0000-0000-0000-000000000001'::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000006'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000006'::uuid, 'VISITING_SPECIALIST', '32000000-0000-0000-0000-000000000002'::uuid, '12000000-0000-0000-0000-000000000001'::uuid),
  ('62000000-0000-0000-0000-000000000007'::uuid, '22000000-0000-0000-0000-000000000002'::uuid, '42000000-0000-0000-0000-000000000007'::uuid, 'OWNER', null::uuid, '12000000-0000-0000-0000-000000000007'::uuid),
  ('62000000-0000-0000-0000-000000000008'::uuid, '22000000-0000-0000-0000-000000000002'::uuid, '42000000-0000-0000-0000-000000000008'::uuid, 'DENTIST', '32000000-0000-0000-0000-000000000003'::uuid, '12000000-0000-0000-0000-000000000007'::uuid),
  ('62000000-0000-0000-0000-000000000009'::uuid, '22000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000009'::uuid, 'DENTIST', '32000000-0000-0000-0000-000000000001'::uuid, '12000000-0000-0000-0000-000000000001'::uuid)
) as assignment(
  id,
  organization_id,
  organization_member_id,
  role_code,
  branch_id,
  assigned_by
)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  organization_member_id = excluded.organization_member_id,
  role_id = excluded.role_id,
  branch_id = excluded.branch_id,
  assigned_by = excluded.assigned_by,
  assigned_at = excluded.assigned_at;

do $$
begin
  if (
    select count(*)
    from public.member_roles
    where id::text like '62000000-0000-0000-0000-00000000000%'
  ) <> 9 then
    raise exception 'P1-12 seed could not resolve every required system role';
  end if;
end;
$$;

commit;
