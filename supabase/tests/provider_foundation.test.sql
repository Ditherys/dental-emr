begin;

select extensions.no_plan();

-- Synthetic-only P3-02 graph. The suite is intentionally authored before the
-- migration: public.providers is the first desired relation touched below, so
-- the RED run fails because the provider foundation does not exist yet.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  actor.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  actor.email,
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"fixture":"p3-02-synthetic"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('b3010000-0000-0000-0000-000000000001'::uuid, 'owner-a@p302.example.test'),
  ('b3010000-0000-0000-0000-000000000002'::uuid, 'dentist-a@p302.example.test'),
  ('b3010000-0000-0000-0000-000000000003'::uuid, 'suspended-admin-a@p302.example.test'),
  ('b3010000-0000-0000-0000-000000000004'::uuid, 'owner-b@p302.example.test'),
  ('b3010000-0000-0000-0000-000000000005'::uuid, 'branch-owner-a@p302.example.test')
) as actor(id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('b3020000-0000-0000-0000-000000000001', 'P302 Synthetic A Inc.', 'P302 Synthetic A', 'p302-synthetic-a'),
  ('b3020000-0000-0000-0000-000000000002', 'P302 Synthetic B Inc.', 'P302 Synthetic B', 'p302-synthetic-b');

insert into public.branches (
  id, organization_id, name, slug, code, address_line1, city, province
)
values
  ('b3030000-0000-0000-0000-000000000001', 'b3020000-0000-0000-0000-000000000001', 'P302 A Main', 'p302-a-main', 'P302-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('b3030000-0000-0000-0000-000000000002', 'b3020000-0000-0000-0000-000000000002', 'P302 B Main', 'p302-b-main', 'P302-B1', '2 Synthetic Street', 'Test City', 'Test Province');

insert into public.organization_members (
  id, organization_id, user_id, membership_status, joined_at, suspended_at
)
values
  ('b3040000-0000-0000-0000-000000000001', 'b3020000-0000-0000-0000-000000000001', 'b3010000-0000-0000-0000-000000000001', 'active', statement_timestamp(), null),
  ('b3040000-0000-0000-0000-000000000002', 'b3020000-0000-0000-0000-000000000001', 'b3010000-0000-0000-0000-000000000002', 'active', statement_timestamp(), null),
  ('b3040000-0000-0000-0000-000000000003', 'b3020000-0000-0000-0000-000000000001', 'b3010000-0000-0000-0000-000000000003', 'suspended', statement_timestamp(), statement_timestamp()),
  ('b3040000-0000-0000-0000-000000000004', 'b3020000-0000-0000-0000-000000000002', 'b3010000-0000-0000-0000-000000000004', 'active', statement_timestamp(), null),
  ('b3040000-0000-0000-0000-000000000005', 'b3020000-0000-0000-0000-000000000001', 'b3010000-0000-0000-0000-000000000005', 'active', statement_timestamp(), null);

insert into public.branch_memberships (
  organization_id, branch_id, organization_member_id, access_status
)
values (
  'b3020000-0000-0000-0000-000000000001',
  'b3030000-0000-0000-0000-000000000001',
  'b3040000-0000-0000-0000-000000000005',
  'active'
);

insert into public.member_roles (
  organization_id, organization_member_id, role_id, branch_id, assigned_by
)
select
  assignment.organization_id,
  assignment.organization_member_id,
  role.id,
  assignment.branch_id,
  assignment.user_id
from (values
  ('b3020000-0000-0000-0000-000000000001'::uuid, 'b3040000-0000-0000-0000-000000000001'::uuid, 'OWNER'::text, null::uuid, 'b3010000-0000-0000-0000-000000000001'::uuid),
  ('b3020000-0000-0000-0000-000000000001'::uuid, 'b3040000-0000-0000-0000-000000000002'::uuid, 'DENTIST'::text, null::uuid, 'b3010000-0000-0000-0000-000000000002'::uuid),
  ('b3020000-0000-0000-0000-000000000001'::uuid, 'b3040000-0000-0000-0000-000000000003'::uuid, 'ADMIN'::text, null::uuid, 'b3010000-0000-0000-0000-000000000003'::uuid),
  ('b3020000-0000-0000-0000-000000000002'::uuid, 'b3040000-0000-0000-0000-000000000004'::uuid, 'OWNER'::text, null::uuid, 'b3010000-0000-0000-0000-000000000004'::uuid),
  ('b3020000-0000-0000-0000-000000000001'::uuid, 'b3040000-0000-0000-0000-000000000005'::uuid, 'OWNER'::text, 'b3030000-0000-0000-0000-000000000001'::uuid, 'b3010000-0000-0000-0000-000000000001'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

insert into public.providers (
  id, organization_id, linked_user_id, first_name, last_name, provider_type
)
values
  ('b3050000-0000-0000-0000-000000000001', 'b3020000-0000-0000-0000-000000000001', 'b3010000-0000-0000-0000-000000000002', 'Provider', 'A', 'REGULAR'),
  ('b3050000-0000-0000-0000-000000000002', 'b3020000-0000-0000-0000-000000000002', 'b3010000-0000-0000-0000-000000000004', 'Provider', 'B', 'VISITING'),
  ('b3050000-0000-0000-0000-000000000003', 'b3020000-0000-0000-0000-000000000001', null, 'Referral', 'Synthetic', 'EXTERNAL_REFERRAL');

insert into public.specialties (
  id, organization_id, code, name
)
values
  ('b3060000-0000-0000-0000-000000000001', 'b3020000-0000-0000-0000-000000000001', 'P302_CUSTOM', 'P302 Custom A'),
  ('b3060000-0000-0000-0000-000000000002', 'b3020000-0000-0000-0000-000000000002', 'P302_CUSTOM', 'P302 Custom B');

insert into public.provider_branches (
  organization_id, provider_id, branch_id
)
values
  ('b3020000-0000-0000-0000-000000000001', 'b3050000-0000-0000-0000-000000000001', 'b3030000-0000-0000-0000-000000000001'),
  ('b3020000-0000-0000-0000-000000000002', 'b3050000-0000-0000-0000-000000000002', 'b3030000-0000-0000-0000-000000000002');

insert into public.provider_specialties (
  organization_id, provider_id, specialty_id, is_primary
)
values
  ('b3020000-0000-0000-0000-000000000001', 'b3050000-0000-0000-0000-000000000001', 'b3060000-0000-0000-0000-000000000001', true),
  ('b3020000-0000-0000-0000-000000000002', 'b3050000-0000-0000-0000-000000000002', 'b3060000-0000-0000-0000-000000000002', true);

select extensions.set_eq(
  $$select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('providers', 'specialties', 'provider_branches', 'provider_specialties')$$,
  array['provider_branches', 'provider_specialties', 'providers', 'specialties']::text[],
  'P3-02 creates exactly the four intended provider configuration tables'
);

select extensions.columns_are(
  'public',
  'providers',
  array[
    'id', 'organization_id', 'linked_user_id', 'first_name', 'middle_name',
    'last_name', 'suffix', 'professional_title', 'license_number',
    'contact_phone', 'contact_email', 'provider_type', 'status',
    'website_visible', 'bio', 'version', 'created_at', 'updated_at',
    'archived_at'
  ],
  'providers has only the bounded P3-02 identity and stored-profile columns'
);
select extensions.columns_are(
  'public',
  'specialties',
  array[
    'id', 'organization_id', 'code', 'name', 'is_active', 'created_at',
    'updated_at'
  ],
  'specialties has the global-or-tenant catalog shape'
);
select extensions.columns_are(
  'public',
  'provider_branches',
  array[
    'id', 'organization_id', 'provider_id', 'branch_id', 'is_active',
    'created_at', 'updated_at'
  ],
  'provider branches carries direct tenant ownership and active state'
);
select extensions.columns_are(
  'public',
  'provider_specialties',
  array[
    'id', 'organization_id', 'provider_id', 'specialty_id', 'is_primary',
    'is_active', 'created_at', 'updated_at'
  ],
  'provider specialties carries direct tenant ownership and primary state'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.providers'::regclass,
      'public.specialties'::regclass,
      'public.provider_branches'::regclass,
      'public.provider_specialties'::regclass
    )
      and relrowsecurity
  ),
  4,
  'RLS is enabled on every P3-02 public table'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      (0::oid),
      ((select oid from pg_roles where rolname = 'anon')),
      ((select oid from pg_roles where rolname = 'authenticated')),
      ((select oid from pg_roles where rolname = 'service_role'))
    ) as denied_role(role_oid)
    cross join (values
      ('public.providers'),
      ('public.specialties'),
      ('public.provider_branches'),
      ('public.provider_specialties')
    ) as denied_table(table_name)
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
      ('REFERENCES'), ('TRIGGER')
    ) as denied_privilege(privilege_name)
    where has_table_privilege(
      denied_role.role_oid,
      denied_table.table_name,
      denied_privilege.privilege_name
    )
  ),
  'PUBLIC, anon, authenticated, and service_role have no P3-02 base-table privileges'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      (0::oid),
      ((select oid from pg_roles where rolname = 'anon')),
      ((select oid from pg_roles where rolname = 'authenticated')),
      ((select oid from pg_roles where rolname = 'service_role'))
    ) as denied_role(role_oid)
    cross join (values
      ('private.can_read_provider_configuration(uuid)'),
      ('private.can_manage_provider_configuration(uuid)'),
      ('private.validate_provider_linked_membership()'),
      ('private.protect_specialty_scope()'),
      ('private.validate_provider_specialty_scope()')
    ) as denied_function(function_name)
    where has_function_privilege(
      denied_role.role_oid,
      denied_function.function_name,
      'EXECUTE'
    )
  ),
  'all P3-02 private functions revoke execution from public, browser, and service roles'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as procedure
    where procedure.oid in (
      'private.can_read_provider_configuration(uuid)'::regprocedure,
      'private.can_manage_provider_configuration(uuid)'::regprocedure
    )
      and procedure.prosecdef
      and procedure.provolatile = 's'
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  2,
  'both provider authorization predicates are stable SECURITY DEFINER functions with an empty search path'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as procedure
    where procedure.oid in (
      'private.validate_provider_linked_membership()'::regprocedure,
      'private.protect_specialty_scope()'::regprocedure,
      'private.validate_provider_specialty_scope()'::regprocedure
    )
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  3,
  'every P3-02 trigger function fixes an empty search path'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.providers'::regclass,
      'public.specialties'::regclass,
      'public.provider_branches'::regclass,
      'public.provider_specialties'::regclass
    )
      and polcmd = 'r'
      and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
      and polwithcheck is null
  ),
  4,
  'each P3-02 table has one authenticated SELECT-only policy without a write check'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.providers'::regclass,
      'public.specialties'::regclass,
      'public.provider_branches'::regclass,
      'public.provider_specialties'::regclass
    )
  ),
  4,
  'P3-02 adds no mutation or duplicate policies'
);

