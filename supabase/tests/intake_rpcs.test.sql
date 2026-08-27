begin;

select extensions.no_plan();

-- Synthetic-only P17-02 graph. The two public intake RPCs are SECURITY
-- DEFINER, require no auth at all, and are deliberately granted to anon and
-- authenticated. The whole chain therefore runs as postgres with NO auth GUC
-- to prove the anonymous path works with zero identity, plus one explicit
-- `set local role anon` execution at the end. The three staff RPCs are
-- intake.manage-gated and read the actor from the request.jwt.claim.sub GUC;
-- base tables stay deny-by-default.
-- org-a (p1701-a) has one active branch (A Main); receptionist-a (RECEPTIONIST
-- at A Main) is the positive intake.manage holder; billing-a (BILLING) and
-- dentist-a (DENTIST) at A Main hold none; owner-b is a foreign-organization
-- OWNER. patient-a belongs to org A, patient-b to org B. GLOBAL_CONSENT is a
-- global template; CUSTOM_A (version 2) and CUSTOM_B are org-scoped templates;
-- INACTIVE_CONSENT is an inactive global template. org A has a privacy notice.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1701.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1701.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1701.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p1701.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e2000000-0000-0000-0000-000000000001','P1701 Synthetic A Inc.','P1701 A','p1701-a'),
  ('e2000000-0000-0000-0000-000000000002','P1701 Synthetic B Inc.','P1701 B','p1701-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province, website_visible) values
  ('e2100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1701 A Main','p1701-a-main','P1701-A','1 Intake St','Test City','Test Province',true),
  ('e2100000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1701 B Main','p1701-b-main','P1701-B','2 Intake St','Test City','Test Province',true);
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
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e4000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1701-A-0001','Intake','Patient',date '1990-01-01','e2100000-0000-0000-0000-000000000001'),
  ('e4000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1701-B-0001','Foreign','Patient',date '1991-02-02','e2100000-0000-0000-0000-000000000002');
insert into public.consent_templates (id, organization_id, code, name, body, version, is_active) values
  ('e5000000-0000-0000-0000-000000000001', null, 'GLOBAL_CONSENT', 'Global Consent', 'We will keep your dental records private.', 1, true),
  ('e5000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'CUSTOM_A', 'Custom A Consent', 'Org A custom consent body.', 2, true),
  ('e5000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000002', 'CUSTOM_B', 'Custom B Consent', 'Org B custom consent body.', 1, true),
  ('e5000000-0000-0000-0000-000000000004', null, 'INACTIVE_CONSENT', 'Inactive Consent', 'An inactive global consent body.', 1, false);
insert into public.public_site_settings (organization_id, privacy_notice, version) values
  ('e2000000-0000-0000-0000-000000000001','Our clinic privacy notice.',1);

-- Boundary assertions: six SECURITY DEFINER definers pin an empty search path;
-- the two public intake RPCs reach anon and authenticated; the three staff RPCs
-- are authenticated-only; service_role holds none; the private permission
-- helper is revoked from every browser and service role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'private.has_intake_permission_at_branch(uuid,text)'::regprocedure,
  'public.create_intake_form(uuid,uuid,text,uuid)'::regprocedure,
  'public.public_get_intake_form(text,text)'::regprocedure,
  'public.public_submit_intake_form(text,text,jsonb,boolean)'::regprocedure,
  'public.mark_intake_form_paper(uuid,uuid,integer,text)'::regprocedure,
  'public.list_intake_forms(uuid,uuid)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),6,'the six P17-02 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('anon','public.public_get_intake_form(text,text)','execute')
  and has_function_privilege('anon','public.public_submit_intake_form(text,text,jsonb,boolean)','execute')
  and has_function_privilege('authenticated','public.public_get_intake_form(text,text)','execute')
  and has_function_privilege('authenticated','public.public_submit_intake_form(text,text,jsonb,boolean)','execute')
  and has_function_privilege('authenticated','public.create_intake_form(uuid,uuid,text,uuid)','execute')
  and has_function_privilege('authenticated','public.mark_intake_form_paper(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.list_intake_forms(uuid,uuid)','execute')
  and not has_function_privilege('anon','public.create_intake_form(uuid,uuid,text,uuid)','execute')
  and not has_function_privilege('anon','public.mark_intake_form_paper(uuid,uuid,integer,text)','execute')
  and not has_function_privilege('anon','public.list_intake_forms(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.public_get_intake_form(text,text)','execute')
  and not has_function_privilege('service_role','public.public_submit_intake_form(text,text,jsonb,boolean)','execute')
  and not has_function_privilege('service_role','public.create_intake_form(uuid,uuid,text,uuid)','execute'),
  'the two public intake RPCs reach anon and authenticated; the staff RPCs are authenticated-only; service_role holds none'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_intake_permission_at_branch(uuid,text)')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the intake permission helper is not executable by browser or service roles');

-- create_intake_form positive path: RECEPTIONIST (intake.manage) creates a
-- PENDING form plus an ACTIVE link; the token is returned once and only its
-- SHA-256 hash is stored; one intake.form.created audit event is appended.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);

