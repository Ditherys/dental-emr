-- P1-05 group F: conservative foundation RBAC catalog.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null check (
    code = upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  name text not null check (btrim(name) <> ''),
  is_system boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint roles_system_scope_check check (
    is_system = (organization_id is null)
  )
);

comment on table public.roles is
  'Global system roles and future organization-owned custom roles.';

create unique index roles_system_code_key
  on public.roles (code)
  where organization_id is null;

create unique index roles_organization_code_key
  on public.roles (organization_id, code)
  where organization_id is not null;

create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

create or replace function private.prevent_role_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.is_system is distinct from old.is_system then
    raise exception 'role scope is immutable';
  end if;

  return new;
end;
$$;

comment on function private.prevent_role_scope_change() is
  'Prevents an existing role from being moved between system and tenant scope.';

revoke all on function private.prevent_role_scope_change() from public;
revoke all on function private.prevent_role_scope_change() from anon;
revoke all on function private.prevent_role_scope_change() from authenticated;

create trigger roles_prevent_scope_change
before update on public.roles
for each row execute function private.prevent_role_scope_change();

alter table public.roles enable row level security;

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (
    code = lower(code)
    and code ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'
  ),
  description text not null check (btrim(description) <> ''),
  created_at timestamptz not null default statement_timestamp()
);

comment on table public.permissions is
  'Stable permission catalog used by server authorization and RLS helpers.';

alter table public.permissions enable row level security;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is
  'Permission grants attached to roles; grants do not replace contextual checks.';

alter table public.role_permissions enable row level security;

insert into public.roles (code, name, is_system)
values
  ('OWNER', 'Owner', true),
  ('ADMIN', 'Administrator', true),
  ('DENTIST', 'Dentist', true),
  ('RECEPTIONIST', 'Receptionist', true),
  ('DENTAL_ASSISTANT', 'Dental Assistant', true),
  ('VISITING_SPECIALIST', 'Visiting Specialist', true),
  ('BILLING', 'Billing', true)
on conflict (code) where organization_id is null do nothing;

insert into public.permissions (code, description)
values
  ('organization.read', 'View the current organization configuration.'),
  ('organization.manage', 'Manage organization-level configuration.'),
  ('branch.read', 'View authorized branch configuration.'),
  ('branch.manage', 'Create and manage authorized branches.'),
  ('user.invite', 'Invite workforce users into the organization.'),
  ('user.manage', 'Manage workforce membership status.'),
  ('role.manage', 'Assign and manage roles within the organization.'),
  ('security.manage', 'Manage high-impact organization security settings.'),
  ('audit.read', 'Read authorized organization audit events.')
on conflict (code) do nothing;

-- Owner remains administrative, not implicitly clinical.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
cross join public.permissions
where roles.code = 'OWNER'
  and roles.organization_id is null
  and permissions.code in (
    'organization.read',
    'organization.manage',
    'branch.read',
    'branch.manage',
    'user.invite',
    'user.manage',
    'role.manage',
    'security.manage',
    'audit.read'
  )
on conflict do nothing;

-- Administrator grants are intentionally narrower than owner/security control.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
cross join public.permissions
where roles.code = 'ADMIN'
  and roles.organization_id is null
  and permissions.code in (
    'organization.read',
    'branch.read',
    'branch.manage',
    'user.invite',
    'user.manage',
    'audit.read'
  )
on conflict do nothing;

-- Operational roles only receive the foundation visibility needed for later
-- contextual authorization. No clinical permission catalog exists in P1-05.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
cross join public.permissions
where roles.code in (
    'DENTIST',
    'RECEPTIONIST',
    'DENTAL_ASSISTANT',
    'VISITING_SPECIALIST',
    'BILLING'
  )
  and roles.organization_id is null
  and permissions.code in ('organization.read', 'branch.read')
on conflict do nothing;
