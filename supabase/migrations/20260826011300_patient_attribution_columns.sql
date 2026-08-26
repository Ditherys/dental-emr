-- P5-02: nullable patient attribution columns referencing the P5-01 catalogs.
-- The acquisition source follows the specialties tenant rule (global OR
-- same-organization custom) through a scoped trigger because a plain FK cannot
-- express that predicate; referring patients use the existing composite
-- tenant-safe unique key on patients (organization_id, id). Nullable columns,
-- no backfill, and this migration grants nothing.

alter table public.patients
  add column acquisition_source_id uuid
    references public.acquisition_sources(id) on delete restrict,
  add column referrer_patient_id uuid,
  add column external_referrer_name text,
  add column external_referrer_organization text,
  add column external_referrer_contact text,
  add column initial_booking_channel_code text
    references public.booking_channels(code) on delete restrict;

alter table public.patients
  add constraint patients_external_referrer_name_bounded_check check (
    external_referrer_name is null or (
      pg_catalog.btrim(external_referrer_name) <> ''
      and pg_catalog.length(external_referrer_name) <= 160
    )
  ),
  add constraint patients_external_referrer_organization_bounded_check check (
    external_referrer_organization is null or (
      pg_catalog.btrim(external_referrer_organization) <> ''
      and pg_catalog.length(external_referrer_organization) <= 160
    )
  ),
  add constraint patients_external_referrer_contact_bounded_check check (
    external_referrer_contact is null or (
      pg_catalog.btrim(external_referrer_contact) <> ''
      and pg_catalog.length(external_referrer_contact) <= 200
    )
  ),
  add constraint patients_single_referrer_kind_check check (
    referrer_patient_id is null or external_referrer_name is null
  ),
  add constraint patients_no_self_referral_check check (
    referrer_patient_id is null or referrer_patient_id <> id
  ),
  add constraint patients_organization_referrer_patient_fk foreign key (
    organization_id,
    referrer_patient_id
  ) references public.patients(organization_id, id) on delete restrict;

comment on column public.patients.acquisition_source_id is
  'How this patient discovered the clinic: a global immutable catalog source or a same-organization custom source.';
comment on column public.patients.referrer_patient_id is
  'Same-organization referring patient; mutually exclusive with the external referrer snapshot.';
comment on column public.patients.initial_booking_channel_code is
  'System-global first-booking channel code at registration time; appointments later carry their own channel.';

create or replace function private.ensure_patient_acquisition_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_organization_id uuid;
  source_is_active boolean;
begin
  if new.acquisition_source_id is null then
    return new;
  end if;

  select
    acquisition_source.organization_id,
    acquisition_source.is_active
  into source_organization_id, source_is_active
  from public.acquisition_sources as acquisition_source
  where acquisition_source.id = new.acquisition_source_id
  for share;

  -- Unknown source IDs remain the responsibility of the normal FK. A known
  -- custom source must belong to the patient's direct organization.
  if found
     and source_organization_id is not null
     and source_organization_id <> new.organization_id then
    raise check_violation using
      message = 'patient acquisition source must be global or belong to the patient organization';
  end if;

  if found and not source_is_active then
    raise check_violation using
      message = 'inactive acquisition sources cannot be attributed to new patients';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_patient_acquisition_scope()
from public, anon, authenticated, service_role;

create trigger patients_validate_acquisition_scope
before insert or update of organization_id, acquisition_source_id
on public.patients
for each row execute function private.ensure_patient_acquisition_scope();

create index patients_organization_acquisition_source_idx
  on public.patients (organization_id, acquisition_source_id)
  where acquisition_source_id is not null;
