-- Phase 1 secure baseline — file 3 of 8: RBAC catalog, branch access, and role
-- assignments, including the conservative Phase 1 system-role seed.
--
-- BASELINE INVARIANT: this file grants nothing.

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

revoke all on table public.roles from public, anon, authenticated;

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

revoke all on function private.prevent_role_scope_change() from public;
revoke all on function private.prevent_role_scope_change() from anon;
revoke all on function private.prevent_role_scope_change() from authenticated;

comment on function private.prevent_role_scope_change() is
  'Prevents an existing role from being moved between system and tenant scope.';

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

revoke all on table public.permissions from public, anon, authenticated;

comment on table public.permissions is
  'Stable permission catalog used by server authorization and RLS helpers.';

alter table public.permissions enable row level security;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

revoke all on table public.role_permissions from public, anon, authenticated;

comment on table public.role_permissions is
  'Permission grants attached to roles; grants do not replace contextual checks.';

alter table public.role_permissions enable row level security;

create table public.branch_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  organization_member_id uuid not null,
  access_status text not null default 'active' check (
    access_status in ('active', 'suspended', 'revoked')
  ),
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint branch_memberships_branch_member_key unique (
    branch_id,
    organization_member_id
  ),
  constraint branch_memberships_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches (organization_id, id) on delete restrict,
  constraint branch_memberships_organization_member_fk foreign key (
    organization_id,
    organization_member_id
  ) references public.organization_members (organization_id, id) on delete restrict,
  constraint branch_memberships_revoked_state_check check (
    (access_status = 'revoked') = (revoked_at is not null)
  )
);

revoke all on table public.branch_memberships from public, anon, authenticated;

comment on table public.branch_memberships is
  'Explicit branch access; composite FKs prevent cross-tenant assignments.';

create index branch_memberships_member_branch_idx
  on public.branch_memberships (organization_member_id, branch_id);

create trigger branch_memberships_set_updated_at
before update on public.branch_memberships
for each row execute function private.set_updated_at();

alter table public.branch_memberships enable row level security;

create table public.member_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_member_id uuid not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  branch_id uuid,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default statement_timestamp(),
  constraint member_roles_assignment_key unique nulls not distinct (
    organization_member_id,
    role_id,
    branch_id
  ),
  constraint member_roles_organization_member_fk foreign key (
    organization_id,
    organization_member_id
  ) references public.organization_members (organization_id, id) on delete restrict,
  constraint member_roles_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches (organization_id, id) on delete restrict,
  constraint member_roles_branch_membership_fk foreign key (
    branch_id,
    organization_member_id
  ) references public.branch_memberships (branch_id, organization_member_id) on delete restrict
);

revoke all on table public.member_roles from public, anon, authenticated;

comment on table public.member_roles is
  'Organization-wide or branch-scoped role assignments with tenant consistency.';

create index member_roles_organization_member_idx
  on public.member_roles (organization_member_id);

create index member_roles_role_idx
  on public.member_roles (role_id);

create or replace function private.enforce_member_role_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role_organization_id uuid;
begin
  select roles.organization_id
  into role_organization_id
  from public.roles
  where roles.id = new.role_id;

  if not found then
    raise foreign_key_violation using
      message = 'member role references an unknown role';
  end if;

  if role_organization_id is not null
     and role_organization_id <> new.organization_id then
    raise foreign_key_violation using
      message = 'custom role and organization member must belong to the same organization';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_member_role_tenant() from public;
revoke all on function private.enforce_member_role_tenant() from anon;
revoke all on function private.enforce_member_role_tenant() from authenticated;

comment on function private.enforce_member_role_tenant() is
  'Allows global system roles or custom roles owned by the member organization.';

create trigger member_roles_enforce_tenant
before insert or update on public.member_roles
for each row execute function private.enforce_member_role_tenant();

alter table public.member_roles enable row level security;

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
-- contextual authorization. No clinical permission catalog exists in Phase 1.
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
