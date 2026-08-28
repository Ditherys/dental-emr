begin;

select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b6500000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-owner-a@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('b6500000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-owner-b@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('b6500000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-unaffiliated@example.test', '', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b6510000-0000-0000-0000-000000000001', 'Billing Configuration A Inc.', 'Billing Configuration A', 'billing-config-a'),
  ('b6510000-0000-0000-0000-000000000002', 'Billing Configuration B Inc.', 'Billing Configuration B', 'billing-config-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b6520000-0000-0000-0000-000000000001', 'b6510000-0000-0000-0000-000000000001', 'Billing Configuration A Main', 'billing-config-a-main', 'BCA', '1 Synthetic Way', 'Test City', 'Test Province'),
  ('b6520000-0000-0000-0000-000000000002', 'b6510000-0000-0000-0000-000000000002', 'Billing Configuration B Main', 'billing-config-b-main', 'BCB', '2 Synthetic Way', 'Test City', 'Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b6530000-0000-0000-0000-000000000001', 'b6510000-0000-0000-0000-000000000001', 'b6500000-0000-0000-0000-000000000001', 'active', statement_timestamp()),
  ('b6530000-0000-0000-0000-000000000002', 'b6510000-0000-0000-0000-000000000002', 'b6500000-0000-0000-0000-000000000002', 'active', statement_timestamp());
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select member.organization_id, member.id, role.id, null, member.user_id
from public.organization_members as member
join public.roles as role on role.organization_id is null and role.code = 'OWNER'
where member.id in ('b6530000-0000-0000-0000-000000000001', 'b6530000-0000-0000-0000-000000000002');
insert into public.procedures (id, organization_id, code, name) values
  ('b6540000-0000-0000-0000-000000000001', 'b6510000-0000-0000-0000-000000000001', 'BCFG_A', 'Billing Configuration A Procedure'),
  ('b6540000-0000-0000-0000-000000000002', 'b6510000-0000-0000-0000-000000000002', 'BCFG_B', 'Billing Configuration B Procedure');

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'set_procedure_default_fee', 'list_procedure_direct_cost_defaults',
        'create_procedure_direct_cost_default', 'update_procedure_direct_cost_default',
        'deactivate_procedure_direct_cost_default'
      )
      and has_function_privilege('authenticated', proc.oid, 'execute')
      and not has_function_privilege('anon', proc.oid, 'execute')
      and not has_function_privilege('service_role', proc.oid, 'execute')
      and proc.prosecdef
      and proc.proconfig = array['search_path=""']::text[]
  ),
  5,
  'only authenticated executes all five empty-search-path procedure financial configuration RPCs'
);
select extensions.ok(
  not exists (
    select 1
    from (values ('public.procedures'), ('public.procedure_direct_cost_defaults')) as target(table_name)
    cross join (values ('anon'), ('authenticated'), ('service_role')) as viewer(role_name)
    where has_table_privilege(viewer.role_name, target.table_name, 'select')
       or has_table_privilege(viewer.role_name, target.table_name, 'insert')
       or has_table_privilege(viewer.role_name, target.table_name, 'update')
       or has_table_privilege(viewer.role_name, target.table_name, 'delete')
  ),
  'procedure financial configuration tables remain inaccessible directly'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000001', true);

select extensions.is(
  (select version from public.set_procedure_default_fee('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', 1, 125000)),
  2,
  'billing.adjust owner updates the same-tenant procedure default fee with optimistic versioning'
);
reset role;
select extensions.is(
  (select default_fee_centavos from public.procedures where id = 'b6540000-0000-0000-0000-000000000001'),
  125000::bigint,
  'procedure fee is persisted as centavos'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.set_procedure_default_fee('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000002', 1, 999)$$,
  '42501', 'not authorized',
  'a foreign procedure is denied indistinguishably from a missing target'
);
select extensions.is(
  (select version from public.create_procedure_direct_cost_default('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', 'LAB', 'Synthetic lab fee', 20000)),
  1,
  'billing.adjust owner creates a same-tenant direct-cost default'
);
reset role;
select set_config('test.direct_cost_default_id', id::text, true)
from public.procedure_direct_cost_defaults
where description = 'Synthetic lab fee';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select version from public.update_procedure_direct_cost_default('b6520000-0000-0000-0000-000000000001', current_setting('test.direct_cost_default_id')::uuid, 1, 'MATERIAL', 'Synthetic material fee', 30000)),
  2,
  'direct-cost default updates are versioned'
);
reset role;
select set_config('test.direct_cost_default_id', id::text, true)
from public.procedure_direct_cost_defaults
where description = 'Synthetic material fee';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select version from public.deactivate_procedure_direct_cost_default('b6520000-0000-0000-0000-000000000001', current_setting('test.direct_cost_default_id')::uuid, 2)),
  3,
  'direct-cost default deactivation preserves the row and advances its version'
);
select extensions.is(
  (select count(*)::integer from public.list_procedure_direct_cost_defaults('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', false)),
  0,
  'default list excludes deactivated records'
);
select extensions.is(
  (select count(*)::integer from public.list_procedure_direct_cost_defaults('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', true)),
  1,
  'configuration list includes deactivated records only when requested'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.audit_events where organization_id = 'b6510000-0000-0000-0000-000000000001' and category = 'BILLING' and action like 'billing.procedure_%'),
  4,
  'fee and direct-cost mutations append one bounded audit event each'
);
select extensions.ok(
  (select private.audit_metadata_is_safe(metadata) from public.audit_events where organization_id = 'b6510000-0000-0000-0000-000000000001' and action = 'billing.procedure_direct_cost_default.created'),
  'direct-cost default audit metadata remains within the bounded allowlist'
);

create function private.b650_reject_fee_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'billing.procedure_default_fee.updated' then
    raise exception using errcode = 'P0001', message = 'audit blocked';
  end if;
  return new;
end;
$$;
create trigger b650_reject_fee_audit
before insert on public.audit_events
for each row execute function private.b650_reject_fee_audit();
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.set_procedure_default_fee('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', 2, 126000)$$,
  'P0001', 'audit blocked',
  'an audit insertion failure rejects the fee update atomically'
);
reset role;
select extensions.is(
  (select default_fee_centavos from public.procedures where id = 'b6540000-0000-0000-0000-000000000001'),
  125000::bigint,
  'audit failure rolls back the procedure fee update'
);
drop trigger b650_reject_fee_audit on public.audit_events;
drop function private.b650_reject_fee_audit();

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6500000-0000-0000-0000-000000000003', true);
select extensions.throws_ok(
  $$select * from public.list_procedure_direct_cost_defaults('b6520000-0000-0000-0000-000000000001', 'b6540000-0000-0000-0000-000000000001', false)$$,
  '42501', 'not authorized',
  'an unaffiliated authenticated actor cannot read procedure financial configuration'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
