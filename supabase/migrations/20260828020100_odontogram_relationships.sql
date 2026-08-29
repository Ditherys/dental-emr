-- P15-05 / O3: bridge and implant relationships. The Phase 15 odontogram
-- has no relational prosthetic state; the fork persists bridges and
-- implants only as renderer status JSON. O3 introduces five
-- append-oriented, versioned, sealed bridge/implant tables plus an
-- append-only legacy resolution table so bridges and implants
-- survive reload as clinical relationships, not icons.
--
-- Architecture:
--
--   * `dental_bridges` carries record_kind ∈ {PLAN_DESIGN, CURRENT}.
--     A PLAN_DESIGN is editable while its parent plan is DRAFT; it is
--     frozen when the plan transitions to PRESENTED/ACKNOWLEDGED. A
--     CURRENT row is a separate sealed materialization that links to
--     the treating provider, execution time, and the charge that
--     completed it; amendment creates a new CURRENT row that
--     supersedes the predecessor, never mutates it.
--   * `dental_bridge_units` carries the ordered units of a bridge.
--     PONTIC requires support_kind=NONE; ABUTMENT requires
--     NATURAL_TOOTH or IMPLANT_COMPONENT support. A sealed CURRENT
--     bridge rejects any unit INSERT/UPDATE/DELETE; amendment is
--     done by creating a new bridge and a new set of units.
--   * `dental_implant_components` carries the FIXTURE → ABUTMENT →
--     CROWN/ATTACHMENT chain as a dependency-linked graph. PLAN_DESIGN
--     components depend on a previous PLAN_DESIGN or CURRENT
--     component; CURRENT components depend on a previous CURRENT
--     component. A pre-existing external implant with unknown fixture
--     history is recorded as a CURRENT FIXTURE with provenance
--     PREEXISTING_EXTERNAL and depends_on_component_id=NULL, not as a
--     missing dependency.
--   * `dental_bridge_voids` and `dental_implant_component_voids` are
--     append-only void events. A void is never a destructive update.
--   * `odontogram_legacy_resolutions` is the append-only link between
--     an ambiguous LEGACY_PHASE15 row and a canonical clinical entry,
--     bridge, or treatment-plan item; or an explicit NO_CURRENT_STATE
--     record. Exactly one of the three nullable FK columns is set
--     per resolution kind.
--
-- All new tables are RLS-enabled with zero policies; no browser
-- grant is added in this file. O5 RPCs will own all writes.

-- ============================================================================
-- dental_bridges
-- ============================================================================

