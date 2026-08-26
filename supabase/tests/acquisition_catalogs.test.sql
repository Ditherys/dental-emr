begin;

select extensions.no_plan();

-- Synthetic-only P5-01 graph. Catalog seed data itself arrives via migration;
-- this suite proves shape, seeds, integrity rules, and fail-closed visibility.
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
  '{"fixture":"p5-01-synthetic"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('b7100000-0000-0000-0000-000000000001'::uuid, 'receptionist-a@p501.example.test'),
  ('b7100000-0000-0000-0000-000000000002'::uuid, 'dentist-b@p501.example.test'),
  ('b7100000-0000-0000-0000-000000000003'::uuid, 'owner-a@p501.example.test')
) as actor(id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('b7200000-0000-0000-0000-000000000001', 'P501 Synthetic A Inc.', 'P501 Synthetic A', 'p501-synthetic-a'),
  ('b7200000-0000-0000-0000-000000000002', 'P501 Synthetic B Inc.', 'P501 Synthetic B', 'p501-synthetic-b');

insert into public.branches (
  id, organization_id, name, slug, code, address_line1, city, province
)
values
  ('b7300000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'P501 A Main', 'p501-a-main', 'P501-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('b7300000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000002', 'P501 B Main', 'p501-b-main', 'P501-B1', '2 Synthetic Street', 'Test City', 'Test Province');

insert into public.organization_members (
  id, organization_id, user_id, membership_status, joined_at
)
values
  ('b7400000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000002', 'b7100000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000003', 'b7200000-0000-0000-0000-000000000001', 'b7100000-0000-0000-0000-000000000003', 'active', statement_timestamp());

insert into public.branch_memberships (
  organization_id, branch_id, organization_member_id, access_status
)
values
  ('b7200000-0000-0000-0000-000000000001', 'b7300000-0000-0000-0000-000000000001', 'b7400000-0000-0000-0000-000000000001', 'active'),
  ('b7200000-0000-0000-0000-000000000002', 'b7300000-0000-0000-0000-000000000002', 'b7400000-0000-0000-0000-000000000002', 'active');

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
  ('b7200000-0000-0000-0000-000000000001'::uuid, 'b7400000-0000-0000-0000-000000000001'::uuid, 'RECEPTIONIST'::text, 'b7300000-0000-0000-0000-000000000001'::uuid, 'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000002'::uuid, 'b7400000-0000-0000-0000-000000000002'::uuid, 'DENTIST'::text, 'b7300000-0000-0000-0000-000000000002'::uuid, 'b7100000-0000-0000-0000-000000000002'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid, 'b7400000-0000-0000-0000-000000000003'::uuid, 'OWNER'::text, null::uuid, 'b7100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role
  on role.organization_id is null
 and role.code = assignment.role_code;

select extensions.set_eq(
  $$select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('acquisition_sources', 'booking_channels')$$,
  array['acquisition_sources', 'booking_channels']::text[],
  'P5-01 creates exactly the two intended catalog tables'
);

select extensions.columns_are(
  'public',
  'acquisition_sources',
  array[
    'id', 'code', 'name', 'category', 'organization_id', 'is_active',
    'version', 'created_at', 'updated_at'
  ],
  'acquisition_sources has the global-or-custom catalog shape'
);
select extensions.columns_are(
  'public',
  'booking_channels',
  array['id', 'code', 'name', 'is_active', 'created_at', 'updated_at'],
  'booking_channels carries the system-global channel-only shape'
);
select extensions.is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acquisition_sources'
      and column_name = 'version'
  ),
  '1',
  'acquisition source version defaults to one'
);
select extensions.is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acquisition_sources'
      and column_name = 'is_active'
  ),
  'true',
  'acquisition sources start active'
);

