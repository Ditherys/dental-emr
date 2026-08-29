-- O8: treatment-plan item lifecycle and completion (execution projection + append-only events).
-- Keeps treatment_plans DRAFT/PRESENTED/ACKNOWLEDGED and treatment_plan_items as immutable
-- proposal content once the parent plan is PRESENTED/ACKNOWLEDGED. Adds a one-per-item
-- execution projection and an append-only event log. No browser grants or policies are
-- added; O5 RPCs own all writes. The execution projection is derived from the latest
-- valid event; direct table mutation is rejected. Do NOT create RPCs here (O5 already
-- drafted transition_treatment_plan_item_execution / complete_treatment_plan_item_with_charge
-- / correct_treatment_plan_item_execution). This file is schema only.

-- ============================================================================
-- Guard: reject treatment_plan_items mutation when parent plan is frozen
-- ============================================================================

create or replace function private.reject_frozen_plan_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select plan.status into v_status
  from public.treatment_plans as plan
  where plan.organization_id = coalesce(new.organization_id, old.organization_id)
    and plan.id = coalesce(new.plan_id, old.plan_id);

  if v_status in ('PRESENTED', 'ACKNOWLEDGED') then
    raise exception 'treatment_plan_items are immutable when parent plan is PRESENTED/ACKNOWLEDGED; execution progresses separately';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.reject_frozen_plan_item_mutation()
from public, anon, authenticated, service_role;

comment on function private.reject_frozen_plan_item_mutation() is
  'Rejects INSERT/UPDATE/DELETE on treatment_plan_items when the parent treatment_plans row is PRESENTED or ACKNOWLEDGED. Proposal content stays immutable; execution is tracked separately.';

drop trigger if exists treatment_plan_items_protect_frozen_plan on public.treatment_plan_items;
create trigger treatment_plan_items_protect_frozen_plan
before insert or update or delete on public.treatment_plan_items
for each row execute function private.reject_frozen_plan_item_mutation();

-- ============================================================================
-- treatment_plan_item_executions — one projection row per item
-- ============================================================================