create temp table p1701_create_medical as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null) as result;

select extensions.ok(
  (select result is not null
     and result ->> 'formId' is not null
     and result ->> 'version' = '1'
     and result ->> 'token' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (result ->> 'expiresAt')::timestamptz > statement_timestamp()
   from p1701_create_medical),
  'an intake.manage holder creates a form and receives the plaintext token, version one, and a future expiry exactly once'
);
select extensions.ok(
  (select form.form_type = 'MEDICAL_HISTORY'
     and form.template_version = 'v1'
     and form.status = 'PENDING'
     and form.version = 1
     and form.answers = '{}'::jsonb
     and form.privacy_acknowledged = false
     and form.submitted_at is null
     and form.branch_id = 'e2100000-0000-0000-0000-000000000001'
     and form.created_by = 'e1000000-0000-0000-0000-000000000001'
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_create_medical)),
  'the new form is PENDING at version one with a v1 snapshot and no submission state'
);
select extensions.ok(
  (select link.status = 'ACTIVE'
     and link.token_hash = encode(sha256((select result->>'token' from p1701_create_medical)::bytea),'hex')
     and link.token_hash ~ '^[0-9a-f]{64}$'
     and link.expires_at > statement_timestamp() + interval '6 days'
     and link.expires_at < statement_timestamp() + interval '8 days'
     and link.patient_id = 'e4000000-0000-0000-0000-000000000001'
   from public.intake_links as link
   where link.intake_form_id = (select (result->>'formId')::uuid from p1701_create_medical)),
  'exactly one ACTIVE link stores only the SHA-256 token hash with a seven-day expiry for the same patient'
);
select extensions.is((select count(*)::integer from public.intake_links where intake_form_id = (select (result->>'formId')::uuid from p1701_create_medical)),1,'creating a form creates exactly one link');
select extensions.is((select count(*)::integer from public.intake_links where token_hash = (select result->>'token' from p1701_create_medical)),0,'the plaintext token never appears in intake_links');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.created' and metadata='{}'::jsonb and result='SUCCESS' and actor_user_id='e1000000-0000-0000-0000-000000000001' and entity_type='intake_form' and patient_id='e4000000-0000-0000-0000-000000000001' and branch_id='e2100000-0000-0000-0000-000000000001'),1,'creating a form appends exactly one intake.form.created audit event with empty metadata');