create table if not exists public.dental_bridges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  record_kind text not null,
  parent_plan_id uuid,
  parent_plan_item_id uuid,
  design_snapshot jsonb,
  support_kind text,
  prosthesis_value text,
  provenance text,
  treating_provider_id uuid,
  executed_at timestamptz,
  charge_id uuid,
  supersedes_bridge_id uuid
    references public.dental_bridges(id) on delete restrict,
  sealed_at timestamptz,
  voided_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint dental_bridges_organization_patient_fk foreign key (
    organization_id, patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint dental_bridges_organization_parent_plan_fk foreign key (
    organization_id, parent_plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint dental_bridges_organization_parent_plan_item_fk foreign key (
    organization_id, parent_plan_item_id
  ) references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint dental_bridges_organization_provider_fk foreign key (
    organization_id, treating_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint dental_bridges_organization_charge_fk foreign key (
    organization_id, charge_id
  ) references public.charges(organization_id, id) on delete restrict,
  constraint dental_bridges_organization_id_id_key unique (organization_id, id),
  constraint dental_bridges_record_kind_check check (
    record_kind in ('PLAN_DESIGN', 'CURRENT')
  ),
  constraint dental_bridges_support_kind_check check (
    support_kind is null
    or support_kind in ('NATURAL_TOOTH', 'IMPLANT_COMPONENT', 'MIXED')
  ),
  constraint dental_bridges_prosthesis_value_check check (
    prosthesis_value is null
    or prosthesis_value in (
      'healing-abutment', 'locator', 'locator-denture',
      'bar', 'bar-denture', 'removable-partial', 'removable-full'
    )
  ),
  constraint dental_bridges_provenance_check check (
    provenance is null
    or provenance in ('INTERNAL', 'PREEXISTING_EXTERNAL')
  ),
  constraint dental_bridges_version_positive_check check (version > 0),
  constraint dental_bridges_supersedes_self_check check (
    supersedes_bridge_id is null or supersedes_bridge_id <> id
  ),
  constraint dental_bridges_record_kind_columns_check check (
    (record_kind = 'PLAN_DESIGN' and parent_plan_id is not null
      and treating_provider_id is null
      and executed_at is null
      and charge_id is null
      and sealed_at is null
      and supersedes_bridge_id is null
      and provenance is null
      and design_snapshot is null)
    or
    (record_kind = 'CURRENT' and parent_plan_id is null
      and parent_plan_item_id is null
      and design_snapshot is null
      and (
        (provenance = 'PREEXISTING_EXTERNAL'
          and treating_provider_id is null
          and executed_at is null)
        or
        (provenance is null
          and treating_provider_id is not null
          and executed_at is not null)
      )
      and (charge_id is not null or provenance = 'PREEXISTING_EXTERNAL'))
  )
);

revoke all on table public.dental_bridges
from public, anon, authenticated, service_role;

alter table public.dental_bridges enable row level security;

comment on table public.dental_bridges is
  'A dental bridge relationship in one of two record kinds: PLAN_DESIGN (a draft attached to a DRAFT treatment plan, mutable in place) or CURRENT (a sealed materialization that links a treating provider, execution time, and the charge that completed it). Plan designs and current relationships are never mixed in the same row; amendment is a separate successor CURRENT row that supersedes the predecessor; void is a separate append-only event.';

create index if not exists dental_bridges_organization_patient_record_kind_idx
  on public.dental_bridges (organization_id, patient_id, record_kind);

create index if not exists dental_bridges_organization_parent_plan_idx
  on public.dental_bridges (organization_id, parent_plan_id)
  where parent_plan_id is not null;

create index if not exists dental_bridges_organization_supersedes_idx
  on public.dental_bridges (organization_id, supersedes_bridge_id)
  where supersedes_bridge_id is not null;

create index if not exists dental_bridges_organization_patient_sealed_idx
  on public.dental_bridges (organization_id, patient_id, sealed_at)
  where sealed_at is not null;

create trigger dental_bridges_set_updated_at
before update on public.dental_bridges
for each row execute function private.set_updated_at();

-- ============================================================================
-- dental_bridge_units
-- ============================================================================

create table if not exists public.dental_bridge_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  bridge_id uuid not null,
  tooth_fdi text not null,
  ordinal smallint not null,
  role text not null,
  support_kind text not null,
  support_component_id uuid,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint dental_bridge_units_organization_bridge_fk foreign key (
    organization_id, bridge_id
  ) references public.dental_bridges(organization_id, id) on delete restrict,
  constraint dental_bridge_units_organization_id_id_key
    unique (organization_id, id),
  constraint dental_bridge_units_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint dental_bridge_units_ordinal_positive_check check (ordinal > 0),
  constraint dental_bridge_units_role_check check (
    role in ('ABUTMENT', 'PONTIC')
  ),
  constraint dental_bridge_units_support_kind_check check (
    support_kind in ('NATURAL_TOOTH', 'IMPLANT_COMPONENT', 'NONE')
  ),
  constraint dental_bridge_units_unique_tooth unique (bridge_id, tooth_fdi),
  constraint dental_bridge_units_unique_ordinal unique (bridge_id, ordinal),
  constraint dental_bridge_units_role_support_check check (
    (role = 'ABUTMENT'
      and support_kind in ('NATURAL_TOOTH', 'IMPLANT_COMPONENT')
      and (support_kind = 'IMPLANT_COMPONENT') = (support_component_id is not null))
    or
    (role = 'PONTIC'
      and support_kind = 'NONE'
      and support_component_id is null)
  )
);

revoke all on table public.dental_bridge_units
from public, anon, authenticated, service_role;

alter table public.dental_bridge_units enable row level security;

comment on table public.dental_bridge_units is
  'An ordered unit of a dental bridge (an abutment or a pontic). A PONTIC must have support_kind=NONE and no support_component; an ABUTMENT must have natural or implant support, and an implant-supported abutment must reference an implant component. The natural/implant/mixed support mode of a bridge is derived from its units.';

create index if not exists dental_bridge_units_organization_bridge_ordinal_idx
  on public.dental_bridge_units (organization_id, bridge_id, ordinal);

create index if not exists dental_bridge_units_organization_component_idx
  on public.dental_bridge_units (organization_id, support_component_id)
  where support_component_id is not null;

-- ============================================================================
-- dental_implant_components
-- ============================================================================

create table if not exists public.dental_implant_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  tooth_fdi text not null,
  ordinal smallint not null,
  component_kind text not null,
  attachment_value text,
  depends_on_component_id uuid,
  record_kind text not null,
  parent_plan_id uuid,
  parent_plan_item_id uuid,
  design_snapshot jsonb,
  provenance text,
  treating_provider_id uuid,
  executed_at timestamptz,
  charge_id uuid,
  supersedes_component_id uuid
    references public.dental_implant_components(id) on delete restrict,
  sealed_at timestamptz,
  voided_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint dental_implant_components_organization_patient_fk foreign key (
    organization_id, patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_parent_plan_fk foreign key (
    organization_id, parent_plan_id
  ) references public.treatment_plans(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_parent_plan_item_fk foreign key (
    organization_id, parent_plan_item_id
  ) references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_depends_on_fk foreign key (
    organization_id, depends_on_component_id
  ) references public.dental_implant_components(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_provider_fk foreign key (
    organization_id, treating_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_charge_fk foreign key (
    organization_id, charge_id
  ) references public.charges(organization_id, id) on delete restrict,
  constraint dental_implant_components_organization_id_id_key
    unique (organization_id, id),
  constraint dental_implant_components_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint dental_implant_components_ordinal_positive_check check (ordinal > 0),
  constraint dental_implant_components_component_kind_check check (
    component_kind in ('FIXTURE', 'ABUTMENT', 'CROWN', 'ATTACHMENT')
  ),
  constraint dental_implant_components_attachment_value_check check (
    attachment_value is null
    or attachment_value in ('locator', 'bar')
  ),
  constraint dental_implant_components_record_kind_check check (
    record_kind in ('PLAN_DESIGN', 'CURRENT')
  ),
  constraint dental_implant_components_provenance_check check (
    provenance is null
    or provenance in ('INTERNAL', 'PREEXISTING_EXTERNAL')
  ),
  constraint dental_implant_components_version_positive_check check (version > 0),
  constraint dental_implant_components_depends_on_self_check check (
    depends_on_component_id is null or depends_on_component_id <> id
  ),
  constraint dental_implant_components_supersedes_self_check check (
    supersedes_component_id is null or supersedes_component_id <> id
  ),
  constraint dental_implant_components_record_kind_columns_check check (
    (record_kind = 'PLAN_DESIGN' and parent_plan_id is not null
      and treating_provider_id is null
      and executed_at is null
      and charge_id is null
      and sealed_at is null
      and supersedes_component_id is null
      and provenance is null
      and design_snapshot is null)
    or
    (record_kind = 'CURRENT' and parent_plan_id is null
      and parent_plan_item_id is null
      and design_snapshot is null
      and (
        (provenance = 'PREEXISTING_EXTERNAL'
          and treating_provider_id is null
          and executed_at is null)
        or
        (provenance is null
          and treating_provider_id is not null
          and executed_at is not null)
      )
      and (charge_id is not null or provenance = 'PREEXISTING_EXTERNAL'))
  ),
  constraint dental_implant_components_attachment_value_required check (
    (component_kind = 'ATTACHMENT') = (attachment_value is not null)
  ),
  constraint dental_implant_components_dependency_kind_check check (
    (component_kind = 'FIXTURE' and depends_on_component_id is null
      and (provenance = 'PREEXISTING_EXTERNAL' or parent_plan_id is not null))
    or
    (component_kind = 'ABUTMENT' and depends_on_component_id is not null)
    or
    (component_kind = 'CROWN' and depends_on_component_id is not null)
    or
    (component_kind = 'ATTACHMENT' and depends_on_component_id is not null)
  )
);

revoke all on table public.dental_implant_components
from public, anon, authenticated, service_role;

alter table public.dental_implant_components enable row level security;

comment on table public.dental_implant_components is
  'A single implant component (FIXTURE, ABUTMENT, CROWN, or ATTACHMENT) at a patient/tooth position. The FIXTURE is the chain root; ABUTMENT, CROWN, and ATTACHMENT reference a depends_on_component_id. A pre-existing external implant with unknown fixture history is recorded as a CURRENT FIXTURE with provenance=PREEXISTING_EXTERNAL and depends_on_component_id=NULL. PLAN_DESIGN components depend on a previous PLAN_DESIGN or CURRENT component in the same design; CURRENT components depend on a previous CURRENT component. Amendment is a separate successor CURRENT row that supersedes the predecessor; void is a separate append-only event.';

create index if not exists dental_implant_components_organization_patient_record_kind_idx
  on public.dental_implant_components (organization_id, patient_id, record_kind);

create index if not exists dental_implant_components_organization_depends_on_idx
  on public.dental_implant_components (organization_id, depends_on_component_id)
  where depends_on_component_id is not null;

create index if not exists dental_implant_components_organization_parent_plan_idx
  on public.dental_implant_components (organization_id, parent_plan_id)
  where parent_plan_id is not null;

create index if not exists dental_implant_components_organization_supersedes_idx
  on public.dental_implant_components (organization_id, supersedes_component_id)
  where supersedes_component_id is not null;

create index if not exists dental_implant_components_organization_patient_tooth_current_idx
  on public.dental_implant_components (organization_id, patient_id, tooth_fdi)
  where record_kind = 'CURRENT' and voided_at is null;

create trigger dental_implant_components_set_updated_at
before update on public.dental_implant_components
for each row execute function private.set_updated_at();

-- ============================================================================
-- dental_bridge_voids (append-only)
-- ============================================================================

create table if not exists public.dental_bridge_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  bridge_id uuid not null
    references public.dental_bridges(id) on delete restrict,
  reason text,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz not null default statement_timestamp(),
  constraint dental_bridge_voids_organization_bridge_fk foreign key (
    organization_id, bridge_id
  ) references public.dental_bridges(organization_id, id) on delete restrict,
  constraint dental_bridge_voids_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  ),
  constraint dental_bridge_voids_organization_id_id_key
    unique (organization_id, id)
);

revoke all on table public.dental_bridge_voids
from public, anon, authenticated, service_role;

alter table public.dental_bridge_voids enable row level security;

comment on table public.dental_bridge_voids is
  'Append-only void events for a dental bridge. The bridge row is preserved with voided_at set; a void is never a destructive update.';

create index if not exists dental_bridge_voids_organization_bridge_idx
  on public.dental_bridge_voids (organization_id, bridge_id);

-- ============================================================================
-- dental_implant_component_voids (append-only)
-- ============================================================================

create table if not exists public.dental_implant_component_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  component_id uuid not null
    references public.dental_implant_components(id) on delete restrict,
  reason text,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz not null default statement_timestamp(),
  constraint dental_implant_component_voids_organization_component_fk
    foreign key (organization_id, component_id)
    references public.dental_implant_components(organization_id, id) on delete restrict,
  constraint dental_implant_component_voids_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  ),
  constraint dental_implant_component_voids_organization_id_id_key
    unique (organization_id, id)
);

