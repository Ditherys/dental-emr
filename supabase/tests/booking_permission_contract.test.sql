begin;

select extensions.plan(6);

select extensions.is(
  (select count(*)::integer from public.permissions where code = 'booking.review'),
  1,
  'the booking.review permission row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'booking.review'
    order by role.code
  $$,
  array[
    'ADMIN:booking.review',
    'OWNER:booking.review',
    'RECEPTIONIST:booking.review'
  ]::text[],
  'only OWNER, ADMIN, and RECEPTIONIST receive booking.review'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('DENTIST', 'DENTAL_ASSISTANT', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code = 'booking.review'
  ),
  0,
  'no other baseline role receives booking.review'
);

select extensions.columns_are('public','booking_requests',array['id','organization_id','branch_id','requested_procedure_id','requested_provider_id','requested_starts_at','requested_ends_at','first_name','last_name','birth_date','mobile','email','acquisition_source_code','booking_channel_code','referral_payload','request_status','management_token_hash','idempotency_key','reviewed_by','reviewed_at','appointment_id','version','created_at','updated_at'],'booking_requests has only the approved P13-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.booking_requests'::regclass),'booking_requests has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.booking_requests',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no booking_requests privileges');

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from test_failures;

rollback;