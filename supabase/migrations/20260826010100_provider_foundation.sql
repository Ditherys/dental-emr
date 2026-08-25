-- P3-02: organization-owned provider profiles, global-or-tenant specialties,
-- tenant-safe associations, and fail-closed configuration read policies.
-- This object migration deliberately grants nothing.

create or replace function private.can_read_provider_configuration(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
     and organization.status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
     and member_role.branch_id is null
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
     and permission.code = 'provider.read'
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
  )
$$;

revoke all on function private.can_read_provider_configuration(uuid)
from public, anon, authenticated, service_role;

comment on function private.can_read_provider_configuration(uuid) is
  'Current-user provider.read check requiring active membership and an organization-wide role.';

create or replace function private.can_manage_provider_configuration(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
     and organization.status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
     and member_role.branch_id is null
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
     and permission.code = 'provider.manage'
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
  )
$$;

revoke all on function private.can_manage_provider_configuration(uuid)
from public, anon, authenticated, service_role;

comment on function private.can_manage_provider_configuration(uuid) is
  'Current-user provider.manage check requiring active membership and an organization-wide role.';

create or replace function private.validate_provider_linked_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_membership_status text;
begin
  if new.linked_user_id is null then
    return new;
  end if;

  select organization_member.membership_status
  into linked_membership_status
  from public.organization_members as organization_member
  where organization_member.organization_id = new.organization_id
    and organization_member.user_id = new.linked_user_id
  for key share;

  -- A missing same-tenant row is left to the named composite FK so callers get
  -- the normal integrity error. A present but inactive row needs this guard.
  if found and linked_membership_status <> 'active' then
    raise check_violation using
      message = 'linked provider user must be an active organization member';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_provider_linked_membership()
from public, anon, authenticated, service_role;

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  linked_user_id uuid,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  professional_title text,
  license_number text,
  contact_phone text,
  contact_email text,
  provider_type text not null,
  status text not null default 'active',
  website_visible boolean not null default false,
  bio text,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint providers_first_name_bounded_check check (
    pg_catalog.btrim(first_name) <> ''
    and pg_catalog.length(first_name) <= 120
  ),
  constraint providers_middle_name_bounded_check check (
    middle_name is null or (
      pg_catalog.btrim(middle_name) <> ''
      and pg_catalog.length(middle_name) <= 120
    )
  ),
  constraint providers_last_name_bounded_check check (
    pg_catalog.btrim(last_name) <> ''
    and pg_catalog.length(last_name) <= 120
  ),
  constraint providers_suffix_bounded_check check (
    suffix is null or (
      pg_catalog.btrim(suffix) <> ''
      and pg_catalog.length(suffix) <= 40
    )
  ),
  constraint providers_professional_title_bounded_check check (
    professional_title is null or (
      pg_catalog.btrim(professional_title) <> ''
      and pg_catalog.length(professional_title) <= 120
    )
  ),
  constraint providers_license_number_bounded_check check (
    license_number is null or (
      pg_catalog.btrim(license_number) <> ''
      and pg_catalog.length(license_number) <= 80
    )
  ),
  constraint providers_contact_phone_bounded_check check (
    contact_phone is null or (
      pg_catalog.btrim(contact_phone) <> ''
      and pg_catalog.length(contact_phone) <= 40
    )
  ),
  constraint providers_contact_email_bounded_check check (
    contact_email is null or (
      pg_catalog.btrim(contact_email) <> ''
      and pg_catalog.length(contact_email) <= 254
    )
  ),
  constraint providers_bio_bounded_check check (
    bio is null or (
      pg_catalog.btrim(bio) <> ''
      and pg_catalog.length(bio) <= 4000
    )
  ),
  constraint providers_type_check check (
    provider_type in (
      'REGULAR',
      'PART_TIME',
      'VISITING',
      'ON_CALL',
      'EXTERNAL_REFERRAL'
    )
  ),
  constraint providers_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint providers_version_positive_check check (version > 0),
  constraint providers_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  ),
  constraint providers_organization_id_id_key unique (organization_id, id),
  constraint providers_organization_linked_user_fk foreign key (
    organization_id,
    linked_user_id
  ) references public.organization_members(organization_id, user_id)
    on delete restrict
);

revoke all on table public.providers
from public, anon, authenticated, service_role;

alter table public.providers enable row level security;

comment on table public.providers is
  'Tenant-owned provider profiles; type and website fields do not imply availability, publication, or authorization.';

create unique index providers_organization_linked_user_key
  on public.providers (organization_id, linked_user_id)
  where linked_user_id is not null;

create index providers_organization_status_name_idx
  on public.providers (organization_id, status, last_name, first_name);

create trigger providers_validate_linked_membership
before insert or update of organization_id, linked_user_id on public.providers
for each row execute function private.validate_provider_linked_membership();

create trigger providers_set_updated_at
before update on public.providers
for each row execute function private.set_updated_at();

create or replace function private.protect_specialty_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is null then
    raise check_violation using message = 'global specialties are immutable';
  end if;

  if tg_op = 'UPDATE'
     and new.organization_id is distinct from old.organization_id then
    raise check_violation using
      message = 'specialty organization scope is immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_specialty_scope()
