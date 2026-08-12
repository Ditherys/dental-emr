begin;

select extensions.no_plan();

-- Synthetic P1-19 identities only. Factors contain no TOTP secret, code,
-- recovery material, session token, or usable login credential.
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
  ('a1190000-0000-0000-0000-000000000001'::uuid, 'actor@p119.example.test'),
  ('a1190000-0000-0000-0000-000000000002'::uuid, 'other@p119.example.test'),
  ('a1190000-0000-0000-0000-000000000003'::uuid, 'no-membership@p119.example.test')
) as synthetic_users(user_id, email);

insert into public.organizations (
  id,
  legal_name,
  business_name,
  slug,
  status
)
values
  ('b1190000-0000-0000-0000-000000000001', 'P119 Synthetic A Inc.', 'P119 Synthetic A', 'p119-synthetic-a', 'active'),
  ('b1190000-0000-0000-0000-000000000002', 'P119 Synthetic B Inc.', 'P119 Synthetic B', 'p119-synthetic-b', 'active'),
  ('b1190000-0000-0000-0000-000000000003', 'P119 Synthetic C Inc.', 'P119 Synthetic C', 'p119-synthetic-c', 'active');

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  membership_status,
  joined_at,
  suspended_at
)
values
  ('d1190000-0000-0000-0000-000000000001', 'b1190000-0000-0000-0000-000000000001', 'a1190000-0000-0000-0000-000000000001', 'active', statement_timestamp(), null),
  ('d1190000-0000-0000-0000-000000000002', 'b1190000-0000-0000-0000-000000000002', 'a1190000-0000-0000-0000-000000000001', 'active', statement_timestamp(), null),
  ('d1190000-0000-0000-0000-000000000003', 'b1190000-0000-0000-0000-000000000003', 'a1190000-0000-0000-0000-000000000001', 'suspended', statement_timestamp(), statement_timestamp());

insert into auth.mfa_factors (
  id,
  user_id,
  friendly_name,
  factor_type,
  status,
  created_at,
  updated_at,
  secret
)
values
  ('f1190000-0000-0000-0000-000000000001', 'a1190000-0000-0000-0000-000000000001', 'Synthetic verified factor', 'totp', 'verified', statement_timestamp(), statement_timestamp(), null),
  ('f1190000-0000-0000-0000-000000000002', 'a1190000-0000-0000-0000-000000000002', 'Other synthetic factor', 'totp', 'verified', statement_timestamp(), statement_timestamp(), null),
  ('f1190000-0000-0000-0000-000000000003', 'a1190000-0000-0000-0000-000000000003', 'No-membership synthetic factor', 'totp', 'verified', statement_timestamp(), statement_timestamp(), null);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.record_mfa_enrollment(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_mfa_enrollment(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.record_mfa_enrollment(uuid)',
    'EXECUTE'
  ),
  'only authenticated user context can invoke the MFA audit projection'
);

select extensions.ok(
  (
    select prosecdef
      and coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'record_mfa_enrollment'
  ),
  'the MFA audit projection is SECURITY DEFINER with an empty search_path'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.audit_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
  'authenticated users have no direct audit history mutation privilege'
);

select extensions.ok(
  private.audit_metadata_is_safe('{}'::jsonb)
  and private.audit_metadata_is_safe(
    '{"invitation_id":"62000000-0000-0000-0000-000000000001","role_code":"ADMIN","scope":"BRANCH"}'::jsonb
  )
  and private.audit_metadata_is_safe(
    '{"permission_code":"audit.read"}'::jsonb
  ),
  'the bounded Phase 1 metadata catalog accepts only expected shapes'
);

select extensions.ok(
  not private.audit_metadata_is_safe('{"password":"not-a-real-password"}'::jsonb)
  and not private.audit_metadata_is_safe('{"access_token":"not-a-real-token"}'::jsonb)
  and not private.audit_metadata_is_safe('{"presigned_url":"https://example.test/private"}'::jsonb)
  and not private.audit_metadata_is_safe('{"clinical_text":"synthetic note"}'::jsonb)
  and not private.audit_metadata_is_safe(
    jsonb_build_object('role_code', repeat('A', 129))
  ),
  'secrets, URLs, clinical text, unknown keys, and oversized metadata are rejected'
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
      result,
      metadata
    ) values (
      'b1190000-0000-0000-0000-000000000001',
      'a1190000-0000-0000-0000-000000000001',
      'USER',
      'SECURITY',
      'security.changed',
      'user',
      'SUCCESS',
      '{"password":"not-a-real-password"}'::jsonb
    )
  $$,
  '23514',
  'new row for relation "audit_events" violates check constraint "audit_events_metadata_safe_check"',
  'the table constraint rejects unsafe metadata even from a privileged writer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1190000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

select extensions.throws_ok(
  $$select public.record_mfa_enrollment('f1190000-0000-0000-0000-000000000001')$$,
  '42501',
  'AAL2 required',
  'an AAL1 session cannot project an MFA enrollment event'
);

select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$select public.record_mfa_enrollment('f1190000-0000-0000-0000-000000000002')$$,
  '42501',
  'verified authenticator factor required',
  'a user cannot project another identity factor into audit history'
);

select extensions.is(
  public.record_mfa_enrollment('f1190000-0000-0000-0000-000000000001'),
  2,
  'one verified factor projects once into each active organization membership'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_user_id = 'a1190000-0000-0000-0000-000000000001'
      and action = 'mfa.enrolled'
      and entity_type = 'mfa_factor'
      and entity_id = 'f1190000-0000-0000-0000-000000000001'
      and actor_type = 'USER'
      and category = 'SECURITY'
      and result = 'SUCCESS'
      and branch_id is null
      and metadata = '{}'::jsonb
      and correlation_id is not null
  ),
  2,
  'MFA events contain only minimal actor, tenant, target, result, and correlation context'
);

select extensions.set_eq(
  $$
    select organization_id
    from public.audit_events
    where actor_user_id = 'a1190000-0000-0000-0000-000000000001'
      and action = 'mfa.enrolled'
  $$,
  array[
    'b1190000-0000-0000-0000-000000000001'::uuid,
    'b1190000-0000-0000-0000-000000000002'::uuid
  ],
  'suspended organization memberships receive no MFA audit projection'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1190000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.is(
  public.record_mfa_enrollment('f1190000-0000-0000-0000-000000000001'),
  0,
  'retries are idempotent for the same tenant, user, and factor'
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
      result
    ) values (
      'b1190000-0000-0000-0000-000000000001',
      'a1190000-0000-0000-0000-000000000002',
      'USER',
      'SECURITY',
      'mfa.enrolled',
      'mfa_factor',
      'SUCCESS'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'an authenticated user cannot fabricate an audit event directly'
);

reset role;

select extensions.throws_ok(
  $$
    update public.audit_events
    set result = 'FAILED'
    where action = 'mfa.enrolled'
  $$,
  'P0001',
  'audit events are append-only',
  'the append-only trigger rejects audit history changes even for a privileged writer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1190000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

select extensions.throws_ok(
  $$select public.record_mfa_enrollment('f1190000-0000-0000-0000-000000000003')$$,
  '42501',
  'active organization membership required',
  'a verified user without an active tenant membership cannot create an unscoped audit event'
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
