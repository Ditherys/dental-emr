-- P7-01: walk-in queue entries are a separate operational dimension from
-- appointments. A walk-in creates a queue entry, never a fake appointment, and
-- queue transitions never touch appointment rows. This migration grants
-- nothing and opens no RLS policy; the queue RPC boundaries own all access.

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  status text not null default 'WAITING',
  provider_id uuid,
  resource_id uuid,
  chief_complaint text,
  arrived_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  left_at timestamptz,
  constraint queue_entries_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint queue_entries_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint queue_entries_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint queue_entries_organization_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.branch_resources(organization_id, id) on delete restrict,
  constraint queue_entries_status_check check (
    status in ('WAITING', 'READY', 'CALLED', 'IN_CHAIR', 'COMPLETED', 'LEFT', 'CANCELLED')
  ),
  constraint queue_entries_chief_complaint_bounded_check check (
    chief_complaint is null or pg_catalog.length(chief_complaint) <= 2000
  ),
  constraint queue_entries_version_positive_check check (version > 0),
  constraint queue_entries_completed_state_check check (
    (status = 'COMPLETED') = (completed_at is not null)
  ),
  constraint queue_entries_left_state_check check (
    (status = 'LEFT') = (left_at is not null)
  )
);

revoke all on table public.queue_entries
from public, anon, authenticated, service_role;

alter table public.queue_entries enable row level security;

create index queue_entries_organization_branch_status_idx
  on public.queue_entries (organization_id, branch_id, status);

create index queue_entries_organization_branch_arrived_idx
  on public.queue_entries (organization_id, branch_id, arrived_at);

create trigger queue_entries_set_updated_at
before update on public.queue_entries
for each row execute function private.set_updated_at();