from public, anon, authenticated, service_role;

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint specialties_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint specialties_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  )
);

revoke all on table public.specialties
from public, anon, authenticated, service_role;

alter table public.specialties enable row level security;

comment on table public.specialties is
  'Global immutable defaults and organization-owned custom provider specialties.';

create unique index specialties_global_code_key
  on public.specialties (code)
  where organization_id is null;

create unique index specialties_organization_code_key
  on public.specialties (organization_id, code)
  where organization_id is not null;

create index specialties_organization_active_name_idx
  on public.specialties (organization_id, is_active, name);

create trigger specialties_protect_scope
before update or delete on public.specialties
for each row execute function private.protect_specialty_scope();

create trigger specialties_set_updated_at
before update on public.specialties
for each row execute function private.set_updated_at();

insert into public.specialties (id, organization_id, code, name)
values
  ('b3000000-0000-0000-0000-000000000001', null, 'GENERAL_DENTISTRY', 'General Dentistry'),
  ('b3000000-0000-0000-0000-000000000002', null, 'ORTHODONTICS', 'Orthodontics'),
  ('b3000000-0000-0000-0000-000000000003', null, 'PERIODONTICS', 'Periodontics'),
  ('b3000000-0000-0000-0000-000000000004', null, 'PROSTHODONTICS', 'Prosthodontics'),
  ('b3000000-0000-0000-0000-000000000005', null, 'ENDODONTICS', 'Endodontics'),
  ('b3000000-0000-0000-0000-000000000006', null, 'ORAL_SURGERY', 'Oral Surgery'),
  ('b3000000-0000-0000-0000-000000000007', null, 'PEDIATRIC_DENTISTRY', 'Pediatric Dentistry')
on conflict (id) do nothing;

create table public.provider_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  branch_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_branches_organization_provider_branch_key unique (
    organization_id,
    provider_id,
    branch_id
  ),
  constraint provider_branches_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint provider_branches_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict
);

revoke all on table public.provider_branches
from public, anon, authenticated, service_role;

alter table public.provider_branches enable row level security;

comment on table public.provider_branches is
  'Tenant-safe provider-to-branch classification; it does not represent availability.';

create index provider_branches_organization_provider_active_idx
  on public.provider_branches (organization_id, provider_id, is_active);

create index provider_branches_organization_branch_active_idx
  on public.provider_branches (organization_id, branch_id, is_active);

create trigger provider_branches_set_updated_at
before update on public.provider_branches
for each row execute function private.set_updated_at();

create or replace function private.validate_provider_specialty_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  specialty_organization_id uuid;
begin
  select specialty.organization_id
  into specialty_organization_id
  from public.specialties as specialty
  where specialty.id = new.specialty_id
  for key share;

  -- Unknown specialty IDs remain the responsibility of the normal FK. A known
  -- custom specialty must belong to the provider's direct organization.
  if found
     and specialty_organization_id is not null
     and specialty_organization_id <> new.organization_id then
    raise foreign_key_violation using
      message = 'provider specialty must be global or belong to the provider organization';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_provider_specialty_scope()
from public, anon, authenticated, service_role;

create table public.provider_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  specialty_id uuid not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_specialties_primary_active_check check (
    not is_primary or is_active
  ),
  constraint provider_specialties_organization_provider_specialty_key unique (
    organization_id,
    provider_id,
    specialty_id
  ),
  constraint provider_specialties_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint provider_specialties_specialty_fk foreign key (
    specialty_id
  ) references public.specialties(id) on delete restrict
);

revoke all on table public.provider_specialties
from public, anon, authenticated, service_role;

alter table public.provider_specialties enable row level security;

comment on table public.provider_specialties is
  'Tenant-safe provider specialty assignments with at most one primary relation.';

create unique index provider_specialties_one_primary_key
  on public.provider_specialties (organization_id, provider_id)
  where is_primary;

create index provider_specialties_organization_provider_active_idx
  on public.provider_specialties (organization_id, provider_id, is_active);

create index provider_specialties_specialty_idx
  on public.provider_specialties (specialty_id);

create trigger provider_specialties_validate_scope
before insert or update of organization_id, specialty_id
on public.provider_specialties
for each row execute function private.validate_provider_specialty_scope();

create trigger provider_specialties_set_updated_at
before update on public.provider_specialties
for each row execute function private.set_updated_at();

create policy providers_select_authorized_configuration
on public.providers
for select
to authenticated
using ((select private.can_read_provider_configuration(organization_id)));

create policy specialties_select_authorized_configuration
on public.specialties
for select
to authenticated
using (
  (
    organization_id is not null
    and (select private.can_read_provider_configuration(organization_id))
  )
  or (
    organization_id is null
    and exists (
      select 1
      from public.organization_members as current_membership
      where current_membership.user_id = (select auth.uid())
        and (select private.can_read_provider_configuration(
          current_membership.organization_id
        ))
    )
  )
);

create policy provider_branches_select_authorized_configuration
on public.provider_branches
for select
to authenticated
using ((select private.can_read_provider_configuration(organization_id)));

create policy provider_specialties_select_authorized_configuration
on public.provider_specialties
for select
to authenticated
using ((select private.can_read_provider_configuration(organization_id)));
