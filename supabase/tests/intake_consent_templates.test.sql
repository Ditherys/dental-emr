begin;

select extensions.plan(11);

-- Synthetic-only P17-04 graph mirroring intake_rpcs.test.sql. org A (p1704-a)
-- has one active branch (A Main); receptionist-a (RECEPTIONIST at A Main) is the
-- positive intake.manage holder; billing-a (BILLING) and dentist-a (DENTIST) at
-- A Main hold none; owner-b is a foreign-organization OWNER. GLOBAL_CONSENT is a
-- global template; CUSTOM_A (version 2) and CUSTOM_B are org-scoped templates;
-- INACTIVE_CONSENT is an inactive global template. The RPC is SECURITY DEFINER
-- and reads the actor from the request.jwt.claim.sub GUC; base tables stay
-- deny-by-default.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1704.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1704.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1704.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p1704.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e2000000-0000-0000-0000-000000000001','P1704 Synthetic A Inc.','P1704 A','p1704-a'),
  ('e2000000-0000-0000-0000-000000000002','P1704 Synthetic B Inc.','P1704 B','p1704-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province, website_visible) values
  ('e2100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1704 A Main','p1704-a-main','P1704-A','1 Intake St','Test City','Test Province',true),
  ('e2100000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1704 B Main','p1704-b-main','P1704-B','2 Intake St','Test City','Test Province',true);
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','active'),
  ('e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002','active'),
  ('e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000003','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'e2100000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000001'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000002'::uuid,'BILLING'::text,'e2100000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000001'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000003'::uuid,'DENTIST'::text,'e2100000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000001'::uuid),
  ('e2000000-0000-0000-0000-000000000002'::uuid,'e3000000-0000-0000-0000-000000000004'::uuid,'OWNER'::text,null::uuid,'e1000000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.consent_templates (id, organization_id, code, name, body, version, is_active) values
  ('e5000000-0000-0000-0000-000000000001', null, 'GLOBAL_CONSENT', 'Global Consent', 'We will keep your dental records private.', 1, true),
  ('e5000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'CUSTOM_A', 'Custom A Consent', 'Org A custom consent body.', 2, true),
  ('e5000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000002', 'CUSTOM_B', 'Custom B Consent', 'Org B custom consent body.', 1, true),
  ('e5000000-0000-0000-0000-000000000004', null, 'INACTIVE_CONSENT', 'Inactive Consent', 'An inactive global consent body.', 1, false);

-- Boundary assertions: the list_consent_templates definer pins an empty search
-- path (like its permission helper); the RPC reaches authenticated only, never
-- anon or service_role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'private.has_intake_permission_at_branch(uuid,text)'::regprocedure,
  'public.list_consent_templates(uuid)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),2,'the intake permission helper and list_consent_templates definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.list_consent_templates(uuid)','execute')
  and not has_function_privilege('anon','public.list_consent_templates(uuid)','execute')
  and not has_function_privilege('service_role','public.list_consent_templates(uuid)','execute'),
  'list_consent_templates is authenticated-only; anon and service_role hold none'
);

-- Positive path: RECEPTIONIST (intake.manage) at A Main sees exactly the active
-- global template plus the org A template, never a foreign-org or inactive one.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);

create temp table p1704_consent_catalog as
select * from public.list_consent_templates('e2100000-0000-0000-0000-000000000001');
select extensions.is((select count(*)::integer from p1704_consent_catalog),2,'an intake.manage holder at A Main sees exactly two templates');
select extensions.set_eq(
  $$select code from p1704_consent_catalog$$,
  array['CUSTOM_A','GLOBAL_CONSENT']::text[],
  'the catalog is exactly the active global and same-organization templates'
);
select extensions.is((select count(*)::integer from p1704_consent_catalog where code = 'CUSTOM_B'),0,'a foreign-organization template is never visible');
select extensions.is((select count(*)::integer from p1704_consent_catalog where code = 'INACTIVE_CONSENT'),0,'an inactive global template is never visible');

-- Denials for BILLING, DENTIST, and a foreign-organization OWNER acting at A
-- Main; the RPC fails closed instead of returning a degraded catalog.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.list_consent_templates('e2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user without intake.manage is denied');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_consent_templates('e2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a dentist without intake.manage is denied');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.list_consent_templates('e2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization OWNER acting at A Main is denied');

-- Tenant isolation: the same foreign OWNER acting at their own org B branch
-- sees only the org B and global templates, never CUSTOM_A.
create temp table p1704_consent_catalog_b as
select * from public.list_consent_templates('e2100000-0000-0000-0000-000000000002');
select extensions.set_eq(
  $$select code from p1704_consent_catalog_b$$,
  array['CUSTOM_B','GLOBAL_CONSENT']::text[],
  'acting at the org B branch reveals only the org B and global templates'
);

-- No audit event is written by the read-only catalog surface.
select extensions.is((select count(*)::integer from public.audit_events where entity_type='consent_template'),0,'listing consent templates writes no audit event');

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;