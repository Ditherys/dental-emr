begin;

select extensions.plan(6);

select extensions.is(
  (select count(*)::integer from public.permissions where code = 'site.manage'),
  1,
  'the site.manage permission row exists exactly once'
);

select extensions.set_eq(
  $$
    select role.code || ':' || permission.code
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and permission.code = 'site.manage'
    order by role.code
  $$,
  array[
    'ADMIN:site.manage',
    'OWNER:site.manage'
  ]::text[],
  'only OWNER and ADMIN receive site.manage'
);

select extensions.is(
  (
    select count(*)::integer
    from public.role_permissions as role_permission
    join public.roles as role on role.id = role_permission.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.organization_id is null
      and role.is_system
      and role.code in ('DENTIST', 'RECEPTIONIST', 'DENTAL_ASSISTANT', 'VISITING_SPECIALIST', 'BILLING')
      and permission.code = 'site.manage'
  ),
  0,
  'no other baseline role receives site.manage'
);

select extensions.columns_are('public','public_site_settings',array['organization_id','hero_heading','hero_subtext','about_text','contact_phone','contact_email','address_override','operating_hours','privacy_notice','messenger_link','booking_link','social_links','version','created_at','updated_at'],'public_site_settings has only the approved P12-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.public_site_settings'::regclass),'public_site_settings has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.public_site_settings',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no public_site_settings privileges');

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