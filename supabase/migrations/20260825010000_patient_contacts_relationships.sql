-- P2-03: tenant-safe patient contacts and guardian relationships. This object
-- migration grants nothing; supported mutations and reads arrive in later tasks.

create or replace function private.normalize_patient_mobile(candidate text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  compact_value text;
begin
  compact_value := pg_catalog.regexp_replace(
    pg_catalog.btrim(normalize(candidate, NFKC)),
    '[ ()\.-]',
    '',
    'g'
  );

  if compact_value ~ '^09[0-9]{9}$' then
    return '+63' || pg_catalog.substr(compact_value, 2);
  end if;

  if compact_value ~ '^63[0-9]{10}$' and pg_catalog.substr(compact_value, 3, 1) = '9' then
    return '+' || compact_value;
  end if;

  if compact_value ~ '^9[0-9]{9}$' then
    return '+63' || compact_value;
  end if;

  if compact_value ~ '^\+[0-9]{7,15}$' then
    return compact_value;
  end if;

  return null;
end;
$$;

revoke all on function private.normalize_patient_mobile(text)
from public, anon, authenticated, service_role;

create or replace function private.normalize_patient_email(candidate text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when normalized_value !~ '^[\x00-\x7F]+$' then null
    when normalized_value !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' then null
    else pg_catalog.translate(
      normalized_value,
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    )
  end
  from (
    select pg_catalog.btrim(normalize(candidate, NFKC)) as normalized_value
  ) as input
$$;

revoke all on function private.normalize_patient_email(text)
from public, anon, authenticated, service_role;

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  contact_type text not null,
  label text,
  value text not null,
  normalized_value text generated always as (
    case contact_type
      when 'MOBILE' then private.normalize_patient_mobile(value)
      when 'EMAIL' then private.normalize_patient_email(value)
      else null
    end
  ) stored,
  is_primary boolean not null default false,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint patient_contacts_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_contacts_type_check check (
    contact_type in ('MOBILE', 'EMAIL', 'LANDLINE', 'OTHER')
  ),
  constraint patient_contacts_label_bounded_check check (
    label is null or (
      pg_catalog.btrim(label) <> '' and pg_catalog.length(label) <= 80
    )
  ),
  constraint patient_contacts_value_bounded_check check (
    pg_catalog.btrim(value) <> '' and pg_catalog.length(value) <= 320
  ),
  constraint patient_contacts_normalized_value_check check (
    (contact_type in ('MOBILE', 'EMAIL')) = (normalized_value is not null)
  ),
  constraint patient_contacts_status_check check (status in ('active', 'archived')),
  constraint patient_contacts_version_positive_check check (version > 0),
  constraint patient_contacts_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.patient_contacts
from public, anon, authenticated, service_role;

alter table public.patient_contacts enable row level security;

create trigger patient_contacts_set_updated_at
before update on public.patient_contacts
for each row execute function private.set_updated_at();

create index patient_contacts_organization_patient_status_idx
  on public.patient_contacts (organization_id, patient_id, status);

create index patient_contacts_active_mobile_normalized_value_idx
  on public.patient_contacts (organization_id, normalized_value)
  where status = 'active' and contact_type = 'MOBILE';

create index patient_contacts_active_email_normalized_value_idx
  on public.patient_contacts (organization_id, normalized_value)
  where status = 'active' and contact_type = 'EMAIL';

create unique index patient_contacts_one_active_primary_per_type_idx
  on public.patient_contacts (organization_id, patient_id, contact_type)
  where status = 'active' and is_primary;

create policy patient_contacts_select_shared_directory
on public.patient_contacts
for select
to authenticated
using ((select private.has_shared_patient_permission(
  organization_id,
  'patient.demographics.read'
)));

create table public.patient_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  related_patient_id uuid,
  external_contact_name text,
  external_mobile text,
  external_email text,
  relationship_type text not null,
  is_legal_guardian boolean not null default false,
  can_receive_communications boolean not null default false,
  can_consent boolean not null default false,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint patient_relationships_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_relationships_organization_related_patient_fk foreign key (
    organization_id,
    related_patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_relationships_exactly_one_related_party_check check (
    (related_patient_id is null) <> (external_contact_name is null)
  ),
  constraint patient_relationships_external_contacts_only_check check (
    related_patient_id is null
    or (external_mobile is null and external_email is null)
  ),
  constraint patient_relationships_not_self_check check (
    related_patient_id is null or related_patient_id <> patient_id
  ),
  constraint patient_relationships_external_contact_name_bounded_check check (
    external_contact_name is null or (
      pg_catalog.btrim(external_contact_name) <> ''
      and pg_catalog.length(external_contact_name) <= 160
    )
  ),
  constraint patient_relationships_external_mobile_bounded_check check (
    external_mobile is null or (
      pg_catalog.btrim(external_mobile) <> ''
      and pg_catalog.length(external_mobile) <= 50
      and private.normalize_patient_mobile(external_mobile) is not null
    )
  ),
  constraint patient_relationships_external_email_bounded_check check (
    external_email is null or (
      pg_catalog.btrim(external_email) <> ''
      and pg_catalog.length(external_email) <= 320
      and private.normalize_patient_email(external_email) is not null
    )
  ),
  constraint patient_relationships_type_check check (
    relationship_type in (
      'PARENT', 'GUARDIAN', 'CHILD', 'SPOUSE', 'DEPENDENT',
      'EMERGENCY_CONTACT', 'HOUSEHOLD_CONTACT', 'OTHER'
    )
  ),
  constraint patient_relationships_status_check check (
    status in ('active', 'archived')
  ),
  constraint patient_relationships_version_positive_check check (version > 0),
  constraint patient_relationships_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.patient_relationships
from public, anon, authenticated, service_role;

alter table public.patient_relationships enable row level security;

create trigger patient_relationships_set_updated_at
before update on public.patient_relationships
for each row execute function private.set_updated_at();

create index patient_relationships_organization_patient_status_idx
  on public.patient_relationships (organization_id, patient_id, status);

create policy patient_relationships_select_shared_directory
on public.patient_relationships
for select
to authenticated
using ((select private.has_shared_patient_permission(
  organization_id,
  'patient.demographics.read'
)));
