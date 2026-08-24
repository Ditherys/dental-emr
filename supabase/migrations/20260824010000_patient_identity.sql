-- P2-02: organization-owned patient identity root, fail-closed RLS, and
-- tenant-safe audit linkage. This object migration grants nothing.

create or replace function private.normalize_patient_name(candidate text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.lower(normalize(candidate, NFKC)),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ),
    ''
  )
$$;

revoke all on function private.normalize_patient_name(text)
from public, anon, authenticated, service_role;

create or replace function private.validate_patient_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > current_date then
    raise invalid_parameter_value using message = 'invalid patient birth date';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_patient_birth_date()
from public, anon, authenticated, service_role;

create or replace function private.has_shared_patient_permission(
  target_organization_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_permission_code in (
    'patient.demographics.read',
    'patient.demographics.write'
  ) and exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
     and organization.status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (
       role.organization_id is null
       or role.organization_id = organization_member.organization_id
     )
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = target_permission_code
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
      and (
        member_role.branch_id is null
        or exists (
          select 1
          from public.branches as branch
          join public.branch_memberships as branch_membership
            on branch_membership.organization_id = branch.organization_id
           and branch_membership.branch_id = branch.id
           and branch_membership.organization_member_id = organization_member.id
          where branch.organization_id = target_organization_id
            and branch.id = member_role.branch_id
            and branch.status = 'active'
            and branch_membership.access_status = 'active'
        )
      )
  )
$$;

revoke all on function private.has_shared_patient_permission(uuid, text)
from public, anon, authenticated, service_role;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  preferred_name text,
  birth_date date not null,
  sex_at_registration text,
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text,
  preferred_branch_id uuid,
  status text not null default 'active',
  version integer not null default 1,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  normalized_first_name text generated always as (
    private.normalize_patient_name(first_name)
  ) stored,
  normalized_middle_name text generated always as (
    private.normalize_patient_name(middle_name)
  ) stored,
  normalized_last_name text generated always as (
    private.normalize_patient_name(last_name)
  ) stored,
  normalized_full_name text generated always as (
    private.normalize_patient_name(
      first_name
      || case when middle_name is null then '' else ' ' || middle_name end
      || ' ' || last_name
      || case when suffix is null then '' else ' ' || suffix end
    )
  ) stored,
  constraint patients_patient_number_bounded_check check (
    pg_catalog.btrim(patient_number) <> ''
    and pg_catalog.length(patient_number) <= 64
  ),
  constraint patients_first_name_bounded_check check (
    pg_catalog.btrim(first_name) <> ''
    and pg_catalog.length(first_name) <= 120
  ),
  constraint patients_middle_name_bounded_check check (
    middle_name is null or (
      pg_catalog.btrim(middle_name) <> ''
      and pg_catalog.length(middle_name) <= 120
    )
  ),
  constraint patients_last_name_bounded_check check (
    pg_catalog.btrim(last_name) <> ''
    and pg_catalog.length(last_name) <= 120
  ),
  constraint patients_suffix_bounded_check check (
    suffix is null or (
      pg_catalog.btrim(suffix) <> ''
      and pg_catalog.length(suffix) <= 40
    )
  ),
  constraint patients_preferred_name_bounded_check check (
    preferred_name is null or (
      pg_catalog.btrim(preferred_name) <> ''
      and pg_catalog.length(preferred_name) <= 120
    )
  ),
  constraint patients_birth_date_minimum_check check (
    birth_date >= date '1900-01-01'
  ),
  constraint patients_sex_at_registration_check check (
    sex_at_registration is null or sex_at_registration in (
      'female', 'male', 'intersex', 'unknown', 'not_recorded'
    )
  ),
  constraint patients_address_line1_bounded_check check (
    address_line1 is null or (
      pg_catalog.btrim(address_line1) <> ''
      and pg_catalog.length(address_line1) <= 160
    )
  ),
  constraint patients_address_line2_bounded_check check (
    address_line2 is null or (
      pg_catalog.btrim(address_line2) <> ''
      and pg_catalog.length(address_line2) <= 160
    )
  ),
  constraint patients_city_bounded_check check (
    city is null or (
      pg_catalog.btrim(city) <> ''
      and pg_catalog.length(city) <= 100
    )
  ),
  constraint patients_province_bounded_check check (
    province is null or (
      pg_catalog.btrim(province) <> ''
      and pg_catalog.length(province) <= 100
    )
  ),
  constraint patients_postal_code_bounded_check check (
    postal_code is null or (
      pg_catalog.btrim(postal_code) <> ''
      and pg_catalog.length(postal_code) <= 20
    )
  ),
  constraint patients_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint patients_version_positive_check check (version > 0),
  constraint patients_organization_id_id_key unique (organization_id, id),
  constraint patients_organization_patient_number_key unique (
    organization_id,
    patient_number
  ),
  constraint patients_organization_preferred_branch_fk foreign key (
    organization_id,
    preferred_branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint patients_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.patients
from public, anon, authenticated, service_role;

alter table public.patients enable row level security;

create trigger patients_validate_birth_date
before insert or update of birth_date on public.patients
for each row execute function private.validate_patient_birth_date();

create trigger patients_set_updated_at
before update on public.patients
for each row execute function private.set_updated_at();

create index patients_organization_birth_date_idx
  on public.patients (organization_id, birth_date);

create index patients_organization_normalized_name_birth_date_idx
  on public.patients (
    organization_id,
    normalized_last_name,
    normalized_first_name,
    birth_date
  );

create policy patients_select_shared_directory
on public.patients
for select
to authenticated
using ((select private.has_shared_patient_permission(
  organization_id,
  'patient.demographics.read'
)));

alter table public.audit_events
  add column patient_id uuid,
  add constraint audit_events_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict;

create index audit_events_organization_patient_occurred_at_idx
  on public.audit_events (organization_id, patient_id, occurred_at desc)
  where patient_id is not null;
