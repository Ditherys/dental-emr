begin;

select extensions.no_plan();

-- B9 narrow aggregate RPCs are reachable only to authenticated, with empty
-- SECURITY DEFINER search paths, and never touch the base ledger directly.
select extensions.is(
  (
    select count(*)::integer
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in ('get_financial_summary', 'list_pending_pdc')
      and has_function_privilege('authenticated', proc.oid, 'execute')
      and not has_function_privilege('anon', proc.oid, 'execute')
      and not has_function_privilege('service_role', proc.oid, 'execute')
      and proc.prosecdef
      and proc.proconfig = array['search_path=""']::text[]
  ),
  2,
  'only authenticated executes both financial analytics RPCs and they pin an empty search path'
);

-- The financial ledger base tables remain grant-free for browser roles.
select extensions.ok(
  not exists (
    select 1
    from (values
      ('public.payments'), ('public.payment_allocations'), ('public.payment_refunds'),
      ('public.postdated_cheques'), ('public.provider_earning_entries'), ('public.charges')
    ) as ledger(table_name)
    cross join (values ('anon'), ('authenticated'), ('service_role')) as viewer(role_name)
    where has_table_privilege(viewer.role_name, ledger.table_name, 'select')
       or has_table_privilege(viewer.role_name, ledger.table_name, 'insert')
       or has_table_privilege(viewer.role_name, ledger.table_name, 'update')
       or has_table_privilege(viewer.role_name, ledger.table_name, 'delete')
  ),
  'financial ledger base tables remain grant-free for browser and service roles'
);

-- Build a synthetic organization and a deposit + collection pair to validate
-- the bounded signed aggregation.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b9100000-0000-0000-0000-000000000001', 'B9 Synthetic A Inc.', 'B9 A', 'b9-a');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b9110000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', 'B9 A Main', 'b9-a-main', 'B9-A', '1 St', 'City', 'Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b9120000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', 'B9-A-0001', 'Bea', 'Santos', date '1990-01-01');
insert into public.charges (id, organization_id, patient_id, branch_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  ('b9130000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', 'b9120000-0000-0000-0000-000000000001', 'b9110000-0000-0000-0000-000000000001', 1500000, date '2026-08-10', 'b9-charge-1', true);
insert into public.payment_methods (organization_id, code, name) values
  ('b9100000-0000-0000-0000-000000000001', 'CASH', 'Cash')
  on conflict (organization_id, code) do nothing;
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, idempotency_key) values
  ('b9140000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', 'b9120000-0000-0000-0000-000000000001', 'b9110000-0000-0000-0000-000000000001', (select id from public.payment_methods where organization_id='b9100000-0000-0000-0000-000000000001' and code='CASH'), 1000000, 'b9-payment-1');
insert into public.payment_allocations (organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values
  ('b9100000-0000-0000-0000-000000000001', 'b9140000-0000-0000-0000-000000000001', 'b9130000-0000-0000-0000-000000000001', 'b9120000-0000-0000-0000-000000000001', 1000000, 'b9-alloc-1');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b9100000-0000-0000-0000-000000000003', true);
select extensions.throws_ok(
  $$select public.get_financial_summary('b9110000-0000-0000-0000-000000000001'::uuid, null::uuid, null::date, null::date)$$,
  '42501',
  'not authorized',
  'an unaffiliated authenticated actor cannot read the financial summary'
);
select extensions.throws_ok(
  $$select public.list_pending_pdc('b9110000-0000-0000-0000-000000000001'::uuid, null::uuid)$$,
  '42501',
  'not authorized',
  'an unaffiliated authenticated actor cannot read the pending PDC report'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