select extensions.ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.acquisition_sources'::regclass
  )
  and (
    select relrowsecurity
    from pg_class
    where oid = 'public.booking_channels'::regclass
  ),
  'RLS is enabled on both catalog tables'
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
      ('public.acquisition_sources'),
      ('public.booking_channels')
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
  'PUBLIC, anon, authenticated, and service_role hold no base-table privileges on either catalog'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.acquisition_sources'::regclass,
      'public.booking_channels'::regclass
    )
  ),
  2,
  'each catalog table ships exactly one visibility policy and no mutation policies'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.acquisition_sources'::regclass,
      'public.booking_channels'::regclass
    )
    and polcmd = 'r'
    and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
    and polwithcheck is null
  ),
  2,
  'catalog policies are SELECT-only, authenticated-only, and read-only shaped'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as procedure
    where procedure.oid in (
      'private.protect_acquisition_source_scope()'::regprocedure,
      'private.validate_acquisition_source_code_scope()'::regprocedure
    )
    and procedure.proconfig = array['search_path=""']::text[]
  ),
  2,
  'every P5-01 trigger function fixes an empty search path'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_trigger as trigger
    join pg_proc as procedure on procedure.oid = trigger.tgfoid
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where trigger.tgrelid in (
      'public.acquisition_sources'::regclass,
      'public.booking_channels'::regclass
    )
    and trigger.tgname like '%_set_updated_at'
    and not trigger.tgisinternal
    and namespace.nspname = 'private'
    and procedure.proname = 'set_updated_at'
  ),
  2,
  'both catalogs use the shared updated-at trigger'
);
select extensions.ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public'
  and indexname = 'acquisition_sources_category_idx'
), 'acquisition_sources has the category reporting index');
select extensions.is(
  (
    select array_agg(attribute.attname order by index_key.ordinality)
    from pg_index as index_metadata
    cross join lateral unnest(index_metadata.indkey)
      with ordinality as index_key(attnum, ordinality)
    join pg_attribute as attribute
      on attribute.attrelid = index_metadata.indrelid
     and attribute.attnum = index_key.attnum
    where index_metadata.indexrelid =
      'public.acquisition_sources_organization_active_idx'::regclass
  ),
  array['organization_id', 'is_active']::name[],
  'the tenant access-path index is keyed by organization and active state'
);
select extensions.ok(
  (
    select index_metadata.indisunique
    from pg_index as index_metadata
    where index_metadata.indexrelid =
      'public.acquisition_sources_global_code_key'::regclass
  )
  and (
    select pg_get_expr(index_metadata.indpred, index_metadata.indrelid)
    from pg_index as index_metadata
    where index_metadata.indexrelid =
      'public.acquisition_sources_global_code_key'::regclass
  ) = '(organization_id IS NULL)',
  'global source codes are unique among global rows only'
);
select extensions.ok(
  (
    select index_metadata.indisunique
    from pg_index as index_metadata
    where index_metadata.indexrelid =
      'public.acquisition_sources_organization_code_key'::regclass
  )
  and (
    select pg_get_expr(index_metadata.indpred, index_metadata.indrelid)
    from pg_index as index_metadata
    where index_metadata.indexrelid =
      'public.acquisition_sources_organization_code_key'::regclass
  ) = '(organization_id IS NOT NULL)',
  'custom source codes are unique per organization only'
);

select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.acquisition_sources'::regclass$$,
  array[
    'acquisition_sources_category_check',
    'acquisition_sources_code_bounded_check',
    'acquisition_sources_name_bounded_check',
    'acquisition_sources_organization_id_fkey',
    'acquisition_sources_pkey',
    'acquisition_sources_version_positive_check'
  ]::text[],
  'the acquisition-source relation carries the complete bounded catalog constraint set'
);
select extensions.set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.booking_channels'::regclass$$,
  array[
    'booking_channels_code_bounded_check',
    'booking_channels_code_key',
    'booking_channels_name_bounded_check',
    'booking_channels_pkey'
  ]::text[],
  'the booking-channel relation carries the complete system-global constraint set'
);

