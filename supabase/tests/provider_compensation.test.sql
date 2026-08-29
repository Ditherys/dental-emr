begin;

select extensions.plan(27);

-- Compensation tables are RLS-enforced, grant-free, and append-only where
-- ledger-like.
select extensions.has_table('public','provider_compensation_agreements','agreements are effective-dated provider compensation records');
select extensions.has_table('public','provider_procedure_compensation_rates','procedure overrides are agreement-scoped');
select extensions.has_table('public','provider_earning_entries','earning entries are append-only ledger rows');
select extensions.has_table('public','charge_compensation_resolutions','compensation resolutions are append-only');
select extensions.ok(
  (select count(*)::integer from pg_class where oid in ('public.provider_compensation_agreements'::regclass,'public.provider_procedure_compensation_rates'::regclass,'public.provider_earning_entries'::regclass,'public.charge_compensation_resolutions'::regclass) and relrowsecurity)=4,
  'every compensation table has RLS enabled'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('provider_compensation_agreements','provider_procedure_compensation_rates','provider_earning_entries','charge_compensation_resolutions')),
  0,
  'compensation tables expose no browser RLS policy before narrow RPCs exist'
);
select extensions.ok(
  not exists (
    select 1
    from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    cross join (values ('public.provider_compensation_agreements'),('public.provider_procedure_compensation_rates'),('public.provider_earning_entries'),('public.charge_compensation_resolutions')) as tab(name)
    where has_table_privilege(viewer.role_name, tab.name, 'SELECT')
       or has_table_privilege(viewer.role_name, tab.name, 'INSERT')
       or has_table_privilege(viewer.role_name, tab.name, 'UPDATE')
       or has_table_privilege(viewer.role_name, tab.name, 'DELETE')
  ),
  'no compensation table grants any base DML to browser roles'
);
select extensions.is(
  (select count(*)::integer from pg_trigger where tgname in ('provider_earning_entries_append_only','charge_compensation_resolutions_append_only') and not tgisinternal),2,
  'earning entries and resolutions are append-only via trigger'
);

