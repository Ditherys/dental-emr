begin;

select extensions.no_plan();

-- Synthetic-only P9-03 graph. The calendar RPCs are SECURITY DEFINER and read
-- the actor from the request.jwt.claim.sub GUC, so the whole chain runs as
-- postgres with set_config-driven auth.uid(); base tables stay deny-by-default
-- and are never touched by the authenticated role. dentist-a is the positive
-- actor (DENTIST, calendar.manage at A Main); billing-a and receptionist-a hold
-- no calendar permission; receptionist-a has appointment.write for the trigger
-- tests; dentist-b is a foreign-org DENTIST. provider-a1 is active at A Main
-- with a CONNECTED integration, provider-a2 is active with no integration,
-- provider-a3 is in Org A but not assigned to a branch, provider-b is foreign.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b9a20000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p903.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9a20000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p903.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9a20000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p903.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9a20000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p903.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b9a00000-0000-0000-0000-000000000001','P903 Synthetic A Inc.','P903 A','p903-a'),
  ('b9a00000-0000-0000-0000-000000000002','P903 Synthetic B Inc.','P903 B','p903-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b9a10000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','P903 A Main','p903-a-main','P903-A','1 Synthetic St','Test City','Test Province'),
  ('b9a10000-0000-0000-0000-000000000002','b9a00000-0000-0000-0000-000000000002','P903 B Main','p903-b-main','P903-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b9a30000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','b9a20000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b9a30000-0000-0000-0000-000000000002','b9a00000-0000-0000-0000-000000000001','b9a20000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b9a30000-0000-0000-0000-000000000003','b9a00000-0000-0000-0000-000000000001','b9a20000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b9a30000-0000-0000-0000-000000000004','b9a00000-0000-0000-0000-000000000002','b9a20000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b9a00000-0000-0000-0000-000000000001','b9a10000-0000-0000-0000-000000000001','b9a30000-0000-0000-0000-000000000001','active'),
  ('b9a00000-0000-0000-0000-000000000001','b9a10000-0000-0000-0000-000000000001','b9a30000-0000-0000-0000-000000000002','active'),
  ('b9a00000-0000-0000-0000-000000000001','b9a10000-0000-0000-0000-000000000001','b9a30000-0000-0000-0000-000000000003','active'),
  ('b9a00000-0000-0000-0000-000000000002','b9a10000-0000-0000-0000-000000000002','b9a30000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b9a00000-0000-0000-0000-000000000001'::uuid,'b9a30000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,'b9a10000-0000-0000-0000-000000000001'::uuid,'b9a20000-0000-0000-0000-000000000001'::uuid),
  ('b9a00000-0000-0000-0000-000000000001'::uuid,'b9a30000-0000-0000-0000-000000000002'::uuid,'BILLING'::text,'b9a10000-0000-0000-0000-000000000001'::uuid,'b9a20000-0000-0000-0000-000000000002'::uuid),
  ('b9a00000-0000-0000-0000-000000000001'::uuid,'b9a30000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'b9a10000-0000-0000-0000-000000000001'::uuid,'b9a20000-0000-0000-0000-000000000003'::uuid),
  ('b9a00000-0000-0000-0000-000000000002'::uuid,'b9a30000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,'b9a10000-0000-0000-0000-000000000002'::uuid,'b9a20000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b9a40000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','P903-A-0001','Patient','A',date '1990-01-01','b9a10000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('c9a10000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('c9a10000-0000-0000-0000-000000000002','b9a00000-0000-0000-0000-000000000001','Dentist','A2','REGULAR','active'),
  ('c9a10000-0000-0000-0000-000000000003','b9a00000-0000-0000-0000-000000000001','Dentist','A3','REGULAR','active'),
  ('c9a10000-0000-0000-0000-000000000004','b9a00000-0000-0000-0000-000000000002','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b9a00000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','b9a10000-0000-0000-0000-000000000001',true),
  ('b9a00000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000002','b9a10000-0000-0000-0000-000000000001',true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
select 'b9a00000-0000-0000-0000-000000000001', provider_id, 'b9a10000-0000-0000-0000-000000000001',
  EXTRACT(DOW FROM '2026-01-05 09:00:00+00'::timestamptz), time '08:00', time '18:00', date '2026-01-01'
from (values ('c9a10000-0000-0000-0000-000000000001'::uuid), ('c9a10000-0000-0000-0000-000000000002'::uuid)) as provider(provider_id);
insert into public.calendar_integrations (id, organization_id, provider_id, google_account_ref, calendar_id, privacy_mode, connection_status) values
  ('c9a20000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','opaque-a1','a1@gmail.com','HIGH_PRIVACY','CONNECTED');
-- Appt-a1 is the direct RPC fixture. The deferred insert trigger is queued but
-- appt-a1 has no appointment_providers, so it never enqueues anything.
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status) values
  ('c9a30000-0000-0000-0000-000000000001','b9a00000-0000-0000-0000-000000000001','b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','PENDING');

-- Boundary assertions: eleven SECURITY DEFINER definers pin an empty search
-- path, only authenticated holds the eight RPC grants, and the three private
-- objects are revoked from every browser and service role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.enqueue_calendar_sync(uuid,uuid,uuid,text)'::regprocedure,
  'public.list_calendar_syncs(uuid,uuid)'::regprocedure,
  'public.claim_due_calendar_syncs(uuid,integer)'::regprocedure,
  'public.acknowledge_calendar_sync(uuid,uuid,text)'::regprocedure,
  'public.fail_calendar_sync(uuid,uuid,text)'::regprocedure,
  'public.connect_calendar(uuid,uuid,text,text)'::regprocedure,
  'public.disconnect_calendar(uuid,uuid)'::regprocedure,
  'public.list_calendar_integrations(uuid)'::regprocedure,
  'private.has_calendar_permission_at_branch(uuid,text)'::regprocedure,
  'private.enqueue_calendar_sync_internal(uuid,uuid,uuid,text)'::regprocedure,
  'private.appointment_calendar_sync_trigger()'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),11,'the eleven P9-03 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.enqueue_calendar_sync(uuid,uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.list_calendar_syncs(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.claim_due_calendar_syncs(uuid,integer)','execute')
  and has_function_privilege('authenticated','public.acknowledge_calendar_sync(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.fail_calendar_sync(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.connect_calendar(uuid,uuid,text,text)','execute')
  and has_function_privilege('authenticated','public.disconnect_calendar(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.list_calendar_integrations(uuid)','execute')
  and not has_function_privilege('anon','public.enqueue_calendar_sync(uuid,uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.enqueue_calendar_sync(uuid,uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.connect_calendar(uuid,uuid,text,text)','execute'),
  'only authenticated has the eight exact P9-03 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_calendar_permission_at_branch(uuid,text)'),
    ('private.enqueue_calendar_sync_internal(uuid,uuid,uuid,text)'),
    ('private.appointment_calendar_sync_trigger()')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the calendar private helpers and trigger are not executable by browser or service roles');
select extensions.ok((select tgdeferrable and tginitdeferred from pg_trigger where tgname='appointments_calendar_sync_after_insert'),'the calendar insert trigger is deferred so the enqueue can see the ASSIGNED providers');
select extensions.ok((select exists (select 1 from pg_trigger where tgname='appointments_calendar_sync_after_update')),'the calendar update trigger fires on scheduling_status/starts_at/ends_at changes');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b9a20000-0000-0000-0000-000000000001',true);

-- enqueue_calendar_sync: positive + idempotency + validation.
select extensions.is((select status from public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE')),'QUEUED','a dentist enqueues a QUEUED CREATE sync');
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and idempotency_key='cal-CREATE-c9a30000-0000-0000-0000-000000000001-c9a10000-0000-0000-0000-000000000001'),1,'the CREATE sync is enqueued once');
select extensions.is((select sync_job_id from public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE')),(select id from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and idempotency_key='cal-CREATE-c9a30000-0000-0000-0000-000000000001-c9a10000-0000-0000-0000-000000000001'),'an idempotent re-enqueue returns the existing job');
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and idempotency_key='cal-CREATE-c9a30000-0000-0000-0000-000000000001-c9a10000-0000-0000-0000-000000000001'),1,'a duplicate idempotency key never creates a second job');
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000002','CREATE')$$,'P0001','calendar not connected','a provider without a CONNECTED integration cannot be enqueued');
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000003','CREATE')$$,'22023','invalid input','a provider not active at the acting branch is rejected');
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000004','CREATE')$$,'42501','not authorized','a foreign-organization provider is denied');
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','DELETE')$$,'22023','invalid input','invented operations are rejected');

-- list_calendar_syncs: bounded projection, appointment filter, no event titles.
select extensions.ok((select pg_proc.proargnames::text[] from pg_proc where pg_proc.oid='public.list_calendar_syncs(uuid,uuid)'::regprocedure) @> array['sync_job_id','appointment_id','provider_id','provider_display_name','operation','status','attempts','next_attempt_at','external_event_id','created_at','version'],'list_calendar_syncs exposes only the approved projection');
select extensions.throws_ok($$select sync_row.event_title from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001') as sync_row$$,'42703',null,'list never exposes Google event titles or details');
select extensions.is((select count(*)::integer from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001')),1,'list returns every sync job for the acting branch');
select extensions.is((select count(*)::integer from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001')),1,'list filters by appointment');
select extensions.is((select count(*)::integer from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000002')),0,'list filters by a foreign or absent appointment');
select extensions.is((select provider_display_name from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001') where sync_job_id=(select id from public.calendar_sync_jobs where idempotency_key='cal-CREATE-c9a30000-0000-0000-0000-000000000001-c9a10000-0000-0000-0000-000000000001')),'Dentist A1','list renders the provider display name');
select extensions.is((select version from public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001') where sync_job_id=(select id from public.calendar_sync_jobs where idempotency_key='cal-CREATE-c9a30000-0000-0000-0000-000000000001-c9a10000-0000-0000-0000-000000000001')),1,'the version column defaults to the correlated link version');

-- claim_due_calendar_syncs: due QUEUED only, SKIP LOCKED, limit, status unchanged.
insert into public.calendar_sync_jobs (organization_id, appointment_id, provider_id, operation, idempotency_key, next_attempt_at) values
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE','p903-due','2020-01-01 00:00:00+00'),
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE','p903-future',statement_timestamp() + interval '1 day'),
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE','p903-processed','2020-01-01 00:00:00+00');
update public.calendar_sync_jobs set status='PROCESSED' where idempotency_key='p903-processed';
select extensions.is((select count(*)::integer from public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',1)),1,'claim respects the p_limit');
select extensions.ok((select not exists (select 1 from public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',10) where sync_job_id in (select id from public.calendar_sync_jobs where idempotency_key in ('p903-future','p903-processed')))),'claim never returns a future or already PROCESSED job');
select extensions.ok((select exists (select 1 from public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',10) where sync_job_id=(select id from public.calendar_sync_jobs where idempotency_key='p903-due'))),'claim returns the earliest due QUEUED job');
select extensions.is((select status from public.calendar_sync_jobs where idempotency_key='p903-due'),'QUEUED','claiming leaves the job status QUEUED for the worker to acknowledge');
select extensions.throws_ok($$select public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',0)$$,'22023','invalid input','claim rejects a limit below one');
select extensions.throws_ok($$select public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',51)$$,'22023','invalid input','claim rejects a limit above fifty');

-- acknowledge_calendar_sync: QUEUED -> PROCESSED, SYNCED link, integration stamp.
insert into public.calendar_sync_jobs (organization_id, appointment_id, provider_id, operation, idempotency_key, next_attempt_at) values
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE','p903-ack','2020-01-01 00:00:00+00');
select extensions.is((select status from public.acknowledge_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-ack'),'evt-a1')),'PROCESSED','acknowledgement moves a QUEUED job to PROCESSED');
select extensions.ok((select status='PROCESSED' and external_event_id='evt-a1' from public.calendar_sync_jobs where idempotency_key='p903-ack'),'acknowledgement stamps PROCESSED and the external event id');
select extensions.ok((select sync_status='SYNCED' and external_event_id='evt-a1' and last_synced_at is not null from public.calendar_event_links where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id='c9a30000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='CREATE'),'acknowledgement upserts a SYNCED event link');
select extensions.ok((select last_synced_at is not null from public.calendar_integrations where organization_id='b9a00000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000001'),'acknowledgement stamps the provider integration last_synced_at');
select extensions.throws_ok($$select public.acknowledge_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-ack'),'evt-a1-again')$$,'P0001','invalid state','an already PROCESSED job cannot be acknowledged again');
select extensions.throws_ok($$select public.acknowledge_calendar_sync('b9a10000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','evt-x')$$,'42501','not authorized','a job outside the acting organization is denied');
select extensions.throws_ok($$select public.acknowledge_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-due'),'')$$,'22023','invalid input','an empty external event id is rejected');

-- fail_calendar_sync: retries advance attempts and backoff; max_attempts terminalizes into a FAILED link.
insert into public.calendar_sync_jobs (organization_id, appointment_id, provider_id, operation, idempotency_key, next_attempt_at) values
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','UPDATE','p903-fail-1','2020-01-01 00:00:00+00');
insert into public.calendar_event_links (organization_id, appointment_id, provider_id, external_event_id, operation, sync_status) values
  ('b9a00000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','evt-update','UPDATE','SYNCED');
select extensions.is((select status from public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),'first failure')),'QUEUED','the first failure keeps the job QUEUED');
select extensions.is((select attempts=1 and next_attempt_at > statement_timestamp() from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),true,'the first failure records one attempt and advances backoff');
select extensions.is((select status from public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),null)),'QUEUED','the second failure keeps the job QUEUED');
select extensions.is((select attempts=2 from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),true,'the second failure records two attempts');
select extensions.is((select status from public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),'third failure')),'FAILED','the final failure terminalizes the job');
select extensions.ok((select attempts=3 from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),'a FAILED job records max attempts');
select extensions.ok((select sync_status='FAILED' and last_error='third failure' from public.calendar_event_links where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id='c9a30000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='UPDATE'),'terminal failure marks the existing event link FAILED with the bounded error');
select extensions.throws_ok($$select public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-fail-1'),null)$$,'P0001','invalid state','a FAILED job cannot be failed again');
select extensions.throws_ok($$select public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-due'),repeat('x',1001))$$,'22023','invalid input','an over-long error payload is rejected');

-- connect_calendar / disconnect_calendar: upsert, version, audit, denied paths.
select extensions.is((select version from public.connect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000002','a2@gmail.com','opaque-a2')),1,'connect upserts a CONNECTED integration at version one');
select extensions.ok((select connection_status='CONNECTED' and google_account_ref='opaque-a2' and calendar_id='a2@gmail.com' from public.calendar_integrations where organization_id='b9a00000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000002'),'connect stores the opaque reference and calendar id');
select extensions.is((select version from public.connect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000002','a2b@gmail.com','opaque-a2b')),2,'reconnecting the same provider bumps the version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b9a00000-0000-0000-0000-000000000001' and branch_id='b9a10000-0000-0000-0000-000000000001' and action='calendar.connected' and metadata='{}'::jsonb),2,'each connect appends one calendar.connected audit event');
select extensions.is((select integration_id from public.disconnect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000002')),(select id from public.calendar_integrations where organization_id='b9a00000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000002'),'disconnect returns the provider integration');
select extensions.ok((select connection_status='DISCONNECTED' and google_account_ref is null and version=3 from public.calendar_integrations where organization_id='b9a00000-0000-0000-0000-000000000001' and provider_id='c9a10000-0000-0000-0000-000000000002'),'disconnect clears the token reference and bumps the version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b9a00000-0000-0000-0000-000000000001' and branch_id='b9a10000-0000-0000-0000-000000000001' and action='calendar.disconnected' and metadata='{}'::jsonb),1,'disconnect appends one calendar.disconnected audit event');
select extensions.throws_ok($$select public.connect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000004','b1@gmail.com','opaque-b1')$$,'42501','not authorized','a foreign-organization provider cannot be connected');
select extensions.throws_ok($$select public.disconnect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000003')$$,'42501','not authorized','disconnecting a provider with no integration is denied');
select extensions.throws_ok($$select public.connect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','','opaque-x')$$,'22023','invalid input','an empty calendar id is rejected');

-- list_calendar_integrations: bounded projection, no google ref ever.
select extensions.ok((select pg_proc.proargnames::text[] from pg_proc where pg_proc.oid='public.list_calendar_integrations(uuid)'::regprocedure) @> array['integration_id','provider_id','provider_display_name','privacy_mode','connection_status','calendar_id','last_synced_at','version'],'list_calendar_integrations exposes only the approved projection');
select extensions.throws_ok($$select integration_row.google_account_ref from public.list_calendar_integrations('b9a10000-0000-0000-0000-000000000001') as integration_row$$,'42703',null,'list never returns google_account_ref');
select extensions.is((select count(*)::integer from public.list_calendar_integrations('b9a10000-0000-0000-0000-000000000001')),2,'list returns the connected and disconnected integrations at the acting branch');
select extensions.is((select string_agg(connection_status, ',' order by provider_id) from public.list_calendar_integrations('b9a10000-0000-0000-0000-000000000001')),'CONNECTED,DISCONNECTED','list reflects live connection status');

-- Permission denials across the surface.
select set_config('request.jwt.claim.sub','b9a20000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE')$$,'42501','not authorized','a user without calendar.manage cannot enqueue');
select extensions.throws_ok($$select public.list_calendar_syncs('b9a10000-0000-0000-0000-000000000001')$$,'42501','not authorized','a user without calendar.manage cannot list syncs');
select extensions.throws_ok($$select public.claim_due_calendar_syncs('b9a10000-0000-0000-0000-000000000001',10)$$,'42501','not authorized','a user without calendar.manage cannot claim jobs');
select extensions.throws_ok($$select public.acknowledge_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-due'),'evt-x')$$,'42501','not authorized','a user without calendar.manage cannot acknowledge');
select extensions.throws_ok($$select public.fail_calendar_sync('b9a10000-0000-0000-0000-000000000001',(select id from public.calendar_sync_jobs where idempotency_key='p903-due'))$$,'42501','not authorized','a user without calendar.manage cannot fail a job');
select extensions.throws_ok($$select public.connect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','a1@gmail.com','opaque-a1')$$,'42501','not authorized','a user without calendar.manage cannot connect');
select extensions.throws_ok($$select public.disconnect_calendar('b9a10000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001')$$,'42501','not authorized','a user without calendar.manage cannot disconnect');
select extensions.throws_ok($$select public.list_calendar_integrations('b9a10000-0000-0000-0000-000000000001')$$,'42501','not authorized','a user without calendar.manage cannot list integrations');
select set_config('request.jwt.claim.sub','b9a20000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE')$$,'42501','not authorized','a receptionist without calendar.manage cannot enqueue');
select set_config('request.jwt.claim.sub','b9a20000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.enqueue_calendar_sync('b9a10000-0000-0000-0000-000000000001','c9a30000-0000-0000-0000-000000000001','c9a10000-0000-0000-0000-000000000001','CREATE')$$,'42501','not authorized','a foreign-organization dentist cannot reach Org A');
select extensions.throws_ok($$select public.list_calendar_integrations('b9a10000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization dentist cannot list Org A integrations');

-- Appointment automation trigger: a receptionist (appointment.write, no
-- calendar.manage) creates an appointment for a provider with a CONNECTED
-- integration and the deferred insert trigger auto-enqueues exactly one CREATE.
select set_config('request.jwt.claim.sub','b9a20000-0000-0000-0000-000000000003',true);
select extensions.lives_ok($$select public.create_appointment('b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T10:00:00+00","endsAt":"2026-01-05T10:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9a10000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'a receptionist creates an appointment for a connected provider');
set constraints appointments_calendar_sync_after_insert immediate;
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='CREATE'),1,'creating an appointment for a connected provider auto-enqueues exactly one CREATE sync');
select extensions.is((select status from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='CREATE'),'QUEUED','the trigger-enqueued CREATE starts QUEUED');
select extensions.is((select idempotency_key from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='CREATE'),'cal-CREATE-' || (select id::text from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') || '-' || 'c9a10000-0000-0000-0000-000000000001','the trigger enqueue mirrors the stable cal-<op>-<appointment>-<provider> key');
set constraints appointments_calendar_sync_after_insert deferred;

-- Trigger: an appointment for a provider with no integration enqueues nothing.
select extensions.lives_ok($$select public.create_appointment('b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9a10000-0000-0000-0000-000000000002","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'an appointment for a provider with no integration is created');
set constraints appointments_calendar_sync_after_insert immediate;
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 11:00:00+00')),0,'an appointment for a provider without an integration enqueues nothing');
set constraints appointments_calendar_sync_after_insert deferred;

-- Trigger: cancelling enqueues a CANCEL for the synced provider.
select extensions.lives_ok($$select public.create_appointment('b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T12:00:00+00","endsAt":"2026-01-05T12:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9a10000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'the cancel fixture is created for a connected provider');
set constraints appointments_calendar_sync_after_insert immediate;
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and operation='CREATE'),1,'the cancel fixture auto-enqueues its CREATE');
set constraints appointments_calendar_sync_after_insert deferred;
select extensions.lives_ok($$select public.cancel_appointment('b9a10000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),1,'test cancellation')$$,'cancelling the appointment succeeds');
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='CANCEL'),1,'cancelling enqueues exactly one CANCEL for the synced provider');

-- Trigger: rescheduling enqueues an UPDATE for the connected provider.
select extensions.lives_ok($$select public.create_appointment('b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T13:00:00+00","endsAt":"2026-01-05T13:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9a10000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'the reschedule fixture is created for a connected provider');
set constraints appointments_calendar_sync_after_insert immediate;
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00') and operation='CREATE'),1,'the reschedule fixture auto-enqueues its CREATE');
set constraints appointments_calendar_sync_after_insert deferred;
select extensions.is((select version from public.reschedule_appointment('b9a10000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00'),1,'2026-01-05 13:45:00+00','2026-01-05 14:15:00+00')),2,'the reschedule fixture moves to the new window');
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='b9a00000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:45:00+00') and provider_id='c9a10000-0000-0000-0000-000000000001' and operation='UPDATE'),1,'rescheduling enqueues exactly one UPDATE for the connected provider');

-- Trigger: a blocked calendar enqueue rolls back the whole appointment save.
create function private.p903_block_calendar_jobs() returns trigger language plpgsql as $$begin raise exception using errcode = 'P0001', message = 'calendar jobs blocked'; end;$$;
create trigger p903_block_calendar_jobs before insert on public.calendar_sync_jobs for each row execute function private.p903_block_calendar_jobs();
create function private.p903_create_and_flush() returns void language plpgsql as $$
begin
  perform public.create_appointment('b9a10000-0000-0000-0000-000000000001','b9a40000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T14:30:00+00","endsAt":"2026-01-05T15:00:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9a10000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb);
  set constraints appointments_calendar_sync_after_insert immediate;
end;
$$;
select extensions.throws_ok($$select private.p903_create_and_flush()$$,'P0001','calendar jobs blocked','a blocked calendar enqueue rolls back the appointment mutation');
select extensions.is((select count(*)::integer from public.appointments where organization_id='b9a00000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:30:00+00'),0,'the failed appointment save leaves no appointment row behind');
drop trigger p903_block_calendar_jobs on public.calendar_sync_jobs;
drop function private.p903_block_calendar_jobs();
drop function private.p903_create_and_flush();

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;