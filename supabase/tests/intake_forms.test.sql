begin;

select extensions.no_plan();

-- Synthetic-only P17-01 graph. Direct inserts as the owner bypass RLS; the
-- schema is deny-by-default with zero base grants and no browser policies.
-- org-a and org-b each get one branch; patient-a/patient-b are tenant-scoped.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('c8000000-0000-0000-0000-000000000001','P1701 Synthetic A Inc.','P1701 A','p1701-a'),
  ('c8000000-0000-0000-0000-000000000002','P1701 Synthetic B Inc.','P1701 B','p1701-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('c8100000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001','P1701 A Main','p1701-a-main','P1701-A','1 Intake St','Test City','Test Province'),
  ('c8100000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000002','P1701 B Main','p1701-b-main','P1701-B','2 Intake St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('c8200000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001','P1701-A-0001','Intake','Patient',date '1990-01-01','c8100000-0000-0000-0000-000000000001'),
  ('c8200000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000002','P1701-B-0001','Foreign','Patient',date '1991-02-02','c8100000-0000-0000-0000-000000000002');

select extensions.columns_are('public','consent_templates',array['id','organization_id','code','name','body','version','is_active','created_at','updated_at'],'consent_templates has only the approved P17-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.consent_templates'::regclass),'consent_templates has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.consent_templates',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no consent_templates privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='consent_templates'),0,'consent_templates is deny-by-default with no browser policies');

select extensions.columns_are('public','intake_forms',array['id','organization_id','branch_id','patient_id','form_type','consent_template_id','template_version','answers','privacy_acknowledged','status','submitted_via','submitted_at','signed_by','signed_at','created_by','version','created_at','updated_at'],'intake_forms has only the approved P17-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.intake_forms'::regclass),'intake_forms has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.intake_forms',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no intake_forms privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='intake_forms'),0,'intake_forms is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='intake_forms' and indexname='intake_forms_organization_patient_status_idx'),1,'intake_forms indexes the org+patient+status access path');

select extensions.columns_are('public','intake_links',array['id','organization_id','patient_id','intake_form_id','token_hash','status','expires_at','created_at'],'intake_links has only the approved P17-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.intake_links'::regclass),'intake_links has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.intake_links',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no intake_links privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='intake_links'),0,'intake_links is deny-by-default with no browser policies');

-- Consent template catalog: global defaults plus org-scoped customs, with the
-- global rows immutable and codes unique per scope.
select extensions.lives_ok($$insert into public.consent_templates (id, organization_id, code, name, body) values ('c8300000-0000-0000-0000-000000000001', null, 'GLOBAL_CONSENT', 'Global Consent', 'Standard global consent body.')$$,'a global consent template is accepted');
select extensions.lives_ok($$insert into public.consent_templates (id, organization_id, code, name, body) values ('c8300000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000001', 'CUSTOM_A', 'Custom A Consent', 'Org A custom consent body.')$$,'an org-scoped consent template is accepted');
select extensions.lives_ok($$insert into public.consent_templates (id, organization_id, code, name, body) values ('c8300000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-000000000002', 'CUSTOM_A', 'Custom A for B', 'Org B custom consent body with the same code.')$$,'the same code is allowed in a different organization');
select extensions.throws_ok($$insert into public.consent_templates (organization_id, code, name, body) values ('c8000000-0000-0000-0000-000000000001', 'CUSTOM_A', 'Duplicate', 'A duplicate org code.')$$,'23505',null,'a duplicate org code is rejected by the partial unique index');
select extensions.throws_ok($$insert into public.consent_templates (organization_id, code, name, body) values (null, 'GLOBAL_CONSENT', 'Duplicate', 'A duplicate global code.')$$,'23505',null,'a duplicate global code is rejected');
select extensions.throws_ok($$update public.consent_templates set body='Rewritten.' where id='c8300000-0000-0000-0000-000000000001'$$,'23514','global consent templates are immutable','a global consent template rejects UPDATE by the scope trigger');
select extensions.throws_ok($$delete from public.consent_templates where id='c8300000-0000-0000-0000-000000000001'$$,'23514','global consent templates are immutable','a global consent template rejects DELETE by the scope trigger');
select extensions.lives_ok($$update public.consent_templates set body='Org A updated body.' where id='c8300000-0000-0000-0000-000000000002'$$,'an org-scoped consent template body remains editable');
select extensions.throws_ok($$update public.consent_templates set organization_id='c8000000-0000-0000-0000-000000000002' where id='c8300000-0000-0000-0000-000000000002'$$,'23514','consent template organization scope is immutable','re-scoping a consent template to another organization is rejected');
select extensions.lives_ok($$delete from public.consent_templates where id='c8300000-0000-0000-0000-000000000002'$$,'an org-scoped consent template DELETE is tolerated by the scope trigger');
select extensions.is((select count(*)::integer from public.consent_templates where id='c8300000-0000-0000-0000-000000000002'),0,'org-scoped consent templates remain deletable while the global rows stay immutable');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.protect_consent_template_scope()'::regprocedure and (
    has_function_privilege('public', proc.oid, 'execute')
    or has_function_privilege('anon', proc.oid, 'execute')
    or has_function_privilege('authenticated', proc.oid, 'execute')
    or has_function_privilege('service_role', proc.oid, 'execute')
  )
),'the consent template scope trigger function is revoked from every role');
select extensions.is((select count(*)::integer from pg_proc where oid='private.protect_consent_template_scope()'::regprocedure and proconfig = array['search_path=""']::text[]),1,'the consent template scope trigger function pins an empty search path');

