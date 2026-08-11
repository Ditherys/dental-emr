-- P1-05 groups F and G: tenant-safe branch access and role assignments.

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

comment on function private.enforce_member_role_tenant() is
  'Allows global system roles or custom roles owned by the member organization.';

revoke all on function private.enforce_member_role_tenant() from public;
revoke all on function private.enforce_member_role_tenant() from anon;
revoke all on function private.enforce_member_role_tenant() from authenticated;

create trigger member_roles_enforce_tenant
before insert or update on public.member_roles
for each row execute function private.enforce_member_role_tenant();

alter table public.member_roles enable row level security;