revoke all on table public.dental_implant_component_voids
from public, anon, authenticated, service_role;

alter table public.dental_implant_component_voids enable row level security;

comment on table public.dental_implant_component_voids is
  'Append-only void events for an implant component. The component row is preserved with voided_at set; a void is never a destructive update.';

create index if not exists dental_implant_component_voids_organization_component_idx
  on public.dental_implant_component_voids (organization_id, component_id);

-- ============================================================================
-- odontogram_legacy_resolutions (append-only)
-- ============================================================================

create table if not exists public.odontogram_legacy_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  legacy_entry_id uuid not null,
  resolution_kind text not null,
  resolved_clinical_entry_id uuid,
  resolved_bridge_id uuid,
  resolved_treatment_plan_item_id uuid,
  reason text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz not null default statement_timestamp(),
  constraint odontogram_legacy_resolutions_organization_entry_fk foreign key (
    organization_id, legacy_entry_id
  ) references public.tooth_clinical_entries(organization_id, id) on delete restrict,
  constraint odontogram_legacy_resolutions_organization_clinical_entry_fk foreign key (
    organization_id, resolved_clinical_entry_id
  ) references public.tooth_clinical_entries(organization_id, id) on delete restrict,
  constraint odontogram_legacy_resolutions_organization_bridge_fk foreign key (
    organization_id, resolved_bridge_id
  ) references public.dental_bridges(organization_id, id) on delete restrict,
  constraint odontogram_legacy_resolutions_organization_plan_item_fk foreign key (
    organization_id, resolved_treatment_plan_item_id
  ) references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint odontogram_legacy_resolutions_kind_check check (
    resolution_kind in ('LINK_CANONICAL', 'NO_CURRENT_STATE')
  ),
  constraint odontogram_legacy_resolutions_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  ),
  constraint odontogram_legacy_resolutions_exact_target_check check (
    (resolution_kind = 'LINK_CANONICAL' and resolved_clinical_entry_id is not null
      and resolved_bridge_id is null
      and resolved_treatment_plan_item_id is null)
    or
    (resolution_kind = 'NO_CURRENT_STATE' and resolved_clinical_entry_id is null
      and resolved_bridge_id is null
      and resolved_treatment_plan_item_id is null)
  ),
  constraint odontogram_legacy_resolutions_organization_legacy_key
    unique (organization_id, legacy_entry_id)
);

