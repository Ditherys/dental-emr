-- P1-05 group H: minimal, sanitized, append-oriented audit foundation.

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
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_events_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches (organization_id, id) on delete restrict
);

comment on table public.audit_events is
  'Append-oriented administrative and security audit events; metadata must be sanitized.';

comment on column public.audit_events.metadata is
  'Redacted metadata only. Never store tokens, passwords, full request bodies, or clinical text.';

create index audit_events_organization_occurred_at_idx
  on public.audit_events (organization_id, occurred_at desc);

create index audit_events_branch_occurred_at_idx
  on public.audit_events (branch_id, occurred_at desc)
  where branch_id is not null;

create or replace function private.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only';
end;
$$;

comment on function private.prevent_audit_event_mutation() is
  'Rejects normal UPDATE and DELETE operations against historical audit events.';

revoke all on function private.prevent_audit_event_mutation() from public;
revoke all on function private.prevent_audit_event_mutation() from anon;
revoke all on function private.prevent_audit_event_mutation() from authenticated;

create trigger audit_events_prevent_mutation
before update or delete on public.audit_events
for each row execute function private.prevent_audit_event_mutation();

alter table public.audit_events enable row level security;
