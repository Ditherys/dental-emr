begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a3010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dentist-a@p203.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a3010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@p203.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('a3020000-0000-0000-0000-000000000001', 'P203 Synthetic A Inc.', 'P203 Synthetic A', 'p203-synthetic-a'),
  ('a3020000-0000-0000-0000-000000000002', 'P203 Synthetic B Inc.', 'P203 Synthetic B', 'p203-synthetic-b');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at)
values
  ('a3030000-0000-0000-0000-000000000001', 'a3020000-0000-0000-0000-000000000001', 'a3010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('a3030000-0000-0000-0000-000000000002', 'a3020000-0000-0000-0000-000000000001', 'a3010000-0000-0000-0000-000000000002', 'active', statement_timestamp());

insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select 'a3020000-0000-0000-0000-000000000001', 'a3030000-0000-0000-0000-000000000001', id, 'a3010000-0000-0000-0000-000000000001'
from public.roles where organization_id is null and code = 'DENTIST';

insert into public.member_roles (organization_id, organization_member_id, role_id, assigned_by)
select 'a3020000-0000-0000-0000-000000000001', 'a3030000-0000-0000-0000-000000000002', id, 'a3010000-0000-0000-0000-000000000002'
from public.roles where organization_id is null and code = 'OWNER';

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date)
values
  ('a3040000-0000-0000-0000-000000000001', 'a3020000-0000-0000-0000-000000000001', 'P203-A-0001', 'Minor', 'Synthetic', date '2015-01-01'),
  ('a3040000-0000-0000-0000-000000000002', 'a3020000-0000-0000-0000-000000000001', 'P203-A-0002', 'Guardian', 'Synthetic', date '1985-01-01'),
  ('a3040000-0000-0000-0000-000000000003', 'a3020000-0000-0000-0000-000000000002', 'P203-B-0001', 'Foreign', 'Synthetic', date '1980-01-01');

insert into public.patient_contacts (organization_id, patient_id, contact_type, value, is_primary)
values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'MOBILE', '0917 123 4567', true);

insert into public.patient_relationships (
  organization_id, patient_id, external_contact_name, external_mobile,
  external_email, relationship_type, is_legal_guardian, can_consent
)
values (
  'a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001',
  'External Guardian', '+63 (917) 123-4567', 'GUARDIAN@EXAMPLE.TEST', 'GUARDIAN', true, true
);

