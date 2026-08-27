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
  ('91000000-0000-0000-0000-000000000001'::uuid, 'owner-a@p201.example.test'),
  ('91000000-0000-0000-0000-000000000002'::uuid, 'dentist-a@p201.example.test'),
  ('91000000-0000-0000-0000-000000000003'::uuid, 'reception-a@p201.example.test'),
  ('91000000-0000-0000-0000-000000000004'::uuid, 'invite-dentist@p201.example.test'),
  ('91000000-0000-0000-0000-000000000005'::uuid, 'invite-reception@p201.example.test'),
  ('91000000-0000-0000-0000-000000000006'::uuid, 'owner-b@p201.example.test'),
  ('91000000-0000-0000-0000-000000000007'::uuid, 'spare-a@p201.example.test'),
  ('91000000-0000-0000-0000-000000000008'::uuid, 'stale-invite@p201.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  (
    '92000000-0000-0000-0000-000000000001',
    'P201 Synthetic Dental A Inc.',
    'P201 Synthetic Dental A',
    'p201-synthetic-a'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    'P201 Synthetic Dental B Inc.',
    'P201 Synthetic Dental B',
    'p201-synthetic-b'
  );

insert into public.branches (
  id,
  organization_id,
  name,
  slug,
  code,
  address_line1,
  city,
  province,
  status,
  archived_at
)
values
  (
    '93000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'P201 A Main',
    'p201-a-main',
    'P201-A1',
    '1 Synthetic Street',
    'Test City',
    'Test Province',
    'active',
    null
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    'P201 A Archived',
    'p201-a-archived',
    'P201-A2',
    '2 Synthetic Street',
    'Test City',
    'Test Province',
    'archived',
    statement_timestamp()
  ),
  (
    '93000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000002',
    'P201 B Main',
    'p201-b-main',
    'P201-B1',
    '3 Synthetic Street',
    'Test City',
    'Test Province',
    'active',
    null
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
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    'active',
    statement_timestamp()
  ),
  (
    '94000000-0000-0000-0000-000000000004',
    '92000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000006',
    'active',
    statement_timestamp()
  ),
  (
    '94000000-0000-0000-0000-000000000005',
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000007',
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
  assignment.organization_id,
  assignment.member_id,
  role.id,
  assignment.user_id
from (values
  (
    '92000000-0000-0000-0000-000000000001'::uuid,
    '94000000-0000-0000-0000-000000000001'::uuid,
    '91000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    '92000000-0000-0000-0000-000000000002'::uuid,
    '94000000-0000-0000-0000-000000000004'::uuid,
    '91000000-0000-0000-0000-000000000006'::uuid
  )
) as assignment(organization_id, member_id, user_id)
join public.roles as role
  on role.organization_id is null
 and role.code = 'OWNER';

insert into public.branch_memberships (
  organization_id,
  branch_id,
  organization_member_id
)
values (
  '92000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000003'
);

insert into public.roles (id, organization_id, code, name, is_system)
values
  (
    '95000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'CUSTOM_PATIENT',
    'Custom Patient Role',
    false
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'FOREIGN_PATIENT',
    'Foreign Patient Role',
    false
  );

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.id in (
    '95000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000002'
  )
  and permission.code in (
    'patient.demographics.read',
    'patient.demographics.write'
  );

select extensions.set_eq(
  $$
    select code
    from public.permissions
    where code like 'patient.%'
  $$,
  $$ values
    ('patient.clinical.read'::text),
    ('patient.clinical.write'::text),
    ('patient.demographics.read'::text),
    ('patient.demographics.write'::text)
  $$,
  'the P2-01 permission catalog contains exactly the planned patient permissions'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where permission.code like 'patient.%'
      and role.organization_id is null
  $$,
  $$ values
    ('ADMIN:patient.clinical.read'::text),
    ('ADMIN:patient.clinical.write'::text),
    ('DENTAL_ASSISTANT:patient.clinical.read'::text),
    ('DENTIST:patient.clinical.read'::text),
    ('DENTIST:patient.clinical.write'::text),
    ('DENTIST:patient.demographics.read'::text),
    ('DENTIST:patient.demographics.write'::text),
    ('OWNER:patient.clinical.read'::text),
    ('OWNER:patient.clinical.write'::text),
    ('OWNER:patient.demographics.read'::text),
    ('OWNER:patient.demographics.write'::text),
    ('RECEPTIONIST:patient.demographics.read'::text),
    ('RECEPTIONIST:patient.demographics.write'::text)
  $$,
  'patient permissions follow the approved clinical + demographics role matrix with OWNER as the highest-authority principal'
);

select extensions.ok(
  private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'patient.demographics.read'
  )
  and private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'patient.demographics.write'
  )
  and private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'patient.clinical.read'
  )
  and private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'patient.clinical.write'
  ),
  'the owner resolves to the full organization-level clinical and demographic permission set'
);

