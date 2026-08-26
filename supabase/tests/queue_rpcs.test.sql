begin;

select extensions.no_plan();

-- Synthetic-only P7-02 graph. The queue RPCs are SECURITY DEFINER and read the
-- actor from the request.jwt.claim.sub GUC, so the whole chain runs as postgres
-- with set_config-driven auth.uid(); base tables stay deny-by-default and are
-- never touched by the authenticated role.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b8100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p702.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','no-perm@p702.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b8100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-b@p702.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b8200000-0000-0000-0000-000000000001','P702 Synthetic A Inc.','P702 A','p702-a'),
  ('b8200000-0000-0000-0000-000000000002','P702 Synthetic B Inc.','P702 B','p702-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b8300000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P702 A Main','p702-a-main','P702-A','1 Synthetic St','Test City','Test Province'),
  ('b8300000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P702 B Main','p702-b-main','P702-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b8400000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b8400000-0000-0000-0000-000000000003','b8200000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000003','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8400000-0000-0000-0000-000000000001','active'),
  ('b8200000-0000-0000-0000-000000000001','b8300000-0000-0000-0000-000000000001','b8400000-0000-0000-0000-000000000002','active'),
  ('b8200000-0000-0000-0000-000000000002','b8300000-0000-0000-0000-000000000002','b8400000-0000-0000-0000-000000000003','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b8200000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b8300000-0000-0000-0000-000000000001'::uuid,'b8100000-0000-0000-0000-000000000001'::uuid),
  ('b8200000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000002'::uuid,'BILLING'::text,'b8300000-0000-0000-0000-000000000001'::uuid,'b8100000-0000-0000-0000-000000000002'::uuid),
  ('b8200000-0000-0000-0000-000000000002'::uuid,'b8400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'b8300000-0000-0000-0000-000000000002'::uuid,'b8100000-0000-0000-0000-000000000003'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b8500000-0000-0000-0000-000000000001','b8200000-0000-0000-0000-000000000001','P702-A-0001','Patient','A',date '1990-01-01','b8300000-0000-0000-0000-000000000001'),
  ('b8500000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','P702-B-0001','Patient','B',date '1991-01-01','b8300000-0000-0000-0000-000000000002');

select extensions.is((select procedure.proconfig from pg_proc as procedure where procedure.oid='private.has_queue_permission_at_branch(uuid,text)'::regprocedure),array['search_path=""']::text[],'the queue permission helper fixes an empty search path');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) where has_function_privilege(role.role_oid,'private.has_queue_permission_at_branch(uuid,text)','execute')),'the queue helper is not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000001',true);

select extensions.lives_ok($$select public.create_walkin_entry('b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','sensitive tooth')$$,'a receptionist can create a walk-in queue entry without a fake appointment');
select extensions.is((select count(*)::integer from public.queue_entries),1,'exactly one walk-in queue entry exists');
select extensions.is((select status from public.queue_entries limit 1),'WAITING','walk-in entries default to WAITING');
select extensions.is((select version from public.queue_entries limit 1),1,'walk-in entries start at optimistic version one');
select extensions.is((select count(*)::integer from public.audit_events where action='queue.entry.created'),1,'walk-in creation emits exactly one audit event');
select extensions.throws_ok($$select public.create_walkin_entry('b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000002','pain')$$,'42501',null,'a walk-in cannot reference a foreign patient');

select extensions.lives_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),1,'READY')$$,'WAITING can advance to READY');
select extensions.is((select status from public.queue_entries limit 1),'READY','queue entry advanced to READY');
select extensions.is((select count(*)::integer from public.audit_events where action='queue.entry.status_updated'),1,'each queue transition emits exactly one audit event');

select extensions.lives_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),2,'CALLED')$$,'READY can advance to CALLED');
select extensions.lives_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),3,'IN_CHAIR')$$,'CALLED can advance to IN_CHAIR');
select extensions.lives_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),4,'COMPLETED')$$,'IN_CHAIR can advance to COMPLETED');
select extensions.is((select completed_at is not null from public.queue_entries limit 1),true,'COMPLETED sets the completion timestamp');
select extensions.is((select version from public.queue_entries limit 1),5,'queue version advances with each transition');
select extensions.is((select count(*)::integer from public.audit_events where action='queue.entry.status_updated'),4,'every queue transition emits exactly one audit event');
select extensions.throws_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),4,'READY')$$,'P0001','stale version','stale versions are rejected');
select extensions.throws_ok($$select public.update_queue_status('b8300000-0000-0000-0000-000000000001',(select id from public.queue_entries limit 1),5,'CALLED')$$,'P0001','invalid state','terminal queue entries reject further transitions');
select extensions.is((select count(*)::integer from public.list_queue('b8300000-0000-0000-0000-000000000001',false)),0,'completed entries are hidden from the active queue by default');
select extensions.is((select count(*)::integer from public.list_queue('b8300000-0000-0000-0000-000000000001',true)),1,'include_terminal reveals the completed entry');

select extensions.lives_ok($$select public.create_walkin_entry('b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','second walk-in')$$,'a second walk-in can be created');
select extensions.is((select count(*)::integer from public.list_queue('b8300000-0000-0000-0000-000000000001',false)),1,'the active queue lists only the non-terminal walk-in');

select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.create_walkin_entry('b8300000-0000-0000-0000-000000000001','b8500000-0000-0000-0000-000000000001','pain')$$,'42501',null,'a user without queue.manage cannot create a walk-in');
select extensions.throws_ok($$select public.list_queue('b8300000-0000-0000-0000-000000000001',false)$$,'42501',null,'a user without queue.read cannot view the queue');

select set_config('request.jwt.claim.sub','b8100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_queue('b8300000-0000-0000-0000-000000000001',false)$$,'42501',null,'a foreign-organization user cannot view the Org A queue');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;