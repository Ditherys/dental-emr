-- P5-04: minimal incoming/outgoing referral records. This migration grants
-- nothing; P5-05 owns the audited write and bounded read RPC boundaries.

create table public.patient_referrals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  direction text not null,
  status text not null default 'RECEIVED',
  required_specialty_id uuid references public.specialties(id) on delete restrict,
  external_party_name text,
  external_party_organization text,
  external_party_contact text,
  notes text,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint patient_referrals_org_id_patient_id_fk foreign key (org_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint patient_referrals_direction_check check (direction in ('IN', 'OUT')),
  constraint patient_referrals_status_check check (status in ('RECEIVED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  constraint patient_referrals_external_party_name_bounded_check check (
    external_party_name is null or (
      pg_catalog.btrim(external_party_name) <> ''
      and pg_catalog.length(external_party_name) <= 160
    )
  ),
  constraint patient_referrals_external_party_organization_bounded_check check (
    external_party_organization is null or (
      pg_catalog.btrim(external_party_organization) <> ''
      and pg_catalog.length(external_party_organization) <= 160
    )
  ),
  constraint patient_referrals_external_party_contact_bounded_check check (
    external_party_contact is null or (
      pg_catalog.btrim(external_party_contact) <> ''
      and pg_catalog.length(external_party_contact) <= 200
    )
  ),
  constraint patient_referrals_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 2000
  ),
  constraint patient_referrals_version_positive_check check (version > 0)
);

revoke all on table public.patient_referrals
from public, anon, authenticated, service_role;

alter table public.patient_referrals enable row level security;

create index patient_referrals_org_patient_status_idx
  on public.patient_referrals (org_id, patient_id, status);

create or replace function private.validate_patient_referral_specialty_scope()
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

  -- Unknown specialty IDs remain the responsibility of the normal FK. A known
  -- custom specialty must belong to the referral's direct organization.
  if found
     and specialty_organization_id is not null
     and specialty_organization_id <> new.org_id then
    raise foreign_key_violation using
      message = 'patient referral specialty must be global or belong to the referral organization';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_patient_referral_specialty_scope()
from public, anon, authenticated, service_role;

create trigger patient_referrals_validate_specialty_scope
before insert or update of org_id, required_specialty_id
on public.patient_referrals
for each row execute function private.validate_patient_referral_specialty_scope();

create trigger patient_referrals_set_updated_at
before update on public.patient_referrals
for each row execute function private.set_updated_at();

create policy patient_referrals_select_shared_directory
on public.patient_referrals
for select
to authenticated
using ((select private.has_shared_patient_permission(
  org_id,
  'patient.demographics.read'
)));