select extensions.set_eq(
  $$select code from public.specialties where organization_id is null$$,
  array[
    'ENDODONTICS', 'GENERAL_DENTISTRY', 'ORAL_SURGERY', 'ORTHODONTICS',
    'PEDIATRIC_DENTISTRY', 'PERIODONTICS', 'PROSTHODONTICS'
  ]::text[],
  'the global catalog contains only the seven approved specialty examples'
);

select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.providers'::regclass
    and conname = 'providers_organization_id_id_key'
    and contype = 'u'
), 'providers has a tenant-safe organization/id unique key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.providers'::regclass
    and conname = 'providers_organization_linked_user_fk'
    and contype = 'f'
), 'linked users have a composite same-organization membership foreign key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.provider_branches'::regclass
    and conname = 'provider_branches_organization_provider_fk'
    and contype = 'f'
), 'provider branches has a composite provider tenant foreign key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.provider_branches'::regclass
    and conname = 'provider_branches_organization_branch_fk'
    and contype = 'f'
), 'provider branches has a composite branch tenant foreign key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.provider_specialties'::regclass
    and conname = 'provider_specialties_organization_provider_fk'
    and contype = 'f'
), 'provider specialties has a composite provider tenant foreign key');
select extensions.ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.provider_specialties'::regclass
    and conname = 'provider_specialties_specialty_fk'
  and contype = 'f'
), 'provider specialties has the normal specialty foreign key required for global rows');

