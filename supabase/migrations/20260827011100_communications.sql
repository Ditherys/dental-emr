-- P8-02: communications table is both the durable job queue and the unified
-- communication history. Rows are template-only (bounded subject/body with no
-- clinical content), retryable (attempts/max_attempts/next_attempt_at),
-- idempotent (unique org idempotency key), and observable (status + timestamps).
-- This migration grants nothing and opens no RLS policy; the P8-03 RPC and
-- trigger boundaries own all access.

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid,
  patient_id uuid,
  appointment_id uuid,
  channel text not null,
  template_type text not null,
  recipient text not null,
  subject text,
  body text not null,
  provider_id text,
  provider_message_id text,
  status text not null default 'QUEUED',
  idempotency_key text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default statement_timestamp(),
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint communications_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint communications_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint communications_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint communications_channel_check check (
    channel in ('EMAIL', 'SMS')
  ),
  constraint communications_template_type_check check (
    template_type in ('CONFIRMATION', 'REMINDER', 'RESCHEDULE', 'CANCELLATION')
  ),
  constraint communications_status_check check (
    status in ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')
  ),
  constraint communications_recipient_bounded_check check (
    pg_catalog.btrim(recipient) <> ''
    and pg_catalog.length(recipient) <= 320
  ),
  constraint communications_subject_bounded_check check (
    subject is null or pg_catalog.length(subject) <= 200
  ),
  constraint communications_body_bounded_check check (
    pg_catalog.btrim(body) <> ''
    and pg_catalog.length(body) <= 4000
  ),
  constraint communications_provider_ids_bounded_check check (
    (provider_id is null or pg_catalog.length(provider_id) <= 120)
    and (provider_message_id is null or pg_catalog.length(provider_message_id) <= 200)
  ),
  constraint communications_idempotency_bounded_check check (
    pg_catalog.length(idempotency_key) between 1 and 128
  ),
  constraint communications_attempts_bounds_check check (
    attempts between 0 and max_attempts
    and max_attempts between 1 and 10
  ),
  constraint communications_sent_state_check check (
    (status in ('SENT', 'DELIVERED')) = (sent_at is not null)
  ),
  constraint communications_delivered_state_check check (
    (status = 'DELIVERED') = (delivered_at is not null)
  ),
  constraint communications_failed_state_check check (
    (status = 'FAILED') = (failed_at is not null)
  ),
  constraint communications_cancelled_state_check check (
    (status = 'CANCELLED') = (cancelled_at is not null)
  ),
  constraint communications_organization_idempotency_key unique (
    organization_id,
    idempotency_key
  )
);

revoke all on table public.communications
from public, anon, authenticated, service_role;

alter table public.communications enable row level security;

create index communications_organization_status_next_attempt_idx
  on public.communications (organization_id, status, next_attempt_at)
  where status = 'QUEUED';

create index communications_organization_patient_idx
  on public.communications (organization_id, patient_id);

create index communications_organization_appointment_idx
  on public.communications (organization_id, appointment_id, status);

create trigger communications_set_updated_at
before update on public.communications
for each row execute function private.set_updated_at();