-- create_intake_form CONSENT path: global and same-org templates snapshot their
-- version; foreign, inactive, or missing templates and non-consent misuse are
-- all rejected.
create temp table p1701_create_consent as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','CONSENT','e5000000-0000-0000-0000-000000000001') as result;
select extensions.ok(
  (select form.template_version = 'v1'
     and form.consent_template_id = 'e5000000-0000-0000-0000-000000000001'
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_create_consent)),
  'a CONSENT form on a global template snapshots v1 and records the template id'
);
create temp table p1701_create_consent_custom as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','CONSENT','e5000000-0000-0000-0000-000000000002') as result;
select extensions.ok(
  (select form.template_version = 'v2'
     and form.consent_template_id = 'e5000000-0000-0000-0000-000000000002'
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_create_consent_custom)),
  'a CONSENT form on a same-org template snapshots the template version v2'
);
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','CONSENT',null)$$,'22023','invalid input','a CONSENT form without a template is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','CONSENT','e5000000-0000-0000-0000-000000000003')$$,'22023','invalid input','a foreign-organization consent template is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','CONSENT','e5000000-0000-0000-0000-000000000004')$$,'22023','invalid input','an inactive consent template is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY','e5000000-0000-0000-0000-000000000001')$$,'22023','invalid input','a non-CONSENT form with a consent template is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','LOCKED',null)$$,'22023','invalid input','an unknown form type is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000002','MEDICAL_HISTORY',null)$$,'42501','not authorized','a foreign-organization patient is rejected');
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','MEDICAL_HISTORY',null)$$,'42501','not authorized','an unknown patient is rejected');

-- Permission denials on create/list/mark for BILLING, DENTIST, and a
-- foreign-organization OWNER acting at A Main; RECEPTIONIST remains positive.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null)$$,'42501','not authorized','a billing user without intake.manage cannot create an intake form');
select extensions.throws_ok($$select public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user without intake.manage cannot list intake forms');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_create_medical),1,null)$$,'42501','not authorized','a billing user without intake.manage cannot mark a form paper');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null)$$,'42501','not authorized','a dentist without intake.manage cannot create an intake form');
select extensions.throws_ok($$select public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a dentist without intake.manage cannot list intake forms');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_create_medical),1,null)$$,'42501','not authorized','a dentist without intake.manage cannot mark a form paper');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null)$$,'42501','not authorized','a foreign-organization OWNER cannot create an intake form at A Main');
select extensions.throws_ok($$select public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization OWNER cannot list intake forms at A Main');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_create_medical),1,null)$$,'42501','not authorized','a foreign-organization OWNER cannot mark a form paper at A Main');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);

-- public_get_intake_form: NO auth GUC is set -- the anonymous visitor path. A
-- correct token resolves exactly the bounded single-form projection with the
-- organization privacy notice and no patient data whatsoever.
select extensions.ok((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical)) is not null),'public_get_intake_form resolves an ACTIVE link with no authentication at all');
select extensions.ok(
  (select array_agg(key order by key) = array['consentBody','expiresAt','formId','formType','privacyNotice','status','templateVersion']::text[] from jsonb_object_keys(public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical))) as key),
  'public_get_intake_form returns exactly the bounded intake keyset with no patient, clinical, or internal keys'
);
create temp table p1701_fetched_medical as
select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical)) as form;
select extensions.ok(
  (select form ->> 'formType' = 'MEDICAL_HISTORY'
     and form ->> 'templateVersion' = 'v1'
     and form ->> 'status' = 'PENDING'
     and form ->> 'formId' = (select result->>'formId' from p1701_create_medical)
     and form ->> 'consentBody' is null
     and form ->> 'privacyNotice' = 'Our clinic privacy notice.'
     and (form ->> 'expiresAt')::timestamptz > statement_timestamp()
   from p1701_fetched_medical),
  'a medical-history link returns the bounded form projection and the organization privacy notice'
);
select extensions.ok(
  (select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_consent)) ->> 'consentBody' = 'We will keep your dental records private.'),
  'a CONSENT link returns the snapshot consent body for the patient to acknowledge'
);
select extensions.ok(
  (select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical))::text not like '%P1701-A-0001%'
     and public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical))::text not like '%Intake%'
     and public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical))::text not like '%"answers"%'),
  'public_get_intake_form never leaks patient identity or the answers body even when both exist'
);
select extensions.is((select public.public_get_intake_form('p1701-a', repeat('0',64))),null,'a wrong token is an indistinguishable NULL');
select extensions.is((select public.public_get_intake_form('no-such-org', (select result->>'token' from p1701_create_medical))),null,'an unknown org slug is an indistinguishable NULL');

