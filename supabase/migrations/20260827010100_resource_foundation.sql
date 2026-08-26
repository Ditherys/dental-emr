-- P6-02: schedulable physical resources. resource_types follow the global-or-
-- tenant rule (mirrors specialties); branch_resources and
-- resource_unavailability are branch/org-scoped with tenant-safe composite FKs.
-- This migration grants nothing and opens no RLS policy; the scheduling RPC
-- boundaries own all reads/writes in later tasks.

create or replace function private.protect_resource_type_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is null then
    raise check_violation using message = 'global resource types are immutable';
  end if;

  if tg_op = 'UPDATE'
     and new.organization_id is distinct from old.organization_id then
    raise check_violation using
      message = 'resource type organization scope is immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_resource_type_scope()
from public, anon, authenticated, service_role;

create table public.resource_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  schedulable boolean not null default true,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint resource_types_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint resource_types_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint resource_types_version_positive_check check (version > 0)
);

revoke all on table public.resource_types
from public, anon, authenticated, service_role;

alter table public.resource_types enable row level security;

create unique index resource_types_organization_code_key
  on public.resource_types (organization_id, code)
  where organization_id is not null;

create index resource_types_organization_active_name_idx
  on public.resource_types (organization_id, is_active, name);

create trigger resource_types_protect_scope
before update or delete on public.resource_types
for each row execute function private.protect_resource_type_scope();

create trigger resource_types_set_updated_at
before update on public.resource_types
for each row execute function private.set_updated_at();

insert into public.resource_types (id, organization_id, code, name, schedulable)
values
  ('c0000000-0000-0000-0000-000000000001', null, 'DENTAL_CHAIR', 'Dental Chair', true),
  ('c0000000-0000-0000-0000-000000000002', null, 'SURGERY_ROOM', 'Surgery Room', true),
  ('c0000000-0000-0000-0000-000000000003', null, 'XRAY_ROOM', 'X-ray Room', true),
  ('c0000000-0000-0000-0000-000000000004', null, 'PANORAMIC_XRAY', 'Panoramic X-ray', true),
  ('c0000000-0000-0000-0000-000000000005', null, 'INTRAORAL_SCANNER', 'Intraoral Scanner', true)
on conflict (id) do nothing;

create table public.branch_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  resource_type_id uuid not null
    references public.resource_types(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  serial_number text,
  notes text,
  online_booking_eligible boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint branch_resources_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint branch_resources_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint branch_resources_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint branch_resources_archived_status_check check (
    (status = 'archived') = (archived_at is not null)
  ),
  constraint branch_resources_serial_bounded_check check (
    serial_number is null or pg_catalog.length(serial_number) <= 100
  ),
  constraint branch_resources_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 1000
  ),
  constraint branch_resources_version_positive_check check (version > 0),
  constraint branch_resources_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.branch_resources
from public, anon, authenticated, service_role;

alter table public.branch_resources enable row level security;

create index branch_resources_organization_branch_active_idx
  on public.branch_resources (organization_id, branch_id, status);

create index branch_resources_organization_resource_type_idx
  on public.branch_resources (organization_id, resource_type_id);

create or replace function private.validate_branch_resource_type_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resource_type_organization_id uuid;
  resource_type_is_active boolean;
begin
  select resource_type.organization_id, resource_type.is_active
  into resource_type_organization_id, resource_type_is_active
  from public.resource_types as resource_type
  where resource_type.id = new.resource_type_id
  for share;

  if found
     and resource_type_organization_id is not null
     and resource_type_organization_id <> new.organization_id then
    raise check_violation using
      message = 'branch resource type must be global or belong to the resource organization';
  end if;

  if found and not resource_type_is_active then
    raise check_violation using
      message = 'inactive resource types cannot be assigned to branch resources';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_branch_resource_type_scope()
from public, anon, authenticated, service_role;

create trigger branch_resources_validate_resource_type_scope
before insert or update of organization_id, resource_type_id
on public.branch_resources
for each row execute function private.validate_branch_resource_type_scope();

create trigger branch_resources_set_updated_at
before update on public.branch_resources
for each row execute function private.set_updated_at();

create table public.resource_unavailability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint resource_unavailability_organization_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.branch_resources(organization_id, id) on delete restrict,
  constraint resource_unavailability_interval_check check (ends_at > starts_at),
  constraint resource_unavailability_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  )
);

revoke all on table public.resource_unavailability
from public, anon, authenticated, service_role;

alter table public.resource_unavailability enable row level security;

create index resource_unavailability_organization_resource_interval_idx
  on public.resource_unavailability (organization_id, resource_id, starts_at, ends_at);