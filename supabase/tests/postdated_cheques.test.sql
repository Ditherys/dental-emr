begin;

select extensions.plan(26);

-- PDC tables are RLS-enforced, grant-free, and the event chain is append-only.
select extensions.has_table('public','postdated_cheques','postdated cheques are protected promise records');
select extensions.has_table('public','postdated_cheque_allocations','proposed allocations are separate from confirmed payment allocations');
select extensions.has_table('public','postdated_cheque_status_events','the cheque state chain is append-only');
select extensions.ok(
  (select count(*)::integer from pg_class where oid in ('public.postdated_cheques'::regclass,'public.postdated_cheque_allocations'::regclass,'public.postdated_cheque_status_events'::regclass) and relrowsecurity)=3,
  'every postdated cheque table has RLS enabled'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('postdated_cheques','postdated_cheque_allocations','postdated_cheque_status_events')),
  0,
  'postdated cheque tables expose no browser RLS policy before narrow RPCs exist'
);
select extensions.ok(
  not exists (
    select 1
    from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    cross join (values ('public.postdated_cheques'),('public.postdated_cheque_allocations'),('public.postdated_cheque_status_events')) as tab(name)
    where has_table_privilege(viewer.role_name, tab.name, 'SELECT')
       or has_table_privilege(viewer.role_name, tab.name, 'INSERT')
       or has_table_privilege(viewer.role_name, tab.name, 'UPDATE')
       or has_table_privilege(viewer.role_name, tab.name, 'DELETE')
  ),
  'no postdated cheque table grants any base DML to browser roles'
);
select extensions.is(
  (select count(*)::integer from pg_trigger where tgname='postdated_cheque_status_events_append_only' and not tgisinternal),1,
  'the status event chain is append-only via trigger'
);

