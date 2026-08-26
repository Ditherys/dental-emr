-- P6-04: appointment core schema with three independent status dimensions,
-- tenant-safe composite FKs, zero-many provider/resource associations, and a
-- status history ledger. This migration grants nothing and opens no RLS
-- policy; the scheduling RPC boundaries own all reads/writes in later tasks.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  procedure_id uuid,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scheduling_status text not null default 'REQUESTED',
  confirmation_status text not null default 'PENDING',
  encounter_status text not null default 'PENDING',
  booking_channel_code text
    references public.booking_channels(code) on delete restrict,
  chief_complaint text,
  internal_scheduling_notes text,
  patient_visible_notes text,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint appointments_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint appointments_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint appointments_organization_procedure_fk foreign key (
    organization_id,
    procedure_id
  ) references public.procedures(organization_id, id) on delete restrict,
  constraint appointments_interval_check check (ends_at > starts_at),
  constraint appointments_scheduling_status_check check (
    scheduling_status in ('REQUESTED', 'AWAITING_SPECIALIST', 'SCHEDULED', 'CANCELLED')
  ),
  constraint appointments_confirmation_status_check check (
    confirmation_status in ('PENDING', 'CONFIRMED')
  ),
  constraint appointments_encounter_status_check check (
    encounter_status in ('PENDING', 'CHECKED_IN', 'IN_CHAIR', 'COMPLETED', 'NO_SHOW', 'CANCELLED')
  ),
  constraint appointments_title_bounded_check check (
    title is null or (pg_catalog.btrim(title) <> '' and pg_catalog.length(title) <= 200)
  ),
  constraint appointments_chief_complaint_bounded_check check (
    chief_complaint is null or pg_catalog.length(chief_complaint) <= 2000
  ),
  constraint appointments_internal_notes_bounded_check check (
    internal_scheduling_notes is null or pg_catalog.length(internal_scheduling_notes) <= 4000
  ),
  constraint appointments_patient_notes_bounded_check check (
    patient_visible_notes is null or pg_catalog.length(patient_visible_notes) <= 2000
  ),
  constraint appointments_version_positive_check check (version > 0),
  constraint appointments_organization_id_id_key unique (organization_id, id),
  constraint appointments_cancelled_state_check check (
    (scheduling_status = 'CANCELLED' or encounter_status = 'CANCELLED')
    = (cancelled_at is not null)
  ),
  constraint appointments_completed_state_check check (
    (encounter_status = 'COMPLETED') = (completed_at is not null)
  )
);

revoke all on table public.appointments
from public, anon, authenticated, service_role;

alter table public.appointments enable row level security;

create index appointments_organization_branch_interval_idx
  on public.appointments (organization_id, branch_id, starts_at, ends_at);

create index appointments_organization_patient_starts_idx
  on public.appointments (organization_id, patient_id, starts_at);

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function private.set_updated_at();

create table public.appointment_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  provider_id uuid not null,
  provider_role text not null,
  assignment_status text not null default 'ASSIGNED',
  created_at timestamptz not null default statement_timestamp(),
  constraint appointment_providers_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint appointment_providers_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint appointment_providers_organization_appointment_provider_role_key unique (
    organization_id,
    appointment_id,
    provider_id,
    provider_role
  ),
  constraint appointment_providers_role_check check (
    provider_role in ('PRIMARY_DENTIST', 'SPECIALIST', 'ASSISTING_DENTIST', 'SUPERVISING_DENTIST')
  ),
  constraint appointment_providers_assignment_status_check check (
    assignment_status in ('ASSIGNED', 'REMOVED')
  )
);

revoke all on table public.appointment_providers
from public, anon, authenticated, service_role;

alter table public.appointment_providers enable row level security;

create index appointment_providers_organization_appointment_idx
  on public.appointment_providers (organization_id, appointment_id);

create index appointment_providers_organization_provider_idx
  on public.appointment_providers (organization_id, provider_id, assignment_status);

create table public.appointment_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  resource_id uuid not null,
  purpose text,
  created_at timestamptz not null default statement_timestamp(),
  constraint appointment_resources_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint appointment_resources_organization_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.branch_resources(organization_id, id) on delete restrict,
  constraint appointment_resources_organization_appointment_resource_key unique (
    organization_id,
    appointment_id,
    resource_id
  ),
  constraint appointment_resources_purpose_bounded_check check (
    purpose is null or pg_catalog.length(purpose) <= 200
  )
);

revoke all on table public.appointment_resources
from public, anon, authenticated, service_role;

alter table public.appointment_resources enable row level security;

create index appointment_resources_organization_appointment_idx
  on public.appointment_resources (organization_id, appointment_id);

create index appointment_resources_organization_resource_idx
  on public.appointment_resources (organization_id, resource_id);

create table public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  status_dimension text not null,
  old_value text,
  new_value text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default statement_timestamp(),
  reason text,
  constraint appointment_status_history_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint appointment_status_history_dimension_check check (
    status_dimension in ('scheduling_status', 'confirmation_status', 'encounter_status')
  ),
  constraint appointment_status_history_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 1000
  )
);

revoke all on table public.appointment_status_history
from public, anon, authenticated, service_role;

alter table public.appointment_status_history enable row level security;

create index appointment_status_history_organization_appointment_changed_idx
  on public.appointment_status_history (organization_id, appointment_id, changed_at);