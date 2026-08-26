-- P6-03: provider recurring availability and schedule exceptions. Both tables
-- are org-scoped with tenant-safe composite foreign keys; branch references are
-- null-safe. This migration grants nothing and opens no RLS policy; the
-- scheduling RPC boundaries own all reads/writes in later tasks.

create table public.provider_availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  branch_id uuid not null,
  weekday smallint not null,
  starts_at_local time not null,
  ends_at_local time not null,
  valid_from date not null,
  valid_to date,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_availability_rules_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint provider_availability_rules_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint provider_availability_rules_weekday_check check (
    weekday between 0 and 6
  ),
  constraint provider_availability_rules_interval_check check (
    starts_at_local < ends_at_local
  ),
  constraint provider_availability_rules_valid_range_check check (
    valid_to is null or valid_to >= valid_from
  ),
  constraint provider_availability_rules_version_positive_check check (version > 0)
);

comment on column public.provider_availability_rules.weekday is
  'PostgreSQL EXTRACT(DOW): 0 = Sunday, 1 = Monday, ..., 6 = Saturday.';

revoke all on table public.provider_availability_rules
from public, anon, authenticated, service_role;

alter table public.provider_availability_rules enable row level security;

create index provider_availability_rules_org_provider_branch_idx
  on public.provider_availability_rules (organization_id, provider_id, branch_id, active);

create trigger provider_availability_rules_set_updated_at
before update on public.provider_availability_rules
for each row execute function private.set_updated_at();

create table public.provider_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  branch_id uuid,
  exception_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint provider_schedule_exceptions_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint provider_schedule_exceptions_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint provider_schedule_exceptions_type_check check (
    exception_type in ('UNAVAILABLE', 'ADDITIONAL_AVAILABILITY', 'LEAVE')
  ),
  constraint provider_schedule_exceptions_interval_check check (ends_at > starts_at),
  constraint provider_schedule_exceptions_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  )
);

revoke all on table public.provider_schedule_exceptions
from public, anon, authenticated, service_role;

alter table public.provider_schedule_exceptions enable row level security;

create index provider_schedule_exceptions_org_provider_interval_idx
  on public.provider_schedule_exceptions (organization_id, provider_id, starts_at, ends_at);