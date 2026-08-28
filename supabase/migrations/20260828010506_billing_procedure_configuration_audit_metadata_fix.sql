-- Forward correction for the already-applied B6/B7 configuration migration.
-- The validator remains fail-closed while admitting the bounded default ID.

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
    when exists (
      select 1
      from pg_catalog.jsonb_each(candidate) as entry(key, value)
      where not case
        when entry.key = any (array['invitation_id','charge_id','payment_id','allocation_id','refund_id','cheque_id','adjustment_id','direct_cost_id','direct_cost_default_id','resolution_id','agreement_id','provider_id','procedure_id','treatment_plan_item_id','appointment_id','attribution_previous_provider','attribution_corrected_provider'])
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        when entry.key = 'permission_code'
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'role_code'
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^[A-Z][A-Z0-9_]*$' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'scope' then entry.value #>> '{}' in ('ORGANIZATION','BRANCH')
        when entry.key = 'service_date' then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
        when entry.key = 'reason' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 500
        when entry.key = 'note' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 256
        when entry.key = 'idempotency_key' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'cause' then entry.value #>> '{}' in ('DIRECT_COST','ATTRIBUTION','REFUND','VOID','REALLOCATION')
        when entry.key = 'direction' then entry.value #>> '{}' in ('CREDIT','DEBIT')
        when entry.key = 'cost_type' then entry.value #>> '{}' in ('LAB','MATERIAL','OTHER')
        when entry.key = 'method_code' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 40
        when entry.key = 'from_status' then entry.value #>> '{}' in ('HELD','DEPOSITED','BOUNCED')
        when entry.key = 'to_status' then entry.value #>> '{}' in ('DEPOSITED','CLEARED','BOUNCED','CANCELLED','REPLACED')
        else false
      end
    ) then false
    else true
  end
$$;
revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;