-- Cross-tenant token isolation: a link created for an org B patient resolves
-- only through the org B slug; the org A slug returns NULL for the same token.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
create temp table p1701_create_foreign as
select public.create_intake_form('e2100000-0000-0000-0000-000000000002','e4000000-0000-0000-0000-000000000002','MEDICAL_HISTORY',null) as result;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
select extensions.ok((select public.public_get_intake_form('p1701-b', (select result->>'token' from p1701_create_foreign)) is not null),'an org B link resolves through the org B slug');
select extensions.is((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_foreign))),null,'an org B token never resolves through the org A slug');

-- Expiry via state transition: an ACTIVE link past its lifetime is flipped to
-- EXPIRED and treated indistinguishably from an unknown token.
create temp table p1701_expire_me as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null) as result;
update public.intake_links
set expires_at = statement_timestamp() - interval '1 minute'
where intake_form_id = (select (result->>'formId')::uuid from p1701_expire_me);
select extensions.is((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_expire_me))),null,'an expired ACTIVE link returns NULL');
select extensions.is((select status from public.intake_links where intake_form_id = (select (result->>'formId')::uuid from p1701_expire_me)),'EXPIRED','the expired ACTIVE link is transitioned to EXPIRED by the read');

-- public_submit_intake_form: PENDING -> SUBMITTED with answers preserved
-- verbatim, submitted_via LINK, the link expired, and idempotent duplicates.
create temp table p1701_submit_result as
select public.public_submit_intake_form(
  'p1701-a',
  (select result->>'token' from p1701_create_medical),
  '{"hasMedications":"No","allergies":"None"}'::jsonb,
  true
) as result;
select extensions.ok(
  (select result ->> 'formId' = (select result->>'formId' from p1701_create_medical)
     and result ->> 'status' = 'SUBMITTED'
     and result ->> 'submittedAt' is not null
   from p1701_submit_result),
  'a correct link submission returns SUBMITTED with a submitted timestamp'
);
select extensions.ok(
  (select form.status = 'SUBMITTED'
     and form.submitted_via = 'LINK'
     and form.submitted_at is not null
     and form.answers = '{"hasMedications":"No","allergies":"None"}'::jsonb
     and form.privacy_acknowledged = true
     and form.version = 2
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_create_medical)),
  'the submission preserves answers verbatim and bumps the version under submitted_via LINK'
);
select extensions.is((select status from public.intake_links where intake_form_id = (select (result->>'formId')::uuid from p1701_create_medical)),'EXPIRED','submission expires the link');
select extensions.ok(
  (select result ->> 'formId' = (select result->>'formId' from p1701_create_medical)
     and result ->> 'status' = 'SUBMITTED'
     and result ->> 'submittedAt' = (select result->>'submittedAt' from p1701_submit_result)
   from (select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_create_medical), '{"changed":"payload"}'::jsonb, true) as result) as duplicate),
  'a duplicate submission is an idempotent no-op returning the existing status'
);
select extensions.ok(
  (select form.answers = '{"hasMedications":"No","allergies":"None"}'::jsonb and form.version = 2
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_create_medical)),
  'an idempotent duplicate never overwrites the preserved answers or bumps the version again'
);
select extensions.is((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_medical))),null,'a submitted form link no longer resolves through the read');

-- Submit validation: CONSENT requires the privacy acknowledgement; bounded
-- object answers only; wrong/unknown tokens are indistinguishable NULLs.
select extensions.throws_ok($$select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_create_consent), '{"consentGiven":"yes"}'::jsonb, false)$$,'22023','invalid input','a CONSENT submission without the privacy acknowledgement is rejected');
select extensions.throws_ok($$select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_create_consent), '[]'::jsonb, true)$$,'22023','invalid input','a non-object answers payload is rejected');
select extensions.throws_ok($$select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_create_consent), ('{"a":"' || repeat('x',16500) || '"}')::jsonb, true)$$,'22023','invalid input','oversized answers are rejected');
select extensions.throws_ok($$select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_create_consent), null, true)$$,'22023','invalid input','null answers are rejected');
select extensions.is((select public.public_submit_intake_form('p1701-a', repeat('0',64), '{}'::jsonb, true)),null,'a wrong token submission is an indistinguishable NULL');
select extensions.is((select public.public_submit_intake_form('no-such-org', (select result->>'token' from p1701_create_consent), '{}'::jsonb, true)),null,'an unknown org slug submission is an indistinguishable NULL');

