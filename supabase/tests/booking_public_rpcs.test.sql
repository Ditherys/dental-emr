begin;

select extensions.no_plan();

-- Synthetic-only P13-02 graph. The four public booking RPCs are SECURITY
-- DEFINER, require no auth at all, and are deliberately granted to anon and
-- authenticated. The whole chain therefore runs as postgres with NO auth GUC to
-- prove the anonymous path works with zero identity, plus one explicit `set
-- local role anon` execution at the end. Base tables stay deny-by-default.
-- org-a (p1302-a) has one website-visible active branch (A Main). P1302_INSTANT
-- is website-visible instant-bookable; P1302_REQUEST is REQUEST_ONLY;
-- P1302_DISABLED has online_booking_enabled=false; P1302_HIDDEN is
-- website-hidden. provider-a1 is active at A Main and carries the availability
-- rule covering the test slot; provider-a2 belongs to org A but is not assigned
-- to A Main; provider-b is foreign.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('d2000000-0000-0000-0000-000000000001','P1302 Synthetic A Inc.','P1302 A','p1302-a'),
  ('d2000000-0000-0000-0000-000000000002','P1302 Synthetic B Inc.','P1302 B','p1302-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province, website_visible) values
  ('d2100000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','P1302 A Main','p1302-a-main','P1302-A','1 Booking St','Test City','Test Province',true),
  ('d2100000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','P1302 B Main','p1302-b-main','P1302-B','2 Booking St','Test City','Test Province',true);
insert into public.procedures (id, organization_id, code, name, description, status, website_visible, online_booking_enabled, booking_mode, default_duration_minutes) values
  ('d2200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','P1302_INSTANT','Instant Cleaning','An instant-bookable procedure.','active',true,true,'REQUIRES_REVIEW',30),
  ('d2200000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','P1302_REQUEST','Specialist Request','A request-only procedure.','active',true,true,'REQUEST_ONLY',30),
  ('d2200000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','P1302_DISABLED','Disabled Online Booking','Online booking disabled.','active',true,false,'REQUIRES_REVIEW',30),
  ('d2200000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000001','P1302_HIDDEN','Hidden Procedure','Not shown on the website.','active',false,true,'REQUIRES_REVIEW',30);
insert into public.providers (id, organization_id, first_name, last_name, bio, provider_type, status, website_visible) values
  ('d4000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Bookable','Dentist','An instant provider.','REGULAR','active',true),
  ('d4000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','Unassigned','Dentist','Not assigned to any branch.','REGULAR','active',true),
  ('d4000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000002','Foreign','Dentist','A foreign-organization provider.','REGULAR','active',true);
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('d2000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','d2100000-0000-0000-0000-000000000001',true);

-- The test slot is a fixed clock-aligned 15-minute grid point tomorrow at
-- 10:00 local (public_get_available_slots anchors its grid to the hour, and any
-- whole-hour offset is on that grid), and slot_t2 is a second on-grid slot used
-- for the stale-hold expiry test. The availability rule spans 09:00-12:00 so it
-- never crosses midnight.
create temp table p1302_test_state as
select
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') as slot_t,
  (date_trunc('day', statement_timestamp()) + interval '1 day' + interval '10 hours') + interval '30 minutes' as slot_t2;

insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
select 'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'd2100000-0000-0000-0000-000000000001',
  EXTRACT(DOW FROM state.slot_t)::smallint,
  time '09:00',
  time '12:00',
  (state.slot_t::date - 1)
from p1302_test_state as state;

-- Boundary assertions: four SECURITY DEFINER definers pin an empty search path;
-- the four public RPCs reach anon and authenticated; service_role and the staff
-- review RPCs do not reach anon.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.public_get_available_slots(text,text,integer)'::regprocedure,
  'public.public_submit_booking_request(text,jsonb)'::regprocedure,
  'public.public_get_booking_status(uuid,text)'::regprocedure,
  'public.public_cancel_booking_request(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),4,'the four P13-02 public definers pin an empty search path');
select extensions.ok(
  has_function_privilege('anon','public.public_get_available_slots(text,text,integer)','execute')
  and has_function_privilege('anon','public.public_submit_booking_request(text,jsonb)','execute')
  and has_function_privilege('anon','public.public_get_booking_status(uuid,text)','execute')
  and has_function_privilege('anon','public.public_cancel_booking_request(uuid,text)','execute')
  and has_function_privilege('authenticated','public.public_get_available_slots(text,text,integer)','execute')
  and has_function_privilege('authenticated','public.public_submit_booking_request(text,jsonb)','execute')
  and has_function_privilege('authenticated','public.public_get_booking_status(uuid,text)','execute')
  and has_function_privilege('authenticated','public.public_cancel_booking_request(uuid,text)','execute')
  and not has_function_privilege('service_role','public.public_get_available_slots(text,text,integer)','execute')
  and not has_function_privilege('service_role','public.public_submit_booking_request(text,jsonb)','execute')
  and not has_function_privilege('anon','public.list_booking_requests(uuid,text)','execute')
  and not has_function_privilege('anon','public.review_booking_request(uuid,uuid,integer,text,text)','execute'),
  'the four public booking RPCs reach anon and authenticated; service_role and the staff review RPCs hold no anon grant'
);

-- public_get_available_slots: only website-visible instant procedures, bounded
-- projection, unknown slug yields no rows, never leaks columns.
select extensions.ok(
  (select exists (
    select 1 from public.public_get_available_slots('p1302-a','P1302_INSTANT',7) as slot
    where slot.starts_at = state.slot_t
  )),
  'the instant procedure slot is visible before any hold'
) from p1302_test_state as state;
select extensions.is((select count(*)::integer from public.public_get_available_slots('p1302-a','P1302_REQUEST',7)),0,'REQUEST_ONLY procedures expose no fake slots');
select extensions.is((select count(*)::integer from public.public_get_available_slots('p1302-a','P1302_DISABLED',7)),0,'online-booking-disabled procedures expose no slots');
select extensions.is((select count(*)::integer from public.public_get_available_slots('p1302-a','P1302_HIDDEN',7)),0,'website-hidden procedures expose no slots');
select extensions.is((select count(*)::integer from public.public_get_available_slots('p1302-a','NO_SUCH_CODE',7)),0,'unknown procedure codes expose no slots');
select extensions.is((select count(*)::integer from public.public_get_available_slots('no-such-org',null,7)),0,'unknown org slugs expose no slots');
select extensions.throws_ok($$select public.public_get_available_slots('p1302-a',null,0)$$,'22023','invalid input','a days-ahead value below one is rejected');
select extensions.throws_ok($$select public.public_get_available_slots('p1302-a',null,31)$$,'22023','invalid input','a days-ahead value above thirty is rejected');
select extensions.throws_ok($$select slot_row.patient_id from public.public_get_available_slots('p1302-a','P1302_INSTANT',7) as slot_row$$,'42703',null,'available slots never expose patient or internal columns');

-- public_submit_booking_request positive instant path: token returned once,
-- only its hash stored, request SUBMITTED, 5-minute ACTIVE HOLD created.
create temp table p1302_submit_result as
select public.public_submit_booking_request('p1302-a', jsonb_build_object(
  'firstName','Maria','lastName','Santos','birthDate','1992-05-05',
  'mobile','+639170000001','requestedProcedureCode','P1302_INSTANT',
  'requestedProviderId','d4000000-0000-0000-0000-000000000001',
  'requestedStartsAt', to_char(state.slot_t,'YYYY-MM-DD"T"HH24:MI:SSOF'),
  'idempotencyKey','p1302-key-0001','acquisitionSourceCode','CLINIC_WEBSITE'
)) as result
from p1302_test_state as state;

select extensions.ok(
  (select result is not null
     and result ->> 'status' = 'SUBMITTED'
     and result ->> 'managementToken' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (result ->> 'holdExpiresAt')::timestamptz > statement_timestamp()
   from p1302_submit_result),
  'an instant submission returns the plaintext management token, SUBMITTED status, and a future hold expiry exactly once'
);
select extensions.ok(
  (select request.request_status = 'SUBMITTED'
     and request.version = 1
     and request.booking_channel_code = 'WEBSITE'
     and request.acquisition_source_code = 'CLINIC_WEBSITE'
     and request.requested_ends_at = state.slot_t + interval '30 minutes'
     and request.management_token_hash = encode(sha256((select result->>'managementToken' from p1302_submit_result)::bytea),'hex')
     and request.management_token_hash ~ '^[0-9a-f]{64}$'
   from public.booking_requests as request, p1302_test_state as state
   where request.id = (select (result->>'requestId')::uuid from p1302_submit_result)),
  'the request is SUBMITTED with only the SHA-256 hash of the management token stored and the derived window'
);
select extensions.is((select count(*)::integer from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result) and management_token_hash = (select result->>'managementToken' from p1302_submit_result)),0,'the plaintext management token never appears in booking_requests');
select extensions.is(
  (select count(*)::integer from public.provider_reservations as reservation
   where reservation.organization_id = 'd2000000-0000-0000-0000-000000000001'
     and reservation.provider_id = 'd4000000-0000-0000-0000-000000000001'
     and reservation.reservation_kind = 'HOLD'
     and reservation.reservation_status = 'ACTIVE'
     and reservation.appointment_id is null
     and reservation.expires_at is not null
     and reservation.starts_at = (select slot_t from p1302_test_state)),
  1,
  'an instant submission acquires exactly one ACTIVE 5-minute HOLD reservation'
);
select extensions.ok(
  (select not exists (
    select 1 from public.public_get_available_slots('p1302-a','P1302_INSTANT',7) as slot
    where slot.starts_at = state.slot_t
  )),
  'the held slot disappears from available slots'
) from p1302_test_state as state;

