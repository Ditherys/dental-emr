begin;

select extensions.no_plan();

-- Synthetic-only two-organization graph. Org A has two branches and all metric
-- source domains; Org B rows prove every aggregate remains tenant-scoped.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b2010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@p20.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('b2010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reception@p20.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp()),
  ('b2010000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foreign@p20.example.test', '', statement_timestamp(), '{"provider":"email","providers":["email"]}', '{}', statement_timestamp(), statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('b2020000-0000-0000-0000-000000000001', 'P20 A Inc.', 'P20 A', 'p20-a'),
  ('b2020000-0000-0000-0000-000000000002', 'P20 B Inc.', 'P20 B', 'p20-b');

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b2030000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'Main', 'p20-a-main', 'P20-A1', '1 Test St', 'Test', 'Test'),
  ('b2030000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'North', 'p20-a-north', 'P20-A2', '2 Test St', 'Test', 'Test'),
  ('b2030000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'Foreign', 'p20-b-main', 'P20-B1', '3 Test St', 'Test', 'Test');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b2040000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2010000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('b2040000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2010000-0000-0000-0000-000000000002', 'active', statement_timestamp()),
  ('b2040000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'b2010000-0000-0000-0000-000000000003', 'active', statement_timestamp());

insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2040000-0000-0000-0000-000000000001', 'active'),
  ('b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'b2040000-0000-0000-0000-000000000001', 'active'),
  ('b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2040000-0000-0000-0000-000000000002', 'active'),
  ('b2020000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000003', 'b2040000-0000-0000-0000-000000000003', 'active');

insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b2020000-0000-0000-0000-000000000001'::uuid, 'b2040000-0000-0000-0000-000000000001'::uuid, null::uuid, 'b2010000-0000-0000-0000-000000000001'::uuid, 'OWNER'::text),
  ('b2020000-0000-0000-0000-000000000001'::uuid, 'b2040000-0000-0000-0000-000000000002'::uuid, 'b2030000-0000-0000-0000-000000000001'::uuid, 'b2010000-0000-0000-0000-000000000001'::uuid, 'RECEPTIONIST'::text),
  ('b2020000-0000-0000-0000-000000000002'::uuid, 'b2040000-0000-0000-0000-000000000003'::uuid, null::uuid, 'b2010000-0000-0000-0000-000000000003'::uuid, 'OWNER'::text)
) as assignment(organization_id, member_id, branch_id, user_id, role_code)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id, acquisition_source_id, initial_booking_channel_code, created_at) values
  ('b2050000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'P20-A-1', 'Synthetic', 'One', date '1980-01-01', 'b2030000-0000-0000-0000-000000000001', (select id from public.acquisition_sources where code = 'FACEBOOK' and organization_id is null), 'CLINIC_WEBSITE', statement_timestamp() - interval '2 days'),
  ('b2050000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'P20-A-2', 'Synthetic', 'Two', date '1980-01-01', 'b2030000-0000-0000-0000-000000000002', (select id from public.acquisition_sources where code = 'GOOGLE_SEARCH' and organization_id is null), 'PHONE', statement_timestamp() - interval '2 days'),
  ('b2050000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'P20-B-1', 'Synthetic', 'Foreign', date '1980-01-01', 'b2030000-0000-0000-0000-000000000003', (select id from public.acquisition_sources where code = 'FACEBOOK' and organization_id is null), 'CLINIC_WEBSITE', statement_timestamp() - interval '2 days');

insert into public.providers (id, organization_id, first_name, last_name, provider_type) values
  ('b2060000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'Ada', 'Dentist', 'REGULAR'),
  ('b2060000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'Bea', 'Dentist', 'PART_TIME'),
  ('b2060000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'Foreign', 'Dentist', 'REGULAR');

insert into public.branch_resources (id, organization_id, branch_id, resource_type_id, name) values
  ('b2070000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Chair A'),
  ('b2070000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Chair B'),
  ('b2070000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Foreign Chair');

insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, confirmation_status, encounter_status, completed_at, cancelled_at) values
  ('b2080000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2050000-0000-0000-0000-000000000001', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '60 minutes', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', statement_timestamp() - interval '2 days' + interval '60 minutes', null),
  ('b2080000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2050000-0000-0000-0000-000000000001', statement_timestamp() - interval '1 day', statement_timestamp() - interval '1 day' + interval '30 minutes', 'SCHEDULED', 'PENDING', 'NO_SHOW', null, null),
  ('b2080000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'b2050000-0000-0000-0000-000000000002', statement_timestamp() - interval '3 days', statement_timestamp() - interval '3 days' + interval '45 minutes', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', statement_timestamp() - interval '3 days' + interval '45 minutes', null),
  ('b2080000-0000-0000-0000-000000000004', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2050000-0000-0000-0000-000000000001', statement_timestamp() - interval '4 days', statement_timestamp() - interval '4 days' + interval '30 minutes', 'CANCELLED', 'PENDING', 'CANCELLED', null, statement_timestamp() - interval '4 days'),
  ('b2080000-0000-0000-0000-000000000005', 'b2020000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000003', 'b2050000-0000-0000-0000-000000000003', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '60 minutes', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', statement_timestamp() - interval '2 days' + interval '60 minutes', null);

insert into public.provider_reservations (id, organization_id, provider_id, branch_id, appointment_id, starts_at, ends_at) values
  ('b20d0000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2060000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2080000-0000-0000-0000-000000000001', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '60 minutes'),
  ('b20d0000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2060000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2080000-0000-0000-0000-000000000002', statement_timestamp() - interval '1 day', statement_timestamp() - interval '1 day' + interval '30 minutes'),
  ('b20d0000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000001', 'b2060000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000002', 'b2080000-0000-0000-0000-000000000003', statement_timestamp() - interval '3 days', statement_timestamp() - interval '3 days' + interval '45 minutes'),
  ('b20d0000-0000-0000-0000-000000000004', 'b2020000-0000-0000-0000-000000000002', 'b2060000-0000-0000-0000-000000000003', 'b2030000-0000-0000-0000-000000000003', 'b2080000-0000-0000-0000-000000000005', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '60 minutes');

insert into public.resource_reservations (id, organization_id, resource_id, branch_id, appointment_id, starts_at, ends_at) values
  ('b20e0000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2070000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2080000-0000-0000-0000-000000000001', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '60 minutes'),
  ('b20e0000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2070000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b2080000-0000-0000-0000-000000000002', statement_timestamp() - interval '1 day', statement_timestamp() - interval '1 day' + interval '30 minutes'),
  ('b20e0000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000001', 'b2070000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000002', 'b2080000-0000-0000-0000-000000000003', statement_timestamp() - interval '3 days', statement_timestamp() - interval '3 days' + interval '45 minutes');

insert into public.booking_requests (id, organization_id, branch_id, first_name, last_name, mobile, booking_channel_code, request_status, appointment_id, idempotency_key, created_at) values
  ('b2090000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'Synthetic', 'Request', '09170000001', 'WEBSITE', 'CONVERTED', 'b2080000-0000-0000-0000-000000000001', 'p20-request-1', statement_timestamp() - interval '2 days'),
  ('b2090000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'Synthetic', 'Declined', '09170000002', 'WEBSITE', 'DECLINED', null, 'p20-request-2', statement_timestamp() - interval '2 days'),
  ('b2090000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'Synthetic', 'Pending', '09170000003', 'WEBSITE', 'SUBMITTED', null, 'p20-request-3', statement_timestamp() - interval '2 days'),
  ('b2090000-0000-0000-0000-000000000004', 'b2020000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000003', 'Synthetic', 'Foreign', '09170000004', 'WEBSITE', 'CONVERTED', 'b2080000-0000-0000-0000-000000000005', 'p20-request-4', statement_timestamp() - interval '2 days');

insert into public.communications (id, organization_id, branch_id, channel, template_type, recipient, body, status, idempotency_key, sent_at, delivered_at, failed_at, created_at) values
  ('b20a0000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'SMS', 'REMINDER', '09170000001', 'Synthetic reminder', 'DELIVERED', 'p20-comms-1', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '1 minute', null, statement_timestamp() - interval '2 days'),
  ('b20a0000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'SMS', 'REMINDER', '09170000002', 'Synthetic reminder', 'FAILED', 'p20-comms-2', null, null, statement_timestamp() - interval '2 days' + interval '1 minute', statement_timestamp() - interval '2 days'),
  ('b20a0000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'EMAIL', 'CONFIRMATION', 'synthetic@example.test', 'Synthetic confirmation', 'SENT', 'p20-comms-3', statement_timestamp() - interval '2 days', null, null, statement_timestamp() - interval '2 days'),
  ('b20a0000-0000-0000-0000-000000000004', 'b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'EMAIL', 'CONFIRMATION', 'synthetic2@example.test', 'Synthetic confirmation', 'DELIVERED', 'p20-comms-4', statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days' + interval '1 minute', null, statement_timestamp() - interval '2 days');

insert into public.patient_referrals (id, org_id, patient_id, direction, status, created_at) values
  ('b20b0000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'b2050000-0000-0000-0000-000000000001', 'IN', 'COMPLETED', statement_timestamp() - interval '2 days'),
  ('b20b0000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'b2050000-0000-0000-0000-000000000002', 'OUT', 'ACTIVE', statement_timestamp() - interval '2 days'),
  ('b20b0000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'b2050000-0000-0000-0000-000000000003', 'IN', 'ACTIVE', statement_timestamp() - interval '2 days');

insert into public.inventory_items (id, organization_id, code, name, category, unit, reorder_level) values
  ('b20c0000-0000-0000-0000-000000000001', 'b2020000-0000-0000-0000-000000000001', 'GLOVES', 'Gloves', 'CONSUMABLE', 'box', 5),
  ('b20c0000-0000-0000-0000-000000000002', 'b2020000-0000-0000-0000-000000000001', 'MASKS', 'Masks', 'CONSUMABLE', 'box', 1),
  ('b20c0000-0000-0000-0000-000000000003', 'b2020000-0000-0000-0000-000000000002', 'FOREIGN', 'Foreign item', 'CONSUMABLE', 'box', 5);

insert into public.inventory_stock (organization_id, branch_id, item_id, quantity_on_hand) values
  ('b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000001', 'b20c0000-0000-0000-0000-000000000001', 2),
  ('b2020000-0000-0000-0000-000000000001', 'b2030000-0000-0000-0000-000000000002', 'b20c0000-0000-0000-0000-000000000001', 6),
  ('b2020000-0000-0000-0000-000000000002', 'b2030000-0000-0000-0000-000000000003', 'b20c0000-0000-0000-0000-000000000003', 0);

select extensions.is(
  (select description from public.permissions where code = 'analytics.view'),
  'View organization-level operational, acquisition, and referral analytics.',
  'the analytics permission describes its complete aggregate scope'
);

select extensions.set_eq(
  $$
    select role.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null and role.is_system and permission.code = 'analytics.view'
  $$,
  array['ADMIN', 'OWNER']::text[],
  'only OWNER and ADMIN retain analytics.view'
);

select extensions.is(
  (select count(*)::integer from pg_proc where oid in (
    'private.has_analytics_permission_at_branch(uuid)'::regprocedure,
    'public.get_operational_analytics_summary(uuid,uuid,integer)'::regprocedure,
    'public.list_operational_analytics_breakdown(uuid,uuid,integer)'::regprocedure
  ) and prosecdef and proconfig = array['search_path=""']::text[]),
  3,
  'all three Phase 20 definers pin an empty search path'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.get_operational_analytics_summary(uuid,uuid,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.list_operational_analytics_breakdown(uuid,uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_operational_analytics_summary(uuid,uuid,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.get_operational_analytics_summary(uuid,uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'public.list_operational_analytics_breakdown(uuid,uuid,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.list_operational_analytics_breakdown(uuid,uuid,integer)', 'execute'),
  'only authenticated receives the two exact Phase 20 RPC grants'
);

select extensions.ok(not exists(
  select 1
  from (values ('public'), ('anon'), ('authenticated'), ('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, 'private.has_analytics_permission_at_branch(uuid)', 'execute')
), 'the private analytics helper is not executable by any API role');

select extensions.ok(not exists(
  select 1
  from (values
    ('appointments'),
    ('patients'),
    ('patient_referrals'),
    ('booking_requests'),
    ('communications'),
    ('provider_reservations'),
    ('resource_reservations'),
    ('inventory_stock')
  ) as source(table_name)
  cross join (values ('anon'), ('authenticated'), ('service_role')) as role(role_name)
  where has_table_privilege(role.role_name, 'public.' || source.table_name, 'select')
), 'analytics adds no browser or service-role base-table reads');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2010000-0000-0000-0000-000000000001', true);

select extensions.set_eq(
  $$
    select metric_code || '=' || numerator::text || '/' || coalesce(denominator::text, '-')
    from public.get_operational_analytics_summary(
      'b2030000-0000-0000-0000-000000000001',
      'b2030000-0000-0000-0000-000000000001',
      30
    )
  $$,
  array[
    'appointments=2/-',
    'communication_delivery_rate=1/2',
    'completed_appointments=1/-',
    'confirmation_rate=1/2',
    'incoming_referrals=1/-',
    'low_stock_branch_items=2/-',
    'new_patients=1/-',
    'no_show_rate=1/2',
    'outgoing_referrals=0/-',
    'website_conversion_rate=1/2'
  ]::text[],
  'the branch summary follows every documented numerator and denominator'
);

select extensions.set_eq(
  $$
    select metric_code || '=' || numerator::text || '/' || coalesce(denominator::text, '-')
    from public.get_operational_analytics_summary(
      'b2030000-0000-0000-0000-000000000001', null, 30
    )
  $$,
  array[
    'appointments=3/-',
    'communication_delivery_rate=2/3',
    'completed_appointments=2/-',
    'confirmation_rate=2/3',
    'incoming_referrals=1/-',
    'low_stock_branch_items=3/-',
    'new_patients=2/-',
    'no_show_rate=1/3',
    'outgoing_referrals=1/-',
    'website_conversion_rate=1/3'
  ]::text[],
  'All Branches combines Org A without leaking Org B rows'
);

select extensions.is(
  (select item_count::text || ':' || booked_minutes::text
   from public.list_operational_analytics_breakdown(
     'b2030000-0000-0000-0000-000000000001',
     'b2030000-0000-0000-0000-000000000001',
     30
   ) where group_type = 'provider_load' and name = 'Ada Dentist'),
  '2:90',
  'provider load reports traceable booked appointment count and minutes'
);

select extensions.is(
  (select item_count::text || ':' || booked_minutes::text
   from public.list_operational_analytics_breakdown(
     'b2030000-0000-0000-0000-000000000001',
     'b2030000-0000-0000-0000-000000000001',
     30
   ) where group_type = 'resource_load' and name = 'Chair A'),
  '2:90',
  'resource load reports traceable booked appointment count and minutes'
);

select extensions.set_eq(
  $$
    select group_type || ':' || code || '=' || item_count::text
    from public.list_operational_analytics_breakdown(
      'b2030000-0000-0000-0000-000000000001',
      'b2030000-0000-0000-0000-000000000001',
      30
    )
    where group_type in ('acquisition_source', 'booking_channel')
  $$,
  array['acquisition_source:FACEBOOK=1', 'booking_channel:CLINIC_WEBSITE=1']::text[],
  'acquisition source and booking channel remain separate dimensions'
);

select extensions.set_eq(
  $$
    select code || '=' || item_count::text
    from public.list_operational_analytics_breakdown(
      'b2030000-0000-0000-0000-000000000001', null, 30
    )
    where group_type = 'branch_appointments'
  $$,
  array['P20-A1=2', 'P20-A2=1']::text[],
  'All Branches returns each Org A branch and excludes the foreign branch'
);

select extensions.ok(
  (select count(*) <= 300 from public.list_operational_analytics_breakdown(
    'b2030000-0000-0000-0000-000000000001', null, 30
  )),
  'the analytics breakdown is bounded to at most 300 aggregate rows'
);

select extensions.throws_ok(
  $$select public.get_operational_analytics_summary('b2030000-0000-0000-0000-000000000001',null,45)$$,
  '22023', 'invalid input', 'an unsupported analytics window is rejected'
);

select extensions.throws_ok(
  $$select public.get_operational_analytics_summary('b2030000-0000-0000-0000-000000000001','b2030000-0000-0000-0000-000000000003',30)$$,
  '42501', 'not authorized', 'a foreign branch filter is rejected'
);

select extensions.throws_ok(
  $$select public.list_operational_analytics_breakdown('b2ff0000-0000-0000-0000-000000000001',null,30)$$,
  '42501', 'not authorized', 'a forged acting branch is rejected'
);

select set_config('request.jwt.claim.sub', 'b2010000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.get_operational_analytics_summary('b2030000-0000-0000-0000-000000000001',null,30)$$,
  '42501', 'not authorized', 'a receptionist without analytics.view is denied'
);

select set_config('request.jwt.claim.sub', 'b2010000-0000-0000-0000-000000000003', true);
select extensions.throws_ok(
  $$select public.list_operational_analytics_breakdown('b2030000-0000-0000-0000-000000000001',null,30)$$,
  '42501', 'not authorized', 'a foreign-organization owner cannot read Org A analytics'
);

reset role;

select extensions.ok(
  pg_get_function_result('public.get_operational_analytics_summary(uuid,uuid,integer)'::regprocedure) !~* 'patient|recipient|contact|clinical'
  and pg_get_function_result('public.list_operational_analytics_breakdown(uuid,uuid,integer)'::regprocedure) !~* 'patient|recipient|contact|clinical',
  'analytics return contracts expose no patient, contact, or clinical field'
);

select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'b2020000-0000-0000-0000-000000000001'
     and action like '%.viewed'),
  0,
  'aggregate analytics reads write no audit event'
);

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;
