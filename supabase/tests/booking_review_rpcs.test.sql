begin;

select extensions.no_plan();

-- Synthetic-only P13-03 graph. The staff review RPCs are SECURITY DEFINER and
-- read the actor from the request.jwt.claim.sub GUC, so the whole chain runs as
-- postgres with set_config-driven auth.uid(); base tables stay deny-by-default
-- and are never touched by the authenticated role. receptionist-a is the
-- positive reviewer (RECEPTIONIST, booking.review + demographics.write +
-- appointment.write at A Main); owner-a is an org-wide OWNER with booking.review
-- but no demographics.write; billing-a holds no booking.review; receptionist-b
-- is a foreign-org RECEPTIONIST. provider-a1 is active at A Main with a
-- CONNECTED calendar integration (so the conversion automation enqueues a
-- CREATE job); provider-a2 is in org A but unassigned. patient-a carries the
-- mobile +639170000001 so the br-convert approval matches an existing patient.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p1303.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p1303.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1303.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-b@p1303.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e2000000-0000-0000-0000-000000000001','P1303 Synthetic A Inc.','P1303 A','p1303-a'),
  ('e2000000-0000-0000-0000-000000000002','P1303 Synthetic B Inc.','P1303 B','p1303-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e2100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1303 A Main','p1303-a-main','P1303-A','1 Review St','Test City','Test Province'),
  ('e2100000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','P1303 B Main','p1303-b-main','P1303-B','2 Review St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e3000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','active'),
  ('e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000003','active'),
  ('e2000000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'e2100000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000001'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'e1000000-0000-0000-0000-000000000002'::uuid),
  ('e2000000-0000-0000-0000-000000000001'::uuid,'e3000000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'e2100000-0000-0000-0000-000000000001'::uuid,'e1000000-0000-0000-0000-000000000003'::uuid),
  ('e2000000-0000-0000-0000-000000000002'::uuid,'e3000000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'e2100000-0000-0000-0000-000000000002'::uuid,'e1000000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status, website_visible) values
  ('e4000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','Review','Dentist','REGULAR','active',true),
  ('e4000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','Unassigned','Dentist','REGULAR','active',true);
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001',true);
insert into public.procedures (id, organization_id, code, name, status, website_visible, online_booking_enabled, booking_mode, default_duration_minutes) values
  ('e5000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1303_INSTANT','Instant Review','active',true,true,'REQUIRES_REVIEW',30),
  ('e5000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','P1303_REQUEST','Request Review','active',true,true,'REQUEST_ONLY',30),
  ('e5000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000002','P1303_REQUEST_B','Request Review B','active',true,true,'REQUEST_ONLY',30);
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e6000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','P1303-A-0001','Maria','Santos',date '1992-05-05','e2100000-0000-0000-0000-000000000001');
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('e6100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','MOBILE','+639170000001',true,'active');
insert into public.calendar_integrations (id, organization_id, provider_id, google_account_ref, calendar_id, privacy_mode, connection_status) values
  ('e6200000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','opaque-a1','a1@p1303.example.test','HIGH_PRIVACY','CONNECTED');

create temp table p1303_test_state as
select
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') as window_w,
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') + interval '30 minutes' as window_w2,
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') + interval '60 minutes' as window_w3,
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') + interval '90 minutes' as window_w4;

insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
select 'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001',
  EXTRACT(DOW FROM state.window_w)::smallint,
  time '09:00',
  time '12:00',
  (state.window_w::date - 1)
from p1303_test_state as state;

insert into public.booking_requests (id, organization_id, branch_id, requested_procedure_id, requested_provider_id, requested_starts_at, requested_ends_at, first_name, last_name, birth_date, mobile, email, booking_channel_code, request_status, management_token_hash, idempotency_key, version) values
  ('e7000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001',(select window_w from p1303_test_state),(select window_w from p1303_test_state)+interval '30 minutes','Maria','Santos',date '1992-05-05','+639170000001','maria@p1303.example.test','WEBSITE','SUBMITTED',encode(sha256('tok-br-convert'::bytea),'hex'),'review-key-0001',1),
  ('e7000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000002',null,null,null,'Juan','Dela Cruz',date '1988-03-03','+639180000002',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-request'::bytea),'hex'),'review-key-0002',1),
  ('e7000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001',(select window_w2 from p1303_test_state),(select window_w2 from p1303_test_state)+interval '30 minutes','Ana','Reyes',date '1985-08-08','+639190000003',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-decline'::bytea),'hex'),'review-key-0003',1),
  ('e7000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001',(select window_w3 from p1303_test_state),(select window_w3 from p1303_test_state)+interval '30 minutes','Bot','Spam',date '1999-01-01','+639190000004',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-spam'::bytea),'hex'),'review-key-0004',1),
  ('e7000000-0000-0000-0000-000000000005','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001',(select window_w4 from p1303_test_state),(select window_w4 from p1303_test_state)+interval '30 minutes','New','Patient',date '1980-02-02','+639199999999',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-nomatch'::bytea),'hex'),'review-key-0005',1),
  ('e7000000-0000-0000-0000-000000000006','e2000000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000002',null,null,null,'Pedro','Owner Request',date '1982-06-06','+639200000005',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-owner'::bytea),'hex'),'review-key-0006',1),
  ('e7000000-0000-0000-0000-000000000007','e2000000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000002','e5000000-0000-0000-0000-000000000003',null,null,null,'Foreign','Org',date '1975-09-09','+639210000006',null,'WEBSITE','SUBMITTED',encode(sha256('tok-br-foreign'::bytea),'hex'),'review-key-0007',1);

insert into public.provider_reservations (organization_id, provider_id, branch_id, starts_at, ends_at, reservation_kind, reservation_status, expires_at)
select 'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001',
  state.window_w, state.window_w + interval '30 minutes', 'HOLD', 'ACTIVE', statement_timestamp() + interval '5 minutes'
from p1303_test_state as state;
insert into public.provider_reservations (organization_id, provider_id, branch_id, starts_at, ends_at, reservation_kind, reservation_status, expires_at)
select 'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001',
  state.window_w2, state.window_w2 + interval '30 minutes', 'HOLD', 'ACTIVE', statement_timestamp() + interval '5 minutes'
from p1303_test_state as state;
insert into public.provider_reservations (organization_id, provider_id, branch_id, starts_at, ends_at, reservation_kind, reservation_status, expires_at)
select 'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001',
  state.window_w3, state.window_w3 + interval '30 minutes', 'HOLD', 'ACTIVE', statement_timestamp() + interval '5 minutes'
from p1303_test_state as state;
insert into public.provider_reservations (organization_id, provider_id, branch_id, starts_at, ends_at, reservation_kind, reservation_status, expires_at)
select 'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001',
  state.window_w4, state.window_w4 + interval '30 minutes', 'HOLD', 'ACTIVE', statement_timestamp() + interval '5 minutes'
from p1303_test_state as state;

-- Boundary assertions: three SECURITY DEFINER definers pin an empty search path;
-- the staff RPCs reach authenticated only; anon and service_role hold none.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'private.has_booking_review_permission_at_branch(uuid,text)'::regprocedure,
  'public.list_booking_requests(uuid,text)'::regprocedure,
  'public.review_booking_request(uuid,uuid,integer,text,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),3,'the three P13-03 staff definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','private.has_booking_review_permission_at_branch(uuid,text)','execute')
  and has_function_privilege('authenticated','public.list_booking_requests(uuid,text)','execute')
  and has_function_privilege('authenticated','public.review_booking_request(uuid,uuid,integer,text,text)','execute')
  and not has_function_privilege('anon','public.list_booking_requests(uuid,text)','execute')
  and not has_function_privilege('anon','public.review_booking_request(uuid,uuid,integer,text,text)','execute')
  and not has_function_privilege('service_role','public.review_booking_request(uuid,uuid,integer,text,text)','execute'),
  'the three P13-03 staff RPCs reach authenticated only; anon and service_role hold none'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);

-- list_booking_requests: bounded projection without the token hash or referral
-- payload, org+branch scoped, optional status filter, no audit.
select extensions.throws_ok($$select br_row.management_token_hash from public.list_booking_requests('e2100000-0000-0000-0000-000000000001') as br_row$$,'42703',null,'list never returns management_token_hash');
select extensions.throws_ok($$select br_row.referral_payload from public.list_booking_requests('e2100000-0000-0000-0000-000000000001') as br_row$$,'42703',null,'list never returns referral_payload');
select extensions.is((select count(*)::integer from public.list_booking_requests('e2100000-0000-0000-0000-000000000001')),6,'list returns every request for the acting org and branch');
select extensions.is((select count(*)::integer from public.list_booking_requests('e2100000-0000-0000-0000-000000000001','SUBMITTED')),6,'list filters by SUBMITTED');
select extensions.is((select count(*)::integer from public.list_booking_requests('e2100000-0000-0000-0000-000000000001','DECLINED')),0,'list filters by a status with no matching rows');
select extensions.ok(
  (select requested_procedure_name = 'Instant Review' and requested_provider_display_name = 'Review Dentist'
   from public.list_booking_requests('e2100000-0000-0000-0000-000000000001') where request_id = 'e7000000-0000-0000-0000-000000000001'),
  'list renders the procedure and provider display labels'
);
select extensions.ok(
  (select not exists (
    select 1 from public.audit_events where action = 'booking.request.reviewed'
  )),
  'listing a request writes no audit event'
);
select extensions.throws_ok($$select public.list_booking_requests('e2100000-0000-0000-0000-000000000001','INVENTED')$$,'22023','invalid input','an unknown status filter is rejected');

-- DECLINE releases the hold and appends the review audit event.
select extensions.is((select request_status from public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000003',1,'DECLINE','no availability')),'DECLINED','a reviewer declines a request');
select extensions.ok(
  (select version = 2 and reviewed_by = 'e1000000-0000-0000-0000-000000000001' and reviewed_at is not null
   from public.booking_requests where id = 'e7000000-0000-0000-0000-000000000003'),
  'a declined request bumps the version and records the reviewer'
);
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='e2000000-0000-0000-0000-000000000001' and provider_id='e4000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='RELEASED' and starts_at=(select window_w2 from p1303_test_state)),1,'declining releases the matching ACTIVE HOLD reservation');
select extensions.is((select count(*)::integer from public.audit_events where action='booking.request.reviewed' and entity_id='e7000000-0000-0000-0000-000000000003' and metadata='{"action":"DECLINE","old_value":"SUBMITTED","new_value":"DECLINED","reason":"no availability"}'::jsonb and result='SUCCESS' and actor_user_id='e1000000-0000-0000-0000-000000000001'),1,'declining appends one booking.request.reviewed audit event with bounded metadata');

-- SPAM follows the same path.
select extensions.is((select request_status from public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000004',1,'SPAM')),'SPAM','a reviewer marks a request as SPAM');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='e2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='RELEASED' and starts_at=(select window_w3 from p1303_test_state)),1,'spamming releases the matching ACTIVE HOLD reservation');
select extensions.is((select count(*)::integer from public.audit_events where action='booking.request.reviewed' and entity_id='e7000000-0000-0000-0000-000000000004' and metadata='{"action":"SPAM","old_value":"SUBMITTED","new_value":"SPAM"}'::jsonb),1,'spamming appends one booking.request.reviewed audit event');

-- APPROVE converts an instant request to a real appointment reusing the
-- matched patient, converting the HOLD reservation and firing the existing
-- calendar/communication automation triggers.
select extensions.is((select request_status from public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001',1,'APPROVE')),'CONVERTED','a reviewer approves an instant request and it converts to an appointment');
select extensions.ok(
  (select request_status = 'CONVERTED'
     and version = 2
     and appointment_id is not null
     and reviewed_by = 'e1000000-0000-0000-0000-000000000001'
     and reviewed_at is not null
   from public.booking_requests where id = 'e7000000-0000-0000-0000-000000000001'),
  'a converted request records CONVERTED, the appointment id, and the reviewer'
);
select extensions.ok(
  (select appointment.patient_id = 'e6000000-0000-0000-0000-000000000001'
     and appointment.procedure_id = 'e5000000-0000-0000-0000-000000000001'
     and appointment.branch_id = 'e2100000-0000-0000-0000-000000000001'
     and appointment.scheduling_status = 'SCHEDULED'
     and appointment.confirmation_status = 'PENDING'
     and appointment.encounter_status = 'PENDING'
     and appointment.booking_channel_code = 'ONLINE_BOOKING'
     and appointment.starts_at = (select window_w from p1303_test_state)
     and appointment.created_by = 'e1000000-0000-0000-0000-000000000001'
   from public.appointments as appointment
   where appointment.id = (select appointment_id from public.booking_requests where id = 'e7000000-0000-0000-0000-000000000001')),
  'conversion creates the real SCHEDULED appointment for the requested window and procedure'
);
select extensions.is((select count(*)::integer from public.appointment_providers where organization_id='e2000000-0000-0000-0000-000000000001' and appointment_id=(select appointment_id from public.booking_requests where id='e7000000-0000-0000-0000-000000000001') and provider_id='e4000000-0000-0000-0000-000000000001' and provider_role='PRIMARY_DENTIST' and assignment_status='ASSIGNED'),1,'conversion assigns the requested provider as PRIMARY_DENTIST');
select extensions.ok(
  (select reservation_kind = 'APPOINTMENT'
     and reservation_status = 'ACTIVE'
     and appointment_id = (select appointment_id from public.booking_requests where id = 'e7000000-0000-0000-0000-000000000001')
     and expires_at is null
   from public.provider_reservations
   where organization_id='e2000000-0000-0000-0000-000000000001'
     and provider_id='e4000000-0000-0000-0000-000000000001'
     and starts_at = (select window_w from p1303_test_state)),
  'the ACTIVE HOLD reservation is converted to an APPOINTMENT reservation tied to the appointment'
);
select extensions.is((select count(*)::integer from public.patients where organization_id='e2000000-0000-0000-0000-000000000001'),1,'conversion reuses the matched patient and never creates a duplicate');
set constraints appointments_calendar_sync_after_insert immediate;
select extensions.is((select count(*)::integer from public.calendar_sync_jobs where organization_id='e2000000-0000-0000-0000-000000000001' and appointment_id=(select appointment_id from public.booking_requests where id='e7000000-0000-0000-0000-000000000001') and provider_id='e4000000-0000-0000-0000-000000000001' and operation='CREATE'),1,'conversion auto-enqueues exactly one calendar CREATE sync via the existing deferred trigger');
set constraints appointments_calendar_sync_after_insert deferred;
select extensions.is((select count(*)::integer from public.communications where organization_id='e2000000-0000-0000-0000-000000000001' and appointment_id=(select appointment_id from public.booking_requests where id='e7000000-0000-0000-0000-000000000001') and template_type='CONFIRMATION'),1,'conversion auto-enqueues one CONFIRMATION communication via the existing trigger');
select extensions.is((select count(*)::integer from public.audit_events where action='appointment.created' and entity_id=(select appointment_id from public.booking_requests where id='e7000000-0000-0000-0000-000000000001') and patient_id='e6000000-0000-0000-0000-000000000001'),1,'conversion appends one appointment.created audit event');
select extensions.is((select count(*)::integer from public.audit_events where action='booking.request.reviewed' and entity_id='e7000000-0000-0000-0000-000000000001' and metadata='{"action":"APPROVE","old_value":"SUBMITTED","new_value":"CONVERTED"}'::jsonb and patient_id='e6000000-0000-0000-0000-000000000001'),1,'conversion appends one booking.request.reviewed audit event');

-- APPROVE on a request-only request marks it APPROVED with no appointment and
-- no fake slot.
select extensions.is((select request_status from public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000002',1,'APPROVE')),'APPROVED','a reviewer approves a request-only request');
select extensions.ok(
  (select version = 2 and appointment_id is null
   from public.booking_requests where id = 'e7000000-0000-0000-0000-000000000002'),
  'a request-only approval never creates an appointment'
);
select extensions.is((select count(*)::integer from public.audit_events where action='booking.request.reviewed' and entity_id='e7000000-0000-0000-0000-000000000002' and metadata='{"action":"APPROVE","old_value":"SUBMITTED","new_value":"APPROVED"}'::jsonb),1,'a request-only approval appends one booking.request.reviewed audit event');

-- Stale versions and invalid inputs are rejected.
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000005',2,'APPROVE')$$,'P0001','stale version','a stale expected version is rejected');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000005',1,'CONFIRM')$$,'22023','invalid input','an invented review action is rejected');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000005',1,'DECLINE',repeat('x',501))$$,'22023','invalid input','an over-long review reason is rejected');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000002',2,'DECLINE')$$,'P0001','invalid state','an already-approved request cannot be reviewed again');

-- Approval of an instant request with no candidate match requires
-- demographics.write. Removing that one grant from the owner proves the
-- requirement is live; the grant is restored so the owner keeps full authority.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
delete from public.role_permissions
where role_id = (select id from public.roles where organization_id is null and code = 'OWNER')
  and permission_id = (select id from public.permissions where code = 'patient.demographics.write');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000005',1,'APPROVE')$$,'42501','not authorized','an instant approval with no patient candidate requires demographics.write');
select extensions.is((select request_status from public.booking_requests where id='e7000000-0000-0000-0000-000000000005'),'SUBMITTED','a denied approval leaves the request untouched');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='e2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='ACTIVE' and starts_at=(select window_w4 from p1303_test_state)),1,'a denied approval leaves the hold untouched');
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code = 'OWNER'
  and permission.code = 'patient.demographics.write'
on conflict do nothing;
-- The org-wide OWNER can still approve request-only requests (no patient write).
select extensions.is((select request_status from public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000006',1,'APPROVE')),'APPROVED','an org-wide OWNER with booking.review approves a request-only request');

-- Permission denials and tenant isolation.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_booking_requests('e2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user without booking.review cannot list requests');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000007',1,'DECLINE')$$,'42501','not authorized','a billing user without booking.review cannot review requests');
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.list_booking_requests('e2100000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization receptionist cannot list another organization requests');
select extensions.throws_ok($$select public.review_booking_request('e2100000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001',1,'DECLINE')$$,'42501','not authorized','a foreign-organization receptionist cannot review another organization requests');

-- Invalid state guard: an already-CANCELLED or terminal request cannot be
-- reviewed again through the public cancel surface.
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
select extensions.is((select request_status from public.public_cancel_booking_request('e7000000-0000-0000-0000-000000000007', encode(sha256('tok-br-foreign'::bytea),'hex'))),'CANCELLED','the anonymous cancel surface works for the foreign request via its management token');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;