-- Idempotency: a duplicate key is a no-op returning the existing request with
-- no management token and no second hold.
select extensions.ok(
  (select (result ->> 'requestId') = (select result ->> 'requestId' from p1302_submit_result)
     and result ->> 'status' = 'SUBMITTED'
     and result ->> 'managementToken' is null
   from (select public.public_submit_booking_request('p1302-a', jsonb_build_object(
     'firstName','Maria','lastName','Santos','birthDate','1992-05-05',
     'mobile','+639170000001','requestedProcedureCode','P1302_INSTANT',
     'requestedProviderId','d4000000-0000-0000-0000-000000000001',
     'requestedStartsAt', to_char((select slot_t from p1302_test_state),'YYYY-MM-DD"T"HH24:MI:SSOF'),
     'idempotencyKey','p1302-key-0001','acquisitionSourceCode','CLINIC_WEBSITE')) as result) as duplicate),
  'a duplicate idempotency key returns the existing request with no management token'
);
select extensions.is((select count(*)::integer from public.booking_requests where idempotency_key='p1302-key-0001'),1,'a duplicate idempotency key never creates a second request row');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='ACTIVE'),1,'a duplicate idempotency key never creates a second hold');

-- Double-book backstop: a second distinct submission for the same provider and
-- slot is rejected by the exclusion constraint and rolls back entirely.
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a', jsonb_build_object('firstName','Second','lastName','Booker','birthDate','1990-01-01','mobile','+639170000002','requestedProcedureCode','P1302_INSTANT','requestedProviderId','d4000000-0000-0000-0000-000000000001','requestedStartsAt', to_char((select slot_t from p1302_test_state),'YYYY-MM-DD"T"HH24:MI:SSOF'),'idempotencyKey','p1302-key-0009'))$$,'P0001','slot unavailable','a second booking for the same provider and slot is rejected by the hold exclusion backstop');
select extensions.is((select count(*)::integer from public.booking_requests where organization_id='d2000000-0000-0000-0000-000000000001' and request_status='SUBMITTED'),1,'the rejected double book leaves only the winning request');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='ACTIVE'),1,'the rejected double book leaves exactly one ACTIVE hold');