-- Consent privacy acknowledgement positive path, then the consent form is
-- signed by the acknowledged submission with the snapshot version captured.
create temp table p1701_submit_consent as
select public.public_submit_intake_form(
  'p1701-a',
  (select result->>'token' from p1701_create_consent),
  '{"consentGiven":"yes"}'::jsonb,
  true
) as result;
select extensions.ok(
  (select result ->> 'status' = 'SUBMITTED'
     and (select form.template_version from public.intake_forms as form where form.id = (select (result->>'formId')::uuid from p1701_create_consent)) = 'v1'
     and (select form.submitted_via from public.intake_forms as form where form.id = (select (result->>'formId')::uuid from p1701_create_consent)) = 'LINK'
   from p1701_submit_consent),
  'an acknowledged CONSENT submission captures template version v1, time, and LINK provenance'
);

-- mark_intake_form_paper: PENDING -> PRINTED with signer/time, links revoked,
-- and a bounded {reason} audit event; SUBMITTED -> PRINTED keeps submitted_at.
create temp table p1701_paper as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','DENTAL_HISTORY',null) as result;
create temp table p1701_paper_result as
select * from public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_paper),1,'Patient signed the paper form.');
select extensions.ok(
  (select form_id = (select (result->>'formId')::uuid from p1701_paper)
     and version = 2
   from p1701_paper_result),
  'marking a PENDING form paper returns the bumped version'
);
select extensions.ok(
  (select form.status = 'PRINTED'
     and form.signed_by = 'e1000000-0000-0000-0000-000000000001'
     and form.signed_at is not null
     and form.submitted_via = 'PAPER'
     and form.version = 2
     and form.submitted_at is null
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_paper)),
  'a paper-marked PENDING form captures the signing staff and time with submitted_via PAPER'
);
select extensions.is((select status from public.intake_links where intake_form_id = (select (result->>'formId')::uuid from p1701_paper)),'REVOKED','paper-marking revokes the ACTIVE link');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.printed' and metadata='{"reason":"Patient signed the paper form."}'::jsonb and actor_user_id='e1000000-0000-0000-0000-000000000001' and patient_id='e4000000-0000-0000-0000-000000000001'),1,'paper-marking appends one intake.form.printed audit event with bounded reason metadata');
select extensions.is((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_paper))),null,'a revoked link is an indistinguishable NULL');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_paper),2,null)$$,'P0001','invalid state','marking an already-PRINTED form is rejected');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_paper),1,null)$$,'P0001','stale version','a stale expected version is rejected');
select extensions.throws_ok($$select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_paper),2,repeat('x',501))$$,'22023','invalid input','an over-length reason is rejected');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.printed' and metadata='{}'::jsonb),0,'a reason-less paper mark stores empty metadata with nulls stripped');

-- SUBMITTED -> PRINTED keeps the digital submission provenance.
create temp table p1701_paper_from_submitted as
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null) as result;
select public.public_submit_intake_form('p1701-a', (select result->>'token' from p1701_paper_from_submitted), '{"note":"submitted online"}'::jsonb, true) as ignored;
select public.mark_intake_form_paper('e2100000-0000-0000-0000-000000000001',(select (result->>'formId')::uuid from p1701_paper_from_submitted),2,'Override to paper.') as paper_result;
select extensions.ok(
  (select form.status = 'PRINTED'
     and form.submitted_via = 'PAPER'
     and form.submitted_at is not null
     and form.signed_by = 'e1000000-0000-0000-0000-000000000001'
     and form.signed_at is not null
     and form.answers = '{"note":"submitted online"}'::jsonb
     and form.version = 3
   from public.intake_forms as form
   where form.id = (select (result->>'formId')::uuid from p1701_paper_from_submitted)),
  'a SUBMITTED form paper-marked keeps submitted_at and answers and gains the paper signer'
);

