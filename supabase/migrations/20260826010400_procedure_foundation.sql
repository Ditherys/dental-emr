-- P3-05: tenant-owned procedure catalog and qualification relations. This object migration grants nothing.

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  default_duration_minutes integer,
  pre_buffer_minutes integer not null default 0,
  post_buffer_minutes integer not null default 0,
  status text not null default 'active',
  website_visible boolean not null default false,
  online_booking_enabled boolean not null default false,
  booking_mode text not null default 'REQUIRES_REVIEW',
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint procedures_code_bounded_check check (
    code = pg_catalog.upper(code) and code ~ '^[A-Z][A-Z0-9_]*$' and pg_catalog.length(code) <= 80
  ),
  constraint procedures_name_bounded_check check (pg_catalog.btrim(name) <> '' and pg_catalog.length(name) <= 160),
  constraint procedures_description_bounded_check check (description is null or (pg_catalog.btrim(description) <> '' and pg_catalog.length(description) <= 4000)),
  constraint procedures_duration_positive_check check (default_duration_minutes is null or (default_duration_minutes > 0 and default_duration_minutes <= 1440)),
  constraint procedures_pre_buffer_nonnegative_check check (pre_buffer_minutes between 0 and 1440),
  constraint procedures_post_buffer_nonnegative_check check (post_buffer_minutes between 0 and 1440),
  constraint procedures_null_duration_zero_buffers_check check (default_duration_minutes is not null or (pre_buffer_minutes = 0 and post_buffer_minutes = 0)),
  constraint procedures_status_check check (status in ('active', 'inactive', 'archived')),
  constraint procedures_booking_mode_check check (booking_mode in ('REQUIRES_REVIEW', 'REQUEST_ONLY')),
  constraint procedures_version_positive_check check (version > 0),
  constraint procedures_archive_state_check check ((status = 'archived') = (archived_at is not null)),
  constraint procedures_organization_code_key unique (organization_id, code),
  constraint procedures_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.procedures from public, anon, authenticated, service_role;
alter table public.procedures enable row level security;
create index procedures_organization_status_name_idx on public.procedures (organization_id, status, name);
create trigger procedures_set_updated_at before update on public.procedures for each row execute function private.set_updated_at();

create or replace function private.validate_procedure_specialty_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_specialty_organization_id uuid;
begin
  select specialty.organization_id into v_specialty_organization_id
  from public.specialties as specialty where specialty.id = new.specialty_id for key share;
  if found and v_specialty_organization_id is not null and v_specialty_organization_id <> new.organization_id then
    raise foreign_key_violation using message = 'procedure specialty must be global or belong to the procedure organization';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_procedure_specialty_scope() from public, anon, authenticated, service_role;

create table public.procedure_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  procedure_id uuid not null,
  specialty_id uuid not null references public.specialties(id) on delete restrict,
  requirement_level text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint procedure_specialties_requirement_level_check check (requirement_level in ('REQUIRED', 'PREFERRED')),
  constraint procedure_specialties_organization_procedure_specialty_key unique (organization_id, procedure_id, specialty_id),
  constraint procedure_specialties_organization_procedure_fk foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete restrict
);
revoke all on table public.procedure_specialties from public, anon, authenticated, service_role;
alter table public.procedure_specialties enable row level security;
create index procedure_specialties_organization_procedure_idx on public.procedure_specialties (organization_id, procedure_id);
create trigger procedure_specialties_validate_scope before insert or update of organization_id, specialty_id
  on public.procedure_specialties for each row execute function private.validate_procedure_specialty_scope();

create table public.procedure_eligible_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  procedure_id uuid not null,
  provider_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint procedure_eligible_providers_organization_procedure_provider_key unique (organization_id, procedure_id, provider_id),
  constraint procedure_eligible_providers_organization_procedure_fk foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete restrict,
  constraint procedure_eligible_providers_organization_provider_fk foreign key (organization_id, provider_id)
    references public.providers(organization_id, id) on delete restrict
);
revoke all on table public.procedure_eligible_providers from public, anon, authenticated, service_role;
alter table public.procedure_eligible_providers enable row level security;
create index procedure_eligible_providers_organization_procedure_idx on public.procedure_eligible_providers (organization_id, procedure_id);

create policy procedures_select_authorized_configuration on public.procedures for select to authenticated
  using ((select private.can_read_provider_configuration(organization_id)));
create policy procedure_specialties_select_authorized_configuration on public.procedure_specialties for select to authenticated
  using ((select private.can_read_provider_configuration(organization_id)));
create policy procedure_eligible_providers_select_authorized_configuration on public.procedure_eligible_providers for select to authenticated
  using ((select private.can_read_provider_configuration(organization_id)));