select extensions.ok(
  not private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000002',
    'patient.demographics.read'
  )
  and not private.user_has_permission(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000002',
    'patient.clinical.read'
  ),
  'full owner authority is strictly organization-scoped and never crosses tenants'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.prepare_workforce_invitation(uuid,uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.finalize_workforce_invitation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'browser sessions still cannot execute service-only invitation functions'
);

select extensions.ok(
  public.list_workforce_invitation_options(
    '91000000-0000-0000-0000-000000000001'
  )::text like '%"code": "DENTIST"%'
  and public.list_workforce_invitation_options(
    '91000000-0000-0000-0000-000000000001'
  )::text like '%"code": "RECEPTIONIST"%',
  'an owner-only organization is offered both fixed patient-capable roles'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      ' OWNER-A@P201.EXAMPLE.TEST ',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null
    )
  $$,
  'P0001',
  'actor may not invite their own verified email',
  'an owner cannot invite their current verified email'
);

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000002',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'invite-dentist@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null
    )
  $$,
  'the owner can prepare a dentist invitation as a full-superset principal'
);

select extensions.ok(
  public.finalize_workforce_invitation(
    '96000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000004'
  ) is not null,
  'the owner can finalize a dentist invitation'
);

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000003',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'invite-reception@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '93000000-0000-0000-0000-000000000001'
    )
  $$,
  'the owner can prepare a branch-scoped receptionist invitation'
);

select extensions.ok(
  public.finalize_workforce_invitation(
    '96000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000005'
  ) is not null,
  'the owner can finalize a branch-scoped receptionist invitation'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '92000000-0000-0000-0000-000000000001'
      and actor_user_id = '91000000-0000-0000-0000-000000000001'
      and action = 'membership.invited'
      and entity_type = 'organization_member'
  ),
  2,
  'each successful invitation emits exactly one atomic audit event'
);

select extensions.ok(
  private.can_delegate_role_permissions(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001'
  ),
  'as a full-superset principal, the owner may delegate an organization-owned patient role'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000005',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'spare-a@p201.example.test',
      '95000000-0000-0000-0000-000000000002',
      null
    )
  $$,
  'P0001',
  'role is not available for this organization',
  'the exception never permits a cross-tenant custom role'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000006',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'spare-a@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      '93000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'branch is not available for this organization',
  'the exception never permits a foreign branch'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000007',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'spare-a@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '93000000-0000-0000-0000-000000000002'
    )
  $$,
  'P0001',
  'branch is not available for this organization',
  'the exception never permits an archived branch'
);

insert into public.permissions (id, code, description)
values (
  '97000000-0000-0000-0000-000000000001',
  'p2.synthetic.unowned',
  'Synthetic rollback-bounded permission used to prove fail-closed delegation.'
);

insert into public.role_permissions (role_id, permission_id)
select role.id, '97000000-0000-0000-0000-000000000001'
from public.roles as role
where role.organization_id is null
  and role.code = 'DENTIST';

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000008',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'spare-a@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null
    )
  $$,
  'P0001',
  'role contains permissions the actor may not delegate',
  'one additional missing permission makes the fixed-role exception fail closed'
);

delete from public.role_permissions
where permission_id = '97000000-0000-0000-0000-000000000001';

delete from public.permissions
where id = '97000000-0000-0000-0000-000000000001';

insert into private.workforce_invitations (
  id,
  organization_id,
  email,
  role_id,
  invited_by_user_id,
  expires_at
)
select
  '96000000-0000-0000-0000-000000000009',
  '92000000-0000-0000-0000-000000000001',
  'owner-a@p201.example.test',
  role.id,
  '91000000-0000-0000-0000-000000000001',
  statement_timestamp() + interval '48 hours'
from public.roles as role
where role.organization_id is null
  and role.code = 'DENTIST';

