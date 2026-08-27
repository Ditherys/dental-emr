-- P18-01: recall permission vocabulary, the fixed baseline role matrix, and the
-- recall schema. recall.manage (OWNER/ADMIN/DENTIST) covers rule configuration
-- and recall mutations; recall.read (OWNER/ADMIN/DENTIST/RECEPTIONIST) covers
-- the overdue list and retention analytics. Every table is RLS-enforced with
-- zero base grants and no browser policies; all reads and writes flow through
-- the P18-02 SECURITY DEFINER RPCs. This object migration grants nothing.

insert into public.permissions (code, description)
values
  (
    'recall.manage',
    'Configure recall rules and manage recall tracking, preferences, and reminders.'
  ),
  (
    'recall.read',
    'Read the recall overdue list, recall rules, and retention analytics.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN', 'DENTIST')
  and permission.code in ('recall.manage', 'recall.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('RECEPTIONIST')
  and permission.code = 'recall.read'
on conflict do nothing;

create table public.recall_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid,
  name text not null,
  interval_months integer not null,
  channel text not null default 'NONE',
  is_active boolean not null default true,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint recall_rules_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint recall_rules_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint recall_rules_interval_months_check check (
    interval_months between 1 and 120
  ),
  constraint recall_rules_channel_check check (
    channel in ('EMAIL', 'SMS', 'NONE')
  ),
  constraint recall_rules_version_positive_check check (version > 0),
  constraint recall_rules_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.recall_rules
from public, anon, authenticated, service_role;

alter table public.recall_rules enable row level security;

comment on table public.recall_rules is
  'Tenant recall cadence rules, branch-scoped or clinic-wide; no browser policy exists.';

create index recall_rules_organization_branch_active_idx
  on public.recall_rules (organization_id, branch_id, is_active);

create trigger recall_rules_set_updated_at
before update on public.recall_rules
for each row execute function private.set_updated_at();

create table public.patient_recall_preferences (
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  recall_opt_out boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint patient_recall_preferences_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_recall_preferences_pkey primary key (organization_id, patient_id)
);

revoke all on table public.patient_recall_preferences
from public, anon, authenticated, service_role;

alter table public.patient_recall_preferences enable row level security;

comment on table public.patient_recall_preferences is
  'Per-patient recall opt-out preference (default in); no browser policy exists.';

create trigger patient_recall_preferences_set_updated_at
before update on public.patient_recall_preferences
for each row execute function private.set_updated_at();

create table public.recalls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  recall_rule_id uuid not null,
  due_date timestamptz not null,
  status text not null default 'SCHEDULED',
  reminder_sent_at timestamptz,
  reminders_sent integer not null default 0,
  appointment_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint recalls_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint recalls_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint recalls_organization_rule_fk foreign key (
    organization_id,
    recall_rule_id
  ) references public.recall_rules(organization_id, id) on delete restrict,
  constraint recalls_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint recalls_status_check check (
    status in ('SCHEDULED', 'OVERDUE', 'COMPLETED', 'CANCELLED', 'OPTED_OUT')
  ),
  constraint recalls_reminders_sent_nonnegative_check check (reminders_sent >= 0),
  constraint recalls_reminder_state_check check (
    (reminder_sent_at is not null) = (reminders_sent > 0)
  ),
  constraint recalls_version_positive_check check (version > 0),
  constraint recalls_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.recalls
from public, anon, authenticated, service_role;

alter table public.recalls enable row level security;

comment on table public.recalls is
  'Tenant+branch recall tracking rows with a computed overdue state; no browser policy exists.';

create index recalls_organization_status_due_date_idx
  on public.recalls (organization_id, status, due_date);

create index recalls_organization_patient_status_idx
  on public.recalls (organization_id, patient_id, status);

create trigger recalls_set_updated_at
before update on public.recalls
for each row execute function private.set_updated_at();