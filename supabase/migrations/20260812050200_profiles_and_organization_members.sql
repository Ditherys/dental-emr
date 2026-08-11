-- P1-05 groups D and E: application profiles and current tenant membership.

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
