begin;

select extensions.no_plan();

-- Synthetic-only P12-02 graph. get_public_site is the single deliberate
-- unauthenticated surface and runs as postgres with NO auth GUC on purpose.
-- The settings RPCs are site.manage-gated and read the actor from the
-- request.jwt.claim.sub GUC like every other Phase RPC; base tables stay
-- deny-by-default and are never touched by the authenticated role.
-- owner-a (OWNER, org-wide) is the positive site.manage holder; dentist-a,
-- receptionist-a, and billing-a hold no site.manage; owner-b is a
-- foreign-organization OWNER. provider-a1/procedure-a1 are the sole
-- website_visible active items; provider-a2/procedure-a2 are website-hidden;
-- provider-a3/procedure-a3 are inactive; provider-a4/procedure-a4 are foreign.
-- patient-a carries a mobile contact, one referral (with a clinical marker
-- note), and one appointment to prove get_public_site leaks none of it.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p1202.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1202.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1202.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1202.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f1000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p1202.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('f2000000-0000-0000-0000-000000000001','P1202 Synthetic A Inc.','P1202 A','p1202-a'),
  ('f2000000-0000-0000-0000-000000000002','P1202 Synthetic B Inc.','P1202 B','p1202-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('f2100000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','P1202 A Main','p1202-a-main','P1202-A','1 Site St','Test City','Test Province'),
  ('f2100000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','P1202 B Main','p1202-b-main','P1202-B','2 Site St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('f3000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('f3000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('f3000000-0000-0000-0000-000000000005','f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('f2000000-0000-0000-0000-000000000001','f2100000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','active'),
  ('f2000000-0000-0000-0000-000000000001','f2100000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000003','active'),
  ('f2000000-0000-0000-0000-000000000001','f2100000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000004','active'),
  ('f2000000-0000-0000-0000-000000000002','f2100000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('f2000000-0000-0000-0000-000000000001'::uuid,'f3000000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,null::uuid,'f1000000-0000-0000-0000-000000000001'::uuid),
  ('f2000000-0000-0000-0000-000000000001'::uuid,'f3000000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,'f2100000-0000-0000-0000-000000000001'::uuid,'f1000000-0000-0000-0000-000000000001'::uuid),
  ('f2000000-0000-0000-0000-000000000001'::uuid,'f3000000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'f2100000-0000-0000-0000-000000000001'::uuid,'f1000000-0000-0000-0000-000000000001'::uuid),
  ('f2000000-0000-0000-0000-000000000001'::uuid,'f3000000-0000-0000-0000-000000000004'::uuid,'BILLING'::text,'f2100000-0000-0000-0000-000000000001'::uuid,'f1000000-0000-0000-0000-000000000001'::uuid),
  ('f2000000-0000-0000-0000-000000000002'::uuid,'f3000000-0000-0000-0000-000000000005'::uuid,'OWNER'::text,null::uuid,'f1000000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.public_site_settings (organization_id, hero_heading, hero_subtext, about_text, contact_phone, contact_email, address_override, operating_hours, privacy_notice, messenger_link, booking_link, social_links, version) values
  ('f2000000-0000-0000-0000-000000000001','P1202 Hero','A public subtext.','About the clinic.','+639170000001','clinic@p1202.example.test',null,'{"mon":"08:00-18:00"}'::jsonb,'Our privacy notice.','https://m.me/p1202','https://booking.example.test/p1202','{"facebook":"https://facebook.com/p1202"}'::jsonb,1);
insert into public.providers (id, organization_id, first_name, last_name, bio, provider_type, status, website_visible) values
  ('f4000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','Maria','Santos','A clinic bio.','REGULAR','active',true),
  ('f4000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','Hidden','Doc','NOT_PUBLIC_BIO','REGULAR','active',false),
  ('f4000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','Inactive','Doc','INACTIVE_BIO','REGULAR','inactive',true),
  ('f4000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000002','Foreign','Doc','FOREIGN_BIO','REGULAR','active',true);
insert into public.provider_specialties (organization_id, provider_id, specialty_id, is_primary) values
  ('f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000001',(select id from public.specialties where organization_id is null and code='GENERAL_DENTISTRY'),true),
  ('f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000002',(select id from public.specialties where organization_id is null and code='ORTHODONTICS'),true);
insert into public.procedures (id, organization_id, code, name, description, status, website_visible) values
  ('f5000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','P1202_A1','Teeth Cleaning','A public description.','active',true),
  ('f5000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','P1202_HIDDEN','Hidden Procedure','NOT_PUBLIC_DESC','active',false),
  ('f5000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','P1202_INACTIVE','Inactive Procedure','INACTIVE_DESC','inactive',true),
  ('f5000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000002','P1202_FOREIGN','Foreign Procedure','FOREIGN_DESC','active',true);
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('f6000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','P1202-A-0001','Patient','A',date '1990-01-01','f2100000-0000-0000-0000-000000000001');
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('f6100000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','MOBILE','+639180000001',true,'active');
insert into public.patient_referrals (id, org_id, patient_id, direction, status, required_specialty_id, external_party_name, external_party_organization, external_party_contact, notes) values
  ('f6200000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','OUT','ACTIVE',(select id from public.specialties where organization_id is null and code='ORTHODONTICS'),'Acme Dental','Acme Inc.','+639199999999','CLINICAL_MARKER referral note');
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status) values
  ('f7000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f2100000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','PENDING');

-- Boundary assertions: four SECURITY DEFINER definers pin an empty search path;
-- get_public_site reaches anon (the single deliberate public exception) and
-- authenticated; the settings RPCs are authenticated-only; service_role holds
-- none; the private helper is revoked from every browser and service role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.get_public_site(text)'::regprocedure,
  'public.get_public_site_settings(uuid)'::regprocedure,
  'public.update_public_site_settings(uuid,integer,jsonb)'::regprocedure,
  'private.has_site_permission_at_branch(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),4,'the four P12-02 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('anon','public.get_public_site(text)','execute')
  and has_function_privilege('authenticated','public.get_public_site(text)','execute')
  and has_function_privilege('authenticated','public.get_public_site_settings(uuid)','execute')
  and has_function_privilege('authenticated','public.update_public_site_settings(uuid,integer,jsonb)','execute')
  and not has_function_privilege('anon','public.get_public_site_settings(uuid)','execute')
  and not has_function_privilege('anon','public.update_public_site_settings(uuid,integer,jsonb)','execute')
  and not has_function_privilege('service_role','public.get_public_site(text)','execute')
  and not has_function_privilege('service_role','public.get_public_site_settings(uuid)','execute')
  and not has_function_privilege('service_role','public.update_public_site_settings(uuid,integer,jsonb)','execute'),
  'get_public_site is the only anon-reachable RPC; the settings RPCs are authenticated-only; service_role holds none'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_site_permission_at_branch(uuid,text)')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the site permission helper is not executable by browser or service roles');

-- get_public_site: NO auth GUC is set -- the function must work for a visitor
-- who carries no identity at all, returning only the bounded website-safe
-- projection.
select extensions.ok((select public.get_public_site('p1202-a') is not null),'get_public_site resolves the active org by slug with no authentication at all');
select extensions.ok(
  (select array_agg(key order by key) = array['aboutText','address','addressOverride','bookingLink','contactEmail','contactPhone','heroHeading','heroSubtext','messengerLink','operatingHours','organizationName','privacyNotice','procedures','providers','socialLinks']::text[] from jsonb_object_keys(public.get_public_site('p1202-a')) as key),
  'get_public_site returns exactly the bounded website-safe keyset with no patient, clinical, or internal keys'
);
select extensions.ok(
  (select public.get_public_site('p1202-a')->'providers' = '[{"displayName":"Maria Santos","bio":"A clinic bio.","primarySpecialtyLabel":"General Dentistry"}]'::jsonb),
  'only the website_visible active provider is exposed with display name, bio, and primary specialty label'
);
select extensions.ok(
  (select public.get_public_site('p1202-a')->'procedures' = '[{"name":"Teeth Cleaning","description":"A public description."}]'::jsonb),
  'only the website_visible active procedure is exposed with name and description'
);
select extensions.ok(
  (select public.get_public_site('p1202-a')->'operatingHours' = '{"mon":"08:00-18:00"}'::jsonb
     and public.get_public_site('p1202-a')->'socialLinks' = '{"facebook":"https://facebook.com/p1202"}'::jsonb
     and public.get_public_site('p1202-a')->>'heroHeading' = 'P1202 Hero'
     and public.get_public_site('p1202-a')->>'organizationName' = 'P1202 A'
     and public.get_public_site('p1202-a')->>'address' = '1 Site St, Test City, Test Province'),
  'the admin settings, including the operating hours and social links objects, and the representative branch address are returned verbatim'
);
select extensions.ok(
  (select public.get_public_site('p1202-a')::text not like '%NOT_PUBLIC_BIO%'
     and public.get_public_site('p1202-a')::text not like '%NOT_PUBLIC_DESC%'
     and public.get_public_site('p1202-a')::text not like '%INACTIVE_BIO%'
     and public.get_public_site('p1202-a')::text not like '%INACTIVE_DESC%'
     and public.get_public_site('p1202-a')::text not like '%FOREIGN%'),
  'website-hidden, inactive, and foreign-organization provider/procedure content never appears'
);
select extensions.ok((select public.get_public_site('no-such-slug') is null),'an unknown slug yields NULL rather than an error');

-- CRITICAL no-leakage proof: a patient record with a mobile contact, a
-- referral carrying a clinical-marker note, and an appointment all exist in
-- the same organization, yet the public projection contains none of it.
select extensions.ok(
  (select public.get_public_site('p1202-a')::text not like '%P1202-A-0001%'
     and public.get_public_site('p1202-a')::text not like '%Patient%'
     and public.get_public_site('p1202-a')::text not like '%+639180000001%'
     and public.get_public_site('p1202-a')::text not like '%CLINICAL_MARKER%'),
  'get_public_site never leaks patient identity, contacts, referrals, or clinical data even when such data exists'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);

-- The settings RPCs are site.manage-gated: DENTIST, RECEPTIONIST, and BILLING
-- are all denied, as is a foreign-organization OWNER acting at A Main.
select extensions.throws_ok($$select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a dentist without site.manage cannot read site settings');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"x"}'::jsonb)$$,'42501','not authorized','a dentist without site.manage cannot update site settings');
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a receptionist without site.manage cannot read site settings');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"x"}'::jsonb)$$,'42501','not authorized','a receptionist without site.manage cannot update site settings');
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user without site.manage cannot read site settings');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"x"}'::jsonb)$$,'42501','not authorized','a billing user without site.manage cannot update site settings');
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization OWNER cannot read another organization settings at its branch');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"x"}'::jsonb)$$,'42501','not authorized','a foreign-organization OWNER cannot update another organization settings at its branch');