select extensions.throws_ok(
  $$
    select public.finalize_workforce_invitation(
      '96000000-0000-0000-0000-000000000009',
      '91000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'inviter cannot be the invited Auth user',
  'finalization independently rejects self-assignment by Auth user ID'
);

select extensions.lives_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000010',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'stale-invite@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null
    )
  $$,
  'an invitation can be prepared while recipient identity data matches'
);

update auth.users
set email = 'changed-invite@p201.example.test'
where id = '91000000-0000-0000-0000-000000000008';

select extensions.throws_ok(
  $$
    select public.finalize_workforce_invitation(
      '96000000-0000-0000-0000-000000000010',
      '91000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000008'
    )
  $$,
  'P0001',
  'invited Auth identity does not match the intended recipient',
  'finalization rechecks the live Auth email'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000002',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null,
      true
    )
  $$,
  'an AAL2 owner can directly assign an organization-wide dentist role'
);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000003',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      '93000000-0000-0000-0000-000000000001',
      true
    )
  $$,
  'an AAL2 owner can directly assign a branch-scoped receptionist role'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '92000000-0000-0000-0000-000000000001'
      and actor_user_id = '91000000-0000-0000-0000-000000000001'
      and action = 'member_role.assigned'
  ),
  2,
  'each successful direct assignment emits exactly one atomic audit event'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000001',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null,
      true
    )
  $$,
  '42501',
  'role assignment is not authorized',
  'the anti-self rule still prevents an owner from assigning a role to their own membership'
);

select extensions.lives_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000005',
      '95000000-0000-0000-0000-000000000001',
      null,
      true
    )
  $$,
  'an AAL2 owner can directly assign an organization-owned role as a full-superset principal'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000005',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      '93000000-0000-0000-0000-000000000003',
      true
    )
  $$,
  '42501',
  'branch-scoped role requires active branch access',
  'direct assignment does not permit a cross-tenant branch'
);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000005',
      '95000000-0000-0000-0000-000000000002',
      null,
      true
    )
  $$,
  '42501',
  'role assignment is not authorized',
  'direct assignment does not permit an organization-owned role from another tenant'
);

select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$
    select public.set_member_role(
      '94000000-0000-0000-0000-000000000005',
      (select id from public.roles where organization_id is null and code = 'RECEPTIONIST'),
      null,
      true
    )
  $$,
  '42501',
  'AAL2 required',
  'AAL1 cannot use direct patient-capable role assignment'
);

reset role;

select extensions.ok(
  private.can_delegate_role_permissions(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    (select id from public.roles where organization_id is null and code = 'DENTIST')
  ),
  'control: the live predicate permits the bounded fixed-role exception'
);

delete from public.role_permissions
where role_id = (
    select id from public.roles
    where organization_id is null and code = 'OWNER'
  )
  and permission_id = (
    select id from public.permissions
    where code = 'patient.clinical.write'
  );

select extensions.ok(
  not private.can_delegate_role_permissions(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    (select id from public.roles where organization_id is null and code = 'DENTIST')
  ),
  'revoking a permission the target role requires is reflected by the delegation predicate on the next statement'
);

select extensions.throws_ok(
  $$
    select public.prepare_workforce_invitation(
      '96000000-0000-0000-0000-000000000011',
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      'spare-a@p201.example.test',
      (select id from public.roles where organization_id is null and code = 'DENTIST'),
      null
    )
  $$,
  'P0001',
  'role contains permissions the actor may not delegate',
  'the invitation path also observes the permission revocation immediately'
);

select extensions.is(
  (
    select count(*)::integer
    from private.workforce_invitations
    where id in (
      '96000000-0000-0000-0000-000000000001',
      '96000000-0000-0000-0000-000000000004',
      '96000000-0000-0000-0000-000000000005',
      '96000000-0000-0000-0000-000000000006',
      '96000000-0000-0000-0000-000000000007',
      '96000000-0000-0000-0000-000000000008',
      '96000000-0000-0000-0000-000000000011'
    )
  ),
  0,
  'failed delegation checks create no invitation reservation'
);

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where organization_id = '92000000-0000-0000-0000-000000000001'
      and actor_user_id = '91000000-0000-0000-0000-000000000001'
      and action in ('membership.invited', 'member_role.assigned')
  ),
  5,
  'failed authorization emits no success audit event'
);

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