-- intake_forms invariants: tenant-safe composite FKs, snapshot template
-- version, bounded object answers, and sign/submission state coherence.
select extensions.lives_ok($$insert into public.intake_forms (id, organization_id, branch_id, patient_id, form_type, template_version, answers, status) values ('c8400000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','{}'::jsonb,'PENDING')$$,'a PENDING medical-history form defaults at version one');
select extensions.is((select answers from public.intake_forms where id='c8400000-0000-0000-0000-000000000001'),'{}'::jsonb,'intake answers default to an empty object');
select extensions.is((select status from public.intake_forms where id='c8400000-0000-0000-0000-000000000001'),'PENDING','intake forms default to PENDING');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','LOCKED','v1')$$,'23514',null,'form type is bounded to MEDICAL_HISTORY/DENTAL_HISTORY/CONSENT');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version, answers) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','[]'::jsonb)$$,'23514',null,'intake answers must be a JSON object');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version, answers) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1',('{"a":"' || repeat('x',16500) || '"}')::jsonb)$$,'23514',null,'intake answers are bounded to 16KB');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','CONSENT','v1')$$,'23514',null,'a CONSENT form requires a consent template');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version, consent_template_id) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','c8300000-0000-0000-0000-000000000001')$$,'23514',null,'a non-CONSENT form cannot carry a consent template');
select extensions.throws_ok($$insert into public.intake_forms (id, organization_id, branch_id, patient_id, form_type, template_version, status, submitted_via, submitted_at) values ('c8400000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','SUBMITTED','LINK',null)$$,'23514',null,'a LINK submission requires submitted_at');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version, status, signed_by, signed_at) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','PRINTED',null,null)$$,'23514',null,'a PRINTED form requires a signer and signed_at');
select extensions.throws_ok($$insert into public.intake_forms (organization_id, branch_id, patient_id, form_type, template_version, status, signed_at) values ('c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1','PENDING',statement_timestamp())$$,'23514',null,'a PENDING form cannot carry signed_at');
select extensions.throws_ok($$insert into public.intake_forms (id, organization_id, branch_id, patient_id, form_type, template_version) values ('c8400000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001','c8100000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','MEDICAL_HISTORY','v1')$$,'23505',null,'the (organization_id, id) unique key rejects a duplicate form identity');

-- intake_links: only a SHA-256 token hash is stored, unique per link.
select extensions.lives_ok($$insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values ('c8000000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000001',repeat('a',64),'ACTIVE',statement_timestamp() + interval '7 days')$$,'an ACTIVE link with a 64-hex token hash is accepted');
select extensions.throws_ok($$insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values ('c8000000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000001','not-a-hash','ACTIVE',statement_timestamp() + interval '7 days')$$,'23514',null,'a non-hex token hash is rejected');
select extensions.throws_ok($$insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values ('c8000000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000001',repeat('a',64),'ACTIVE',statement_timestamp() + interval '7 days')$$,'23505',null,'the token hash is unique across all links');
select extensions.throws_ok($$insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values ('c8000000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000001','c8400000-0000-0000-0000-000000000001',repeat('b',64),'LIVE',statement_timestamp() + interval '7 days')$$,'23514',null,'link status is bounded to ACTIVE/EXPIRED/REVOKED');
select extensions.throws_ok($$insert into public.intake_links (organization_id, patient_id, intake_form_id, token_hash, status, expires_at) values ('c8000000-0000-0000-0000-000000000001','c8200000-0000-0000-0000-000000000002','c8400000-0000-0000-0000-000000000001',repeat('c',64),'ACTIVE',statement_timestamp() + interval '7 days')$$,'23503',null,'a link cannot reference a foreign-organization patient');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;