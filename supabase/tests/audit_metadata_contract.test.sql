begin;

select extensions.no_plan();

-- This contract is the reviewed union of migration-owned audit writers. Keep
-- the groups small enough that each valid candidate stays below the validator's
-- 1 KiB whole-object bound.
select extensions.ok(
  private.audit_metadata_is_safe('{}'::jsonb),
  'empty metadata remains valid for writers with no bounded metadata'
);

-- Phase 1 workforce and authorization writers.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"invitation_id":"62000000-0000-0000-0000-000000000001","permission_code":"audit.read","role_code":"ADMIN","scope":"BRANCH"}'::jsonb
  ),
  'foundation identifier, permission, role, and scope keys are accepted'
);

-- Appointment and queue writers.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"reason":"Synthetic bounded reason","old_starts_at":"2026-08-29 09:00:00+08","new_starts_at":"2026-08-29 09:30:00+08","old_ends_at":"2026-08-29 09:30:00+08","new_ends_at":"2026-08-29 10:00:00+08","dimension":"scheduling_status","old_value":"SCHEDULED","new_value":"CONFIRMED"}'::jsonb
  ),
  'appointment timestamps and bounded queue/status metadata are accepted'
);

-- Document, booking, and clinical-record writers.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"document_type":"PATIENT_RECORD_SUMMARY","include_set":{"demographics":true,"referrals":false,"appointments":true},"action":"APPROVE","parent_note_id":"62000000-0000-0000-0000-000000000002","record_type":"ALLERGY"}'::jsonb
  ),
  'document, booking action, and clinical relationship metadata are accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"document_type":"TREATMENT_PLAN","include_set":{"planId":"62000000-0000-0000-0000-000000000024","items":true,"alternatives":false,"discussions":true,"drawing":false}}'::jsonb
  ),
  'the treatment-plan include set accepts its reachable selector schema'
);

-- Inventory writers.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"quantity":2,"quantity_delta":-1,"source":"62000000-0000-0000-0000-000000000003","destination":"62000000-0000-0000-0000-000000000004"}'::jsonb
  ),
  'inventory quantity and branch identifier metadata are accepted'
);

-- Billing writer UUID families, split to preserve the whole-object size bound.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"charge_id":"62000000-0000-0000-0000-000000000005","payment_id":"62000000-0000-0000-0000-000000000006","allocation_id":"62000000-0000-0000-0000-000000000007","refund_id":"62000000-0000-0000-0000-000000000008","cheque_id":"62000000-0000-0000-0000-000000000009","adjustment_id":"62000000-0000-0000-0000-000000000010"}'::jsonb
  ),
  'billing transaction identifier metadata is accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"direct_cost_id":"62000000-0000-0000-0000-000000000011","direct_cost_default_id":"62000000-0000-0000-0000-000000000012","resolution_id":"62000000-0000-0000-0000-000000000013","agreement_id":"62000000-0000-0000-0000-000000000014","provider_id":"62000000-0000-0000-0000-000000000015","procedure_id":"62000000-0000-0000-0000-000000000016"}'::jsonb
  ),
  'billing configuration and provider identifier metadata is accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"treatment_plan_item_id":"62000000-0000-0000-0000-000000000017","attribution_previous_provider":"62000000-0000-0000-0000-000000000019","attribution_corrected_provider":"62000000-0000-0000-0000-000000000020"}'::jsonb
  ),
  'billing treatment and attribution identifier metadata is accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"service_date":"2026-08-29","idempotency_key":"synthetic-idempotency-1","direction":"CREDIT","cost_type":"LAB","method_code":"CASH","from_status":"HELD","to_status":"CLEARED"}'::jsonb
  ),
  'billing date, bounded text, and state metadata are accepted'
);

-- Current odontogram RPC writers.
select extensions.ok(
  private.audit_metadata_is_safe(
    '{"supersedes_bridge_id":"62000000-0000-0000-0000-000000000021","supersedes_component_id":"62000000-0000-0000-0000-000000000022","predecessor_examination_id":"62000000-0000-0000-0000-000000000023","supersedes_entry_id":"62000000-0000-0000-0000-000000000025"}'::jsonb
  ),
  'odontogram amendment relationship identifiers are accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"examination_kind":"INITIAL","saved_sites":100,"saved_plaque":30,"saved_tooth":30,"saved_furcation":40}'::jsonb
  ),
  'periodontal examination kind and reachable saved-row counters are accepted'
);

select extensions.ok(
  private.audit_metadata_is_safe(
    '{"from_state":"IN_PROGRESS","to_state":"ACCEPTED"}'::jsonb
  ),
  'treatment item execution transition states are accepted'
);