select extensions.is(
  (select count(*)::integer from public.acquisition_sources where organization_id is null),
  17,
  'the migration seeded exactly seventeen global discovery sources'
);
select extensions.set_eq(
  $$select code from public.acquisition_sources where organization_id is null$$,
  array[
    'CLINIC_SIGNAGE', 'CLINIC_WEBSITE', 'DENTIST_REFERRAL', 'DOCTOR_REFERRAL',
    'EMPLOYER_COMPANY', 'EXISTING_PATIENT_REFERRAL', 'FAMILY_FRIEND', 'FACEBOOK',
    'FLYER_EVENT', 'GOOGLE_MAPS', 'GOOGLE_SEARCH', 'HMO', 'INSTAGRAM', 'OTHER',
    'SCHOOL_PARTNER', 'TIKTOK', 'UNKNOWN'
  ]::text[],
  'the global catalog contains only the approved stable source codes'
);
select extensions.is(
  (select category from public.acquisition_sources
   where organization_id is null and code = 'FACEBOOK'),
  'DIGITAL',
  'Facebook discovery is categorized digital'
);
select extensions.is(
  (select category from public.acquisition_sources
   where organization_id is null and code = 'HMO'),
  'PARTNER',
  'HMO discovery is categorized partner'
);
select extensions.is(
  (select code from public.acquisition_sources where code = 'UNKNOWN' and organization_id is null),
  'UNKNOWN',
  'an Unknown discovery source always exists'
);
select extensions.is(
  (select count(*)::integer from public.booking_channels),
  9,
  'the migration seeded exactly nine booking channels'
);
select extensions.set_eq(
  $$select code from public.booking_channels$$,
  array[
    'CLINIC_WEBSITE', 'FACEBOOK_MESSENGER', 'INSTAGRAM_MESSAGING',
    'ONLINE_BOOKING', 'PHONE', 'RECEPTIONIST_CREATED', 'SMS', 'UNKNOWN',
    'WALK_IN'
  ]::text[],
  'booking channels contain only the approved stable codes including walk-in'
);

select extensions.lives_ok(
  $$insert into public.acquisition_sources (id, organization_id, code, name, category)
    values (
      'b7500000-0000-0000-0000-000000000001',
      'b7200000-0000-0000-0000-000000000001',
      'P501_CUSTOM', 'P501 Custom Source', 'OTHER'
    )$$,
  'an organization may add its own custom acquisition source'
);
select extensions.is((select version from public.acquisition_sources where id = 'b7500000-0000-0000-0000-000000000001'), 1, 'new custom sources start at optimistic version one');
select extensions.ok((select is_active from public.acquisition_sources where id = 'b7500000-0000-0000-0000-000000000001'), 'new custom sources start active');

select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'P501_CUSTOM', 'Duplicate Custom', 'OTHER'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "acquisition_sources_organization_code_key"',
  'custom source codes are unique within one organization'
);
select extensions.lives_ok(
  $$insert into public.acquisition_sources (id, organization_id, code, name, category)
    values (
      'b7500000-0000-0000-0000-000000000002',
      'b7200000-0000-0000-0000-000000000002',
      'P501_CUSTOM', 'P501 Custom B', 'REFERRAL'
    )$$,
  'another organization may independently use the same custom code'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (id, organization_id, code, name, category)
    values (
      'b7500000-0000-0000-0000-000000000004', null,
      'FACEBOOK', 'Facebook Again', 'DIGITAL'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "acquisition_sources_global_code_key"',
  'duplicate global source codes are rejected'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'GOOGLE_SEARCH', 'Shadow Google', 'DIGITAL'
    )$$,
  '23514',
  'custom acquisition source code must differ from every global code',
  'a custom source cannot shadow an active global code'
);