select extensions.ok(to_regclass('public.patient_contacts') is not null, 'patient contacts exists');
select extensions.ok(to_regclass('public.patient_relationships') is not null, 'patient relationships exists');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.patient_contacts'::regclass), 'patient contacts has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.patient_relationships'::regclass), 'patient relationships has RLS enabled');
select extensions.is(private.normalize_patient_mobile('0917 123 4567'), '+639171234567', 'Philippine mobile values canonicalize to E.164');
select extensions.is(private.normalize_patient_email('  USER@EXAMPLE.TEST  '), 'user@example.test', 'email normalization is ASCII-lowercase and trimmed');
select extensions.is((select normalized_value from public.patient_contacts where organization_id = 'a3020000-0000-0000-0000-000000000001' limit 1), '+639171234567', 'mobile contacts store the canonical duplicate value');
select extensions.ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'patient_relationships_organization_patient_status_idx'), 'tenant active relationship index exists');
select extensions.is(
  (select string_agg(attribute.attname, ',' order by index_column.ordinality)
   from pg_index as index_definition
   join pg_class as index_relation on index_relation.oid = index_definition.indexrelid
   join unnest(index_definition.indkey) with ordinality as index_column(attribute_number, ordinality) on true
   join pg_attribute as attribute on attribute.attrelid = index_definition.indrelid and attribute.attnum = index_column.attribute_number
   where index_relation.relname = 'patient_relationships_organization_patient_status_idx'),
  'organization_id,patient_id,status',
  'relationship index uses the required tenant/patient/status column order'
);
select extensions.throws_ok(
  $$insert into public.patient_contacts (organization_id, patient_id, contact_type, value, is_primary) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'MOBILE', '09171234568', true)$$,
  '23505', null, 'two active primary mobiles cannot commit'
);
select extensions.throws_ok(
  $$insert into public.patient_contacts (organization_id, patient_id, contact_type, value) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000003', 'EMAIL', 'foreign@example.test')$$,
  '23503', null, 'a contact cannot attach an Org B patient to Org A'
);
select extensions.throws_ok(
  $$insert into public.patient_relationships (organization_id, patient_id, related_patient_id, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000003', 'GUARDIAN')$$,
  '23503', null, 'a relationship cannot attach an Org B guardian to Org A'
);
select extensions.throws_ok(
  $$insert into public.patient_relationships (organization_id, patient_id, related_patient_id, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'GUARDIAN')$$,
  '23514', 'new row for relation "patient_relationships" violates check constraint "patient_relationships_not_self_check"', 'self relationships fail closed'
);
select extensions.throws_ok(
  $$insert into public.patient_relationships (organization_id, patient_id, related_patient_id, external_contact_name, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000002', 'Both Parties', 'GUARDIAN')$$,
  '23514', 'new row for relation "patient_relationships" violates check constraint "patient_relationships_exactly_one_related_party_check"', 'relationships cannot combine a related patient and external party'
);
select extensions.throws_ok(
  $$insert into public.patient_relationships (organization_id, patient_id, related_patient_id, external_mobile, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000002', '+639171234567', 'GUARDIAN')$$,
  '23514', 'new row for relation "patient_relationships" violates check constraint "patient_relationships_external_contacts_only_check"', 'related-patient relationships cannot carry external contact values'
);
select extensions.lives_ok(
  $$insert into public.patient_relationships (organization_id, patient_id, related_patient_id, relationship_type, is_legal_guardian) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000002', 'GUARDIAN', true)$$,
  'a minor may have a related-patient guardian'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.patient_contacts', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('anon', 'public.patient_contacts', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('service_role', 'public.patient_contacts', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.patient_relationships', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('anon', 'public.patient_relationships', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('service_role', 'public.patient_relationships', 'SELECT, INSERT, UPDATE, DELETE'),
  'browser and service roles have no direct child-table privileges'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a3010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok($$select * from public.patient_contacts$$, '42501', null, 'direct authenticated contact SELECT is privilege-denied');
select extensions.throws_ok($$insert into public.patient_contacts (organization_id, patient_id, contact_type, value) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'EMAIL', 'denied@example.test')$$, '42501', null, 'direct authenticated contact DML is privilege-denied');
select extensions.throws_ok($$select * from public.patient_relationships$$, '42501', null, 'direct authenticated relationship SELECT is privilege-denied');
select extensions.throws_ok($$insert into public.patient_relationships (organization_id, patient_id, external_contact_name, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'Denied', 'GUARDIAN')$$, '42501', null, 'direct authenticated relationship DML is privilege-denied');
reset role;

set local role anon;
select extensions.throws_ok($$select * from public.patient_contacts$$, '42501', null, 'anon contact SELECT is privilege-denied');
select extensions.throws_ok($$insert into public.patient_contacts (organization_id, patient_id, contact_type, value) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'EMAIL', 'denied@example.test')$$, '42501', null, 'anon contact DML is privilege-denied');
select extensions.throws_ok($$select * from public.patient_relationships$$, '42501', null, 'anon relationship SELECT is privilege-denied');
select extensions.throws_ok($$insert into public.patient_relationships (organization_id, patient_id, external_contact_name, relationship_type) values ('a3020000-0000-0000-0000-000000000001', 'a3040000-0000-0000-0000-000000000001', 'Denied', 'GUARDIAN')$$, '42501', null, 'anon relationship DML is privilege-denied');
reset role;

grant select on public.patient_contacts, public.patient_relationships to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a3010000-0000-0000-0000-000000000001', true);
select extensions.is((select count(*)::integer from public.patient_contacts), 1, 'authorized dentist can satisfy child-table RLS');
select extensions.is((select count(*)::integer from public.patient_relationships), 2, 'authorized dentist can read active guardian relationships');
select set_config('request.jwt.claim.sub', 'a3010000-0000-0000-0000-000000000002', true);
select extensions.is((select count(*)::integer from public.patient_contacts), 1, 'owner can read shared child contacts with organization-wide authority');
select extensions.is((select count(*)::integer from public.patient_relationships), 2, 'owner can read shared guardian relationships with organization-wide authority');
reset role;

update public.organization_members
set membership_status = 'suspended', suspended_at = statement_timestamp()
where id = 'a3030000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a3010000-0000-0000-0000-000000000001', true);
select extensions.is((select count(*)::integer from public.patient_contacts), 0, 'suspended dentist cannot read child contacts');
select extensions.is((select count(*)::integer from public.patient_relationships), 0, 'suspended dentist cannot read child relationships');
reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result
from test_failures;

rollback;