-- Build a synthetic graph.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b4100000-0000-0000-0000-000000000001','P410 Synthetic A Inc.','P410 A','p410-a'),
  ('b4100000-0000-0000-0000-000000000002','P410 Synthetic B Inc.','P410 B','p410-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b4110000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','P410 A Main','p410-a-main','P410-A1','1 St','City','Province'),
  ('b4110000-0000-0000-0000-000000000002','b4100000-0000-0000-0000-000000000002','P410 B Main','p410-b-main','P410-B1','2 St','City','Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b4120000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','P410-A-0001','Ana','Santos',date '1990-01-01'),
  ('b4120000-0000-0000-0000-000000000002','b4100000-0000-0000-0000-000000000002','P410-B-0001','Bea','Rivera',date '1991-01-01');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('b4130000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('b4130000-0000-0000-0000-000000000002','b4100000-0000-0000-0000-000000000002','Dentist','B1','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('b4140000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','P410_EXAM','P410 Examination','active');
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  ('b4150000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','b4120000-0000-0000-0000-000000000001','b4110000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',1000000,date '2026-08-10','p410-charge-0001',false);

-- Agreements: effective-dated with no overlapping ACTIVE ranges per provider.
insert into public.provider_compensation_agreements (id, organization_id, provider_id, effective_from, effective_to, default_rate_bps, basis) values
  ('b4160000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001',date '2026-01-01',date '2026-06-30',4000,'GROSS'),
  ('b4160000-0000-0000-0000-000000000002','b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001',date '2026-07-01',null,5000,'NET_DIRECT_COST');
select extensions.is((select count(*)::integer from public.provider_compensation_agreements where organization_id='b4100000-0000-0000-0000-000000000001'),2,'sequential non-overlapping agreements are accepted');
select extensions.throws_ok($$insert into public.provider_compensation_agreements (organization_id, provider_id, effective_from, effective_to, default_rate_bps, basis) values ('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001',date '2026-06-01',date '2026-07-15',3000,'GROSS')$$,'23P01','conflicting key value violates exclusion constraint "provider_compensation_agreements_active_overlap_exclusion"','an ACTIVE agreement overlapping an existing ACTIVE agreement is rejected');
select extensions.throws_ok($$insert into public.provider_compensation_agreements (organization_id, provider_id, effective_from, effective_to, default_rate_bps, basis) values ('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000002',date '2026-01-01',null,3000,'GROSS')$$,'23503',null,'a foreign-tenant provider cannot own an agreement in another organization');

-- Procedure overrides must belong to the agreement provider and to a real
-- procedure, and cannot exceed the rate bound.
insert into public.provider_procedure_compensation_rates (id, organization_id, agreement_id, provider_id, procedure_id, rate_bps, basis) values
  ('b4170000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','b4160000-0000-0000-0000-000000000002','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',6000,'GROSS');
select extensions.is((select count(*)::integer from public.provider_procedure_compensation_rates where organization_id='b4100000-0000-0000-0000-000000000001'),1,'a matching procedure override is accepted');
select extensions.throws_ok($$insert into public.provider_procedure_compensation_rates (organization_id, agreement_id, provider_id, procedure_id, rate_bps) values ('b4100000-0000-0000-0000-000000000001','b4160000-0000-0000-0000-000000000002','b4130000-0000-0000-0000-000000000002','b4140000-0000-0000-0000-000000000001',6000)$$,'23514','procedure compensation rate provider must match its agreement provider','an override provider different from the agreement provider is rejected');
select extensions.throws_ok($$insert into public.provider_procedure_compensation_rates (organization_id, agreement_id, provider_id, procedure_id, rate_bps) values ('b4100000-0000-0000-0000-000000000001','b4160000-0000-0000-0000-000000000002','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',11000)$$,'23514',null,'a rate above 10000 basis points is rejected');

-- Service-date resolution snapshots the effective agreement and procedure
-- override, and returns no row outside any active range.
select extensions.is((select rate_bps from private.resolve_compensation_rate('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',date '2026-03-15')),4000::integer,'the first agreement resolves on its service date');
select extensions.is((select rate_bps from private.resolve_compensation_rate('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',date '2026-08-10')),6000::integer,'the procedure override resolves on the later service date');
select extensions.is((select basis from private.resolve_compensation_rate('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',date '2026-08-10')),'GROSS'::text,'the override basis is used when provided');
select extensions.is((select count(*)::integer from private.resolve_compensation_rate('b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4140000-0000-0000-0000-000000000001',date '2025-12-31')),0,'no agreement resolves on a date before any effective range');

-- Cumulative earning target matches the integer half-up contract.
select extensions.is(private.earning_cumulative_target('GROSS',1000000,0,6000),600000::bigint,'gross target is basis * rate');
select extensions.is(private.earning_cumulative_target('NET_DIRECT_COST',1000000,250000,4000),300000::bigint,'net target recovers approved direct cost first');
select extensions.is(private.earning_cumulative_target('NET_DIRECT_COST',1000000,1200000,4000),0::bigint,'net target is zero until allocations exceed costs');
select extensions.is(private.earning_cumulative_target('GROSS',1,0,5000),1::bigint,'half-up rounding is applied on the positive target');

-- Earning entries are append-only and resolutions require a consistent state.
insert into public.provider_earning_entries (id, organization_id, provider_id, charge_id, entry_type, cause, eligible_basis_centavos, net_approved_cost_centavos, rate_bps, earning_centavos, idempotency_key) values
  ('b4180000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','b4130000-0000-0000-0000-000000000001','b4150000-0000-0000-0000-000000000001','ACCRUAL','DIRECT_COST',1000000,0,6000,600000,'p410-earn-0001');
select extensions.is((select count(*)::integer from public.provider_earning_entries where organization_id='b4100000-0000-0000-0000-000000000001'),1,'an accrual earning entry is accepted');
select extensions.throws_ok($$update public.provider_earning_entries set earning_centavos=0$$,'23514','billing ledger entries are append-only','earning entries cannot be edited');
select extensions.throws_ok($$insert into public.charge_compensation_resolutions (organization_id, charge_id, state, agreement_id, rate_bps, basis, authoritative_service_date, reason, idempotency_key) values ('b4100000-0000-0000-0000-000000000001','b4150000-0000-0000-0000-000000000001','RESOLVED',null,null,null,date '2026-08-10','missing snapshot','p410-res-0001')$$,'23514',null,'a RESOLVED resolution without a rate snapshot is rejected');
insert into public.charge_compensation_resolutions (id, organization_id, charge_id, state, agreement_id, rate_bps, basis, authoritative_service_date, reason, idempotency_key) values
  ('b4190000-0000-0000-0000-000000000001','b4100000-0000-0000-0000-000000000001','b4150000-0000-0000-0000-000000000001','RESOLVED','b4160000-0000-0000-0000-000000000002',6000,'GROSS',date '2026-08-10','resolved','p410-res-0002');
select extensions.is((select count(*)::integer from public.charge_compensation_resolutions where organization_id='b4100000-0000-0000-0000-000000000001'),1,'a consistent RESOLVED resolution is accepted');
select extensions.throws_ok($$insert into public.charge_compensation_resolutions (organization_id, charge_id, state, agreement_id, rate_bps, basis, authoritative_service_date, reason, idempotency_key) values ('b4100000-0000-0000-0000-000000000001','b4150000-0000-0000-0000-000000000001','NO_ACTIVE_AGREEMENT','b4160000-0000-0000-0000-000000000002',6000,'GROSS',date '2026-08-10','contradictory','p410-res-0003')$$,'23514',null,'a NO_ACTIVE_AGREEMENT resolution cannot carry a rate snapshot');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