revoke all on table public.odontogram_legacy_resolutions
from public, anon, authenticated, service_role;

alter table public.odontogram_legacy_resolutions enable row level security;

comment on table public.odontogram_legacy_resolutions is
  'Append-only link between a LEGACY_PHASE15 row and a canonical entry, bridge, or treatment-plan item; or an explicit NO_CURRENT_STATE record. A LEGACY_PHASE15 row has at most one resolution per organization; the resolution is unique by legacy entry.';

create index if not exists odontogram_legacy_resolutions_organization_legacy_idx
  on public.odontogram_legacy_resolutions (organization_id, legacy_entry_id);

create index if not exists odontogram_legacy_resolutions_organization_clinical_entry_idx
  on public.odontogram_legacy_resolutions (organization_id, resolved_clinical_entry_id)
  where resolved_clinical_entry_id is not null;

create index if not exists odontogram_legacy_resolutions_organization_bridge_idx
  on public.odontogram_legacy_resolutions (organization_id, resolved_bridge_id)
  where resolved_bridge_id is not null;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Reject unit INSERT/UPDATE/DELETE on a sealed CURRENT bridge. A sealed
-- bridge exposes its units as immutable; amendment is done by
-- creating a new bridge row plus a new set of units. The trigger
-- fires BEFORE the row change so the row never lands. A PLAN_DESIGN
-- bridge is unaffected: a draft may be edited until the parent plan
-- transitions to PRESENTED/ACKNOWLEDGED, which is enforced by the
-- separate frozen-plan trigger below.
create or replace function private.deny_sealed_bridge_unit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sealed_at timestamptz;
  v_record_kind text;
