-- P9-02: per-provider calendar connections, EMR→Google event links, and a
-- durable calendar sync job queue. The EMR appointment is authoritative; sync
-- failures are actionable job states, never appointment changes. OAuth tokens
-- are stored only as an opaque server-side reference. This migration grants
-- nothing and opens no RLS policy; the P9-03 RPC and trigger boundaries own all
-- access.

create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  google_account_ref text,
  calendar_id text,
  privacy_mode text not null default 'HIGH_PRIVACY',
  connection_status text not null default 'DISCONNECTED',
  last_synced_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint calendar_integrations_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint calendar_integrations_organization_provider_key unique (
    organization_id,
    provider_id
  ),
  constraint calendar_integrations_privacy_mode_check check (
    privacy_mode in ('HIGH_PRIVACY', 'BALANCED', 'DETAILED')
  ),
  constraint calendar_integrations_connection_status_check check (
    connection_status in ('CONNECTED', 'DISCONNECTED', 'ERROR')
  ),
  constraint calendar_integrations_ref_bounded_check check (
    google_account_ref is null or pg_catalog.length(google_account_ref) <= 500
  ),
  constraint calendar_integrations_calendar_id_bounded_check check (
    calendar_id is null or pg_catalog.length(calendar_id) <= 500
  ),
  constraint calendar_integrations_version_positive_check check (version > 0)
);

comment on column public.calendar_integrations.google_account_ref is
  'Opaque server-side reference to the provider OAuth connection; the token itself is never stored in this database or exposed to the browser.';

revoke all on table public.calendar_integrations
from public, anon, authenticated, service_role;

alter table public.calendar_integrations enable row level security;

create index calendar_integrations_organization_provider_status_idx
  on public.calendar_integrations (organization_id, provider_id, connection_status);

create trigger calendar_integrations_set_updated_at
before update on public.calendar_integrations
for each row execute function private.set_updated_at();

create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  provider_id uuid not null,
  external_event_id text not null,
  operation text not null,
  sync_status text not null default 'PENDING',
  attempts integer not null default 0,
  last_error text,
  last_synced_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint calendar_event_links_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint calendar_event_links_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint calendar_event_links_organization_appointment_provider_op_key unique (
    organization_id,
    appointment_id,
    provider_id,
    operation
  ),
  constraint calendar_event_links_operation_check check (
    operation in ('CREATE', 'UPDATE', 'CANCEL')
  ),
  constraint calendar_event_links_sync_status_check check (
    sync_status in ('PENDING', 'SYNCED', 'FAILED', 'CANCELLED')
  ),
  constraint calendar_event_links_external_event_id_bounded_check check (
    pg_catalog.length(external_event_id) between 1 and 500
  ),
  constraint calendar_event_links_last_error_bounded_check check (
    last_error is null or pg_catalog.length(last_error) <= 1000
  ),
  constraint calendar_event_links_attempts_bounds_check check (
    attempts between 0 and 10
  ),
  constraint calendar_event_links_version_positive_check check (version > 0)
);

revoke all on table public.calendar_event_links
from public, anon, authenticated, service_role;

alter table public.calendar_event_links enable row level security;

create index calendar_event_links_organization_appointment_idx
  on public.calendar_event_links (organization_id, appointment_id);

create index calendar_event_links_organization_provider_idx
  on public.calendar_event_links (organization_id, provider_id, sync_status);

create trigger calendar_event_links_set_updated_at
before update on public.calendar_event_links
for each row execute function private.set_updated_at();

create table public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  appointment_id uuid not null,
  provider_id uuid not null,
  operation text not null,
  status text not null default 'QUEUED',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default statement_timestamp(),
  external_event_id text,
  idempotency_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint calendar_sync_jobs_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint calendar_sync_jobs_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint calendar_sync_jobs_operation_check check (
    operation in ('CREATE', 'UPDATE', 'CANCEL')
  ),
  constraint calendar_sync_jobs_status_check check (
    status in ('QUEUED', 'PROCESSED', 'FAILED', 'CANCELLED')
  ),
  constraint calendar_sync_jobs_external_event_id_bounded_check check (
    external_event_id is null or pg_catalog.length(external_event_id) <= 500
  ),
  constraint calendar_sync_jobs_idempotency_bounded_check check (
    pg_catalog.length(idempotency_key) between 1 and 200
  ),
  constraint calendar_sync_jobs_attempts_bounds_check check (
    attempts between 0 and max_attempts
    and max_attempts between 1 and 10
  ),
  constraint calendar_sync_jobs_organization_idempotency_key unique (
    organization_id,
    idempotency_key
  )
);

revoke all on table public.calendar_sync_jobs
from public, anon, authenticated, service_role;

alter table public.calendar_sync_jobs enable row level security;

create index calendar_sync_jobs_organization_status_next_attempt_idx
  on public.calendar_sync_jobs (organization_id, status, next_attempt_at)
  where status = 'QUEUED';

create index calendar_sync_jobs_organization_appointment_idx
  on public.calendar_sync_jobs (organization_id, appointment_id);