select extensions.lives_ok(
  $$insert into public.acquisition_sources (id, organization_id, code, name, category, is_active)
    values (
      'b7500000-0000-0000-0000-000000000003', null,
      'P501_RETIRED_GLOBAL', 'P501 Retired Global', 'OTHER', false
    )$$,
  'a retired inactive global probe row can exist'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'P501_RETIRED_GLOBAL', 'Shadow Retired', 'OTHER'
    )$$,
  '23514',
  'custom acquisition source code must differ from every global code',
  'a custom source cannot shadow even an inactive global code'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'P501_TELEVISION', 'Television', 'TELEVISION'
    )$$,
  '23514',
  'new row for relation "acquisition_sources" violates check constraint "acquisition_sources_category_check"',
  'invented categories are rejected at the allowlist boundary'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'p501_lowercase', 'Lowercase Code', 'OTHER'
    )$$,
  '23514',
  'new row for relation "acquisition_sources" violates check constraint "acquisition_sources_code_bounded_check"',
  'non-canonical machine codes are rejected'
);
select extensions.throws_ok(
  $$update public.acquisition_sources set name = 'Changed'
    where organization_id is null and code = 'FACEBOOK'$$,
  '23514',
  'global acquisition sources are immutable',
  'global sources cannot be updated'
);
select extensions.throws_ok(
  $$delete from public.acquisition_sources
    where organization_id is null and code = 'UNKNOWN'$$,
  '23514',
  'global acquisition sources are immutable',
  'global sources cannot be deleted'
);
select extensions.throws_ok(
  $$update public.acquisition_sources
    set organization_id = 'b7200000-0000-0000-0000-000000000002'
    where id = 'b7500000-0000-0000-0000-000000000001'$$,
  '23514',
  'acquisition source organization scope is immutable',
  'custom sources cannot move between tenants'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values ('b7200000-0000-0000-0000-000000000001', 'TIKTOK', 'Shadow TikTok', 'DIGITAL')$$,
  '23514',
  'custom acquisition source code must differ from every global code',
  'custom codes cannot shadow global codes'
);
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (null, 'P501_CUSTOM', 'Global Shadow', 'OTHER')$$,
  '23514',
  'global acquisition source code must differ from every custom code',
  'global codes cannot shadow existing custom codes'
);
select extensions.throws_ok(
  $$update public.booking_channels set name = 'Changed' where code = 'WALK_IN'$$,
  '23514',
  'booking channels are immutable',
  'booking channels cannot be updated'
);
select extensions.throws_ok(
  $$delete from public.booking_channels where code = 'UNKNOWN'$$,
  '23514',
  'booking channels are immutable',
  'booking channels cannot be deleted'
);
select extensions.throws_ok(
  $$insert into public.booking_channels (code, name)
    values ('WALK_IN', 'Duplicate Walk-in')$$,
  '23505',
  'duplicate key value violates unique constraint "booking_channels_code_key"',
  'booking channel codes stay globally unique'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000001', true);
select extensions.throws_ok($$select * from public.acquisition_sources$$, '42501', null, 'authenticated direct acquisition_sources SELECT is privilege-denied');
select extensions.throws_ok(
  $$insert into public.acquisition_sources (organization_id, code, name, category)
    values (
      'b7200000-0000-0000-0000-000000000001',
      'P501_DIRECT', 'Direct Insert', 'OTHER'
    )$$,
  '42501', null, 'authenticated direct acquisition_sources INSERT is privilege-denied');
reset role;
set local role anon;
select extensions.throws_ok($$select * from public.acquisition_sources$$, '42501', null, 'anonymous direct catalog SELECT is privilege-denied');
reset role;
set local role service_role;
select extensions.throws_ok($$select * from public.booking_channels$$, '42501', null, 'service_role cannot bypass the revoked catalog ACLs');
reset role;

select extensions.ok(
  has_function_privilege('authenticated', 'public.list_acquisition_sources(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.list_booking_channels(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.list_acquisition_sources(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.list_booking_channels(uuid)', 'execute'),
  'only authenticated has the exact bounded catalog read RPC grants'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_proc
    where oid in (
      'public.list_acquisition_sources(uuid)'::regprocedure,
      'public.list_booking_channels(uuid)'::regprocedure
    )
      and prosecdef
      and proconfig = array['search_path=""']::text[]
  ),
  2,
  'catalog read definers pin an empty search path'
);
select extensions.is(
  pg_get_function_result('public.list_acquisition_sources(uuid)'::regprocedure),
  'TABLE(source_id uuid, code text, name text, category text)',
  'the acquisition catalog RPC exposes exactly its bounded source projection'
);
select extensions.is(
  pg_get_function_result('public.list_booking_channels(uuid)'::regprocedure),
  'TABLE(code text, name text)',
  'the booking catalog RPC exposes exactly its bounded channel projection'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000001')),
  18,
  'the authenticated catalog RPC returns active global plus same-organization sources only'
);
select extensions.ok(
  exists (
    select 1
    from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000001')
    where source_id = 'b7500000-0000-0000-0000-000000000001'
      and code = 'P501_CUSTOM'
      and name = 'P501 Custom Source'
      and category = 'OTHER'
  )
  and not exists (
    select 1
    from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000001')
    where source_id = 'b7500000-0000-0000-0000-000000000002'
  ),
  'Org A receives only its own custom acquisition source through the RPC'
);
select extensions.ok(
  not exists (
    select 1
    from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000001')
    where code = 'P501_RETIRED_GLOBAL'
  ),
  'the acquisition RPC excludes inactive sources'
);
select extensions.is(
  (select count(*)::integer from public.list_booking_channels('b7300000-0000-0000-0000-000000000001')),
  9,
  'the authenticated catalog RPC returns active global booking channels'
);
select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000002', true);
select extensions.ok(
  exists (
    select 1
    from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000002')
    where source_id = 'b7500000-0000-0000-0000-000000000002'
      and code = 'P501_CUSTOM'
      and name = 'P501 Custom B'
      and category = 'REFERRAL'
  )
  and not exists (
    select 1
    from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000002')
    where source_id = 'b7500000-0000-0000-0000-000000000001'
  ),
  'Org B receives only its own custom acquisition source through the RPC'
);
select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.list_acquisition_sources('b7300000-0000-0000-0000-000000000001')$$,
  '42501', 'not authorized', 'the catalog RPC rejects a user without live branch read permission'
);
reset role;

