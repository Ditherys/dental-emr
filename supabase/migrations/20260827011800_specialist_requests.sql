-- P10-02: specialist request records carry only a minimal bounded case
-- summary (never full clinical history); acceptance/assignment and automation
-- happen in the P10-03 RPC boundary. This migration grants nothing and opens no
-- RLS policy.

create table public.specialist_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  required_specialty_id uuid,
  requested_provider_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  case_summary text not null,
  request_channel text not null,
  status text not null default 'SENT',
  response_message text,
  expires_at timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint specialist_requests_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint specialist_requests_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint specialist_requests_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint specialist_requests_organization_specialty_fk foreign key (
    required_specialty_id
  ) references public.specialties(id) on delete restrict,
  constraint specialist_requests_organization_provider_fk foreign key (
    organization_id,
    requested_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint specialist_requests_status_check check (
    status in (
      'SENT', 'ACCEPTED', 'ASSIGNED', 'DECLINED',
      'ALTERNATE_TIME_REQUESTED', 'EXPIRED', 'CANCELLED'
    )
  ),
  constraint specialist_requests_channel_check check (
    request_channel in ('EMAIL', 'SMS')
  ),
  constraint specialist_requests_case_summary_bounded_check check (
    pg_catalog.btrim(case_summary) <> ''
    and pg_catalog.length(case_summary) <= 1000
  ),
  constraint specialist_requests_response_bounded_check check (
    response_message is null or pg_catalog.length(response_message) <= 1000
  ),
  constraint specialist_requests_window_check check (
    requested_ends_at is null
    or (requested_starts_at is not null and requested_ends_at > requested_starts_at)
  ),
  constraint specialist_requests_version_positive_check check (version > 0),
  constraint specialist_requests_organization_id_id_key unique (organization_id, id)
);

comment on column public.specialist_requests.case_summary is
  'Minimal, bounded, non-clinical case description for an availability request. Full clinical history is never attached to a specialist request.';

revoke all on table public.specialist_requests
from public, anon, authenticated, service_role;

alter table public.specialist_requests enable row level security;

create index specialist_requests_organization_branch_status_idx
  on public.specialist_requests (organization_id, branch_id, status);

create index specialist_requests_organization_provider_status_idx
  on public.specialist_requests (organization_id, requested_provider_id, status);

create trigger specialist_requests_set_updated_at
before update on public.specialist_requests
for each row execute function private.set_updated_at();

create or replace function private.validate_specialist_request_specialty_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  specialty_organization_id uuid;
begin
  if new.required_specialty_id is null then
    return new;
  end if;

  select specialty.organization_id
  into specialty_organization_id
  from public.specialties as specialty
  where specialty.id = new.required_specialty_id
  for key share;

  if found
     and specialty_organization_id is not null
     and specialty_organization_id <> new.organization_id then
    raise foreign_key_violation using
      message = 'specialist request specialty must be global or belong to the request organization';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_specialist_request_specialty_scope()
from public, anon, authenticated, service_role;

create trigger specialist_requests_validate_specialty_scope
before insert or update of organization_id, required_specialty_id
on public.specialist_requests
for each row execute function private.validate_specialist_request_specialty_scope();

create table public.specialist_request_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  specialist_request_id uuid not null,
  old_value text,
  new_value text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  changed_at timestamptz not null default statement_timestamp(),
  constraint specialist_request_history_organization_request_fk foreign key (
    organization_id,
    specialist_request_id
  ) references public.specialist_requests(organization_id, id) on delete restrict,
  constraint specialist_request_history_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 1000
  )
);

revoke all on table public.specialist_request_status_history
from public, anon, authenticated, service_role;

alter table public.specialist_request_status_history enable row level security;

create index specialist_request_history_organization_request_idx
  on public.specialist_request_status_history (organization_id, specialist_request_id, changed_at);