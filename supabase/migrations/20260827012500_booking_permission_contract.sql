-- P13-01: booking review permission and the public booking request schema.
-- Booking requests are lightweight minimal-information rows, never full
-- clinical patient records; management tokens are stored only as SHA-256 hashes.
-- Grants no functions.

insert into public.permissions (code, description)
values (
  'booking.review',
  'Review and convert public website booking requests.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'RECEPTIONIST')
  and permission.code = 'booking.review'
on conflict do nothing;

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  requested_procedure_id uuid,
  requested_provider_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  first_name text not null,
  last_name text not null,
  birth_date date,
  mobile text not null,
  email text,
  acquisition_source_code text,
  booking_channel_code text not null default 'WEBSITE',
  referral_payload jsonb,
  request_status text not null default 'SUBMITTED',
  management_token_hash text,
  idempotency_key text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  appointment_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint booking_requests_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint booking_requests_organization_procedure_fk foreign key (
    organization_id,
    requested_procedure_id
  ) references public.procedures(organization_id, id) on delete restrict,
  constraint booking_requests_organization_provider_fk foreign key (
    organization_id,
    requested_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint booking_requests_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint booking_requests_status_check check (
    request_status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CONVERTED', 'SPAM', 'CANCELLED')
  ),
  constraint booking_requests_name_bounded_check check (
    pg_catalog.btrim(first_name) <> ''
    and pg_catalog.length(first_name) <= 120
    and pg_catalog.btrim(last_name) <> ''
    and pg_catalog.length(last_name) <= 120
  ),
  constraint booking_requests_contact_bounded_check check (
    pg_catalog.btrim(mobile) <> ''
    and pg_catalog.length(mobile) <= 40
    and (email is null or pg_catalog.length(email) <= 320)
  ),
  constraint booking_requests_window_check check (
    requested_ends_at is null
    or (requested_starts_at is not null and requested_ends_at > requested_starts_at)
  ),
  constraint booking_requests_token_hash_check check (
    management_token_hash is null
    or (management_token_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint booking_requests_idempotency_bounded_check check (
    pg_catalog.length(idempotency_key) between 8 and 128
  ),
  constraint booking_requests_referral_payload_check check (
    referral_payload is null
    or (jsonb_typeof(referral_payload) = 'object' and pg_column_size(referral_payload) <= 2048)
  ),
  constraint booking_requests_version_positive_check check (version > 0),
  constraint booking_requests_organization_idempotency_key unique (
    organization_id,
    idempotency_key
  )
);

revoke all on table public.booking_requests
from public, anon, authenticated, service_role;

alter table public.booking_requests enable row level security;

create index booking_requests_organization_branch_status_idx
  on public.booking_requests (organization_id, branch_id, request_status);

create index booking_requests_organization_created_idx
  on public.booking_requests (organization_id, created_at);

create trigger booking_requests_set_updated_at
before update on public.booking_requests
for each row execute function private.set_updated_at();