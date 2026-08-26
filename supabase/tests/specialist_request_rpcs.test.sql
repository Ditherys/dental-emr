begin;

select extensions.no_plan();

-- Synthetic-only P10-03 graph. The specialist RPCs are SECURITY DEFINER and read
-- the actor from the request.jwt.claim.sub GUC, so the whole chain runs as
-- postgres with set_config-driven auth.uid(); base tables stay deny-by-default
-- and are never touched by the authenticated role. receptionist-a is the
-- positive creator/canceller/list holder (RECEPTIONIST, specialist.request at
-- A Main); dentist-a is the requested specialist's linked user (DENTIST);
-- owner-a holds org-wide role.manage; dentist-c is a plain DENTIST who passes
-- the specialist.request gate but is not the provider's linked user; billing-a
-- holds no specialist.request; dentist-b is foreign. specialist-a is a VISITING
-- provider with a CONNECTED calendar integration and contact channels,
-- regular-a holds an explicit availability rule, oncall-a is ON_CALL with no
-- rule, inactive-a is inactive, and foreign-p lives in Org B. patient-a carries
-- primary MOBILE + EMAIL contacts; patient-b is foreign.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-c@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1003.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('d2000000-0000-0000-0000-000000000001','P1003 Synthetic A Inc.','P1003 A','p1003-a'),
  ('d2000000-0000-0000-0000-000000000002','P1003 Synthetic B Inc.','P1003 B','p1003-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','P1003 A Main','p1003-a-main','P1003-A','1 Synthetic St','Test City','Test Province'),
  ('d3000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','P1003 B Main','p1003-b-main','P1003-B','2 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('d4000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('d4000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('d4000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('d4000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('d4000000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000005','active',statement_timestamp()),
  ('d4000000-0000-0000-0000-000000000006','d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000006','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','active'),
  ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002','active'),
  ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003','active'),
  ('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000005','active'),
  ('d2000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000006','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('d2000000-0000-0000-0000-000000000001'::uuid,'d4000000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'d3000000-0000-0000-0000-000000000001'::uuid,'d1000000-0000-0000-0000-000000000001'::uuid),
  ('d2000000-0000-0000-0000-000000000001'::uuid,'d4000000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,'d3000000-0000-0000-0000-000000000001'::uuid,'d1000000-0000-0000-0000-000000000002'::uuid),
  ('d2000000-0000-0000-0000-000000000001'::uuid,'d4000000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'d3000000-0000-0000-0000-000000000001'::uuid,'d1000000-0000-0000-0000-000000000003'::uuid),
  ('d2000000-0000-0000-0000-000000000001'::uuid,'d4000000-0000-0000-0000-000000000004'::uuid,'OWNER'::text,null::uuid,'d1000000-0000-0000-0000-000000000004'::uuid),
  ('d2000000-0000-0000-0000-000000000001'::uuid,'d4000000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,'d3000000-0000-0000-0000-000000000001'::uuid,'d1000000-0000-0000-0000-000000000005'::uuid),
  ('d2000000-0000-0000-0000-000000000002'::uuid,'d4000000-0000-0000-0000-000000000006'::uuid,'DENTIST'::text,'d3000000-0000-0000-0000-000000000002'::uuid,'d1000000-0000-0000-0000-000000000006'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('d5000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','P1003-A-0001','Patient','A',date '1990-01-01','d3000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','P1003-B-0001','Patient','B',date '1991-01-01','d3000000-0000-0000-0000-000000000002');
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('d5100000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','MOBILE','+639170000001',true,'active'),
  ('d5100000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','EMAIL','patient.a@example.test',true,'active');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status, linked_user_id, contact_phone, contact_email) values
  ('d6000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Specialist','A','VISITING','active','d1000000-0000-0000-0000-000000000002','+639180000001','specialist.a@example.test'),
  ('d6000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','Regular','A','REGULAR','active',null,null,null),
  ('d6000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000002','Foreign','B','REGULAR','active',null,null,null),
  ('d6000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000001','Inactive','A','REGULAR','inactive',null,null,null),
  ('d6000000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000001','Oncall','A','ON_CALL','active',null,null,null);
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001',true),
  ('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000001',true),
  ('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000005','d3000000-0000-0000-0000-000000000001',true);
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from, valid_to) values
  ('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000001',1,time '09:00',time '18:00',date '2026-01-01',null);
insert into public.calendar_integrations (id, organization_id, provider_id, google_account_ref, calendar_id, privacy_mode, connection_status) values
  ('d7000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','opaque-specialist','specialist.a@gmail.com','HIGH_PRIVACY','CONNECTED');
-- appt-a1 is the acceptance fixture. The immediate communication trigger
-- enqueues one CONFIRMATION for patient-a (the fixture carries contacts); the
-- calendar trigger is deferred and never fires inside this rollback test.
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status) values
  ('d8000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','PENDING');

-- Boundary assertions: five SECURITY DEFINER definers pin an empty search path,
-- only authenticated holds the four RPC grants, and the single private helper is
-- revoked from every browser and service role.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.create_specialist_request(uuid,uuid,jsonb)'::regprocedure,
  'public.respond_specialist_request(uuid,uuid,integer,jsonb)'::regprocedure,
  'public.cancel_specialist_request(uuid,uuid,integer,text)'::regprocedure,
  'public.list_specialist_requests(uuid,text)'::regprocedure,
  'private.has_specialist_permission_at_branch(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),5,'the five P10-03 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.create_specialist_request(uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.respond_specialist_request(uuid,uuid,integer,jsonb)','execute')
  and has_function_privilege('authenticated','public.cancel_specialist_request(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.list_specialist_requests(uuid,text)','execute')
  and not has_function_privilege('anon','public.create_specialist_request(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.create_specialist_request(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.list_specialist_requests(uuid,text)','execute'),
  'only authenticated has the four exact P10-03 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_specialist_permission_at_branch(uuid,text)')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the specialist permission helper is not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);

-- create_specialist_request positive: SENT, history, audit, provider notification.
select extensions.is((select version from public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"requiredSpecialtyId":"b3000000-0000-0000-0000-000000000002","requestedProviderId":"d6000000-0000-0000-0000-000000000001","requestedStartsAt":"2026-01-06T09:00:00+00","requestedEndsAt":"2026-01-06T09:30:00+00","caseSummary":"Ortho consult for a patient.","requestChannel":"EMAIL","appointmentId":"d8000000-0000-0000-0000-000000000001"}'::jsonb)),1,'a receptionist creates a SENT specialist request at version one');
select extensions.is((select status from public.specialist_requests where case_summary='Ortho consult for a patient.'),'SENT','the created request starts SENT');
select extensions.is((select version from public.specialist_requests where case_summary='Ortho consult for a patient.'),1,'the created request starts at version one');
select extensions.ok((select old_value is null and new_value='SENT' from public.specialist_request_status_history where specialist_request_id=(select id from public.specialist_requests where case_summary='Ortho consult for a patient.')),'creation appends one status history entry from null to SENT');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='d2000000-0000-0000-0000-000000000001' and action='specialist.requested' and metadata='{}'::jsonb),1,'creation appends one specialist.requested audit event with empty metadata');
select extensions.is((select channel || ':' || recipient from public.communications where idempotency_key='spec-request-' || (select id::text from public.specialist_requests where case_summary='Ortho consult for a patient.')),'EMAIL:specialist.a@example.test','creation enqueues the request notification to the requested provider contact');

-- create_specialist_request validation: allowlist, tenant, provider, bounds, window, expiry.
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"caseSummary":"x","requestChannel":"EMAIL","organizationId":"d2000000-0000-0000-0000-000000000001"}'::jsonb)$$,'22023','invalid input','organization or actor keys are rejected by the payload allowlist');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000002','{"caseSummary":"x","requestChannel":"EMAIL"}'::jsonb)$$,'42501','not authorized','a foreign-organization patient is denied');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"requestedProviderId":"d6000000-0000-0000-0000-000000000003","caseSummary":"x","requestChannel":"EMAIL"}'::jsonb)$$,'42501','not authorized','a foreign-organization provider is denied');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"requestedProviderId":"d6000000-0000-0000-0000-000000000004","caseSummary":"x","requestChannel":"EMAIL"}'::jsonb)$$,'22023','invalid input','an inactive provider is rejected');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001',('{"caseSummary":"' || repeat('n',1001) || '","requestChannel":"EMAIL"}')::jsonb)$$,'22023','invalid input','case summaries beyond 1000 characters are rejected');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"requestedStartsAt":"2026-01-06T12:00:00+00","requestedEndsAt":"2026-01-06T08:00:00+00","caseSummary":"x","requestChannel":"EMAIL"}'::jsonb)$$,'22023','invalid input','a requested window must end after it starts');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001',('{"caseSummary":"x","requestChannel":"EMAIL","expiresAt":"' || to_char(statement_timestamp() + interval '8 days','YYYY-MM-DD"T"HH24:MI:SS"Z"') || '"}')::jsonb)$$,'22023','invalid input','an expiry beyond seven days is rejected');

