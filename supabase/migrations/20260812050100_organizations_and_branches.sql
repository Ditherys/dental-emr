-- P1-05 groups B and C: organization tenant boundaries and dynamic branches.

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

comment on table public.branches is
  'Dynamically addable operational locations within one organization tenant.';

create index branches_organization_status_idx
  on public.branches (organization_id, status);

create trigger branches_set_updated_at
before update on public.branches
for each row execute function private.set_updated_at();

alter table public.branches enable row level security;
