begin;

select extensions.plan(14);

select extensions.has_table('public', 'charges', 'charges are persisted separately from estimates');
select extensions.has_table('public', 'payment_methods', 'payment methods are relational organization records');
select extensions.has_table('public', 'procedure_direct_cost_defaults', 'procedure cost defaults are relational suggestions');
select extensions.has_table('public', 'charge_direct_costs', 'approved direct costs are append-only ledger entries');
select extensions.has_table('public', 'charge_adjustments', 'charge adjustments are append-only ledger entries');
select extensions.has_table('public', 'charge_adjustment_reversals', 'adjustment reversals are distinct immutable entries');
select extensions.has_table('public', 'charge_voids', 'charge voids are immutable events');
select extensions.has_table('public', 'charge_attribution_corrections', 'attribution corrections are append-only events');
select extensions.col_type_is('public', 'procedures', 'default_fee_centavos', 'bigint', 'procedure defaults use centavos');
select extensions.col_type_is('public', 'treatment_plan_items', 'estimated_fee_centavos', 'bigint', 'plan estimates have a centavo compatibility column');
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'charges'),
  0,
  'charges have no browser RLS policy before narrow RPCs exist'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.charge_attribution_corrections'::regclass),
  'attribution corrections have RLS enabled'
);
select extensions.ok(
  not exists (
    select 1
    from (values ('public'), ('anon'), ('authenticated'), ('service_role')) as viewer(role_name)
    cross join (values ('public.charges'), ('public.payment_methods'), ('public.procedure_direct_cost_defaults'), ('public.charge_direct_costs'), ('public.charge_adjustments'), ('public.charge_adjustment_reversals'), ('public.charge_voids'), ('public.charge_attribution_corrections')) as tab(name)
    where has_table_privilege(viewer.role_name, tab.name, 'SELECT')
       or has_table_privilege(viewer.role_name, tab.name, 'INSERT')
       or has_table_privilege(viewer.role_name, tab.name, 'UPDATE')
       or has_table_privilege(viewer.role_name, tab.name, 'DELETE')
  ),
  'no billing ledger table grants any base DML to browser roles'
);
-- The default-method hook must be idempotent under replay.
insert into public.organizations (id, legal_name, business_name, slug)
values ('a2b10000-0000-0000-0000-000000000001', 'B2 Synthetic Inc.', 'B2 Synthetic', 'b2-synthetic')
on conflict (id) do nothing;
insert into public.payment_methods (organization_id, code, name)
values ('a2b10000-0000-0000-0000-000000000001', 'CASH', 'Cash')
on conflict (organization_id, code) do nothing;
select extensions.is(
  (select count(*)::integer from public.payment_methods
   where organization_id = 'a2b10000-0000-0000-0000-000000000001' and active),
  7,
  'a newly created organization receives the seven default payment methods'
);

select * from extensions.finish();
rollback;
