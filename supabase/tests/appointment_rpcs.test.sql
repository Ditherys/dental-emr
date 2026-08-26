begin;

select extensions.no_plan();

-- Synthetic-only P6-06 graph. Owner A and Receptionist A are positive; Billing
-- A, anonymous, and foreign Owner B prove the RPCs, rather than table/RLS
-- access, are the boundary. provider-a1/a4 are active at A Main with a
-- recurring rule; provider-a1 has an afternoon LEAVE exception; provider-a2 is
-- inactive, provider-a3 active but unassigned to any branch, provider-b is
-- foreign. chair-a1 is active, chair-a2 is archived.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b6100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@p606.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receptionist-a@p606.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p606.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b6100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@p606.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b6200000-0000-0000-0000-000000000001','P606 Synthetic A Inc.','P606 A','p606-a'),
  ('b6200000-0000-0000-0000-000000000002','P606 Synthetic B Inc.','P606 B','p606-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b6300000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','P606 A Main','p606-a-main','P606-A','1 Synthetic St','Test City','Test Province'),
  ('b6300000-0000-0000-0000-000000000003','b6200000-0000-0000-0000-000000000002','P606 B Main','p606-b-main','P606-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b6400000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','b6100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b6400000-0000-0000-0000-000000000002','b6200000-0000-0000-0000-000000000001','b6100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b6400000-0000-0000-0000-000000000003','b6200000-0000-0000-0000-000000000001','b6100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b6400000-0000-0000-0000-000000000004','b6200000-0000-0000-0000-000000000002','b6100000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b6200000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001','b6400000-0000-0000-0000-000000000001','active'),
  ('b6200000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001','b6400000-0000-0000-0000-000000000002','active'),
  ('b6200000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001','b6400000-0000-0000-0000-000000000003','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b6200000-0000-0000-0000-000000000001'::uuid,'b6400000-0000-0000-0000-000000000001'::uuid,'OWNER'::text,null::uuid,'b6100000-0000-0000-0000-000000000001'::uuid),
  ('b6200000-0000-0000-0000-000000000001'::uuid,'b6400000-0000-0000-0000-000000000001'::uuid,'RECEPTIONIST'::text,'b6300000-0000-0000-0000-000000000001'::uuid,'b6100000-0000-0000-0000-000000000001'::uuid),
  ('b6200000-0000-0000-0000-000000000001'::uuid,'b6400000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'b6300000-0000-0000-0000-000000000001'::uuid,'b6100000-0000-0000-0000-000000000001'::uuid),
  ('b6200000-0000-0000-0000-000000000001'::uuid,'b6400000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'b6300000-0000-0000-0000-000000000001'::uuid,'b6100000-0000-0000-0000-000000000001'::uuid),
  ('b6200000-0000-0000-0000-000000000002'::uuid,'b6400000-0000-0000-0000-000000000004'::uuid,'OWNER'::text,null::uuid,'b6100000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b6500000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','P606-A-1','Patient','A',date '1990-01-01','b6300000-0000-0000-0000-000000000001'),
  ('b6500000-0000-0000-0000-000000000002','b6200000-0000-0000-0000-000000000002','P606-B-1','Patient','B',date '1991-01-01',null);
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('c7100000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('c7100000-0000-0000-0000-000000000002','b6200000-0000-0000-0000-000000000001','Dentist','A2','REGULAR','inactive'),
  ('c7100000-0000-0000-0000-000000000003','b6200000-0000-0000-0000-000000000001','Dentist','A3','REGULAR','active'),
  ('c7100000-0000-0000-0000-000000000004','b6200000-0000-0000-0000-000000000001','Dentist','A4','REGULAR','active'),
  ('c7100000-0000-0000-0000-000000000005','b6200000-0000-0000-0000-000000000002','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('b6200000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001',true),
  ('b6200000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000004','b6300000-0000-0000-0000-000000000001',true);
insert into public.procedures (id, organization_id, code, name) values
  ('c8100000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','P606_A','P606 Procedure');
insert into public.branch_resources (id, organization_id, branch_id, resource_type_id, name, status, archived_at) values
  ('c1100000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001',(select id from public.resource_types where code='DENTAL_CHAIR'),'P606 Chair 1','active',null),
  ('c1100000-0000-0000-0000-000000000002','b6200000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001',(select id from public.resource_types where code='DENTAL_CHAIR'),'P606 Chair 2','archived',statement_timestamp());
insert into public.provider_availability_rules (organization_id, provider_id, branch_id, weekday, starts_at_local, ends_at_local, valid_from)
select 'b6200000-0000-0000-0000-000000000001', provider_id, 'b6300000-0000-0000-0000-000000000001',
  EXTRACT(DOW FROM '2026-01-05 09:00:00+00'::timestamptz), time '08:00', time '18:00', date '2026-01-01'
from (values ('c7100000-0000-0000-0000-000000000001'::uuid), ('c7100000-0000-0000-0000-000000000004'::uuid)) as provider(provider_id);
insert into public.provider_schedule_exceptions (organization_id, provider_id, branch_id, exception_type, starts_at, ends_at, created_by) values
  ('b6200000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000001','b6300000-0000-0000-0000-000000000001','LEAVE','2026-01-05 16:00:00+00','2026-01-05 18:00:00+00','b6100000-0000-0000-0000-000000000001');

select extensions.ok(
  has_function_privilege('authenticated','public.create_appointment(uuid,uuid,jsonb)','execute')
  and has_function_privilege('authenticated','public.reschedule_appointment(uuid,uuid,integer,timestamptz,timestamptz)','execute')
  and has_function_privilege('authenticated','public.cancel_appointment(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.update_appointment_status(uuid,uuid,integer,text,text,text)','execute')
  and has_function_privilege('authenticated','public.list_appointments(uuid,timestamptz,timestamptz,uuid,text)','execute')
  and not has_function_privilege('anon','public.create_appointment(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.create_appointment(uuid,uuid,jsonb)','execute'),
  'only authenticated has the five exact P6-06 RPC grants'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_appointment(uuid,uuid,jsonb)'::regprocedure,'public.reschedule_appointment(uuid,uuid,integer,timestamptz,timestamptz)'::regprocedure,'public.cancel_appointment(uuid,uuid,integer,text)'::regprocedure,'public.update_appointment_status(uuid,uuid,integer,text,text,text)'::regprocedure,'public.list_appointments(uuid,timestamptz,timestamptz,uuid,text)'::regprocedure,'private.has_appointment_permission_at_branch(uuid,text)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),6,'the six P6-06 definers pin an empty search path');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.has_appointment_permission_at_branch(uuid,text)'::regprocedure
    and (
      has_function_privilege('public','private.has_appointment_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('anon','private.has_appointment_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('authenticated','private.has_appointment_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('service_role','private.has_appointment_permission_at_branch(uuid,text)','execute')
    )
),'the appointment permission helper is revoked from every browser and service role');
select extensions.ok(
  private.audit_metadata_is_safe('{"reason":"patient rescheduled"}'::jsonb)
  and private.audit_metadata_is_safe('{"dimension":"encounter_status","old_value":"IN_CHAIR","new_value":"COMPLETED"}'::jsonb)
  and private.audit_metadata_is_safe('{"old_starts_at":"2026-01-05 09:00:00+00","new_starts_at":"2026-01-05 10:00:00+00"}'::jsonb)
  and not private.audit_metadata_is_safe('{"reason":""}'::jsonb)
  and not private.audit_metadata_is_safe('{"clinical_text":"synthetic note"}'::jsonb),
  'the audit metadata allow-list extends to the bounded scheduling keys and still rejects unknown keys'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T09:00:00+00","endsAt":"2026-01-05T09:30:00+00","procedureId":"c8100000-0000-0000-0000-000000000001","title":"Initial exam","bookingChannelCode":"WALK_IN","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000001","purpose":"Exam chair"}],"schedulingStatus":"SCHEDULED","confirmationStatus":"CONFIRMED"}'::jsonb)),1,'owner creates a scheduled appointment with provider and resource at version one');
reset role;
select extensions.ok((select scheduling_status='SCHEDULED' and confirmation_status='CONFIRMED' and encounter_status='PENDING' and booking_channel_code='WALK_IN' and title='Initial exam' and procedure_id='c8100000-0000-0000-0000-000000000001' and patient_id='b6500000-0000-0000-0000-000000000001' from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00'),'create derives tenant and persists the validated appointment fields');
select extensions.ok((select reservation_status='ACTIVE' and branch_id='b6300000-0000-0000-0000-000000000001' from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00')),'create reserves the provider slot as ACTIVE at the acting branch');
select extensions.ok((select reservation_status='ACTIVE' from public.resource_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and resource_id='c1100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00')),'create reserves the resource slot as ACTIVE');
select extensions.ok((select status_dimension='scheduling_status' and old_value is null and new_value='SCHEDULED' and changed_by='b6100000-0000-0000-0000-000000000001' from public.appointment_status_history where organization_id='b6200000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00')),'create writes the initial scheduling status history entry');
select extensions.ok((select metadata='{}'::jsonb and category='APPOINTMENT' and entity_type='appointment' and result='SUCCESS' from public.audit_events where organization_id='b6200000-0000-0000-0000-000000000001' and action='appointment.created' and patient_id='b6500000-0000-0000-0000-000000000001' and entity_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:00:00+00')),'create writes one opaque appointment.created audit event with empty metadata');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000002',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T09:30:00+00","endsAt":"2026-01-05T09:45:00+00","schedulingStatus":"AWAITING_SPECIALIST"}'::jsonb)),1,'a branch-scoped receptionist creates an appointment without a provider while awaiting specialist');
reset role;
select extensions.ok((select scheduling_status='AWAITING_SPECIALIST' and not exists (select 1 from public.provider_reservations as reservation where reservation.organization_id='b6200000-0000-0000-0000-000000000001' and reservation.appointment_id=appointments.id) from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 09:30:00+00'),'a provider-less AWAITING_SPECIALIST appointment creates no reservations');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","organizationId":"b6200000-0000-0000-0000-000000000001","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'22023','invalid input','creation rejects tenant mass assignment');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000002','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","schedulingStatus":"AWAITING_SPECIALIST"}'::jsonb)$$,'42501','not authorized','creation safely denies foreign patients');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000005","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'22023','invalid input','creation rejects a foreign provider');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000002","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'22023','invalid input','creation rejects an inactive provider');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000003","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'22023','invalid input','creation rejects a provider not assigned to the acting branch');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000002","purpose":"X-ray"}]}'::jsonb)$$,'22023','invalid input','creation rejects an inactive resource');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T06:00:00+00","endsAt":"2026-01-05T06:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'P0001','provider not available','creation rejects a slot outside the provider availability rule');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T17:00:00+00","endsAt":"2026-01-05T17:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'P0001','provider not available','creation rejects a slot covered by a LEAVE exception');
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T10:00:00+00","endsAt":"2026-01-05T10:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000001","purpose":"Exam"}]}'::jsonb)),1,'a second appointment reserves chair-a1 for a later slot');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T10:15:00+00","endsAt":"2026-01-05T10:45:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000004","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000001","purpose":"Exam"}]}'::jsonb)$$,'P0001','scheduling conflict','creation rejects simultaneous use of the same resource');
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:00:00+00","endsAt":"2026-01-05T11:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)),1,'the double-booking probe reserves the provider at 11:00');
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T11:15:00+00","endsAt":"2026-01-05T11:45:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'P0001','scheduling conflict','the exclusion constraint rejects provider double booking');
reset role;
select extensions.ok(not exists (select 1 from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 11:15:00+00'),'a failed double-booking attempt leaves no appointment row behind');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T08:00:00+00","endsAt":"2026-01-05T08:30:00+00","schedulingStatus":"SCHEDULED","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)$$,'42501','not authorized','billing without appointment.write cannot create appointments');
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T08:00:00+00","endsAt":"2026-01-05T08:30:00+00","schedulingStatus":"SCHEDULED"}'::jsonb)$$,'42501','not authorized','foreign acting branches are denied');
reset role;

-- Reschedule fixture: 13:00-13:30 provider-a1 + chair-a1.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T13:00:00+00","endsAt":"2026-01-05T13:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000001","purpose":"Exam"}]}'::jsonb)),1,'the reschedule fixture is created');
reset role;
select extensions.is((select version from public.reschedule_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 13:00:00+00'),1,'2026-01-05 14:00:00+00','2026-01-05 14:30:00+00')),2,'rescheduling bumps the optimistic version');
select extensions.ok((select starts_at='2026-01-05 14:00:00+00'::timestamptz and ends_at='2026-01-05 14:30:00+00'::timestamptz and version=2 from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and id=(select appointment_id from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and reservation_status='ACTIVE' and starts_at='2026-01-05 14:00:00+00' and appointment_id is not null)),'reschedule moves the appointment to the new window');
select extensions.ok((select count(*) = 1 from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00') and reservation_status='ACTIVE'),'reschedule creates exactly one ACTIVE provider reservation for the new window');
select extensions.ok((select count(*) = 1 from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00') and reservation_status='RELEASED'),'reschedule releases the previous provider reservation row');
select extensions.ok((select count(*) = 1 from public.resource_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and resource_id='c1100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00') and reservation_status='ACTIVE'),'reschedule releases and re-creates the resource reservation for the new window');
select extensions.ok((select metadata->>'old_starts_at' is not null and (metadata->>'new_starts_at')::timestamptz='2026-01-05 14:00:00+00'::timestamptz and (metadata->>'new_ends_at')::timestamptz='2026-01-05 14:30:00+00'::timestamptz from public.audit_events where organization_id='b6200000-0000-0000-0000-000000000001' and action='appointment.rescheduled' and patient_id='b6500000-0000-0000-0000-000000000001'),'reschedule audits the old and new window');

select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.reschedule_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00'),1,'2026-01-05 15:00:00+00','2026-01-05 15:30:00+00')$$,'P0001','stale version','reschedule rejects a stale version');
select extensions.throws_ok($$select public.reschedule_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 14:00:00+00'),2,'2026-01-05 09:00:00+00','2026-01-05 09:30:00+00')$$,'P0001','scheduling conflict','reschedule into an already-booked provider slot is rejected');
reset role;

-- Cancel fixture: 15:00-15:30 provider-a1 + chair-a1.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T15:00:00+00","endsAt":"2026-01-05T15:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}],"resources":[{"resourceId":"c1100000-0000-0000-0000-000000000001","purpose":"Exam"}]}'::jsonb)),1,'the cancel fixture is created');
reset role;
select extensions.is((select version from public.cancel_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00'),1,'Patient no-show cancelled the booking')),2,'cancellation bumps the optimistic version');
select extensions.ok((select scheduling_status='CANCELLED' and encounter_status='CANCELLED' and cancelled_at is not null and version=2 from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00' and encounter_status='CANCELLED'),'cancellation terminalizes both status dimensions and stamps cancelled_at');
select extensions.ok((select count(*) = 1 from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00' and encounter_status='CANCELLED') and reservation_status='RELEASED'),'cancellation releases the provider reservation');
select extensions.ok((select count(*) = 1 from public.resource_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and resource_id='c1100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00' and encounter_status='CANCELLED') and reservation_status='RELEASED'),'cancellation releases the resource reservation');
select extensions.ok((select count(*) = 2 from public.appointment_status_history where organization_id='b6200000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00' and encounter_status='CANCELLED') and new_value='CANCELLED'),'cancellation writes scheduling and encounter history rows');
select extensions.ok((select metadata->>'reason'='Patient no-show cancelled the booking' from public.audit_events where organization_id='b6200000-0000-0000-0000-000000000001' and action='appointment.cancelled' and patient_id='b6500000-0000-0000-0000-000000000001'),'cancellation audits the bounded reason');

-- Cancellation must release the slot for reuse.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T15:00:00+00","endsAt":"2026-01-05T15:30:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)),1,'a cancelled appointment frees its provider slot for a new booking');
reset role;
select extensions.throws_ok($$select public.cancel_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 15:00:00+00' and encounter_status='CANCELLED'),2,'double cancel attempt')$$,'P0001','invalid state','already-cancelled appointments reject further cancellation');

-- Status fixture: 12:00-12:30 provider-a4, starting REQUESTED.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T12:00:00+00","endsAt":"2026-01-05T12:30:00+00","schedulingStatus":"REQUESTED","providers":[{"providerId":"c7100000-0000-0000-0000-000000000004","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)),1,'the status fixture is created REQUESTED');
reset role;
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),1,'scheduling_status','AWAITING_SPECIALIST','specialist review requested')),2,'REQUESTED transitions to AWAITING_SPECIALIST');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),2,'scheduling_status','SCHEDULED',null)),3,'AWAITING_SPECIALIST transitions to SCHEDULED');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),3,'confirmation_status','CONFIRMED',null)),4,'confirmation PENDING transitions to CONFIRMED');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),4,'confirmation_status','PENDING',null)),5,'confirmation CONFIRMED transitions back to PENDING');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),5,'encounter_status','CHECKED_IN','patient arrived')),6,'encounter PENDING transitions to CHECKED_IN');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),6,'encounter_status','IN_CHAIR',null)),7,'encounter CHECKED_IN transitions to IN_CHAIR');
select extensions.is((select version from public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),7,'encounter_status','COMPLETED','treatment done')),8,'encounter IN_CHAIR transitions to COMPLETED');
reset role;
select extensions.ok((select encounter_status='COMPLETED' and completed_at is not null and version=8 from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),'completing the encounter stamps completed_at');
select extensions.ok((select count(*) = 8 from public.appointment_status_history where organization_id='b6200000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00') and status_dimension in ('scheduling_status','confirmation_status','encounter_status')),'every status transition writes one history row plus the initial entry');
select extensions.throws_ok($$select public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),8,'scheduling_status','REQUESTED',null)$$,'P0001','invalid state','illegal scheduling regressions are rejected');
select extensions.throws_ok($$select public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),3,'confirmation_status','CONFIRMED',null)$$,'P0001','stale version','stale status writes are rejected');
select extensions.throws_ok($$select public.update_appointment_status('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 12:00:00+00'),8,'billing_status','CONFIRMED',null)$$,'22023','invalid input','unknown status dimensions are rejected');