-- Build a synthetic graph.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b5100000-0000-0000-0000-000000000001','P510 Synthetic A Inc.','P510 A','p510-a'),
  ('b5100000-0000-0000-0000-000000000002','P510 Synthetic B Inc.','P510 B','p510-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b5110000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','P510 A Main','p510-a-main','P510-A1','1 St','City','Province'),
  ('b5110000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000002','P510 B Main','p510-b-main','P510-B1','2 St','City','Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date) values
  ('b5120000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','P510-A-0001','Ana','Santos',date '1990-01-01'),
  ('b5120000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000002','P510-B-0001','Bea','Rivera',date '1991-01-01');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('b5130000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('b5140000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','P510_EXAM','P510 Examination','active');
insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, idempotency_key, non_clinical) values
  ('b5150000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001','b5110000-0000-0000-0000-000000000001','b5130000-0000-0000-0000-000000000001','b5140000-0000-0000-0000-000000000001',500000,date '2026-08-01','p510-charge-0001',false),
  ('b5150000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000002','b5120000-0000-0000-0000-000000000002','b5110000-0000-0000-0000-000000000002',null,null,100000,date '2026-08-02','p510-charge-0002',true);

-- A new cheque starts HELD; cheque fields are protected financial data.
insert into public.postdated_cheques (id, organization_id, patient_id, branch_id, cheque_number, bank_name, amount_centavos, date_due, idempotency_key) values
  ('b5160000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001','b5110000-0000-0000-0000-000000000001','XXXX-00000001','BANK ONE',500000,date '2026-09-30','p510-pdc-0001'),
  ('b5160000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001','b5110000-0000-0000-0000-000000000001','XXXX-00000002','BANK ONE',500000,date '2026-09-30','p510-pdc-0002');
select extensions.is((select status from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000001'),'HELD'::text,'a recorded cheque begins HELD');
select extensions.throws_ok($$insert into public.postdated_cheques (organization_id, patient_id, branch_id, cheque_number, bank_name, amount_centavos, date_due, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001','b5110000-0000-0000-0000-000000000001','XXXX-00000003','BANK TWO',0,date '2026-09-30','p510-pdc-0003')$$,'23514',null,'a zero-amount cheque is rejected');

-- HELD -> DEPOSITED is legal and moves the projection.
select extensions.throws_ok($$insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','HELD','CLEARED','skip deposit','p510-pdc-event-ill-2')$$,'23514','postdated cheque transition is not allowed','a HELD->CLEARED transition is illegal');
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','HELD','DEPOSITED','deposited at bank','p510-pdc-event-0001');
select extensions.is((select status from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000001'),'DEPOSITED'::text,'a HELD->DEPOSITED event moves the projection');
select extensions.is((select from_status||'->'||to_status from public.postdated_cheque_status_events where id=(select current_status_event_id from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000001')),'HELD->DEPOSITED'::text,'the projection references the latest valid event');

-- Legal DEPOSITED transitions and illegal ones.
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','DEPOSITED','BOUNCED','insufficient funds','p510-pdc-event-0002');
select extensions.is((select status from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000001'),'BOUNCED'::text,'a DEPOSITED->BOUNCED event moves the projection');
select extensions.throws_ok($$insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','BOUNCED','CANCELLED','not allowed','p510-pdc-event-ill-1')$$,'23514','postdated cheque transition is not allowed','a BOUNCED->CANCELLED transition is illegal');
select extensions.throws_ok($$insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','HELD','REPLACED','stale','p510-pdc-event-ill-3')$$,'23514','postdated cheque transition must start from the current state','a transition must start from the current state');

-- BOUNCED -> REPLACED is legal and terminal.
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','BOUNCED','REPLACED','replaced cheque issued','p510-pdc-event-0003');
select extensions.is((select status from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000001'),'REPLACED'::text,'a BOUNCED->REPLACED event moves the projection');
select extensions.throws_ok($$insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000001','REPLACED','DEPOSITED','after terminal','p510-pdc-event-ill-4')$$,'23514','postdated cheque is terminal and cannot transition','a terminal cheque rejects further transitions');

-- Proposed allocations are separate and patient-scoped.
insert into public.postdated_cheque_allocations (id, organization_id, cheque_id, charge_id, patient_id, amount_centavos) values
  ('b5170000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000002','b5150000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001',500000);
select extensions.is((select count(*)::integer from public.postdated_cheque_allocations where organization_id='b5100000-0000-0000-0000-000000000001'),1,'a proposed allocation is recorded separately');
select extensions.throws_ok($$insert into public.postdated_cheque_allocations (organization_id, cheque_id, charge_id, patient_id, amount_centavos) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000002','b5150000-0000-0000-0000-000000000002','b5120000-0000-0000-0000-000000000001',100000)$$,'23514','postdated cheque allocation patient must match the cheque and charge patient','a foreign-tenant charge cannot be proposed against a cheque');

-- Clearing is a DEPOSITED->CLEARED event on a fresh cheque; the terminal guard
-- means exactly one clearance can ever succeed.
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000002','HELD','DEPOSITED','deposited','p510-pdc-event-0004');
insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values
  ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000002','DEPOSITED','CLEARED','cleared','p510-pdc-event-0005');
select extensions.is((select status from public.postdated_cheques where id='b5160000-0000-0000-0000-000000000002'),'CLEARED'::text,'a DEPOSITED->CLEARED event moves the projection');
select extensions.throws_ok($$insert into public.postdated_cheque_status_events (organization_id, cheque_id, from_status, to_status, reason, idempotency_key) values ('b5100000-0000-0000-0000-000000000001','b5160000-0000-0000-0000-000000000002','CLEARED','CLEARED','duplicate clear','p510-pdc-event-ill-5')$$,'23514','postdated cheque is terminal and cannot transition','a duplicate clearance is rejected');

-- The payments PDC source link is tenant-safe.
insert into public.payment_methods (organization_id, code, name) values
  ('b5100000-0000-0000-0000-000000000001','CHEQUE','Cheque')
on conflict (organization_id, code) do nothing;
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, postdated_cheque_id, idempotency_key) values
  ('b5180000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5120000-0000-0000-0000-000000000001','b5110000-0000-0000-0000-000000000001',(select id from public.payment_methods where organization_id='b5100000-0000-0000-0000-000000000001' and code='CHEQUE'),500000,'b5160000-0000-0000-0000-000000000002','p510-payment-0001');
select extensions.is((select postdated_cheque_id from public.payments where id='b5180000-0000-0000-0000-000000000001'),'b5160000-0000-0000-0000-000000000002'::uuid,'a cleared cheque payment retains its tenant-safe PDC source link');
select extensions.throws_ok($$insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, postdated_cheque_id, idempotency_key) values ('b5180000-0000-0000-0000-000000000002','b5100000-0000-0000-0000-000000000002','b5120000-0000-0000-0000-000000000002','b5110000-0000-0000-0000-000000000002',(select id from public.payment_methods where organization_id='b5100000-0000-0000-0000-000000000002' and code='CHEQUE'),500000,'b5160000-0000-0000-0000-000000000002','p510-payment-0002')$$,'23503',null,'a cleared cheque payment link cannot cross organizations');

select * from extensions.finish();
rollback;