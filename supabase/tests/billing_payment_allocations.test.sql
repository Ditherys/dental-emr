begin;

select extensions.plan(30);

-- Cleared-money ledger tables are relational, RLS-enforced, and grant-free.
select extensions.has_table('public','payments','payments are immutable cleared-money records');
select extensions.has_table('public','payment_allocations','payment allocations are append-only ledger entries');
select extensions.has_table('public','payment_allocation_reversals','allocation reversals are append-only ledger entries');
select extensions.has_table('public','payment_refunds','refunds are append-only ledger entries');
select extensions.has_table('public','payment_refund_allocations','refund components are append-only metadata');
select extensions.has_table('public','payment_voids','payment voids are unique terminal events');
select extensions.ok(
  (select count(*)::integer from pg_class where oid in ('public.payments'::regclass,'public.payment_allocations'::regclass,'public.payment_allocation_reversals'::regclass,'public.payment_refunds'::regclass,'public.payment_refund_allocations'::regclass,'public.payment_voids'::regclass) and relrowsecurity)=6,
  'every cleared-money ledger table has RLS enabled'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('payments','payment_allocations','payment_allocation_reversals','payment_refunds','payment_refund_allocations','payment_voids')),
  0,
  'cleared-money ledger tables expose no browser RLS policy before narrow RPCs exist'
);
select extensions.ok(
  not exists (
    select 1
    from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    cross join (values ('public.payments'),('public.payment_allocations'),('public.payment_allocation_reversals'),('public.payment_refunds'),('public.payment_refund_allocations'),('public.payment_voids')) as tab(name)
    where has_table_privilege(viewer.role_name, tab.name, 'SELECT')
       or has_table_privilege(viewer.role_name, tab.name, 'INSERT')
       or has_table_privilege(viewer.role_name, tab.name, 'UPDATE')
       or has_table_privilege(viewer.role_name, tab.name, 'DELETE')
  ),
  'no cleared-money ledger table grants any base DML to browser roles'
);
select extensions.is(
  (select count(*)::integer from pg_trigger where tgname='payments_append_only' and not tgisinternal),1,
  'payments are append-only via trigger'
);
select extensions.is(
  (select count(*)::integer from pg_trigger where tgname in ('payment_allocations_append_only','payment_allocation_reversals_append_only','payment_refunds_append_only','payment_refund_allocations_append_only','payment_voids_append_only') and not tgisinternal),5,
  'all payment event tables are append-only via trigger'
);

-- Build a synthetic graph to prove tenant-safe FKs and the derived helpers.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b3100000-0000-0000-0000-000000000001','P310 Synthetic A Inc.','P310 A','p310-a'),
  ('b3100000-0000-0000-0000-000000000002','P310 Synthetic B Inc.','P310 B','p310-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b3110000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','P310 A Main','p310-a-main','P310-A1','1 St','City','Province'),
  ('b3110000-0000-0000-0000-000000000002','b3100000-0000-0000-0000-000000000001','P310 A Other','p310-a-other','P310-A2','2 St','City','Province'),
  ('b3110000-0000-0000-0000-000000000003','b3100000-0000-0000-0000-000000000002','P310 B Main','p310-b-main','P310-B1','3 St','City','Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b3120000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','P310-A-0001','Ana','Santos',date '1990-01-01'),
  ('b3120000-0000-0000-0000-000000000002','b3100000-0000-0000-0000-000000000001','P310-A-0002','Ana','Santos',date '1990-01-01'),
  ('b3120000-0000-0000-0000-000000000003','b3100000-0000-0000-0000-000000000002','P310-B-0001','Bea','Rivera',date '1991-01-01');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('b3130000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('b3140000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','P310_EXAM','P310 Examination','active');
insert into public.payment_methods (organization_id, code, name) values
  ('b3100000-0000-0000-0000-000000000001','CASH','Cash'),
  ('b3100000-0000-0000-0000-000000000002','CASH','Cash')
on conflict (organization_id, code) do nothing;
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  ('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001','b3110000-0000-0000-0000-000000000001','b3130000-0000-0000-0000-000000000001','b3140000-0000-0000-0000-000000000001',500000,date '2026-08-01','p310-charge-0001',false),
  ('b3150000-0000-0000-0000-000000000002','b3100000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001','b3110000-0000-0000-0000-000000000002','b3130000-0000-0000-0000-000000000001',null,100000,date '2026-08-02','p310-charge-0002',false),
  ('b3150000-0000-0000-0000-000000000003','b3100000-0000-0000-0000-000000000002','b3120000-0000-0000-0000-000000000003','b3110000-0000-0000-0000-000000000003',null,null,200000,date '2026-08-03','p310-charge-0003',true);

-- Payments: immutable, nonnegative principal, bounded reference.
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, reference, idempotency_key) values
  ('b3160000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001','b3110000-0000-0000-0000-000000000001',(select id from public.payment_methods where organization_id='b3100000-0000-0000-0000-000000000001' and code='CASH'),300000,'P310-REF-1','p310-payment-0001');
