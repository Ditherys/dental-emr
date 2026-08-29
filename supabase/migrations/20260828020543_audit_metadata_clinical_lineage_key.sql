-- The append-only clinical amendment RPC emits this bounded lineage UUID.
-- Extend the O5 metadata wrapper without weakening the historical base rules.
create or replace function private.audit_metadata_is_safe(candidate jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when candidate is null or pg_catalog.jsonb_typeof(candidate) <> 'object' then false
    else private.audit_metadata_is_safe_o5_base(
      candidate - array[
        'component_count', 'replaces_root_id', 'completion_kind',
        'supersedes_entry_id'
      ]::text[]
    )
      and not exists (
        select 1
        from pg_catalog.jsonb_each(candidate) as e(key, value)
        where not case
          when e.key = 'component_count' then
            pg_catalog.jsonb_typeof(e.value) = 'number' and e.value::text ~ '^[1-4]$'
          when e.key in ('replaces_root_id', 'supersedes_entry_id') then
            pg_catalog.jsonb_typeof(e.value) = 'string'
            and e.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          when e.key = 'completion_kind' then
            pg_catalog.jsonb_typeof(e.value) = 'string'
            and e.value #>> '{}' in ('CLINICAL', 'BRIDGE', 'IMPLANT')
          else true
        end
      )
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;
