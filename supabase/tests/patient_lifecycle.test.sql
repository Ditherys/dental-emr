begin;
select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a8010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','writer@p208.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('a8010000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','foreign@p208.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('a8020000-0000-0000-0000-000000000001','P208 Synthetic Inc.','P208 Synthetic','p208-synthetic'),
  ('a8020000-0000-0000-0000-000000000002','P208 Foreign Inc.','P208 Foreign','p208-foreign');
insert into public.branches (id,organization_id,name,slug,code,address_line1,city,province) values
  ('a8030000-0000-0000-0000-000000000001','a8020000-0000-0000-0000-000000000001','P208','p208','P208','1 Test','Test','Test'),
  ('a8030000-0000-0000-0000-000000000002','a8020000-0000-0000-0000-000000000002','Foreign','p208f','P208F','1 Test','Test','Test');
insert into public.organization_members (id,organization_id,user_id,membership_status,joined_at) values
  ('a8040000-0000-0000-0000-000000000001','a8020000-0000-0000-0000-000000000001','a8010000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('a8040000-0000-0000-0000-000000000002','a8020000-0000-0000-0000-000000000002','a8010000-0000-0000-0000-000000000002','active',statement_timestamp());
insert into public.branch_memberships (organization_id,organization_member_id,branch_id) values
  ('a8020000-0000-0000-0000-000000000001','a8040000-0000-0000-0000-000000000001','a8030000-0000-0000-0000-000000000001'),
  ('a8020000-0000-0000-0000-000000000002','a8040000-0000-0000-0000-000000000002','a8030000-0000-0000-0000-000000000002');
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select 'a8020000-0000-0000-0000-000000000001','a8040000-0000-0000-0000-000000000001',id,'a8030000-0000-0000-0000-000000000001','a8010000-0000-0000-0000-000000000001' from public.roles where organization_id is null and code = 'DENTIST';
insert into public.member_roles (organization_id,organization_member_id,role_id,branch_id,assigned_by)
select 'a8020000-0000-0000-0000-000000000002','a8040000-0000-0000-0000-000000000002',id,'a8030000-0000-0000-0000-000000000002','a8010000-0000-0000-0000-000000000002' from public.roles where organization_id is null and code = 'DENTIST';
insert into public.patients (id,organization_id,patient_number,first_name,last_name,birth_date,status) values
  ('a8050000-0000-0000-0000-000000000001','a8020000-0000-0000-0000-000000000001','P-000001','Ana','Patient',date '1990-01-01','active'),
  ('a8050000-0000-0000-0000-000000000002','a8020000-0000-0000-0000-000000000001','P-000002','Bea','Patient',date '1991-01-01','active'),
  ('a8050000-0000-0000-0000-000000000004','a8020000-0000-0000-0000-000000000001','P-000003','Ina','Patient',date '1992-01-01','inactive'),
  ('a8050000-0000-0000-0000-000000000003','a8020000-0000-0000-0000-000000000002','P-000001','Foreign','Patient',date '1992-01-01','active');

select extensions.ok(
  has_function_privilege('authenticated','public.archive_patient(uuid,uuid,integer)','EXECUTE')
  and has_function_privilege('authenticated','public.reactivate_patient(uuid,uuid,integer)','EXECUTE')
  and not has_function_privilege('service_role','public.archive_patient(uuid,uuid,integer)','EXECUTE'),
  'only authenticated receives lifecycle RPC grants'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.patients','UPDATE')
  and not has_table_privilege('service_role','public.patients','UPDATE'),
  'lifecycle does not add direct patient DML grants'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',1)$$,
  '42501','AAL2 required','AAL1 cannot archive despite live write permission'
);
select extensions.throws_ok(
  $$select public.reactivate_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',1)$$,
  '42501','AAL2 required','AAL1 cannot reactivate despite live write permission'
);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.is(
  (select version from public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',1)),
  2,'archive increments the locked patient version'
);
select extensions.is((select (public.search_patients('a8030000-0000-0000-0000-000000000001')->>'total')::integer),2,'the default patient search excludes archived patients but retains inactive patients');
select extensions.is((select (public.search_patients('a8030000-0000-0000-0000-000000000001', null, null, 'archived')->>'total')::integer),1,'an explicit authorized archived filter finds archived patients');
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',2)$$,
  'P0001','invalid state','archive rejects an already archived patient'
);
select extensions.throws_ok(
  $$select public.reactivate_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',1)$$,
  'P0001','stale version','reactivation rejects a stale version'
);
select extensions.is(
  (select version from public.reactivate_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',2)),
  3,'reactivation restores the patient and increments version'
);
select extensions.throws_ok(
  $$select public.reactivate_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',3)$$,
  'P0001','invalid state','reactivation rejects an active patient'
);
reset role;
select extensions.ok(
  (select status = 'active' and archived_at is null from public.patients where id = 'a8050000-0000-0000-0000-000000000001'),
  'reactivation restores the archive timestamp invariant'
);
select extensions.is(
  (select count(*)::integer from public.audit_events where patient_id = 'a8050000-0000-0000-0000-000000000001' and action in ('patient.archived','patient.reactivated')),
  2,'each successful lifecycle transition records one opaque audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000003',1)$$,
  '42501','not authorized','foreign patient existence is not disclosed'
);
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000002','a8050000-0000-0000-0000-000000000001',3)$$,
  '42501','not authorized','foreign acting branch is rejected'
);
reset role;

create function private.p208_reject_lifecycle_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'patient.archived' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if;
  return new;
end;
$$;
create trigger p208_reject_lifecycle_audit before insert on public.audit_events for each row execute function private.p208_reject_lifecycle_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000002',1)$$,
  'P0001','audit blocked','an audit insertion failure rejects archive'
);
reset role;
select extensions.is((select status from public.patients where id = 'a8050000-0000-0000-0000-000000000002'),'active','audit failure rolls back archive');
drop trigger p208_reject_lifecycle_audit on public.audit_events;
drop function private.p208_reject_lifecycle_audit();
update public.organization_members set membership_status = 'suspended', suspended_at = statement_timestamp() where id = 'a8040000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a8010000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select extensions.throws_ok(
  $$select public.archive_patient('a8030000-0000-0000-0000-000000000001','a8050000-0000-0000-0000-000000000001',3)$$,
  '42501','not authorized','suspension is rechecked at lifecycle boundary'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result from test_failures;
rollback;