-- list_intake_forms: bounded status projection for the patient, never answers.
create temp table p1701_list as
select * from public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001');
select extensions.ok(
  (select count(*) >= 4
     and count(*) <= 100
   from p1701_list),
  'listing returns the bounded forms for the patient'
);
select extensions.ok(
  (select bool_and(form_type in ('MEDICAL_HISTORY','DENTAL_HISTORY','CONSENT'))
     and bool_and(template_version in ('v1','v2'))
     and bool_and(status in ('PENDING','SUBMITTED','PRINTED'))
     and bool_and(submitted_via is null or submitted_via in ('LINK','PAPER'))
     and count(*) = count(form_id)
   from p1701_list),
  'the list projection exposes only the approved status fields'
);
select extensions.throws_ok($$select listed_row.answers from (select * from public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001')) as listed_row$$,'42703',null,'the intake list projection never exposes the answers body');
select extensions.throws_ok($$select public.list_intake_forms('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000002')$$,'42501','not authorized','a receptionist cannot list a foreign-organization patient');

-- Tenant isolation: an org B patient and org B forms are invisible to org A
-- staff and anon alike.
select extensions.is((select count(*)::integer from public.intake_forms where organization_id='e2000000-0000-0000-0000-000000000002' and branch_id='e2100000-0000-0000-0000-000000000001'),0,'org B forms are never created at the org A branch');
select extensions.is((select public.public_get_intake_form('p1701-a', (select result->>'token' from p1701_create_foreign))),null,'the org B token cannot expose the org B patient through the org A slug');

-- Audit-rollback proof: create_intake_form is atomic -- the form, its link,
-- and the audit event all roll back together.
create temp table p1701_rollback_audit_count as
select count(*)::integer as before_audit from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.created';
create temp table p1701_rollback_form_count as
select count(*)::integer as before_forms from public.intake_forms where organization_id='e2000000-0000-0000-0000-000000000001';
savepoint intake_create_atomic;
select public.create_intake_form('e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY',null) as rollback_attempt_result;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.created'),(select before_audit from p1701_rollback_audit_count) + 1,'the rolled-back attempt appends a new audit event before the rollback');
rollback to savepoint intake_create_atomic;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e2000000-0000-0000-0000-000000000001' and action='intake.form.created'),(select before_audit from p1701_rollback_audit_count),'rolling the savepoint back removes the form, link, and audit event together');
select extensions.is((select count(*)::integer from public.intake_forms where organization_id='e2000000-0000-0000-0000-000000000001'),(select before_forms from p1701_rollback_form_count),'the rolled-back form and its link are gone with it');

-- End-to-end anonymous execution: the anon role itself can call the public
-- RPCs even though every base table stays deny-by-default. A fixed synthetic
-- token is seeded directly because the staff-created token is random and anon
-- cannot read the deny-by-default link table.
insert into public.intake_forms (id, organization_id, branch_id, patient_id, form_type, template_version, answers, status, created_by) values
  ('e6000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','{}'::jsonb,'PENDING','e1000000-0000-0000-0000-000000000001');
insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values
  ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001',encode(sha256('anon-end-to-end-token'::bytea),'hex'),'ACTIVE',statement_timestamp() + interval '7 days');
set local role anon;
select extensions.lives_ok($$select public.public_get_intake_form('p1701-a', 'anon-end-to-end-token')$$,'anon role executes public_get_intake_form end to end');
select extensions.lives_ok($$select public.public_submit_intake_form('p1701-a', 'anon-end-to-end-token', '{"anon":"yes"}'::jsonb, true)$$,'anon role executes public_submit_intake_form end to end');
reset role;
select extensions.is((select status from public.intake_forms where id='e6000000-0000-0000-0000-000000000001'),'SUBMITTED','the anon submission persisted a SUBMITTED form');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;