begin
  select bridge.sealed_at, bridge.record_kind
    into v_sealed_at, v_record_kind
    from public.dental_bridges as bridge
    where bridge.organization_id =
        (case tg_op
          when 'DELETE' then old.organization_id
          else new.organization_id
        end)
      and bridge.id = (case tg_op
        when 'DELETE' then old.bridge_id
        else new.bridge_id
      end);

  if v_sealed_at is not null and v_record_kind = 'CURRENT' then
    raise exception 'dental_bridge_units are immutable on a sealed CURRENT bridge; amendment is a successor';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.deny_sealed_bridge_unit_mutation()
from public, anon, authenticated, service_role;

comment on function private.deny_sealed_bridge_unit_mutation() is
  'Rejects INSERT/UPDATE/DELETE on dental_bridge_units when the parent bridge is sealed CURRENT. Amendment is a successor bridge.';

create trigger dental_bridge_units_sealed_check
before insert or update or delete on public.dental_bridge_units
for each row execute function private.deny_sealed_bridge_unit_mutation();

-- Reject unit mutation when the parent plan is not DRAFT. A
-- PLAN_DESIGN bridge whose parent plan is PRESENTED/ACKNOWLEDGED
-- is frozen, just like its units.
create or replace function private.deny_frozen_plan_bridge_unit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan_status text;
begin
  select plan.status into v_plan_status
    from public.dental_bridges as bridge
    join public.treatment_plans as plan
      on plan.organization_id = bridge.organization_id
     and plan.id = bridge.parent_plan_id
    where bridge.organization_id =
        (case tg_op
          when 'DELETE' then old.organization_id
          else new.organization_id
        end)
      and bridge.id = (case tg_op
        when 'DELETE' then old.bridge_id
        else new.bridge_id
      end);

  if v_plan_status is not null and v_plan_status in ('PRESENTED', 'ACKNOWLEDGED') then
    raise exception 'dental_bridge_units are frozen when the parent plan is PRESENTED/ACKNOWLEDGED; create a new bridge';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.deny_frozen_plan_bridge_unit_mutation()
