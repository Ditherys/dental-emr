-- Phase 1 secure baseline — file 2 of 8: tenant boundaries, branches, profiles,
-- and current organization membership.
--
-- BASELINE INVARIANT: this file grants nothing. Each table revokes the broad
-- default privileges Supabase attaches to newly created `public` tables from
-- PUBLIC/anon/authenticated in the same statement sequence that creates it, so
-- the boundary after this file is closed at the privilege layer as well as the
-- RLS layer. service_role privileges are intentionally left exactly as the
-- accepted Phase 1 schema leaves them; see ADR-017 for the scope statement.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (btrim(legal_name) <> ''),
  business_name text not null check (btrim(business_name) <> ''),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  status text not null default 'active' check (
    status in ('active', 'inactive', 'suspended', 'archived')
  ),
  country_code text not null default 'PH' check (
    country_code ~ '^[A-Z]{2}$'
  ),
  default_timezone text not null default 'Asia/Manila' check (
    btrim(default_timezone) <> ''
  ),
  default_currency text not null default 'PHP' check (
    default_currency ~ '^[A-Z]{3}$'
  ),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint organizations_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.organizations from public, anon, authenticated;

comment on table public.organizations is
  'SaaS tenant records. Slugs are identifiers, never authorization evidence.';

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

alter table public.organizations enable row level security;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  slug text not null check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  code text not null check (
    code = upper(code)
    and code ~ '^[A-Z0-9][A-Z0-9_-]*$'
  ),
  status text not null default 'active' check (
    status in ('active', 'inactive', 'archived')
  ),
  phone text,
  email text,
  address_line1 text not null check (btrim(address_line1) <> ''),
  address_line2 text,
  city text not null check (btrim(city) <> ''),
  province text not null check (btrim(province) <> ''),
  postal_code text,
  country_code text not null default 'PH' check (
    country_code ~ '^[A-Z]{2}$'
  ),
  timezone text not null default 'Asia/Manila' check (btrim(timezone) <> ''),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(10, 6) check (longitude between -180 and 180),
  website_visible boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint branches_organization_slug_key unique (organization_id, slug),
  constraint branches_organization_code_key unique (organization_id, code),
  constraint branches_organization_id_id_key unique (organization_id, id),
  constraint branches_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.branches from public, anon, authenticated;

comment on table public.branches is
  'Dynamically addable operational locations within one organization tenant.';

create index branches_organization_status_idx
  on public.branches (organization_id, status);

create trigger branches_set_updated_at
before update on public.branches
for each row execute function private.set_updated_at();

alter table public.branches enable row level security;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  mobile text,
  avatar_object_key text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

revoke all on table public.profiles from public, anon, authenticated;

comment on table public.profiles is
  'Application profile data linked one-to-one with Supabase Auth; not a membership record.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  membership_status text not null default 'invited' check (
    membership_status in ('invited', 'active', 'suspended', 'removed')
  ),
  joined_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint organization_members_organization_user_key unique (organization_id, user_id),
  constraint organization_members_organization_id_id_key unique (organization_id, id),
  constraint organization_members_joined_state_check check (
    membership_status not in ('active', 'suspended') or joined_at is not null
  ),
  constraint organization_members_suspended_state_check check (
    (membership_status = 'suspended') = (suspended_at is not null)
  )
);

revoke all on table public.organization_members from public, anon, authenticated;

comment on table public.organization_members is
  'Current user membership in a tenant; authorization must require active status.';

create index organization_members_user_status_idx
  on public.organization_members (user_id, membership_status);

create index organization_members_organization_status_idx
  on public.organization_members (organization_id, membership_status);

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function private.set_updated_at();

alter table public.organization_members enable row level security;