select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.providers'::regclass$$,
  array[
    'providers_archive_state_check',
    'providers_bio_bounded_check',
    'providers_contact_email_bounded_check',
    'providers_contact_phone_bounded_check',
    'providers_first_name_bounded_check',
    'providers_last_name_bounded_check',
    'providers_license_number_bounded_check',
    'providers_middle_name_bounded_check',
    'providers_organization_id_fkey',
    'providers_organization_id_id_key',
    'providers_organization_linked_user_fk',
    'providers_pkey',
    'providers_professional_title_bounded_check',
    'providers_status_check',
    'providers_suffix_bounded_check',
    'providers_type_check',
    'providers_version_positive_check'
  ]::text[],
  'the provider relation carries the complete bounded identity, state, and tenant constraint set'
);
select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.specialties'::regclass$$,
  array[
    'specialties_code_bounded_check',
    'specialties_name_bounded_check',
    'specialties_organization_id_fkey',
    'specialties_pkey'
  ]::text[],
  'the specialty relation carries the complete bounded catalog constraint set'
);
select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.provider_branches'::regclass$$,
  array[
    'provider_branches_organization_branch_fk',
    'provider_branches_organization_id_fkey',
    'provider_branches_organization_provider_branch_key',
    'provider_branches_organization_provider_fk',
    'provider_branches_pkey'
  ]::text[],
  'the provider-branch relation carries the complete tenant-safe constraint set'
);
select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.provider_specialties'::regclass$$,
  array[
    'provider_specialties_organization_id_fkey',
    'provider_specialties_organization_provider_fk',
    'provider_specialties_organization_provider_specialty_key',
    'provider_specialties_pkey',
    'provider_specialties_primary_active_check',
    'provider_specialties_specialty_fk'
  ]::text[],
  'the provider-specialty relation carries the complete tenant-safe constraint set'
);