create table if not exists public.treatment_plan_item_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  item_id uuid not null,
  current_state text not null,
  version integer not null default 1,
  completion_charge_id uuid,
  completion_clinical_entry_id uuid,
  completion_bridge_id uuid,
  completion_implant_component_id uuid,
  last_actor_user_id uuid references auth.users(id) on delete set null,
  last_occurred_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_item_executions_organization_plan_fk foreign key (
    organization_id, plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_item_fk foreign key (
    organization_id, item_id
  ) references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_charge_fk foreign key (
    organization_id, completion_charge_id
  ) references public.charges(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_clinical_entry_fk foreign key (
    organization_id, completion_clinical_entry_id
  ) references public.tooth_clinical_entries(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_bridge_fk foreign key (
    organization_id, completion_bridge_id
  ) references public.dental_bridges(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_implant_fk foreign key (
    organization_id, completion_implant_component_id
  ) references public.dental_implant_components(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_organization_id_id_key unique (organization_id, id),
  constraint treatment_plan_item_executions_organization_item_key unique (organization_id, item_id),
  constraint treatment_plan_item_executions_current_state_check check (
    current_state in ('PROPOSED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED')
  ),
  constraint treatment_plan_item_executions_version_positive_check check (version > 0),
  constraint treatment_plan_item_executions_completed_links_check check (
    (current_state = 'COMPLETED' and (completion_charge_id is not null or completion_clinical_entry_id is not null or completion_bridge_id is not null or completion_implant_component_id is not null))
    or (current_state <> 'COMPLETED' and completion_charge_id is null and completion_clinical_entry_id is null and completion_bridge_id is null and completion_implant_component_id is null)
  )
);

revoke all on table public.treatment_plan_item_executions
from public, anon, authenticated, service_role;

alter table public.treatment_plan_item_executions enable row level security;

comment on table public.treatment_plan_item_executions is
  'One projection row per treatment_plan_items. current_state is the latest derived state from treatment_plan_item_execution_events; version is optimistic. Completion links (charge/clinical_entry/bridge/implant) are only set when current_state=COMPLETED. No browser policy exists; O5 RPCs own writes.';

comment on column public.treatment_plan_item_executions.current_state is
  'Derived execution state: PROPOSED, ACCEPTED, IN_PROGRESS, COMPLETED, or CANCELLED. The projection is derived from the latest valid event; COMPLETED and CANCELLED are terminal.';

-- O5 peri_exec draft created this table without plan_id; add it idempotently before indexing.
alter table public.treatment_plan_item_executions
  add column if not exists plan_id uuid;
-- Backfill plan_id from treatment_plan_items for existing rows (if any).
update public.treatment_plan_item_executions as exec
  set plan_id = item.plan_id
  from public.treatment_plan_items as item
  where item.organization_id = exec.organization_id
    and item.id = exec.item_id
    and exec.plan_id is null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plan_item_executions_organization_plan_fk'
      and conrelid = 'public.treatment_plan_item_executions'::regclass
  ) then
    alter table public.treatment_plan_item_executions
      add constraint treatment_plan_item_executions_organization_plan_fk
      foreign key (organization_id, plan_id)
      references public.treatment_plans(organization_id, id) on delete restrict
      not valid;
    alter table public.treatment_plan_item_executions validate constraint treatment_plan_item_executions_organization_plan_fk;
  end if;
end
$$;

create index if not exists treatment_plan_item_executions_organization_plan_idx
  on public.treatment_plan_item_executions (organization_id, plan_id);

create index if not exists treatment_plan_item_executions_organization_item_idx
  on public.treatment_plan_item_executions (organization_id, item_id);

create index if not exists treatment_plan_item_executions_organization_state_idx
  on public.treatment_plan_item_executions (organization_id, current_state);

create trigger treatment_plan_item_executions_set_updated_at
before update on public.treatment_plan_item_executions
for each row execute function private.set_updated_at();

-- ============================================================================
-- treatment_plan_item_execution_events — append-only log
-- ============================================================================

create table if not exists public.treatment_plan_item_execution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  item_id uuid not null,
  predecessor_event_id uuid
    references public.treatment_plan_item_execution_events(id) on delete restrict,
  from_state text,
  to_state text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  occurred_at timestamptz not null default statement_timestamp(),
  idempotency_key text,
  created_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_item_execution_events_organization_plan_fk foreign key (
    organization_id, plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_item_execution_events_organization_item_fk foreign key (
    organization_id, item_id
  ) references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint treatment_plan_item_execution_events_organization_id_id_key unique (organization_id, id),
  constraint treatment_plan_item_execution_events_from_state_check check (
    from_state is null or from_state in ('PROPOSED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED')
  ),
  constraint treatment_plan_item_execution_events_to_state_check check (
    to_state in ('PROPOSED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED')
  ),
  constraint treatment_plan_item_execution_events_reason_bounded_check check (
    reason is null or (pg_catalog.btrim(reason) <> '' and pg_catalog.length(reason) <= 1000)
  ),
  constraint treatment_plan_item_execution_events_idempotency_bounded_check check (
    idempotency_key is null or pg_catalog.length(idempotency_key) between 1 and 128
  ),
  constraint treatment_plan_item_execution_events_self_predecessor_check check (
    predecessor_event_id is null or predecessor_event_id <> id
  )
);

revoke all on table public.treatment_plan_item_execution_events
from public, anon, authenticated, service_role;

alter table public.treatment_plan_item_execution_events enable row level security;

comment on table public.treatment_plan_item_execution_events is
  'Append-only execution event log per treatment_plan_items. Each row records from_state -> to_state, actor, reason (required for CANCELLED/correction), occurred_at, and predecessor_event_id. The sibling projection table is derived from the latest valid event; COMPLETED and CANCELLED are terminal and never overwritten.';

create index if not exists treatment_plan_item_execution_events_organization_item_occurred_idx
  on public.treatment_plan_item_execution_events (organization_id, item_id, occurred_at desc);

create index if not exists treatment_plan_item_execution_events_organization_plan_idx
  on public.treatment_plan_item_execution_events (organization_id, plan_id);

create index if not exists treatment_plan_item_execution_events_organization_predecessor_idx
  on public.treatment_plan_item_execution_events (organization_id, predecessor_event_id)
  where predecessor_event_id is not null;

create unique index if not exists treatment_plan_item_execution_events_organization_item_idempotency_idx
  on public.treatment_plan_item_execution_events (organization_id, item_id, idempotency_key)
  where idempotency_key is not null;

create or replace function private.treatment_item_execution_events_no_mutate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'treatment_plan_item_execution_events is append-only; UPDATE/DELETE are not allowed';
  return null;
end;
$$;

revoke all on function private.treatment_item_execution_events_no_mutate()
from public, anon, authenticated, service_role;

comment on function private.treatment_item_execution_events_no_mutate() is
  'Rejects UPDATE/DELETE on the append-only execution event log.';

drop trigger if exists treatment_plan_item_execution_events_no_update on public.treatment_plan_item_execution_events;
create trigger treatment_plan_item_execution_events_no_update
before update or delete on public.treatment_plan_item_execution_events
for each row execute function private.treatment_item_execution_events_no_mutate();

-- The execution projection is derived from the latest valid event in
-- treatment_plan_item_execution_events. Application writes must go
-- through the O5 RPCs (transition/complete/correct), which maintain
-- the projection atomically. Direct table mutation is not part of the
-- supported path; a future migration may add a trigger that rejects
-- direct writes while allowing the SECURITY DEFINER RPCs via a
-- session_replication_role bypass. For now the invariant is enforced
-- at the RPC layer and documented here.
