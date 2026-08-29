begin;

select extensions.plan(9);

-- Tenant-safe append-only attribution corrections never rewrite the charge.
select extensions.has_table('public', 'charge_attribution_corrections', 'attribution corrections are persisted as append-only events');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.charge_attribution_corrections'::regclass),
  'attribution corrections enforce RLS'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'charge_attribution_corrections'),
  0,
  'attribution corrections expose no browser RLS policy before narrow RPCs exist'
);
select extensions.ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'charges_org_procedure_date_idx'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'charges_org_plan_item_idx'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'payment_methods_org_active_code_idx'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'procedure_direct_cost_defaults_org_procedure_active_idx'
  ),
  'the tenant-scoped billing access-path indexes exist'
);

-- A correction must always change provider, branch, or service date and never
-- weaken tenant safety. Build a minimal synthetic graph to prove it.
insert into public.organizations (id, legal_name, business_name, slug)
values ('a2c10000-0000-0000-0000-000000000001', 'B2 Attribution Inc.', 'B2 Attribution', 'b2-attribution');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province)
values ('a2c20000-0000-0000-0000-000000000001', 'a2c10000-0000-0000-0000-000000000001', 'Main', 'main', 'B2-MAIN', '1 St', 'City', 'Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date)
values ('a2c30000-0000-0000-0000-000000000001', 'a2c10000-0000-0000-0000-000000000001', 'P-B2-0001', 'Ana', 'Santos', date '1990-01-01');
insert into public.procedures (id, organization_id, code, name)
values ('a2c40000-0000-0000-0000-000000000001', 'a2c10000-0000-0000-0000-000000000001', 'B2_EXAM', 'B2 Examination');
insert into public.providers (id, organization_id, first_name, last_name, provider_type)
values ('a2c50000-0000-0000-0000-000000000001', 'a2c10000-0000-0000-0000-000000000001', 'Provider', 'A', 'REGULAR');
insert into public.charges (
  id, organization_id, patient_id, branch_id, provider_id, procedure_id,
  amount_centavos, service_date, idempotency_key
)
values (
  'a2c60000-0000-0000-0000-000000000001', 'a2c10000-0000-0000-0000-000000000001',
  'a2c30000-0000-0000-0000-000000000001', 'a2c20000-0000-0000-0000-000000000001',
  'a2c50000-0000-0000-0000-000000000001', 'a2c40000-0000-0000-0000-000000000001',
  250000, date '2026-08-01', 'b2-charge-0001'
);
insert into public.charge_attribution_corrections (
  organization_id, charge_id, previous_provider_id, corrected_provider_id,
  previous_service_date, corrected_service_date, reason, idempotency_key
)
values (
  'a2c10000-0000-0000-0000-000000000001', 'a2c60000-0000-0000-0000-000000000001',
  'a2c50000-0000-0000-0000-000000000001', null,
  date '2026-08-01', date '2026-08-02', 'corrected service date', 'b2-corr-0001'
);
select extensions.is(
  (select count(*)::integer from public.charge_attribution_corrections
   where organization_id = 'a2c10000-0000-0000-0000-000000000001'),
  1,
  'a valid correction event is accepted'
);
select extensions.throws_ok(
  $$update public.charge_attribution_corrections set reason = 'tamper'$$,
  '23514', 'billing ledger entries are append-only',
  'attribution correction history cannot be updated'
);
select extensions.throws_ok(
  $$delete from public.charge_attribution_corrections$$,
  '23514', 'billing ledger entries are append-only',
  'attribution correction history cannot be deleted'
);
select extensions.throws_ok(
  $$insert into public.charge_attribution_corrections (
    organization_id, charge_id, previous_provider_id, corrected_provider_id,
    previous_service_date, corrected_service_date, reason, idempotency_key
  ) values (
    'a2c10000-0000-0000-0000-000000000001', 'a2c60000-0000-0000-0000-000000000001',
    'a2c50000-0000-0000-0000-000000000001', 'a2c50000-0000-0000-0000-000000000001',
    date '2026-08-01', date '2026-08-01', 'no-op', 'b2-corr-0002'
  )$$,
  '23514', 'new row for relation "charge_attribution_corrections" violates check constraint "charge_attribution_corrections_attribution_changed_check"',
  'a correction that changes nothing is rejected'
);
select extensions.throws_ok(
  $$insert into public.charge_attribution_corrections (
    organization_id, charge_id, previous_provider_id, corrected_provider_id,
    previous_service_date, corrected_service_date, reason, idempotency_key
  ) values (
    'a2c10000-0000-0000-0000-000000000001', 'a2c60000-0000-0000-0000-000000000001',
    'a2c50000-0000-0000-0000-000000000001', null,
    date '2026-08-01', date '2026-08-03', 'duplicate key', 'b2-corr-0001'
  )$$,
  '23505', 'duplicate key value violates unique constraint "charge_attribution_correction_organization_id_idempotency_k_key"',
  'a duplicate idempotency key cannot replay a correction'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