select extensions.ok(
  not private.audit_metadata_is_safe('{"unknown_key":"value"}'::jsonb)
  and not private.audit_metadata_is_safe(
    '{"appointment_id":"62000000-0000-0000-0000-000000000025"}'::jsonb
  )
  and not private.audit_metadata_is_safe('{"note":"Synthetic note"}'::jsonb)
  and not private.audit_metadata_is_safe('{"cause":"DIRECT_COST"}'::jsonb)
  and not private.audit_metadata_is_safe(
    '{"clinical_narrative":"Synthetic narrative must not enter audit metadata"}'::jsonb
  ),
  'unknown, unwritten, and clinical narrative keys remain rejected'
);

select extensions.ok(
  not private.audit_metadata_is_safe(
    '{"document_type":"PATIENT_RECORD_SUMMARY","include_set":{"demographics":true,"clinicalNarrative":"Synthetic narrative"}}'::jsonb
  )
  and not private.audit_metadata_is_safe(
    '{"document_type":"PATIENT_RECORD_SUMMARY","include_set":{"demographics":"true"}}'::jsonb
  )
  and not private.audit_metadata_is_safe(
    '{"document_type":"TREATMENT_PLAN","include_set":{"planId":"62000000-0000-0000-0000-000000000024","items":true,"appointments":true}}'::jsonb
  ),
  'include_set rejects nested narrative, wrong selector types, and cross-document selectors'
);

select extensions.ok(
  not private.audit_metadata_is_safe('{"saved_sites":201}'::jsonb)
  and not private.audit_metadata_is_safe(
    '{"saved_sites":100,"saved_plaque":40,"saved_tooth":31,"saved_furcation":30}'::jsonb
  ),
  'periodontal counters reject an individual 201 and a combined present sum of 201'
);

select extensions.ok(
  not private.audit_metadata_is_safe('{"charge_id":1}'::jsonb)
  and not private.audit_metadata_is_safe('{"old_starts_at":"not-a-timestamp"}'::jsonb)
  and not private.audit_metadata_is_safe('{"quantity":"2"}'::jsonb)
  and not private.audit_metadata_is_safe('{"quantity":1.5}'::jsonb)
  and not private.audit_metadata_is_safe('{"include_set":[]}'::jsonb)
  and not private.audit_metadata_is_safe('{"examination_kind":"FREE_TEXT"}'::jsonb)
  and not private.audit_metadata_is_safe('{"from_state":false}'::jsonb),
  'wrong value types and values outside bounded enums remain rejected'
);

select extensions.ok(
  not private.audit_metadata_is_safe(
    pg_catalog.jsonb_build_object('reason', pg_catalog.repeat('x', 501))
  )
  and not private.audit_metadata_is_safe(
    pg_catalog.jsonb_build_object('old_value', pg_catalog.repeat('x', 129))
  )
  and not private.audit_metadata_is_safe(
    pg_catalog.jsonb_build_object('note', pg_catalog.repeat('x', 1025))
  ),
  'per-key and whole-object oversized values remain rejected'
);

select extensions.ok(
  not private.audit_metadata_is_safe(null)
  and not private.audit_metadata_is_safe('null'::jsonb)
  and not private.audit_metadata_is_safe('[]'::jsonb),
  'SQL NULL, JSON null, and non-object candidates remain rejected'
);

select extensions.ok(
  (
    select not pg_proc.prosecdef
      and coalesce(pg_proc.proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_catalog.pg_proc
    join pg_catalog.pg_namespace
      on pg_catalog.pg_namespace.oid = pg_catalog.pg_proc.pronamespace
    where pg_catalog.pg_namespace.nspname = 'private'
      and pg_catalog.pg_proc.proname = 'audit_metadata_is_safe'
      and pg_catalog.pg_get_function_identity_arguments(pg_catalog.pg_proc.oid) = 'candidate jsonb'
  ),
  'the validator remains invoker-rights with an empty search path'
);

select extensions.ok(
  not pg_catalog.has_function_privilege('public', 'private.audit_metadata_is_safe(jsonb)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'private.audit_metadata_is_safe(jsonb)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'private.audit_metadata_is_safe(jsonb)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role', 'private.audit_metadata_is_safe(jsonb)', 'EXECUTE'),
  'the private validator is not executable by browser, PUBLIC, or service roles'
);

with test_failures as (
  select finish
  from extensions.finish()
  where finish !~ '^1\.\.[0-9]+$'
)
select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else string_agg(finish, E'\n')
end as p1_test_result
from test_failures;

rollback;
