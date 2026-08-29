-- Forward-only narrowing of the authoritative audit metadata contract.
--
-- Migration 20260828020504 restored compatibility across real audit writers,
-- but its inventory retained three keys that no migration-owned writer emits
-- and did not validate nested document selectors or aggregate periodontal
-- counters tightly enough. Keep the compatibility union while failing closed
-- on those unwritten and structurally unsafe shapes.

create or replace function private.audit_metadata_is_safe(candidate jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when candidate is null
      or pg_catalog.jsonb_typeof(candidate) <> 'object'
      or pg_catalog.pg_column_size(candidate) > 1024
      then false
    when (
      select coalesce(
        pg_catalog.sum(
          case
            when pg_catalog.jsonb_typeof(entry.value) = 'number'
              and entry.value::text ~ '^[0-9]+$'
              then entry.value::text::numeric
            else 201::numeric
          end
        ),
        0::numeric
      )
      from pg_catalog.jsonb_each(candidate) as entry(key, value)
      where entry.key = any (array[
        'saved_sites',
        'saved_plaque',
        'saved_tooth',
        'saved_furcation'
      ])
    ) > 200 then false
    when exists (
      select 1
      from pg_catalog.jsonb_each(candidate) as entry(key, value)
      where not case
        when entry.key = any (array[
          'invitation_id',
          'parent_note_id',
          'source',
          'destination',
          'charge_id',
          'payment_id',
          'allocation_id',
          'refund_id',
          'cheque_id',
          'adjustment_id',
          'direct_cost_id',
          'direct_cost_default_id',
          'resolution_id',
          'agreement_id',
          'provider_id',
          'procedure_id',
          'treatment_plan_item_id',
          'attribution_previous_provider',
          'attribution_corrected_provider',
          'supersedes_bridge_id',
          'supersedes_component_id',
          'predecessor_examination_id'
        ]) then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        when entry.key = 'permission_code' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
          and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'role_code' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~ '^[A-Z][A-Z0-9_]*$'
          and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'scope' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in ('ORGANIZATION', 'BRANCH')
        when entry.key = 'reason' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and pg_catalog.length(entry.value #>> '{}') between 1 and 500
        when entry.key = any (array[
          'old_starts_at',
          'new_starts_at',
          'old_ends_at',
          'new_ends_at'
        ]) then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
        when entry.key = 'dimension' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in (
            'scheduling_status',
            'confirmation_status',
            'encounter_status'
          )
        when entry.key = any (array['old_value', 'new_value']) then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and pg_catalog.length(entry.value #>> '{}') between 1 and 128
        when entry.key = 'document_type' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in (
            'PATIENT_RECORD_SUMMARY',
            'APPOINTMENT_SLIP',
            'REFERRAL_LETTER',
            'TREATMENT_PLAN'
          )
        when entry.key = 'include_set' then
          pg_catalog.jsonb_typeof(entry.value) = 'object'
          and pg_catalog.pg_column_size(entry.value) <= 2048
          and case candidate ->> 'document_type'
            when 'PATIENT_RECORD_SUMMARY' then not exists (
              select 1
              from pg_catalog.jsonb_each(entry.value) as selector(key, value)
              where selector.key not in ('demographics', 'referrals', 'appointments')
                or pg_catalog.jsonb_typeof(selector.value) <> 'boolean'
            )
            when 'APPOINTMENT_SLIP' then not exists (
              select 1
              from pg_catalog.jsonb_each(entry.value) as selector(key, value)
              where selector.key not in ('demographics', 'appointments')
                or pg_catalog.jsonb_typeof(selector.value) <> 'boolean'
            )
            when 'REFERRAL_LETTER' then not exists (
              select 1
              from pg_catalog.jsonb_each(entry.value) as selector(key, value)
              where selector.key not in ('demographics', 'referrals')
                or pg_catalog.jsonb_typeof(selector.value) <> 'boolean'
            )
            when 'TREATMENT_PLAN' then
              entry.value ? 'planId'
              and pg_catalog.jsonb_typeof(entry.value -> 'planId') = 'string'
              and entry.value ->> 'planId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and not exists (
                select 1
                from pg_catalog.jsonb_each(entry.value) as selector(key, value)
                where selector.key not in (
                  'planId',
                  'items',
                  'alternatives',
                  'discussions',
                  'drawing'
                )
                  or (
                    selector.key <> 'planId'
                    and pg_catalog.jsonb_typeof(selector.value) <> 'boolean'
                  )
              )
            else false
          end
        when entry.key = 'action' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~ '^[A-Z][A-Z0-9_]*$'
          and pg_catalog.length(entry.value #>> '{}') <= 32
        when entry.key = 'record_type' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in ('CONDITION', 'ALLERGY', 'MEDICATION')
        when entry.key = any (array['quantity', 'quantity_delta']) then
          pg_catalog.jsonb_typeof(entry.value) = 'number'
          and entry.value::text ~ '^-?[0-9]+$'
        when entry.key = 'service_date' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
        when entry.key = 'idempotency_key' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and pg_catalog.length(entry.value #>> '{}') between 1 and 128
        when entry.key = 'direction' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in ('CREDIT', 'DEBIT')
        when entry.key = 'cost_type' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in ('LAB', 'MATERIAL', 'OTHER')
        when entry.key = 'method_code' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and pg_catalog.length(entry.value #>> '{}') between 1 and 40
        when entry.key = 'from_status' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in ('HELD', 'DEPOSITED', 'BOUNCED')
        when entry.key = 'to_status' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in (
            'DEPOSITED',
            'CLEARED',
            'BOUNCED',
            'CANCELLED',
            'REPLACED'
          )
        when entry.key = 'examination_kind' then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in (
            'INITIAL',
            'RE-EVALUATION',
            'MAINTENANCE',
            'AMENDMENT'
          )
        when entry.key = any (array[
          'saved_sites',
          'saved_plaque',
          'saved_tooth',
          'saved_furcation'
        ]) then
          pg_catalog.jsonb_typeof(entry.value) = 'number'
          and entry.value::text ~ '^[0-9]+$'
          and entry.value::text::numeric <= 200
        when entry.key = any (array['from_state', 'to_state']) then
          pg_catalog.jsonb_typeof(entry.value) = 'string'
          and entry.value #>> '{}' in (
            'PROPOSED',
            'ACCEPTED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
          )
        else false
      end
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Fail-closed validator for migration-owned audit metadata: exact document selector schemas, bounded periodontal counter totals, and no unwritten metadata keys.';
