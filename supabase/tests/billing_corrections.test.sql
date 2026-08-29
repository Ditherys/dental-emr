begin;

select extensions.plan(15);

-- Correction events never rewrite posted rows: adjustment reversals are
-- one-time full reversals, allocation reversals carry positive source amounts,
-- and payment/charge voids are unique terminal events.

select extensions.ok(
  (select count(*)::integer from pg_indexes where schemaname='public' and indexname='charge_direct_costs_one_reversal_idx')=1,
  'a direct-cost source permits exactly one full reversal'
);
select extensions.ok(
  exists (select 1 from pg_constraint where conname='charge_adjustment_reversals_organization_id_adjustment_id_key' and contype='u'),
  'a charge adjustment permits exactly one full reversal via unique(org,adjustment_id)'
);
select extensions.ok(
  exists (select 1 from pg_constraint where conname='payment_voids_organization_id_payment_id_key' and contype='u'),
  'a payment permits exactly one void via unique(org,payment_id)'
);
select extensions.ok(
  exists (select 1 from pg_constraint where conname='charge_voids_organization_id_charge_id_key' and contype='u'),
  'a charge permits exactly one void via unique(org,charge_id)'
);
select extensions.ok(
  (select count(*)::integer from pg_indexes where schemaname='public' and indexname='payment_allocation_reversals_one_refund_component_idx')=1,
  'every allocated refund component has exactly one equal reversal'
);
select extensions.is(
  (select count(*)::integer from pg_trigger where tgname='charges_append_only' and not tgisinternal),1,
  'charges are immutable POSTED snapshots via append-only trigger'
);

-- Build a synthetic graph to prove correction effects on derived balances.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b3200000-0000-0000-0000-000000000001','P320 Synthetic A Inc.','P320 A','p320-a');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b3210000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','P320 A Main','p320-a-main','P320-A1','1 St','City','Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b3220000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','P320-A-0001','Ana','Santos',date '1990-01-01');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('b3230000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('b3240000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','P320_EXAM','P320 Examination','active');
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  ('b3250000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3220000-0000-0000-0000-000000000001','b3210000-0000-0000-0000-000000000001','b3230000-0000-0000-0000-000000000001','b3240000-0000-0000-0000-000000000001',400000,date '2026-08-01','p320-charge-0001',false),
  ('b3250000-0000-0000-0000-000000000002','b3200000-0000-0000-0000-000000000001','b3220000-0000-0000-0000-000000000001','b3210000-0000-0000-0000-000000000001','b3230000-0000-0000-0000-000000000001','b3240000-0000-0000-0000-000000000001',100000,date '2026-08-02','p320-charge-0002',false);
insert into public.payment_methods (organization_id, code, name) values
  ('b3200000-0000-0000-0000-000000000001','CASH','Cash')
on conflict (organization_id, code) do nothing;
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, idempotency_key) values
  ('b3260000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3220000-0000-0000-0000-000000000001','b3210000-0000-0000-0000-000000000001',(select id from public.payment_methods where organization_id='b3200000-0000-0000-0000-000000000001' and code='CASH'),400000,'p320-payment-0001');
insert into public.payment_allocations (id, organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values
  ('b3270000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3260000-0000-0000-0000-000000000001','b3250000-0000-0000-0000-000000000001','b3220000-0000-0000-0000-000000000001',250000,'p320-alloc-0001');
select extensions.is(private.payment_availability('b3260000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),150000::bigint,'an allocation consumes the availability it retains');

-- A full allocation reversal releases the entire amount as account credit.
insert into public.payment_allocation_reversals (id, organization_id, allocation_id, cause, amount_centavos, reason, idempotency_key) values
  ('b3280000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3270000-0000-0000-0000-000000000001','MANUAL',250000,'full manual release','p320-rev-0001');
select extensions.is(private.payment_availability('b3260000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),400000::bigint,'a full allocation reversal restores full payment availability');
select extensions.is(private.charge_net_allocated('b3250000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),0::bigint,'a full allocation reversal leaves no net allocation');

-- A payment void is a unique terminal event and zeroes availability.
insert into public.payment_voids (id, organization_id, payment_id, reason) values
  ('b3290000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3260000-0000-0000-0000-000000000001','payment voided');
select extensions.is(private.payment_availability('b3260000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),0::bigint,'a valid payment void leaves zero availability');
select extensions.throws_ok($$insert into public.payment_voids (organization_id, payment_id, reason) values ('b3200000-0000-0000-0000-000000000001','b3260000-0000-0000-0000-000000000001','second void')$$,'23505',null,'a second payment void is rejected as a unique terminal event');

-- A charge void removes the voided charge from the derived balance and never
-- rewrites the posted charge row.
select extensions.is(private.patient_account_balance('b3220000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),500000::bigint,'with the payment voided the account balance is the unvoided charge total');
insert into public.charge_voids (id, organization_id, charge_id, reason) values
  ('b32a0000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001','b3250000-0000-0000-0000-000000000002','charge voided');
select extensions.is(private.patient_account_balance('b3220000-0000-0000-0000-000000000001','b3200000-0000-0000-0000-000000000001'),400000::bigint,'a charge void removes the voided charge from the derived balance');
select extensions.throws_ok($$update public.charges set amount_centavos=1 where id='b3250000-0000-0000-0000-000000000001'$$,'23514','billing ledger entries are append-only','a charge cannot be rewritten');
select extensions.throws_ok($$delete from public.charges where id='b3250000-0000-0000-0000-000000000001'$$,'23514','billing ledger entries are append-only','a charge cannot be deleted');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