select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and indexname = 'provider_specialties_one_primary_key'
), 'provider specialties has a partial one-primary unique index');
select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and indexname = 'providers_organization_status_name_idx'
), 'providers has the tenant/status/name access-path index');
select extensions.ok(exists (
  select 1 from pg_trigger as trigger
  join pg_proc as procedure on procedure.oid = trigger.tgfoid
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where trigger.tgrelid = 'public.providers'::regclass
    and trigger.tgname = 'providers_set_updated_at'
    and not trigger.tgisinternal
    and namespace.nspname = 'private'
    and procedure.proname = 'set_updated_at'
), 'providers uses the shared updated-at trigger');

select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, first_name, last_name, provider_type
    ) values (
      'b3020000-0000-0000-0000-000000000001', 'Unsupported', 'Type', 'LOCUM'
    )$$,
  '23514',
  'new row for relation "providers" violates check constraint "providers_type_check"',
  'unsupported provider types fail the named allowlist constraint'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, linked_user_id, first_name, last_name, provider_type
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3010000-0000-0000-0000-000000000003',
      'Suspended', 'Link', 'REGULAR'
    )$$,
  '23514',
  'linked provider user must be an active organization member',
  'a suspended same-organization member cannot be linked to a provider'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, linked_user_id, first_name, last_name, provider_type
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3010000-0000-0000-0000-000000000004',
      'Foreign', 'Link', 'REGULAR'
    )$$,
  '23503',
  null,
  'a user cannot be linked through another organization membership'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, first_name, last_name, provider_type
    ) values (
      'b3020000-0000-0000-0000-000000000001', ' ', 'Blank', 'REGULAR'
    )$$,
  '23514',
  'new row for relation "providers" violates check constraint "providers_first_name_bounded_check"',
  'blank provider names fail closed'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, first_name, last_name, provider_type, contact_email
    ) values (
      'b3020000-0000-0000-0000-000000000001', 'Long', 'Contact', 'REGULAR', repeat('x', 255)
    )$$,
  '23514',
  'new row for relation "providers" violates check constraint "providers_contact_email_bounded_check"',
  'overlong provider contact data fails closed'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, first_name, last_name, provider_type, status, archived_at
    ) values (
      'b3020000-0000-0000-0000-000000000001', 'Archive', 'Mismatch',
      'REGULAR', 'archived', null
    )$$,
  '23514',
  'new row for relation "providers" violates check constraint "providers_archive_state_check"',
  'archived provider state requires an archive timestamp'
);

