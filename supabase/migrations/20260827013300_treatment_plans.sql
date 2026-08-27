-- P16-01: treatment plan schema — tenant-scoped, versioned treatment plans
-- with an immutable PRESENTED/ACKNOWLEDGED state guarded by a database trigger,
-- bounded item/alternative/discussion children, and a renderer-independent
-- per-plan drawing canvas. Every table is RLS-enforced with zero base grants
-- and no browser policies; all reads and writes flow through the P16-02
-- SECURITY DEFINER RPCs. This object migration grants nothing; the trigger
-- function is revoked from every role.

create or replace function private.protect_treatment_plan_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('PRESENTED', 'ACKNOWLEDGED')
     and not (tg_op = 'UPDATE' and old.status = 'PRESENTED' and new.status = 'ACKNOWLEDGED') then
    raise check_violation using
      message = 'presented/acknowledged treatment plans are immutable; create a new version';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_treatment_plan_immutability()
from public, anon, authenticated, service_role;

comment on function private.protect_treatment_plan_immutability() is
  'Rejects UPDATE and DELETE of a PRESENTED/ACKNOWLEDGED treatment plan so revisions must be new plan versions.';

create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  title text not null,
  status text not null default 'DRAFT',
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint treatment_plans_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint treatment_plans_title_bounded_check check (
    pg_catalog.btrim(title) <> ''
    and pg_catalog.length(title) <= 200
  ),
  constraint treatment_plans_status_check check (
    status in ('DRAFT', 'PRESENTED', 'ACKNOWLEDGED')
  ),
  constraint treatment_plans_version_positive_check check (version > 0),
  constraint treatment_plans_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plans
from public, anon, authenticated, service_role;

alter table public.treatment_plans enable row level security;

comment on table public.treatment_plans is
  'Tenant-scoped, versioned treatment plans with an immutable PRESENTED/ACKNOWLEDGED state; no browser policy exists.';

create index treatment_plans_organization_patient_status_idx
  on public.treatment_plans (organization_id, patient_id, status);

create trigger treatment_plans_protect_immutable
before update or delete on public.treatment_plans
for each row execute function private.protect_treatment_plan_immutability();

create trigger treatment_plans_set_updated_at
before update on public.treatment_plans
for each row execute function private.set_updated_at();

create table public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  line_no integer not null,
  procedure_id uuid,
  tooth_code text,
  description text not null,
  estimated_fee numeric,
  created_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_items_organization_plan_fk foreign key (
    organization_id,
    plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_items_organization_procedure_fk foreign key (
    organization_id,
    procedure_id
  ) references public.procedures(organization_id, id) on delete restrict,
  constraint treatment_plan_items_line_no_positive_check check (line_no >= 1),
  constraint treatment_plan_items_tooth_code_check check (
    tooth_code is null
    or tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint treatment_plan_items_description_bounded_check check (
    pg_catalog.btrim(description) <> ''
    and pg_catalog.length(description) <= 2000
  ),
  constraint treatment_plan_items_estimated_fee_check check (
    estimated_fee is null or (estimated_fee >= 0 and estimated_fee <= 999999999)
  ),
  constraint treatment_plan_items_organization_plan_line_key unique (organization_id, plan_id, line_no),
  constraint treatment_plan_items_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plan_items
from public, anon, authenticated, service_role;

alter table public.treatment_plan_items enable row level security;

comment on table public.treatment_plan_items is
  'Bounded line items of a treatment plan with an optional org-scoped procedure link, validated FDI tooth code, and bounded estimated fee; no browser policy exists.';

create index treatment_plan_items_organization_plan_line_idx
  on public.treatment_plan_items (organization_id, plan_id, line_no);

create table public.treatment_plan_alternatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  alternative_no integer not null,
  summary text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_alternatives_organization_plan_fk foreign key (
    organization_id,
    plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_alternatives_alternative_no_positive_check check (alternative_no >= 1),
  constraint treatment_plan_alternatives_summary_bounded_check check (
    pg_catalog.btrim(summary) <> ''
    and pg_catalog.length(summary) <= 2000
  ),
  constraint treatment_plan_alternatives_organization_plan_alternative_key unique (organization_id, plan_id, alternative_no),
  constraint treatment_plan_alternatives_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plan_alternatives
from public, anon, authenticated, service_role;

alter table public.treatment_plan_alternatives enable row level security;

comment on table public.treatment_plan_alternatives is
  'Bounded alternative treatment approaches attached to a plan; no browser policy exists.';

create index treatment_plan_alternatives_organization_plan_alternative_idx
  on public.treatment_plan_alternatives (organization_id, plan_id, alternative_no);

create table public.treatment_plan_discussions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  discussed_by uuid references auth.users(id) on delete set null,
  treating_provider_id uuid,
  discussed_at timestamptz not null,
  context text not null,
  notes text,
  created_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_discussions_organization_plan_fk foreign key (
    organization_id,
    plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_discussions_organization_provider_fk foreign key (
    organization_id,
    treating_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint treatment_plan_discussions_context_bounded_check check (
    pg_catalog.btrim(context) <> ''
    and pg_catalog.length(context) <= 200
  ),
  constraint treatment_plan_discussions_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 4000
  ),
  constraint treatment_plan_discussions_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plan_discussions
from public, anon, authenticated, service_role;

alter table public.treatment_plan_discussions enable row level security;

comment on table public.treatment_plan_discussions is
  'Append-only per-plan discussion history always documenting the provider (treating_provider_id), time (discussed_at), and bounded context; no browser policy exists.';

create index treatment_plan_discussions_organization_plan_discussed_at_idx
  on public.treatment_plan_discussions (organization_id, plan_id, discussed_at);

create table public.treatment_plan_drawings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  drawing jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  constraint treatment_plan_drawings_organization_plan_fk foreign key (
    organization_id,
    plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint treatment_plan_drawings_drawing_object_bounded_check check (
    jsonb_typeof(drawing) = 'object'
    and pg_catalog.pg_column_size(drawing) <= 65536
  ),
  constraint treatment_plan_drawings_version_positive_check check (version > 0),
  constraint treatment_plan_drawings_organization_plan_key unique (organization_id, plan_id),
  constraint treatment_plan_drawings_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plan_drawings
from public, anon, authenticated, service_role;

alter table public.treatment_plan_drawings enable row level security;

comment on table public.treatment_plan_drawings is
  'Renderer-independent bounded drawing canvas (one per plan) versioned in place; it never modifies any original X-ray or image; no browser policy exists.';