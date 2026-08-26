-- P5-01: standardized acquisition-source catalog (global defaults plus
-- same-organization customs) and system-global booking channels. Global rows
-- seed here because every environment needs them; booking channels stay
-- system-global only. This migration grants nothing.

create table public.acquisition_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text not null,
  organization_id uuid references public.organizations(id) on delete restrict,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint acquisition_sources_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint acquisition_sources_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint acquisition_sources_category_check check (
    category in ('REFERRAL', 'DIGITAL', 'TRADITIONAL', 'PARTNER', 'OTHER', 'UNKNOWN')
  ),
  constraint acquisition_sources_version_positive_check check (version > 0)
);

revoke all on table public.acquisition_sources
from public, anon, authenticated, service_role;

alter table public.acquisition_sources enable row level security;

comment on table public.acquisition_sources is
  'Global immutable discovery-source defaults and organization-owned custom sources; booking channel remains a separate dimension.';

create unique index acquisition_sources_global_code_key
  on public.acquisition_sources (code)
  where organization_id is null;

create unique index acquisition_sources_organization_code_key
  on public.acquisition_sources (organization_id, code)
  where organization_id is not null;

create index acquisition_sources_category_idx
  on public.acquisition_sources (category);

create index acquisition_sources_organization_active_idx
  on public.acquisition_sources (organization_id, is_active);

-- A custom code must differ from every global code regardless of active state,
-- so catalog resolution stays deterministic without precedence rules.
create or replace function private.validate_acquisition_source_code_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is null then
    if exists (
      select 1
      from public.acquisition_sources as source
      where source.organization_id is not null
        and source.code = new.code
    ) then
      raise check_violation using
        message = 'global acquisition source code must differ from every custom code';
    end if;

    return new;
  end if;

  if exists (
    select 1
    from public.acquisition_sources as source
    where source.organization_id is null
      and source.code = new.code
  ) then
    raise check_violation using
      message = 'custom acquisition source code must differ from every global code';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_acquisition_source_code_scope()
from public, anon, authenticated, service_role;

create or replace function private.protect_acquisition_source_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is null then
    raise check_violation using message = 'global acquisition sources are immutable';
  end if;

  if tg_op = 'UPDATE'
     and new.organization_id is distinct from old.organization_id then
    raise check_violation using
      message = 'acquisition source organization scope is immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_acquisition_source_scope()
from public, anon, authenticated, service_role;

create trigger acquisition_sources_protect_scope
before update or delete on public.acquisition_sources
for each row execute function private.protect_acquisition_source_scope();

create trigger acquisition_sources_validate_code_scope
before insert or update of organization_id, code
on public.acquisition_sources
for each row execute function private.validate_acquisition_source_code_scope();

create trigger acquisition_sources_set_updated_at
before update on public.acquisition_sources
for each row execute function private.set_updated_at();