from public, anon, authenticated, service_role;

comment on function private.deny_frozen_plan_bridge_unit_mutation() is
  'Rejects INSERT/UPDATE/DELETE on dental_bridge_units when the parent plan is PRESENTED/ACKNOWLEDGED. A plan design frozen with the plan cannot have units added, edited, or removed.';

create trigger dental_bridge_units_frozen_plan_check
before insert or update or delete on public.dental_bridge_units
for each row execute function private.deny_frozen_plan_bridge_unit_mutation();

-- Reject UPDATE/DELETE on a sealed CURRENT bridge. A sealed bridge
-- is the latest nonvoid successor; amendment creates a successor and
-- void creates an event. The exception is the structural edit of
-- sealed_at itself, which is rejected because sealed_at is set
-- exactly once during creation.
create or replace function private.deny_sealed_bridge_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sealed_at is not null and old.record_kind = 'CURRENT' then
    raise exception 'sealed CURRENT bridges are immutable; amendment is a successor bridge and void is an event';
  end if;
  if old.voided_at is not null then
    raise exception 'voided bridges are immutable; void is an append-only event';
  end if;
  return new;
end
$$;

revoke all on function private.deny_sealed_bridge_mutation()
from public, anon, authenticated, service_role;

comment on function private.deny_sealed_bridge_mutation() is
  'Rejects UPDATE on a sealed or voided dental_bridges row. Amendment is a successor; void is an event.';

create trigger dental_bridges_sealed_check
before update on public.dental_bridges
for each row execute function private.deny_sealed_bridge_mutation();

-- Reject UPDATE on a parent plan of a PLAN_DESIGN bridge when the
-- plan transitions to PRESENTED/ACKNOWLEDGED. The plan already
-- rejects its own mutation in that state; this is a defensive
-- companion that also fires when a unit or component row tries to
-- point at the new frozen plan.
create or replace function private.deny_sealed_implant_component_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sealed_at is not null and old.record_kind = 'CURRENT' then
    raise exception 'sealed CURRENT implant components are immutable; amendment is a successor and void is an event';
  end if;
  if old.voided_at is not null then
    raise exception 'voided implant components are immutable; void is an append-only event';
  end if;
  return new;
end
$$;

revoke all on function private.deny_sealed_implant_component_mutation()
from public, anon, authenticated, service_role;

comment on function private.deny_sealed_implant_component_mutation() is
  'Rejects UPDATE on a sealed or voided dental_implant_components row. Amendment is a successor; void is an event.';

create trigger dental_implant_components_sealed_check
before update on public.dental_implant_components
for each row execute function private.deny_sealed_implant_component_mutation();

-- Reject UPDATE/DELETE on dental_implant_components when the parent
-- plan is PRESENTED/ACKNOWLEDGED. PLAN_DESIGN components on a frozen
-- plan cannot be edited.
create or replace function private.deny_frozen_plan_implant_component_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan_status text;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    select plan.status into v_plan_status
      from public.treatment_plans as plan
      where plan.organization_id = old.organization_id
        and plan.id = old.parent_plan_id;
    if v_plan_status is not null and v_plan_status in ('PRESENTED', 'ACKNOWLEDGED') then
      raise exception 'dental_implant_components are frozen when the parent plan is PRESENTED/ACKNOWLEDGED';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.deny_frozen_plan_implant_component_mutation()
from public, anon, authenticated, service_role;

comment on function private.deny_frozen_plan_implant_component_mutation() is
  'Rejects UPDATE/DELETE on dental_implant_components when the parent plan is PRESENTED/ACKNOWLEDGED.';

create trigger dental_implant_components_frozen_plan_check
before update or delete on public.dental_implant_components
for each row execute function private.deny_frozen_plan_implant_component_mutation();