-- create_specialist_request silently skips the provider notification when no
-- contact recipient can be derived (SMS to a provider without contact_phone).
select extensions.lives_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"requestedProviderId":"d6000000-0000-0000-0000-000000000002","caseSummary":"Prosthetic consult.","requestChannel":"SMS"}'::jsonb)$$,'a request to a provider without a contact channel is created');
select extensions.is((select count(*)::integer from public.communications where idempotency_key='spec-request-' || (select id::text from public.specialist_requests where case_summary='Prosthetic consult.')),0,'the provider notification is silently skipped when no recipient is derivable');

-- respond: DECLINE by the provider linked user.
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,requested_provider_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','Root canal consult.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001',null,'SENT','d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
select extensions.is((select version from public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001',1,'{"action":"DECLINE","message":"No slots that week."}'::jsonb)),2,'the requested provider linked user declines and bumps the version');
select extensions.is((select status from public.specialist_requests where id='d9000000-0000-0000-0000-000000000001'),'DECLINED','a decline moves SENT to DECLINED');
select extensions.is((select response_message from public.specialist_requests where id='d9000000-0000-0000-0000-000000000001'),'No slots that week.','the decline response message is stored');
select extensions.ok((select old_value='SENT' and new_value='DECLINED' and reason='No slots that week.' from public.specialist_request_status_history where specialist_request_id='d9000000-0000-0000-0000-000000000001' and old_value is not null),'a decline appends one SENT-to-DECLINED history entry with the reason');
select extensions.is((select metadata from public.audit_events where organization_id='d2000000-0000-0000-0000-000000000001' and action='specialist.request.responded' and entity_id='d9000000-0000-0000-0000-000000000001'),'{"old_value": "SENT", "new_value": "DECLINED"}'::jsonb,'a decline appends one bounded responded audit event');
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001',2,'{"action":"ACCEPT"}'::jsonb)$$,'P0001','invalid state','an already-declined request cannot be responded to again');

-- respond: ACCEPT assigns the SPECIALIST provider and enqueues calendar and
-- communication automation atomically.
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,appointment_id,requested_provider_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','Implant consult for a patient.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000002',null,'SENT','d1000000-0000-0000-0000-000000000001');
select extensions.is((select version from public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000002',1,'{"action":"ACCEPT"}'::jsonb)),2,'an accept bumps the request version');
select extensions.is((select status from public.specialist_requests where id='d9000000-0000-0000-0000-000000000002'),'ACCEPTED','an accept moves SENT to ACCEPTED');
select extensions.is((select count(*)::integer from public.appointment_providers where organization_id='d2000000-0000-0000-0000-000000000001' and appointment_id='d8000000-0000-0000-0000-000000000001' and provider_id='d6000000-0000-0000-0000-000000000001' and provider_role='SPECIALIST' and assignment_status='ASSIGNED'),1,'acceptance assigns the specialist as a SPECIALIST ASSIGNED provider');
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='d2000000-0000-0000-0000-000000000001' and idempotency_key='cal-CREATE-d8000000-0000-0000-0000-000000000001-d6000000-0000-0000-0000-000000000001'),1,'acceptance enqueues exactly one calendar CREATE job for the assigned specialist');
select extensions.is((select status from public.calendar_sync_jobs where organization_id='d2000000-0000-0000-0000-000000000001' and idempotency_key='cal-CREATE-d8000000-0000-0000-0000-000000000001-d6000000-0000-0000-0000-000000000001'),'QUEUED','the acceptance-enqueued calendar job starts QUEUED');
select extensions.is((select channel || ':' || recipient from public.communications where idempotency_key='spec-accepted-' || 'd9000000-0000-0000-0000-000000000002'),'SMS:+639170000001','acceptance enqueues a confirmation to the requester patient contact');
select extensions.ok((select old_value='SENT' and new_value='ACCEPTED' from public.specialist_request_status_history where specialist_request_id='d9000000-0000-0000-0000-000000000002' and old_value is not null),'an accept appends one SENT-to-ACCEPTED history entry');
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000002',2,'{"action":"DECLINE"}'::jsonb)$$,'P0001','invalid state','an already-accepted request rejects any later response');

-- respond: ALTERNATE_TIME_REQUESTED is a positive forward transition.
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,requested_provider_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','Surgery consult.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000003',null,'SENT','d1000000-0000-0000-0000-000000000001');
select extensions.is((select version from public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000003',1,'{"action":"ALTERNATE_TIME","alternateStartsAt":"2026-01-07T10:00:00+00","alternateEndsAt":"2026-01-07T10:30:00+00","message":"Can do Wednesday instead."}'::jsonb)),2,'an alternate-time response bumps the request version');
select extensions.is((select status from public.specialist_requests where id='d9000000-0000-0000-0000-000000000003'),'ALTERNATE_TIME_REQUESTED','an alternate-time response moves SENT to ALTERNATE_TIME_REQUESTED');
select extensions.is((select metadata from public.audit_events where organization_id='d2000000-0000-0000-0000-000000000001' and action='specialist.request.responded' and entity_id='d9000000-0000-0000-0000-000000000003'),'{"old_value": "SENT", "new_value": "ALTERNATE_TIME_REQUESTED"}'::jsonb,'an alternate-time response appends one bounded responded audit event');
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000003',1,'{"action":"ALTERNATE_TIME"}'::jsonb)$$,'22023','invalid input','an alternate-time response requires the alternate window');
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000003',1,'{"action":"ACCEPT","alternateStartsAt":"2026-01-07T10:00:00+00"}'::jsonb)$$,'22023','invalid input','alternate times are rejected outside ALTERNATE_TIME actions');

-- respond: org OWNER may respond through organization-wide role.manage.
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000004',true);
select extensions.is((select version from public.respond_specialist_request('d3000000-0000-0000-0000-000000000001',(select id from public.specialist_requests where case_summary='Ortho consult for a patient.'),1,'{"action":"DECLINE","message":"Clinic can cover."}'::jsonb)),2,'an organization owner responds through org-wide role.manage and bumps the version');
select extensions.is((select status from public.specialist_requests where case_summary='Ortho consult for a patient.'),'DECLINED','an organization owner can decline through org-wide role.manage');

-- respond: a colleague who holds specialist.request but is neither the linked
-- user nor an org OWNER/ADMIN is denied.
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,requested_provider_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','Periodontal consult.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000004',null,'SENT','d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000005',true);
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000004',1,'{"action":"ACCEPT"}'::jsonb)$$,'42501','not authorized','a dentist who is not the requested provider linked user and lacks role.manage cannot respond');

-- respond: stale optimistic versions are rejected before any transition.
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,requested_provider_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','Endodontic consult.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000005',null,'SENT','d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.respond_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000005',2,'{"action":"DECLINE"}'::jsonb)$$,'P0001','stale version','a stale optimistic version is rejected before any transition');

-- cancel: SENT -> CANCELLED and terminal-state rejection.
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
insert into public.specialist_requests (id,organization_id,branch_id,patient_id,case_summary,request_channel,expires_at) values ('d9000000-0000-0000-0000-000000000006','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','Pediatric consult.','EMAIL','2026-03-01 00:00:00+00');
insert into public.specialist_request_status_history (organization_id,specialist_request_id,old_value,new_value,changed_by) values ('d2000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000006',null,'SENT','d1000000-0000-0000-0000-000000000001');
select extensions.is((select version from public.cancel_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000006',1,'duplicate entry')),2,'a receptionist cancels a SENT request and bumps the version');
select extensions.is((select status from public.specialist_requests where id='d9000000-0000-0000-0000-000000000006'),'CANCELLED','a cancel moves SENT to CANCELLED');
select extensions.ok((select old_value='SENT' and new_value='CANCELLED' and reason='duplicate entry' from public.specialist_request_status_history where specialist_request_id='d9000000-0000-0000-0000-000000000006' and old_value is not null),'a cancel appends one SENT-to-CANCELLED history entry with the reason');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='d2000000-0000-0000-0000-000000000001' and action='specialist.request.cancelled' and entity_id='d9000000-0000-0000-0000-000000000006' and metadata='{}'::jsonb),1,'a cancel appends one specialist.request.cancelled audit event');
select extensions.throws_ok($$select public.cancel_specialist_request('d3000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000006',2,'again')$$,'P0001','invalid state','a CANCELLED request cannot be cancelled again');

-- list_specialist_requests: bounded projection, status filter, minimal-case only.
select extensions.ok((select pg_proc.proargnames::text[] from pg_proc where pg_proc.oid='public.list_specialist_requests(uuid,text)'::regprocedure) @> array['request_id','patient_id','patient_display_name','required_specialty_id','required_specialty_name','requested_provider_id','requested_provider_display_name','requested_starts_at','requested_ends_at','case_summary','request_channel','status','response_message','expires_at','version','created_at'],'list_specialist_requests exposes only the approved projection');
select extensions.throws_ok($$select listed.chief_complaint from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001') as listed$$,'42703',null,'list never exposes clinical columns');
select extensions.is((select count(*)::integer from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001')),8,'list returns every request for the acting branch');
select extensions.is((select count(*)::integer from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001','DECLINED')),2,'list filters by status');
select extensions.is((select count(*)::integer from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001','SENT')),3,'list returns the three still-SENT requests');
select extensions.throws_ok($$select public.list_specialist_requests('d3000000-0000-0000-0000-000000000001','DRAFT')$$,'22023','invalid input','list rejects an unknown status');
select extensions.is((select patient_display_name from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001') where request_id=(select id from public.specialist_requests where case_summary='Ortho consult for a patient.')),'Patient A','list renders the patient display name');
select extensions.is((select required_specialty_name from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001') where request_id=(select id from public.specialist_requests where case_summary='Ortho consult for a patient.')),'Orthodontics','list renders the required specialty name');
select extensions.is((select requested_provider_display_name from public.list_specialist_requests('d3000000-0000-0000-0000-000000000001') where request_id=(select id from public.specialist_requests where case_summary='Implant consult for a patient.')),'Specialist A','list renders the requested provider display name');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_specialist_requests('d3000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a user without specialist.request cannot list requests');
select extensions.throws_ok($$select public.create_specialist_request('d3000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001','{"caseSummary":"x","requestChannel":"EMAIL"}'::jsonb)$$,'42501','not authorized','a user without specialist.request cannot create a request');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000006',true);
select extensions.throws_ok($$select public.list_specialist_requests('d3000000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization dentist cannot list Org A requests');

-- Bookability guarantee: an on-call/visiting provider is not automatically
-- bookable. find_available_slots already requires explicit availability rules,
-- so a VISITING and an ON_CALL provider with no rules yield zero slots while a
-- REGULAR provider with an explicit rule enumerates slots.
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select extensions.is((select count(*)::integer from public.find_available_slots('d3000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00',30)),0,'a VISITING provider with no availability rules yields zero slots');
select extensions.is((select count(*)::integer from public.find_available_slots('d3000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000005','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00',30)),0,'an ON_CALL provider with no availability rules yields zero slots');
select extensions.is((select count(*)::integer from public.find_available_slots('d3000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000002','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00',30)),1,'a REGULAR provider with an explicit availability rule enumerates slots');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;