select extensions.is((select amount_centavos from public.payments where id='b3160000-0000-0000-0000-000000000001'),300000::bigint,'a cleared payment stores its principal');
select extensions.throws_ok($$update public.payments set reference='tamper' where id='b3160000-0000-0000-0000-000000000001'$$,'23514','billing ledger entries are append-only','payments cannot be edited');
select extensions.throws_ok($$insert into public.payments (organization_id, patient_id, branch_id, payment_method_id, amount_centavos, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001','b3110000-0000-0000-0000-000000000001',(select id from public.payment_methods where organization_id='b3100000-0000-0000-0000-000000000001' and code='CASH'),0,'p310-payment-0002')$$,'23514',null,'a zero-amount payment is rejected');

-- Allocations require the same patient on payment and charge, and are
-- tenant-safe against foreign charges.
insert into public.payment_allocations (id, organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values
  ('b3170000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3150000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001',200000,'p310-alloc-0001');
select extensions.is((select count(*)::integer from public.payment_allocations where organization_id='b3100000-0000-0000-0000-000000000001'),1,'a same-patient allocation is accepted');
select extensions.throws_ok($$insert into public.payment_allocations (organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3150000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000002',100000,'p310-alloc-0002')$$,'23514','payment allocation patient must match the payment and charge patient','a mismatched patient allocation is rejected');
select extensions.throws_ok($$insert into public.payment_allocations (organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3150000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001',0,'p310-alloc-0003')$$,'23514',null,'a zero-amount allocation is rejected');
select extensions.throws_ok($$insert into public.payment_allocations (organization_id, payment_id, charge_id, patient_id, amount_centavos, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3150000-0000-0000-0000-000000000003','b3120000-0000-0000-0000-000000000001',100000,'p310-alloc-0004')$$,'23514','payment allocation patient must match the payment and charge patient','a foreign-tenant charge cannot be allocated against an org-A payment');

-- Derived balance helpers reconcile the fixture exactly.
select extensions.is(private.payment_availability('b3160000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),100000::bigint,'payment availability is principal minus allocations');
select extensions.is(private.charge_adjusted_amount('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),500000::bigint,'charge adjusted amount starts at the posted amount');
select extensions.is(private.charge_net_allocated('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),200000::bigint,'charge net allocated is the retained allocation');
select extensions.is(private.charge_due('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),300000::bigint,'charge due is adjusted amount minus net allocated');
select extensions.is(private.patient_account_balance('b3120000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),300000::bigint,'patient balance derives from history (two charges minus unallocated credit)');

-- A partial allocation reversal releases credit and reduces charge consumption.
insert into public.payment_allocation_reversals (id, organization_id, allocation_id, cause, amount_centavos, reason, idempotency_key) values
  ('b3180000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001','MANUAL',50000,'manual partial release','p310-rev-0001');
select extensions.is(private.payment_availability('b3160000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),150000::bigint,'a partial allocation reversal releases credit');
select extensions.is(private.charge_net_allocated('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),150000::bigint,'a partial allocation reversal reduces charge consumption');

-- Charge credit adjustments reduce the adjusted amount exactly.
insert into public.charge_adjustments (id, organization_id, charge_id, direction, amount_centavos, reason, idempotency_key) values
  ('b3190000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3150000-0000-0000-0000-000000000001','CREDIT',25000,'adjustment credit','p310-adj-0001');
select extensions.is(private.charge_adjusted_amount('b3150000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001'),475000::bigint,'a credit adjustment reduces the adjusted amount');

-- Refund components: every allocation-linked component needs exactly one equal
-- REFUND reversal; a duplicate or unequal reversal is rejected.
insert into public.payment_refunds (id, organization_id, payment_id, patient_id, amount_centavos, reason, idempotency_key) values
  ('b31a0000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3120000-0000-0000-0000-000000000001',50000,'refund partial','p310-refund-0001');
insert into public.payment_refund_allocations (id, organization_id, refund_id, payment_id, allocation_id, amount_centavos) values
  ('b31b0000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','b31a0000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001',50000),
  ('b31b0000-0000-0000-0000-000000000002','b3100000-0000-0000-0000-000000000001','b31a0000-0000-0000-0000-000000000001','b3160000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001',100000);
select extensions.throws_ok($$insert into public.payment_allocation_reversals (organization_id, allocation_id, cause, amount_centavos, reason, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001','REFUND',50000,'refund component reversal','p310-rev-0002')$$,'23514','new row for relation "payment_allocation_reversals" violates check constraint "payment_allocation_reversals_refund_cause_link_check"','a REFUND reversal without its one-to-one component link is rejected');
select extensions.throws_ok($$insert into public.payment_allocation_reversals (organization_id, allocation_id, payment_refund_allocation_id, cause, amount_centavos, reason, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001','b31b0000-0000-0000-0000-000000000002','REFUND',90000,'unequal component reversal','p310-rev-0009')$$,'23514','refund allocation reversal must exactly equal its refund component','a reversal that does not equal its refund component is rejected');
insert into public.payment_allocation_reversals (id, organization_id, allocation_id, payment_refund_allocation_id, cause, amount_centavos, reason, idempotency_key) values
  ('b3180000-0000-0000-0000-000000000002','b3100000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001','b31b0000-0000-0000-0000-000000000001','REFUND',50000,'refund component reversal','p310-rev-0003');
select extensions.is((select count(*)::integer from public.payment_allocation_reversals where organization_id='b3100000-0000-0000-0000-000000000001' and cause='REFUND'),1,'a refund component reversal is accepted with the exact component amount');
select extensions.throws_ok($$insert into public.payment_allocation_reversals (organization_id, allocation_id, payment_refund_allocation_id, cause, amount_centavos, reason, idempotency_key) values ('b3100000-0000-0000-0000-000000000001','b3170000-0000-0000-0000-000000000001','b31b0000-0000-0000-0000-000000000001','REFUND',50000,'duplicate component reversal','p310-rev-0004')$$,'23505','duplicate key value violates unique constraint "payment_allocation_reversals_one_refund_component_idx"','a second reversal for the same refund component is rejected');

select * from extensions.finish();
rollback;