-- REQUEST_ONLY creates a SUBMITTED request with no hold and no fake slot.
select extensions.ok(
  (select result ->> 'status' = 'SUBMITTED'
     and result ->> 'holdExpiresAt' is null
   from (select public.public_submit_booking_request('p1302-a', jsonb_build_object(
     'firstName','Juana','lastName','Cruz','birthDate','1988-03-03',
     'mobile','+639180000002','requestedProcedureCode','P1302_REQUEST',
     'idempotencyKey','p1302-key-0003')) as result) as request_only),
  'a REQUEST_ONLY submission returns SUBMITTED with no hold expiry'
);
select extensions.is((select count(*)::integer from public.booking_requests where idempotency_key='p1302-key-0003' and requested_provider_id is null and requested_starts_at is null and requested_ends_at is null and request_status='SUBMITTED'),1,'a REQUEST_ONLY submission stores no provider or window');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='ACTIVE'),1,'a REQUEST_ONLY submission never creates a hold');

-- Validation: unknown keys, malformed values, foreign slugs, unassigned
-- providers, and forged acquisition sources are all rejected.
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0007","secretKey":"x"}'::jsonb)$$,'22023','invalid input','an unknown payload key is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"short"}'::jsonb)$$,'22023','invalid input','an idempotency key below eight characters is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"not-a-phone","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0008"}'::jsonb)$$,'22023','invalid input','an invalid mobile is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000002","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0010"}'::jsonb)$$,'22023','invalid input','a provider not active at the branch is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0011","acquisitionSourceCode":"FORGED"}'::jsonb)$$,'22023','invalid input','an unknown acquisition source is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('no-such-org','{"firstName":"A","lastName":"B","birthDate":"1990-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0012"}'::jsonb)$$,'22023','invalid input','an unknown org slug is rejected');
select extensions.throws_ok($$select public.public_submit_booking_request('p1302-a','{"firstName":"A","lastName":"B","birthDate":"2099-01-01","mobile":"+639170000001","requestedProcedureCode":"P1302_INSTANT","requestedProviderId":"d4000000-0000-0000-0000-000000000001","requestedStartsAt":"2030-05-06T09:00:00+00","idempotencyKey":"p1302-key-0013"}'::jsonb)$$,'22023','invalid input','a future birth date is rejected');