insert into public.acquisition_sources (id, organization_id, code, name, category)
values
  ('a5000000-0000-0000-0000-000000000001', null, 'EXISTING_PATIENT_REFERRAL', 'Existing Patient Referral', 'REFERRAL'),
  ('a5000000-0000-0000-0000-000000000002', null, 'FAMILY_FRIEND', 'Family/Friend', 'REFERRAL'),
  ('a5000000-0000-0000-0000-000000000003', null, 'DENTIST_REFERRAL', 'Dentist Referral', 'REFERRAL'),
  ('a5000000-0000-0000-0000-000000000004', null, 'DOCTOR_REFERRAL', 'Doctor/Healthcare Referral', 'REFERRAL'),
  ('a5000000-0000-0000-0000-000000000005', null, 'GOOGLE_SEARCH', 'Google Search', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000006', null, 'GOOGLE_MAPS', 'Google Maps', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000007', null, 'FACEBOOK', 'Facebook', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000008', null, 'INSTAGRAM', 'Instagram', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000009', null, 'TIKTOK', 'TikTok', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000010', null, 'CLINIC_WEBSITE', 'Clinic Website/Direct', 'DIGITAL'),
  ('a5000000-0000-0000-0000-000000000011', null, 'CLINIC_SIGNAGE', 'Clinic Signage', 'TRADITIONAL'),
  ('a5000000-0000-0000-0000-000000000012', null, 'FLYER_EVENT', 'Flyer/Event', 'TRADITIONAL'),
  ('a5000000-0000-0000-0000-000000000013', null, 'HMO', 'HMO', 'PARTNER'),
  ('a5000000-0000-0000-0000-000000000014', null, 'EMPLOYER_COMPANY', 'Employer/Company', 'PARTNER'),
  ('a5000000-0000-0000-0000-000000000015', null, 'SCHOOL_PARTNER', 'School/Partner', 'PARTNER'),
  ('a5000000-0000-0000-0000-000000000016', null, 'OTHER', 'Other', 'OTHER'),
  ('a5000000-0000-0000-0000-000000000017', null, 'UNKNOWN', 'Unknown', 'UNKNOWN')
on conflict (id) do nothing;

create table public.booking_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint booking_channels_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint booking_channels_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint booking_channels_code_key unique (code)
);

revoke all on table public.booking_channels
from public, anon, authenticated, service_role;

alter table public.booking_channels enable row level security;

comment on table public.booking_channels is
  'System-global first-booking channel catalog; walk-in is a booking channel, never a discovery source.';

insert into public.booking_channels (id, code, name)
values
  ('a5100000-0000-0000-0000-000000000001', 'WALK_IN', 'Walk-in'),
  ('a5100000-0000-0000-0000-000000000002', 'PHONE', 'Phone'),
  ('a5100000-0000-0000-0000-000000000003', 'SMS', 'SMS'),
  ('a5100000-0000-0000-0000-000000000004', 'FACEBOOK_MESSENGER', 'Facebook Messenger'),
  ('a5100000-0000-0000-0000-000000000005', 'INSTAGRAM_MESSAGING', 'Instagram Messaging'),
  ('a5100000-0000-0000-0000-000000000006', 'CLINIC_WEBSITE', 'Clinic Website'),
  ('a5100000-0000-0000-0000-000000000007', 'ONLINE_BOOKING', 'Online Booking'),
  ('a5100000-0000-0000-0000-000000000008', 'RECEPTIONIST_CREATED', 'Receptionist-created'),
  ('a5100000-0000-0000-0000-000000000009', 'UNKNOWN', 'Unknown')
on conflict (id) do nothing;

create trigger booking_channels_set_updated_at
before update on public.booking_channels
for each row execute function private.set_updated_at();

create or replace function private.protect_booking_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise check_violation using message = 'booking channels are immutable';
end;
$$;

revoke all on function private.protect_booking_channels()
from public, anon, authenticated, service_role;

create trigger booking_channels_protect_rows
before update or delete on public.booking_channels
for each row execute function private.protect_booking_channels();

-- Row visibility follows the registration read permission; base-table
-- privileges stay revoked from every browser role until the P5-03 RPCs land.
create policy acquisition_sources_select_registration_catalog
on public.acquisition_sources
for select
to authenticated
using (
  (
    organization_id is not null
    and (select private.has_shared_patient_permission(
      organization_id,
      'patient.demographics.read'
    ))
  )
  or (
    organization_id is null
    and exists (
      select 1
      from public.organization_members as current_membership
      where current_membership.user_id = (select auth.uid())
        and (select private.has_shared_patient_permission(
          current_membership.organization_id,
          'patient.demographics.read'
        ))
    )
  )
);

create policy booking_channels_select_registration_catalog
on public.booking_channels
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as current_membership
    where current_membership.user_id = (select auth.uid())
      and (select private.has_shared_patient_permission(
        current_membership.organization_id,
        'patient.demographics.read'
      ))
  )
);