select extensions.throws_ok(
  $$insert into public.provider_branches (
      organization_id, provider_id, branch_id
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000001',
      'b3030000-0000-0000-0000-000000000001'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "provider_branches_organization_provider_branch_key"',
  'duplicate provider-branch relations are rejected'
);
select extensions.throws_ok(
  $$insert into public.provider_branches (
      organization_id, provider_id, branch_id
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000001',
      'b3030000-0000-0000-0000-000000000002'
    )$$,
  '23503',
  null,
  'an Org A provider cannot be assigned to an Org B branch'
);
select extensions.throws_ok(
  $$insert into public.provider_branches (
      organization_id, provider_id, branch_id
    ) values (
      'b3020000-0000-0000-0000-000000000002',
      'b3050000-0000-0000-0000-000000000001',
      'b3030000-0000-0000-0000-000000000002'
    )$$,
  '23503',
  null,
  'a forged organization ID cannot move an Org A provider into Org B'
);

select extensions.lives_ok(
  $$insert into public.provider_specialties (
      organization_id, provider_id, specialty_id, is_primary
    ) select
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000001', id, false
    from public.specialties
    where organization_id is null and code = 'GENERAL_DENTISTRY'$$,
  'Org A may assign an approved global specialty'
);
select extensions.lives_ok(
  $$insert into public.provider_specialties (
      organization_id, provider_id, specialty_id, is_primary
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000003',
      'b3060000-0000-0000-0000-000000000001', false
    )$$,
  'Org A may assign its own custom specialty'
);
select extensions.throws_ok(
  $$insert into public.provider_specialties (
      organization_id, provider_id, specialty_id, is_primary
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000003',
      'b3060000-0000-0000-0000-000000000002', false
    )$$,
  '23503',
  'provider specialty must be global or belong to the provider organization',
  'Org A cannot assign an Org B custom specialty at the integrity boundary'
);
select extensions.throws_ok(
  $$insert into public.provider_specialties (
      organization_id, provider_id, specialty_id, is_primary
    ) select
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000001', id, true
    from public.specialties
    where organization_id is null and code = 'ORTHODONTICS'$$,
  '23505',
  'duplicate key value violates unique constraint "provider_specialties_one_primary_key"',
  'a provider cannot have two primary specialties'
);
select extensions.throws_ok(
  $$insert into public.provider_specialties (
      organization_id, provider_id, specialty_id
    ) values (
      'b3020000-0000-0000-0000-000000000001',
      'b3050000-0000-0000-0000-000000000001',
      'b3060000-0000-0000-0000-000000000001'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "provider_specialties_organization_provider_specialty_key"',
  'duplicate provider-specialty relations are rejected'
);

select extensions.throws_ok(
  $$update public.specialties
    set organization_id = 'b3020000-0000-0000-0000-000000000002'
    where id = 'b3060000-0000-0000-0000-000000000001'$$,
  '23514',
  'specialty organization scope is immutable',
  'custom specialties cannot move between tenants'
);
select extensions.throws_ok(
  $$update public.specialties set name = 'Changed'
    where organization_id is null and code = 'GENERAL_DENTISTRY'$$,
  '23514',
  'global specialties are immutable',
  'global specialties cannot be updated'
);
select extensions.throws_ok(
  $$delete from public.specialties
    where organization_id is null and code = 'ORTHODONTICS'$$,
  '23514',
  'global specialties are immutable',
  'global specialties cannot be deleted'
);
select extensions.throws_ok(
  $$insert into public.specialties (organization_id, code, name)
    values (
      'b3020000-0000-0000-0000-000000000001',
      'P302_CUSTOM', 'Duplicate'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "specialties_organization_code_key"',
  'custom specialty codes are unique within one organization'
);
select extensions.lives_ok(
  $$insert into public.specialties (organization_id, code, name)
    values (
      'b3020000-0000-0000-0000-000000000002',
      'P302_OTHER', 'P302 Other B'
    )$$,
  'a tenant may add another bounded custom specialty'
);

-- Exercise the exact permission predicates as the test owner. Their ACLs stay
-- revoked from browser roles; auth.uid() is still derived from the JWT claim.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000001', true);
select extensions.ok(
  private.can_read_provider_configuration('b3020000-0000-0000-0000-000000000001')
  and private.can_manage_provider_configuration('b3020000-0000-0000-0000-000000000001'),
  'an active Org A organization-wide owner satisfies exact provider read and manage permissions'
);
select extensions.ok(
  not private.can_read_provider_configuration('b3020000-0000-0000-0000-000000000002')
  and not private.can_manage_provider_configuration('b3020000-0000-0000-0000-000000000002'),
  'an Org A owner has no provider configuration permission in Org B'
);
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000002', true);
select extensions.ok(
  not private.can_read_provider_configuration('b3020000-0000-0000-0000-000000000001')
  and not private.can_manage_provider_configuration('b3020000-0000-0000-0000-000000000001'),
  'a dentist receives neither provider configuration permission'
);
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000003', true);
select extensions.ok(
  not private.can_read_provider_configuration('b3020000-0000-0000-0000-000000000001')
  and not private.can_manage_provider_configuration('b3020000-0000-0000-0000-000000000001'),
  'suspended membership invalidates retained provider role grants'
);
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000005', true);
select extensions.ok(
  not private.can_read_provider_configuration('b3020000-0000-0000-0000-000000000001')
  and not private.can_manage_provider_configuration('b3020000-0000-0000-0000-000000000001'),
  'a branch-scoped OWNER assignment cannot satisfy organization-wide provider permissions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$select * from public.providers$$,
  '42501', null,
  'authenticated direct provider SELECT is privilege-denied'
);
select extensions.throws_ok(
  $$insert into public.providers (
      organization_id, first_name, last_name, provider_type
    ) values (
      'b3020000-0000-0000-0000-000000000001', 'Denied', 'Insert', 'REGULAR'
    )$$,
  '42501', null,
  'authenticated direct provider INSERT is privilege-denied'
);
select extensions.throws_ok(
  $$update public.providers set status = 'inactive'
    where id = 'b3050000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'authenticated direct provider UPDATE is privilege-denied'
);
select extensions.throws_ok(
  $$delete from public.providers
    where id = 'b3050000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'authenticated direct provider DELETE is privilege-denied'
);
reset role;

set local role anon;
select extensions.throws_ok(
  $$select * from public.specialties$$,
  '42501', null,
  'anonymous direct specialty SELECT is privilege-denied'
);
reset role;

set local role service_role;
select extensions.throws_ok(
  $$select * from public.provider_branches$$,
  '42501', null,
  'service_role cannot bypass the revoked provider-branch ACL'
);
reset role;

-- Test-only grants make the SELECT policies independently observable. They are
-- transaction-local and disappear with the final rollback.
grant execute on function private.can_read_provider_configuration(uuid)
to authenticated;
grant select on table public.providers, public.specialties,
  public.provider_branches, public.provider_specialties
to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.providers),
  2,
  'Org A owner reads only the two Org A providers'
);
select extensions.is(
  (select count(*)::integer from public.specialties),
  8,
  'Org A owner reads seven global and its one custom specialty only'
);
select extensions.is(
  (select count(*)::integer from public.provider_branches),
  1,
  'Org A owner reads only Org A provider-branch configuration'
);
select extensions.is(
  (select count(*)::integer from public.provider_specialties),
  3,
  'Org A owner reads only Org A provider-specialty configuration'
);

select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.providers),
  0,
  'a dentist cannot read provider configuration even in their organization'
);
select extensions.is(
  (select count(*)::integer from public.specialties),
  0,
  'a dentist cannot read the global specialty catalog without provider.read'
);

select set_config('request.jwt.claim.sub', 'b3010000-0000-0000-0000-000000000004', true);
select extensions.is(
  (select count(*)::integer from public.providers),
  1,
  'Org B owner reads only the Org B provider'
);
select extensions.is(
  (select count(*)::integer from public.specialties),
  9,
  'Org B owner reads seven global and two Org B custom/probe specialties only'
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