-- public_get_booking_status: bounded status projection matched by the hash;
-- wrong hash returns nothing and no PII beyond the status surface.
select extensions.is(
  (select request_status from public.public_get_booking_status(
    (select (result->>'requestId')::uuid from p1302_submit_result),
    (select management_token_hash from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result)))),
  'SUBMITTED',
  'status lookup with the correct hash returns the request status'
);
select extensions.is((select count(*)::integer from public.public_get_booking_status((select (result->>'requestId')::uuid from p1302_submit_result), repeat('0',64))),0,'a wrong management-token hash returns no status row');
select extensions.ok(
  (select converted = false and created_at is not null
   from public.public_get_booking_status(
     (select (result->>'requestId')::uuid from p1302_submit_result),
     (select management_token_hash from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result)))),
  'status lookup exposes only the bounded status projection'
);
select extensions.throws_ok($$select status_row.patient_id from public.public_get_booking_status('d2000000-0000-0000-0000-000000000001', repeat('0',64)) as status_row$$,'42703',null,'status lookup never exposes patient or clinical columns');

-- Stale-hold expiry: a stale ACTIVE HOLD is transitioned to EXPIRED on the next
-- submission for the same provider and slot, and a fresh hold is acquired.
create temp table p1302_submit_r2 as
select public.public_submit_booking_request('p1302-a', jsonb_build_object(
  'firstName','Pedro','lastName','Reyes','birthDate','1985-08-08',
  'mobile','+639190000003','requestedProcedureCode','P1302_INSTANT',
  'requestedProviderId','d4000000-0000-0000-0000-000000000001',
  'requestedStartsAt', to_char(state.slot_t2,'YYYY-MM-DD"T"HH24:MI:SSOF'),
  'idempotencyKey','p1302-key-0004')) as result
from p1302_test_state as state;

