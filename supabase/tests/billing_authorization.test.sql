begin;

select extensions.no_plan();

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'list_patient_account', 'post_charge', 'post_charge_with_attribution_override',
        'correct_charge_attribution', 'void_charge', 'approve_charge_direct_cost',
        'reverse_charge_direct_cost', 'post_charge_adjustment', 'reverse_charge_adjustment',
        'record_payment', 'void_payment', 'allocate_payment', 'reverse_payment_allocation',
        'refund_payment', 'record_postdated_cheque', 'transition_postdated_cheque',
        'clear_postdated_cheque', 'list_payment_methods', 'upsert_payment_method',
        'set_provider_compensation_agreement', 'list_unresolved_charge_compensation',
        'resolve_charge_compensation', 'list_provider_earnings'
      )
      and has_function_privilege('authenticated', proc.oid, 'execute')
      and not has_function_privilege('anon', proc.oid, 'execute')
      and not has_function_privilege('service_role', proc.oid, 'execute')
  ),
  23,
  'legacy billing RPC grant surface remains authenticated-only'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'list_patient_account', 'post_charge', 'post_charge_with_attribution_override',
        'correct_charge_attribution', 'void_charge', 'approve_charge_direct_cost',
        'reverse_charge_direct_cost', 'post_charge_adjustment', 'reverse_charge_adjustment',
        'record_payment', 'void_payment', 'allocate_payment', 'reverse_payment_allocation',
        'refund_payment', 'record_postdated_cheque', 'transition_postdated_cheque',
        'clear_postdated_cheque', 'list_payment_methods', 'upsert_payment_method',
        'set_provider_compensation_agreement', 'list_unresolved_charge_compensation',
        'resolve_charge_compensation', 'list_provider_earnings'
      )
      and proc.prosecdef
      and proc.proconfig = array['search_path=""']::text[]
  ),
  23,
  'every legacy public billing RPC is a SECURITY DEFINER with an empty search path'
);

select extensions.ok(has_function_privilege('authenticated','public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)','execute') and not has_function_privilege('anon','public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)','execute') and not has_function_privilege('service_role','public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)','execute'), 'schedule RPC is browser-authenticated only');

-- The treatment-event boundary confirms procedure charges and allocates
-- payments, so it is held to the same browser boundary as the billing RPCs it
-- delegates to.
select extensions.ok(
  has_function_privilege('authenticated','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('anon','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('service_role','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute')
  and not has_function_privilege('public','public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)','execute'),
  'the treatment-event charge boundary is browser-authenticated only'
);
select extensions.ok(
  (select proc.prosecdef and proc.proconfig = array['search_path=""']::text[]
   from pg_proc as proc
   where proc.oid = 'public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)'::regprocedure),
  'the treatment-event charge boundary is a SECURITY DEFINER with an empty search path'
);

select extensions.ok(
  not exists (
    select 1
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname in (
        'has_billing_permission_at_branch', 'resolve_actor_provider',
        'charge_current_attribution', 'charge_current_resolution',
        'sync_charge_earnings', 'record_billing_audit'
      )
      and (
        has_function_privilege('public', proc.oid, 'execute')
        or has_function_privilege('anon', proc.oid, 'execute')
        or has_function_privilege('authenticated', proc.oid, 'execute')
        or has_function_privilege('service_role', proc.oid, 'execute')
      )
  ),
  'billing authorization, attribution, earning, and audit helpers are not callable directly'
);

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
  'billing ledger base tables have no browser or service-role DML grants'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"charge_id":"b6000000-0000-0000-0000-000000000001","service_date":"2026-08-28","idempotency_key":"b6-audit-1"}'::jsonb
  )
  and private.audit_metadata_is_safe(
    '{"payment_id":"b6000000-0000-0000-0000-000000000002","method_code":"CASH","idempotency_key":"b6-audit-2"}'::jsonb
  )
  and not private.audit_metadata_is_safe('{"bank_name":"protected"}'::jsonb),
  'billing audit metadata permits bounded identifiers and rejects protected cheque fields'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b6000000-0000-0000-0000-000000000003', true);
select extensions.throws_ok(
  $$select public.list_payment_methods('b6000000-0000-0000-0000-000000000004')$$,
  '42501',
  'not authorized',
  'an authenticated actor without an active membership cannot call a billing RPC'
);
reset role;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result from test_failures;
rollback;
