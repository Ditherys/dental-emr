-- P6-05: dedicated reservation ledgers with partial GiST exclusion constraints
-- as the final database-level race-condition protection (DATABASE_DESIGN
-- §14.5). btree_gist is required for the `uuid WITH =` exclusion operator on
-- the generated tstzrange overlap predicate. Reservation expiry is a state
-- transition (RELEASED/EXPIRED), never a bare `expires_at < now()` predicate,
-- so the partial index predicate stays static.

create extension if not exists btree_gist;

create table public.provider_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  branch_id uuid not null,
  appointment_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timespan tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  reservation_status text not null default 'ACTIVE',
  reservation_kind text not null default 'APPOINTMENT',
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint provider_reservations_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint provider_reservations_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint provider_reservations_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint provider_reservations_interval_check check (ends_at > starts_at),
  constraint provider_reservations_status_check check (
    reservation_status in ('ACTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED')
  ),
  constraint provider_reservations_kind_check check (
    reservation_kind in ('APPOINTMENT', 'HOLD', 'BLOCK')
  ),
  constraint provider_reservations_active_no_expiry_check check (
    reservation_status <> 'ACTIVE' or expires_at is null
  ),
  constraint provider_reservations_overlap_exclusion exclude using gist (
    provider_id with =,
    timespan with &&
  ) where (reservation_status = 'ACTIVE')
);

comment on table public.provider_reservations is
  'Organization-wide provider time reservations; the ACTIVE exclusion constraint rejects double booking across every branch.';

revoke all on table public.provider_reservations
from public, anon, authenticated, service_role;

alter table public.provider_reservations enable row level security;

create index provider_reservations_organization_provider_status_idx
  on public.provider_reservations (organization_id, provider_id, reservation_status);

create index provider_reservations_organization_appointment_idx
  on public.provider_reservations (organization_id, appointment_id);

create table public.resource_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  resource_id uuid not null,
  branch_id uuid not null,
  appointment_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timespan tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  reservation_status text not null default 'ACTIVE',
  reservation_kind text not null default 'APPOINTMENT',
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint resource_reservations_organization_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.branch_resources(organization_id, id) on delete restrict,
  constraint resource_reservations_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint resource_reservations_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint resource_reservations_interval_check check (ends_at > starts_at),
  constraint resource_reservations_status_check check (
    reservation_status in ('ACTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED')
  ),
  constraint resource_reservations_kind_check check (
    reservation_kind in ('APPOINTMENT', 'HOLD', 'BLOCK')
  ),
  constraint resource_reservations_active_no_expiry_check check (
    reservation_status <> 'ACTIVE' or expires_at is null
  ),
  constraint resource_reservations_overlap_exclusion exclude using gist (
    resource_id with =,
    timespan with &&
  ) where (reservation_status = 'ACTIVE')
);

comment on table public.resource_reservations is
  'Branch resource time reservations; the ACTIVE exclusion constraint rejects simultaneous use of the same chair/device/room.';

revoke all on table public.resource_reservations
from public, anon, authenticated, service_role;

alter table public.resource_reservations enable row level security;

create index resource_reservations_organization_resource_status_idx
  on public.resource_reservations (organization_id, resource_id, reservation_status);

create index resource_reservations_organization_appointment_idx
  on public.resource_reservations (organization_id, appointment_id);