-- Test-only grants make the SELECT policies independently observable. They are
-- transaction-local and disappear with the final rollback.
grant execute on function private.has_shared_patient_permission(uuid, text)
to authenticated;
grant select on table public.acquisition_sources, public.booking_channels
to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.acquisition_sources),
  19,
  'an Org A receptionist reads eighteen global plus its one custom source'
);
select extensions.is(
  (select count(*)::integer from public.acquisition_sources where organization_id = 'b7200000-0000-0000-0000-000000000002'),
  0,
  'the Org A receptionist cannot read the Org B custom source'
);
select extensions.is(
  (select count(*)::integer from public.booking_channels),
  9,
  'the Org A receptionist reads the full system-global channel catalog'
);

select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.acquisition_sources),
  19,
  'an Org B dentist reads eighteen global plus its one custom source'
);
select extensions.is(
  (select count(*)::integer from public.acquisition_sources where organization_id = 'b7200000-0000-0000-0000-000000000001'),
  0,
  'the Org B dentist cannot read the Org A custom source'
);

select set_config('request.jwt.claim.sub', 'b7100000-0000-0000-0000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.acquisition_sources),
  0,
  'a user without patient directory read sees no acquisition catalog rows'
);
select extensions.is(
  (select count(*)::integer from public.booking_channels),
  0,
  'a user without patient directory read sees no booking channel rows'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
