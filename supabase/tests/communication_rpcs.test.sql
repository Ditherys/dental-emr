begin;

select extensions.no_plan();

-- Synthetic-only P8-03 graph. The communication RPCs are SECURITY DEFINER and
-- read the actor from the request.jwt.claim.sub GUC, so the whole chain runs as
-- postgres with set_config-driven auth.uid(); base tables stay deny-by-default
-- and are never touched by the authenticated role. receptionist-a is the
-- positive actor; billing-a and dentist-a hold no communication permission;
-- receptionist-b is foreign. patient-a carries primary MOBILE + EMAIL
-- contacts, patient-b has no contacts, patient-c lives in Org B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b9100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p803.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p803.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p803.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b9100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-b@p803.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b9200000-0000-0000-0000-000000000001','P803 Synthetic A Inc.','P803 A','p803-a'),
  ('b9200000-0000-0000-0000-000000000002','P803 Synthetic B Inc.','P803 B','p803-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b9300000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','P803 A Main','p803-a-main','P803-A','1 Synthetic St','Test City','Test Province'),
  ('b9300000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000002','P803 B Main','p803-b-main','P803-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b9400000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','b9100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b9400000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000001','b9100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b9400000-0000-0000-0000-000000000003','b9200000-0000-0000-0000-000000000001','b9100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b9400000-0000-0000-0000-000000000004','b9200000-0000-0000-0000-000000000002','b9100000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9400000-0000-0000-0000-000000000001','active'),
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9400000-0000-0000-0000-000000000002','active'),
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9400000-0000-0000-0000-000000000003','active'),
  ('b9200000-0000-0000-0000-000000000002','b9300000-0000-0000-0000-000000000002','b9400000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b9300000-0000-0000-0000-000000000001'::uuid,'b9100000-0000-0000-0000-000000000001'::uuid),
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000002'::uuid,'BILLING'::text,'b9300000-0000-0000-0000-000000000001'::uuid,'b9100000-0000-0000-0000-000000000002'::uuid),
  ('b9200000-0000-0000-0000-000000000001'::uuid,'b9400000-0000-0000-0000-000000000003'::uuid,'DENTIST'::text,'b9300000-0000-0000-0000-000000000001'::uuid,'b9100000-0000-0000-0000-000000000003'::uuid),
  ('b9200000-0000-0000-0000-000000000002'::uuid,'b9400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'b9300000-0000-0000-0000-000000000002'::uuid,'b9100000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b9500000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','P803-A-0001','Patient','A',date '1990-01-01','b9300000-0000-0000-0000-000000000001'),
  ('b9500000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000001','P803-A-0002','Patient','B',date '1991-01-01','b9300000-0000-0000-0000-000000000001'),
  ('b9500000-0000-0000-0000-000000000003','b9200000-0000-0000-0000-000000000002','P803-B-0001','Patient','C',date '1992-01-01','b9300000-0000-0000-0000-000000000002');
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('b9600000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','MOBILE','+639170000001',true,'active'),
  ('b9600000-0000-0000-0000-000000000002','b9200000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','EMAIL','patient.a@example.test',true,'active'),
  ('b9600000-0000-0000-0000-000000000003','b9200000-0000-0000-0000-000000000002','b9500000-0000-0000-0000-000000000003','MOBILE','+639180000001',true,'active');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('c9100000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b9200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001',true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
select 'b9200000-0000-0000-0000-000000000001', provider_id, 'b9300000-0000-0000-0000-000000000001',
  EXTRACT(DOW FROM '2026-01-05 09:00:00+00'::timestamptz), time '08:00', time '18:00', date '2026-01-01'
from (values ('c9100000-0000-0000-0000-000000000001'::uuid)) as provider(provider_id);
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status) values
  ('c9200000-0000-0000-0000-000000000001','b9200000-0000-0000-0000-000000000002','b9300000-0000-0000-0000-000000000002','b9500000-0000-0000-0000-000000000003','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','PENDING');

select extensions.is((select count(*)::integer from pg_proc where oid in ('public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)'::regprocedure,'public.cancel_communication(uuid,uuid,integer)'::regprocedure,'public.list_communications(uuid,uuid,text)'::regprocedure,'public.acknowledge_communication(uuid,uuid,text)'::regprocedure,'public.fail_communication(uuid,uuid)'::regprocedure,'public.claim_due_communications(uuid,integer)'::regprocedure,'private.has_communication_permission_at_branch(uuid,text)'::regprocedure,'private.enqueue_communication_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)'::regprocedure,'private.cancel_appointment_communications_internal(uuid,uuid)'::regprocedure,'private.appointment_communication_trigger()'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),10,'the ten P8-03 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)','execute')
  and has_function_privilege('authenticated','public.cancel_communication(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.list_communications(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.acknowledge_communication(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.fail_communication(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.claim_due_communications(uuid,integer)','execute')
  and not has_function_privilege('anon','public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)','execute')
  and not has_function_privilege('service_role','public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)','execute'),
  'only authenticated has the six exact P8-03 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_communication_permission_at_branch(uuid,text)'),
    ('private.enqueue_communication_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)'),
    ('private.cancel_appointment_communications_internal(uuid,uuid)'),
    ('private.appointment_communication_trigger()')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the private helpers and trigger are not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

-- Appointment slot A for patient-a: the trigger must auto-enqueue one CONFIRMATION.
select extensions.lives_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T09:00:00+00","endsAt":"2026-01-05T09:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'a receptionist creates an appointment for a contact-bearing patient');
select extensions.is((select count(*)::integer from public.communications where organization_id='b9200000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00') and template_type='CONFIRMATION'),1,'creating an appointment for a patient with a mobile contact auto-enqueues exactly one CONFIRMATION');
select extensions.is((select channel || ':' || recipient from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00') and template_type='CONFIRMATION'),'SMS:+639170000001','the confirmation targets the normalized primary mobile via SMS');
select extensions.is((select status from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00') and template_type='CONFIRMATION'),'QUEUED','the trigger-enqueued confirmation starts QUEUED');

-- enqueue_communication positive + idempotency + validation.
select extensions.is((select status from public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000002','Your appointment is tomorrow.','p803-reminder-1')),'QUEUED','a receptionist enqueues a QUEUED reminder');
select extensions.is((select count(*)::integer from public.communications where organization_id='b9200000-0000-0000-0000-000000000001' and idempotency_key='p803-reminder-1'),1,'the reminder is enqueued once');
select extensions.is((select communication_id from public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000002','Your appointment is tomorrow.','p803-reminder-1')),(select id from public.communications where organization_id='b9200000-0000-0000-0000-000000000001' and idempotency_key='p803-reminder-1'),'an idempotent re-enqueue returns the existing row');
select extensions.is((select count(*)::integer from public.communications where organization_id='b9200000-0000-0000-0000-000000000001' and idempotency_key='p803-reminder-1'),1,'a duplicate idempotency key never creates a second row');
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'FAX','REMINDER','+639170000002','x','p803-bad-channel')$$,'22023','invalid input','invented channels are rejected by the enqueue RPC');
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','RANDOM','+639170000002','x','p803-bad-template')$$,'22023','invalid input','invented template types are rejected');
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','','x','p803-bad-recipient')$$,'22023','invalid input','empty recipients are rejected');
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001','c9200000-0000-0000-0000-000000000001','SMS','REMINDER','+639170000002','x','p803-foreign-appt')$$,'42501','not authorized','an appointment outside the acting organization is denied');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000002','x','p803-billing-enqueue')$$,'42501','not authorized','a user without communication.send cannot enqueue');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

-- cancel_communication: QUEUED -> CANCELLED, stale version rejected, SENT blocked.
select extensions.is((select status from public.cancel_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-1'),(select version from public.communications where idempotency_key='p803-reminder-1'))),'CANCELLED','a QUEUED communication can be cancelled');
select extensions.is((select cancelled_at is not null from public.communications where idempotency_key='p803-reminder-1'),true,'cancelling stamps cancelled_at');
select extensions.throws_ok($$select public.cancel_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-1'),1)$$,'P0001','stale version','a stale optimistic version is rejected');
select extensions.is((select status from public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000003','A second reminder.','p803-reminder-2')),'QUEUED','a second reminder is enqueued for the acknowledgement fixture');

-- acknowledge_communication: QUEUED -> SENT; double-acknowledge and SENT-cancel rejected.
select extensions.is((select status from public.acknowledge_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-2'),'provider-msg-2')),'SENT','acknowledgement moves a QUEUED job to SENT');
select extensions.is((select sent_at is not null and provider_message_id='provider-msg-2' from public.communications where idempotency_key='p803-reminder-2'),true,'acknowledgement stamps sent_at and the provider message id');
select extensions.throws_ok($$select public.acknowledge_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-2'),'provider-msg-3')$$,'P0001','invalid state','an already SENT job cannot be acknowledged again');
select extensions.throws_ok($$select public.cancel_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-2'),(select version from public.communications where idempotency_key='p803-reminder-2'))$$,'P0001','invalid state','a SENT communication cannot be cancelled');

-- fail_communication: retries advance attempts and backoff; max_attempts terminalizes.
select extensions.is((select status from public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000004','A retryable reminder.','p803-reminder-3')),'QUEUED','a retry fixture is enqueued');
select extensions.is((select status from public.fail_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'))),'QUEUED','the first failure keeps the job QUEUED');
select extensions.is((select attempts=1 and next_attempt_at > statement_timestamp() from public.communications where idempotency_key='p803-reminder-3'),true,'the first failure records one attempt and advances backoff');
select extensions.is((select status from public.fail_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'))),'QUEUED','the second failure keeps the job QUEUED');
select extensions.is((select attempts=2 from public.communications where idempotency_key='p803-reminder-3'),true,'the second failure records two attempts');
select extensions.is((select status from public.fail_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'))),'FAILED','the final failure terminalizes the job');
select extensions.is((select failed_at is not null and attempts=3 from public.communications where idempotency_key='p803-reminder-3'),true,'a FAILED job records failed_at at max attempts');

-- list_communications: masked projection, appointment/status filters, no full recipient.
select extensions.is((select count(*)::integer from public.list_communications('b9300000-0000-0000-0000-000000000001',null,null)),4,'list returns every communication for the acting branch');
select extensions.ok((select count(*) = 0 from public.list_communications('b9300000-0000-0000-0000-000000000001',null,null) as listed where listed.recipient_masked = (select comm.recipient from public.communications as comm where comm.id = listed.communication_id)),'list never exposes the full recipient');
select extensions.is((select recipient_masked from public.list_communications('b9300000-0000-0000-0000-000000000001',null,null) where communication_id=(select id from public.communications where idempotency_key='p803-reminder-1')),'+63****0002','SMS recipients are masked with a +63**** pattern');
select extensions.is((select count(*)::integer from public.list_communications('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),null)),4,'list filters by appointment');
select extensions.is((select count(*)::integer from public.list_communications('b9300000-0000-0000-0000-000000000001',null,'QUEUED')),1,'list filters by status');
select extensions.throws_ok($$select public.list_communications('b9300000-0000-0000-0000-000000000001',null,'BILLED')$$,'22023','invalid input','list rejects an unknown status');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.list_communications('b9300000-0000-0000-0000-000000000001',null,null)$$,'42501','not authorized','a user without communication.view cannot list communications');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

-- claim_due_communications: due QUEUED only, SKIP LOCKED, limit, full recipient/body to the worker.
select extensions.is((select status from public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000005','A due reminder.','p803-reminder-4')),'QUEUED','a due worker fixture is enqueued');
insert into public.communications (organization_id, branch_id, patient_id, appointment_id, channel, template_type, recipient, body, idempotency_key, next_attempt_at) values
  ('b9200000-0000-0000-0000-000000000001','b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000006','A future reminder.','p803-future',statement_timestamp() + interval '1 day');
select extensions.is((select count(*)::integer from public.claim_due_communications('b9300000-0000-0000-0000-000000000001',1)),1,'claim respects the p_limit');
select extensions.is((select count(*)::integer from public.claim_due_communications('b9300000-0000-0000-0000-000000000001',10)),2,'claim returns only due QUEUED jobs and skips future and SENT rows');
select extensions.ok((select count(*) = 0 from public.claim_due_communications('b9300000-0000-0000-0000-000000000001',10) where communication_id in (select id from public.communications where idempotency_key in ('p803-future','p803-reminder-2'))),'claim never returns a future or already SENT job');
select extensions.is((select recipient from public.claim_due_communications('b9300000-0000-0000-0000-000000000001',10) where communication_id=(select id from public.communications where idempotency_key='p803-reminder-4')),'+639170000005','claim returns the full recipient to the worker');
select extensions.is((select status from public.communications where idempotency_key='p803-reminder-4'),'QUEUED','claiming leaves the job status QUEUED for the worker to acknowledge');
select extensions.throws_ok($$select public.claim_due_communications('b9300000-0000-0000-0000-000000000001',0)$$,'22023','invalid input','claim rejects a limit below one');
select extensions.throws_ok($$select public.claim_due_communications('b9300000-0000-0000-0000-000000000001',51)$$,'22023','invalid input','claim rejects a limit above fifty');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.claim_due_communications('b9300000-0000-0000-0000-000000000001',10)$$,'42501','not authorized','a user without communication.send cannot claim jobs');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_communications('b9300000-0000-0000-0000-000000000001',null,null)$$,'42501','not authorized','a dentist without communication.view cannot list');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

-- Trigger: cancellation cancels the pending job and enqueues a CANCELLATION.
select extensions.lives_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T10:00:00+00","endsAt":"2026-01-05T10:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'the cancellation fixture is created');
select extensions.lives_ok($$select public.cancel_appointment('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00'),1,'test cancellation')$$,'cancelling the appointment succeeds');
select extensions.is((select count(*)::integer from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') and template_type='CANCELLATION' and status='QUEUED'),1,'cancellation enqueues exactly one CANCELLATION');
select extensions.is((select status from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 10:00:00+00') and template_type='CONFIRMATION'),'CANCELLED','cancelling an appointment cancels its pending CONFIRMATION');

-- Trigger: rescheduling cancels pending jobs and enqueues a RESCHEDULE keyed to the new version.
select extensions.lives_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'the reschedule fixture is created');
select extensions.is((select version from public.reschedule_appointment('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 11:00:00+00'),1,'2026-01-05 12:00:00+00','2026-01-05 12:30:00+00')),2,'the reschedule fixture moves to the new window');
select extensions.is((select status from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and template_type='CONFIRMATION'),'CANCELLED','rescheduling cancels the pending CONFIRMATION');
select extensions.is((select count(*)::integer from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and template_type='RESCHEDULE' and status='QUEUED'),1,'rescheduling enqueues exactly one RESCHEDULE');
select extensions.is((select idempotency_key from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and template_type='RESCHEDULE'),'appt-reschedule-' || (select id::text from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') || '-2','the reschedule key embeds the bumped appointment version');

-- Trigger: confirming a created appointment does not duplicate its CONFIRMATION.
select extensions.lives_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T13:00:00+00","endsAt":"2026-01-05T13:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'the confirmation fixture is created pending');
select extensions.is((select count(*)::integer from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00') and template_type='CONFIRMATION'),1,'creating the confirmation fixture auto-enqueues one CONFIRMATION');
select extensions.is((select version from public.update_appointment_status('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00'),1,'confirmation_status','CONFIRMED',null)),2,'confirming the appointment succeeds');
select extensions.is((select count(*)::integer from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00') and template_type='CONFIRMATION'),1,'confirming an already-created appointment does not duplicate the CONFIRMATION');

-- Trigger: an appointment for a patient with no contact enqueues nothing.
select extensions.lives_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000002','{"startsAt":"2026-01-05T14:00:00+00","endsAt":"2026-01-05T14:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'an appointment for a patient with no contact is created');
select extensions.is((select count(*)::integer from public.communications where appointment_id=(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00')),0,'an appointment for a patient without a contact enqueues nothing');

-- Trigger: a blocked communication enqueue rolls back the whole appointment save.
create function private.p803_block_communications() returns trigger language plpgsql as $$begin raise exception using errcode = 'P0001', message = 'communications blocked'; end;$$;
create trigger p803_block_communications before insert on public.communications for each row execute function private.p803_block_communications();
select extensions.throws_ok($$select public.create_appointment('b9300000-0000-0000-0000-000000000001','b9500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T15:00:00+00","endsAt":"2026-01-05T15:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c9100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'P0001','communications blocked','a blocked communication enqueue rolls back the appointment mutation');
select extensions.is((select count(*)::integer from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00'),0,'the failed appointment save leaves no appointment row behind');
drop trigger p803_block_communications on public.communications;
drop function private.p803_block_communications();

-- Denials: foreign-organization receptionist cannot reach Org A.
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.enqueue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b9200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'SMS','REMINDER','+639170000002','x','p803-foreign-actor')$$,'42501','not authorized','a foreign-organization receptionist cannot enqueue on Org A');
select extensions.throws_ok($$select public.list_communications('b9300000-0000-0000-0000-000000000001',null,null)$$,'42501','not authorized','a foreign-organization receptionist cannot list Org A communications');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

-- requeue_communication: FAILED-only manual retry that copies the failed job's
-- own stored content into a fresh QUEUED row keyed requeue-<id>-<version>, so a
-- retry never re-accepts recipient/body from the browser. p803-reminder-3 is the
-- FAILED fixture (three failures terminalized it); p803-reminder-1 is CANCELLED.
select extensions.ok(
  has_function_privilege('authenticated','public.requeue_communication(uuid,uuid,integer)','execute')
  and not has_function_privilege('anon','public.requeue_communication(uuid,uuid,integer)','execute')
  and not has_function_privilege('service_role','public.requeue_communication(uuid,uuid,integer)','execute'),
  'only authenticated holds the requeue grant'
);
select extensions.is((select status from public.requeue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'),(select version from public.communications where idempotency_key='p803-reminder-3'))),'QUEUED','a FAILED communication is requeued into a fresh QUEUED row');
select extensions.is((select count(*)::integer from public.communications where idempotency_key='requeue-' || (select id::text from public.communications where idempotency_key='p803-reminder-3') || '-' || (select version from public.communications where idempotency_key='p803-reminder-3')),1,'the requeue row carries a requeue-<id>-<version> idempotency key');
select extensions.ok((select new_comm.status='QUEUED' and new_comm.attempts=0 and new_comm.id <> old_comm.id and (new_comm.channel, new_comm.template_type, new_comm.recipient, new_comm.body, new_comm.patient_id, new_comm.appointment_id) = (old_comm.channel, old_comm.template_type, old_comm.recipient, old_comm.body, old_comm.patient_id, old_comm.appointment_id) from public.communications as new_comm join public.communications as old_comm on old_comm.idempotency_key='p803-reminder-3' where new_comm.idempotency_key='requeue-' || old_comm.id::text || '-' || old_comm.version),'the requeue copies the failed stored content into a fresh QUEUED row with zero attempts');
select extensions.throws_ok($$select public.requeue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'),(select version from public.communications where idempotency_key='p803-reminder-3'))$$,'23505',null,'a second requeue of the same version is rejected by the unique idempotency key');
select extensions.throws_ok($$select public.requeue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'),1)$$,'P0001','stale version','a stale expected version is rejected before any requeue');
select extensions.throws_ok($$select public.requeue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-1'),(select version from public.communications where idempotency_key='p803-reminder-1'))$$,'P0001','invalid state','a non-FAILED communication cannot be requeued');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.requeue_communication('b9300000-0000-0000-0000-000000000001',(select id from public.communications where idempotency_key='p803-reminder-3'),(select version from public.communications where idempotency_key='p803-reminder-3'))$$,'42501','not authorized','a user without communication.send cannot requeue');
select set_config('request.jwt.claim.sub','b9100000-0000-0000-0000-000000000001',true);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;