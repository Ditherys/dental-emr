begin;

select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a6010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer@p206.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('a6010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@p206.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('a6020000-0000-0000-0000-000000000001', 'P206 Synthetic Inc.', 'P206 Synthetic', 'p206-synthetic'),
  ('a6020000-0000-0000-0000-000000000002', 'P206 Foreign Inc.', 'P206 Foreign', 'p206-foreign');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('a6030000-0000-0000-0000-000000000001', 'a6020000-0000-0000-0000-000000000001', 'P206 A', 'p206-a', 'P206-A', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('a6030000-0000-0000-0000-000000000002', 'a6020000-0000-0000-0000-000000000001', 'P206 B', 'p206-b', 'P206-B', '2 Synthetic Street', 'Test City', 'Test Province'),
  ('a6030000-0000-0000-0000-000000000003', 'a6020000-0000-0000-0000-000000000002', 'P206 Foreign', 'p206-foreign', 'P206-F', '3 Synthetic Street', 'Test City', 'Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('a6040000-0000-0000-0000-000000000001', 'a6020000-0000-0000-0000-000000000001', 'a6010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('a6040000-0000-0000-0000-000000000002', 'a6020000-0000-0000-0000-000000000002', 'a6010000-0000-0000-0000-000000000002', 'active', statement_timestamp());
insert into public.branch_memberships (organization_id, organization_member_id, branch_id) values
  ('a6020000-0000-0000-0000-000000000001', 'a6040000-0000-0000-0000-000000000001', 'a6030000-0000-0000-0000-000000000001');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select 'a6020000-0000-0000-0000-000000000001', 'a6040000-0000-0000-0000-000000000001', id, 'a6030000-0000-0000-0000-000000000001', 'a6010000-0000-0000-0000-000000000001'
from public.roles where organization_id is null and code = 'DENTIST';
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('a6050000-0000-0000-0000-000000000001', 'a6020000-0000-0000-0000-000000000001', 'P-000001', 'Ana', 'Santos', date '1990-01-01', 'a6030000-0000-0000-0000-000000000002'),
  ('a6050000-0000-0000-0000-000000000002', 'a6020000-0000-0000-0000-000000000001', 'P-000002', 'Bea', 'Other', date '1991-01-01', null),
  ('a6050000-0000-0000-0000-000000000003', 'a6020000-0000-0000-0000-000000000002', 'P-000001', 'Foreign', 'Patient', date '1992-01-01', null);

select extensions.ok(
  has_function_privilege('authenticated', 'public.update_patient(uuid,uuid,integer,jsonb,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.update_patient(uuid,uuid,integer,jsonb,boolean)', 'EXECUTE'),
  'only authenticated receives the demographics update RPC grant'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a6010000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select version from public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 1, '{"city":"Updated City"}'::jsonb, false)),
  2,
  'a valid PATCH increments the target version'
);
reset role;
select extensions.is(
  (select preferred_branch_id from public.patients where id = 'a6050000-0000-0000-0000-000000000001'),
  'a6030000-0000-0000-0000-000000000002'::uuid,
  'omitted preferred branch preserves an inaccessible same-organization preference'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a6010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 2, '{"preferredBranchId":"a6030000-0000-0000-0000-000000000002"}'::jsonb, false)$$,
  '42501', 'not authorized', 'a branch-scoped writer cannot set an inaccessible preferred branch'
);
select extensions.is(
  (select version from public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 2, '{"preferredBranchId":null}'::jsonb, false)),
  3,
  'explicit null clears the preferred branch'
);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 2, '{"city":"Stale"}'::jsonb, false)$$,
  'P0001', 'stale version', 'a stale write cannot overwrite a newer edit'
);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 3, '{"organizationId":"a6020000-0000-0000-0000-000000000002"}'::jsonb, false)$$,
  '22023', 'invalid input', 'tenant and immutable fields cannot be mass assigned'
);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000003', 1, '{"city":"Foreign"}'::jsonb, false)$$,
  '42501', 'not authorized', 'a foreign patient is not disclosed to the caller'
);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 3, '{"firstName":"Bea","lastName":"Other","birthDate":"1991-01-01"}'::jsonb, false)$$,
  'P0001', 'duplicate review required', 'a changed name/DOB key is rechecked under the duplicate lock'
);
select extensions.is(
  (select version from public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 3, '{"firstName":"Bea","lastName":"Other","birthDate":"1991-01-01"}'::jsonb, true)),
  4,
  'a confirmed duplicate demographics correction commits'
);
reset role;
select extensions.is(
  (select action from public.audit_events where patient_id = 'a6050000-0000-0000-0000-000000000001' order by occurred_at desc limit 1),
  'patient.demographics.updated_duplicate_override',
  'confirmed duplicate update records the override action atomically'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where patient_id = 'a6050000-0000-0000-0000-000000000001' and action like 'patient.demographics.updated%'),
  3,
  'each successful demographics mutation has exactly one patient-linked audit event'
);
create function private.p206_reject_demographics_audit()
returns trigger language plpgsql as $$
begin
  if new.action = 'patient.demographics.updated' then
    raise exception using errcode = 'P0001', message = 'audit blocked';
  end if;
  return new;
end;
$$;
create trigger p206_reject_demographics_audit
before insert on public.audit_events
for each row execute function private.p206_reject_demographics_audit();
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a6010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000002', 1, '{"city":"Should Roll Back"}'::jsonb, false)$$,
  'P0001', 'audit blocked', 'an audit insertion failure rejects the mutation'
);
reset role;
select extensions.is(
  (select city from public.patients where id = 'a6050000-0000-0000-0000-000000000002'),
  null,
  'audit failure rolls back the demographics update'
);
drop trigger p206_reject_demographics_audit on public.audit_events;
drop function private.p206_reject_demographics_audit();
update public.organization_members set membership_status = 'suspended', suspended_at = statement_timestamp()
where id = 'a6040000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a6010000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.update_patient('a6030000-0000-0000-0000-000000000001', 'a6050000-0000-0000-0000-000000000001', 4, '{"city":"Denied"}'::jsonb, false)$$,
  '42501', 'not authorized', 'suspension is rechecked at the mutation boundary'
);
reset role;

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result
from test_failures;

rollback;