update public.provider_reservations
set expires_at = statement_timestamp() - interval '1 minute'
where organization_id = 'd2000000-0000-0000-0000-000000000001'
  and reservation_kind = 'HOLD'
  and reservation_status = 'ACTIVE'
  and starts_at = (select slot_t2 from p1302_test_state);

select extensions.ok(
  (select result ->> 'status' = 'SUBMITTED'
   from (select public.public_submit_booking_request('p1302-a', jsonb_build_object(
     'firstName','Rosa','lastName','Dela Cruz','birthDate','1979-12-12',
     'mobile','+639190000004','requestedProcedureCode','P1302_INSTANT',
     'requestedProviderId','d4000000-0000-0000-0000-000000000001',
     'requestedStartsAt', to_char((select slot_t2 from p1302_test_state),'YYYY-MM-DD"T"HH24:MI:SSOF'),
     'idempotencyKey','p1302-key-0005')) as result) as stale_resubmit),
  'a resubmission for a stale-held slot succeeds'
);
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='EXPIRED' and starts_at=(select slot_t2 from p1302_test_state)),1,'the stale hold is transitioned to EXPIRED on the next submission');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='ACTIVE' and starts_at=(select slot_t2 from p1302_test_state)),1,'the resubmitted slot acquires a fresh ACTIVE hold');
select extensions.is((select count(*)::integer from public.booking_requests where organization_id='d2000000-0000-0000-0000-000000000001' and requested_starts_at=(select slot_t2 from p1302_test_state)),2,'both submissions for the stale slot remain as separate requests');

-- public_cancel_booking_request: SUBMITTED -> CANCELLED with a version bump and
-- the matching ACTIVE HOLD released; wrong or unknown hashes are denied.
select extensions.is(
  (select request_status from public.public_cancel_booking_request(
    (select (result->>'requestId')::uuid from p1302_submit_result),
    (select management_token_hash from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result)))),
  'CANCELLED',
  'cancelling with the correct hash moves the request to CANCELLED'
);
select extensions.is((select version from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result)),2,'cancelling bumps the request version');
select extensions.is((select count(*)::integer from public.provider_reservations where organization_id='d2000000-0000-0000-0000-000000000001' and reservation_kind='HOLD' and reservation_status='RELEASED' and starts_at=(select slot_t from p1302_test_state)),1,'cancelling releases the matching ACTIVE HOLD reservation');
select extensions.is(
  (select request_status from public.public_cancel_booking_request(
    (select (result->>'requestId')::uuid from p1302_submit_result),
    (select management_token_hash from public.booking_requests where id = (select (result->>'requestId')::uuid from p1302_submit_result)))),
  'CANCELLED',
  'cancelling an already-cancelled request is an idempotent no-op'
);
select extensions.throws_ok($$select public.public_cancel_booking_request((select (result->>'requestId')::uuid from p1302_submit_result), repeat('0',64))$$,'42501','not authorized','cancelling with a wrong management-token hash is denied');
select extensions.throws_ok($$select public.public_cancel_booking_request('00000000-0000-0000-0000-000000000000', repeat('0',64))$$,'42501','not authorized','cancelling an unknown request is denied');
select extensions.ok(
  (select exists (
    select 1 from public.public_get_available_slots('p1302-a','P1302_INSTANT',7) as slot
    where slot.starts_at = state.slot_t
  )),
  'cancelling the request frees the slot again'
) from p1302_test_state as state;

-- End-to-end anonymous execution: the anon role itself can call the public
-- RPCs even though every base table stays deny-by-default.
set local role anon;
select extensions.lives_ok($$select public.public_get_available_slots('p1302-a', 'P1302_INSTANT', 7)$$,'anon role executes public_get_available_slots end to end');
select extensions.lives_ok($$select public.public_submit_booking_request('p1302-a', jsonb_build_object('firstName','Anon','lastName','Caller','birthDate','1995-02-02','mobile','+639200000005','requestedProcedureCode','P1302_REQUEST','idempotencyKey','p1302-key-0014'))$$,'anon role executes public_submit_booking_request end to end');
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;