-- OWNER (org-wide site.manage) is the positive path: read, then a versioned
-- upsert that advances the version and appends one audit event.
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
select extensions.is((select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->>'version'),'1','an OWNER reads the settings object exposing the optimistic version');
select extensions.ok(
  (select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->>'heroHeading' = 'P1202 Hero'
     and public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->'operatingHours' = '{"mon":"08:00-18:00"}'::jsonb),
  'an OWNER reads the full settings object including the operating hours object'
);
select extensions.is(
  (select version from public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"Updated Hero","contactEmail":"new@clinic.example.test","operatingHours":{"mon":"09:00-17:00"},"socialLinks":{"instagram":"https://instagram.com/p1202"}}'::jsonb)),
  2,
  'an OWNER updates the settings and the version advances to two'
);
select extensions.ok(
  (select public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->>'version' = '2'
     and public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->>'heroHeading' = 'Updated Hero'
     and public.get_public_site_settings('f2100000-0000-0000-0000-000000000001')->'socialLinks' = '{"instagram":"https://instagram.com/p1202"}'::jsonb),
  'the updated settings are readable with the bumped version'
);
select extensions.is((select count(*)::integer from public.audit_events where organization_id='f2000000-0000-0000-0000-000000000001' and action='site.settings_updated' and metadata='{}'::jsonb and result='SUCCESS' and actor_user_id='f1000000-0000-0000-0000-000000000001' and entity_type='public_site_settings' and branch_id='f2100000-0000-0000-0000-000000000001'),1,'the settings update appends one site.settings_updated audit event with empty metadata');
select extensions.ok(
  (select public.get_public_site('p1202-a')->>'heroHeading' = 'Updated Hero'),
  'the public site reflects the updated hero heading'
);

-- Optimistic concurrency and allowlist/bounds validation.
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',1,'{"heroHeading":"Bump"}'::jsonb)$$,'42501','stale version','a stale expected version is rejected');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,'{"secretKey":"nope"}'::jsonb)$$,'22023','invalid input','an unknown settings key is rejected');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,('{"heroHeading":"' || repeat('x',201) || '"}')::jsonb)$$,'22023','invalid input','an over-length heroHeading is rejected');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,('{"aboutText":"' || repeat('x',5001) || '"}')::jsonb)$$,'22023','invalid input','an over-length aboutText is rejected');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,'[]'::jsonb)$$,'22023','invalid input','a non-object settings payload is rejected');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,'{"operatingHours":"08:00-18:00"}'::jsonb)$$,'22023','invalid input','operatingHours must be a JSON object');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,'{"socialLinks":[]}'::jsonb)$$,'22023','invalid input','socialLinks must be a JSON object');
select extensions.throws_ok($$select public.update_public_site_settings('f2100000-0000-0000-0000-000000000001',2,'{"heroHeading":42}'::jsonb)$$,'22023','invalid input','a non-string text setting is rejected');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;