-- list_appointments: deterministic bounded projection, no audit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b6500000-0000-0000-0000-000000000001'),17,'audit count is 17 before the read probes');
select extensions.is((select count(*)::integer from public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00',null,null)),8,'list returns every branch appointment in the window');
select extensions.is((select count(*)::integer from public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00','c7100000-0000-0000-0000-000000000001',null)),6,'list filters by assigned provider');
select extensions.is((select count(*)::integer from public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00',null,'CANCELLED')),1,'list filters by encounter status');
select extensions.ok((select patient_display_name='Patient A' and procedure_name='P606 Procedure' and provider_ids @> '["c7100000-0000-0000-0000-000000000001"]'::jsonb and resource_ids @> '["c1100000-0000-0000-0000-000000000001"]'::jsonb and version=1 from public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00',null,null) where starts_at='2026-01-05 09:00:00+00'::timestamptz and patient_display_name='Patient A'),'list projects bounded patient, procedure, provider, and resource identifiers without raw tenant state');
select extensions.throws_ok($$select public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-06 00:00:00+00','2026-01-05 00:00:00+00',null,null)$$,'22023','invalid input','list rejects an inverted window');
select extensions.throws_ok($$select public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-02-06 00:00:00+00',null,null)$$,'22023','invalid input','list rejects a window wider than 31 days');
select extensions.throws_ok($$select public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00','c7100000-0000-0000-0000-000000000005',null)$$,'22023','invalid input','list rejects a foreign provider filter');
select extensions.throws_ok($$select public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00',null,'BILLED')$$,'22023','invalid input','list rejects an unknown encounter status');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b6500000-0000-0000-0000-000000000001'),17,'read probes leave the audit count unchanged');
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.list_appointments('b6300000-0000-0000-0000-000000000001','2026-01-05 00:00:00+00','2026-01-06 00:00:00+00',null,null)$$,'42501','not authorized','foreign branch users cannot list appointments');
reset role;

-- Audit failure rolls back the whole mutation (cancellation here).
create function private.p606_block_cancel_audit() returns trigger language plpgsql as $$begin if new.action = 'appointment.cancelled' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p606_block_cancel_audit before insert on public.audit_events for each row execute function private.p606_block_cancel_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b6100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_appointment('b6300000-0000-0000-0000-000000000001','b6500000-0000-0000-0000-000000000001','{"startsAt":"2026-01-05T08:30:00+00","endsAt":"2026-01-05T09:00:00+00","providers":[{"providerId":"c7100000-0000-0000-0000-000000000001","providerRole":"PRIMARY_DENTIST"}]}'::jsonb)),1,'the audit rollback fixture is created before its cancellation');
reset role;
select extensions.throws_ok($$select public.cancel_appointment('b6300000-0000-0000-0000-000000000001',(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 08:30:00+00'),1,'rollback cancellation')$$,'P0001','audit blocked','a failing audit event rejects the cancellation');
reset role;
select extensions.ok((select scheduling_status='SCHEDULED' and encounter_status='PENDING' and cancelled_at is null and version=1 from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 08:30:00+00'),'a failed audit event rolls back the cancellation status and version');
select extensions.ok((select count(*) = 1 from public.provider_reservations where organization_id='b6200000-0000-0000-0000-000000000001' and provider_id='c7100000-0000-0000-0000-000000000001' and appointment_id=(select id from public.appointments where organization_id='b6200000-0000-0000-0000-000000000001' and starts_at='2026-01-05 08:30:00+00') and reservation_status='ACTIVE'),'a failed audit event does not release the reservations');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b6500000-0000-0000-0000-000000000001' and action='appointment.cancelled'),1,'a failed audit event rolls back its own audit row');
select extensions.is((select count(*)::integer from public.audit_events where patient_id='b6500000-0000-0000-0000-000000000001' and action='appointment.created' and metadata='{}'::jsonb),9,'each successful create writes exactly one opaque audit event');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;