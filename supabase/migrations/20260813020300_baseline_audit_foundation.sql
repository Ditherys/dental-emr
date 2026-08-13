-- Phase 1 secure baseline — file 4 of 8: append-oriented audit foundation,
-- including the P1-19 audit contract hardening.
--
-- BASELINE INVARIANT: this file grants nothing.
--
-- The metadata allow-list predicate is created before the table because the
-- audit metadata CHECK constraint depends on it.

create or replace function private.audit_metadata_is_safe(
  candidate jsonb
)
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
    when candidate - array[
      'invitation_id',
      'permission_code',
      'role_code',
      'scope'
    ]::text[] <> '{}'::jsonb
      then false
    when candidate ? 'invitation_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'invitation_id') = 'string'
      and candidate ->> 'invitation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'permission_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'permission_code') = 'string'
      and candidate ->> 'permission_code' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
      and pg_catalog.length(candidate ->> 'permission_code') <= 128
    ) then false
    when candidate ? 'role_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'role_code') = 'string'
      and candidate ->> 'role_code' ~ '^[A-Z][A-Z0-9_]*$'
      and pg_catalog.length(candidate ->> 'role_code') <= 128
    ) then false
    when candidate ? 'scope' and not (
      pg_catalog.jsonb_typeof(candidate -> 'scope') = 'string'
      and candidate ->> 'scope' in ('ORGANIZATION', 'BRANCH')
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts only the bounded, non-sensitive metadata keys used by Phase 1 audit writers.';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (
    actor_type in ('USER', 'SYSTEM', 'PUBLIC_TOKEN', 'SERVICE')
  ),
  category text not null check (btrim(category) <> ''),
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  result text not null check (result in ('SUCCESS', 'DENIED', 'FAILED')),
  request_id text,
  correlation_id text default gen_random_uuid()::text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_events_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches (organization_id, id) on delete restrict,
  constraint audit_events_actor_identity_check check (
    (actor_type = 'USER' and actor_user_id is not null)
    or (actor_type <> 'USER' and actor_user_id is null)
  ),
  constraint audit_events_category_format_check check (
    pg_catalog.length(category) <= 64
    and category ~ '^[A-Z][A-Z0-9_]*$'
  ),
  constraint audit_events_action_format_check check (
    pg_catalog.length(action) <= 128
    and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint audit_events_entity_type_format_check check (
    pg_catalog.length(entity_type) <= 64
    and entity_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint audit_events_request_id_format_check check (
    request_id is null
    or (
      pg_catalog.length(request_id) between 1 and 128
      and request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  constraint audit_events_correlation_id_format_check check (
    correlation_id is null
    or (
      pg_catalog.length(correlation_id) between 1 and 128
      and correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  constraint audit_events_metadata_safe_check check (
    private.audit_metadata_is_safe(metadata)
  )
);

revoke all on table public.audit_events from public, anon, authenticated;

comment on table public.audit_events is
  'Append-oriented administrative and security audit events; metadata must be sanitized.';

comment on column public.audit_events.metadata is
  'Redacted metadata only. Never store tokens, passwords, full request bodies, or clinical text.';

comment on column public.audit_events.correlation_id is
  'Opaque correlation identifier only; URLs, tokens, and arbitrary request values are forbidden.';

create index audit_events_organization_occurred_at_idx
  on public.audit_events (organization_id, occurred_at desc);

create index audit_events_branch_occurred_at_idx
  on public.audit_events (branch_id, occurred_at desc)
  where branch_id is not null;

create unique index audit_events_mfa_enrollment_once_idx
  on public.audit_events (
    organization_id,
    actor_user_id,
    entity_id,
    action
  )
  where action = 'mfa.enrolled'
    and actor_user_id is not null
    and entity_id is not null;

create or replace function private.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only';
end;
$$;

revoke all on function private.prevent_audit_event_mutation() from public;
revoke all on function private.prevent_audit_event_mutation() from anon;
revoke all on function private.prevent_audit_event_mutation() from authenticated;

comment on function private.prevent_audit_event_mutation() is
  'Rejects normal UPDATE and DELETE operations against historical audit events.';

create trigger audit_events_prevent_mutation
before update or delete on public.audit_events
for each row execute function private.prevent_audit_event_mutation();

alter table public.audit_events enable row level security;
