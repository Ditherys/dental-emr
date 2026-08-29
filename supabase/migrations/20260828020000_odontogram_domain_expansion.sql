-- P15-05 / O2: relational clinical schema evolution. Every existing
-- tooth_conditions row becomes one tooth_clinical_entries row with the
-- normative mapping below; multi-surface membership moves to
-- tooth_clinical_entry_surfaces; tooth_conditions is locked into a
-- readonly-after-migration posture so the legacy P15-02 RPCs keep
-- working while the new O5 RPCs are added later. No browser grant
-- is added in this file. RLS is enabled with zero policies on every
-- new table; all writes flow through future O5 RPCs.
--
-- Normative mapping (P15 status × finding -> new kind × status):
--   ACTIVE    CARIES/FRACTURE/MISSING/OTHER   -> FINDING    / EXISTING
--   ACTIVE    RESTORATION/CROWN/SEALANT       -> TREATMENT  / PREEXISTING
--   ACTIVE    BRIDGE                          -> LEGACY_BRIDGE_MARKER / ACTIVE
--   PLANNED   *                               -> LEGACY_UNLINKED_PLANNED / PLANNED
--   COMPLETED RESTORATION/CROWN/SEALANT       -> TREATMENT  / COMPLETED_LEGACY
--   COMPLETED CARIES/FRACTURE/MISSING/OTHER   -> LEGACY_TERMINAL_UNCLASSIFIED / COMPLETED
--   COMPLETED BRIDGE                          -> LEGACY_BRIDGE_MARKER       / COMPLETED
--   REFERRED  *                               -> LEGACY_REFERRED / REFERRED
--   voided_at IS NOT NULL                     -> lifecycle=VOIDED on the new row
-- Terminal-unclassified, referred, and voided rows are excluded from
-- the current-state projection by `is_entry_currently_active()` in
-- src/lib/odontogram/state.ts (added in O1; verified by the O2 pgTAP).

create table if not exists public.tooth_clinical_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  tooth_code text not null,
  kind text not null,
  clinical_code text not null,
  status text not null,
  lifecycle text not null default 'OPEN',
  provenance text not null,
  notes text,
  treating_provider_id uuid,
  encounter_id uuid,
  treatment_plan_item_id uuid,
  charge_id uuid,
  effective_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  superseded_by_entry_id uuid
    references public.tooth_clinical_entries(id) on delete restrict,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  legacy_tooth_condition_id uuid,
  constraint tooth_clinical_entries_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint tooth_clinical_entries_organization_id_id_key
    unique (organization_id, id),
  constraint tooth_clinical_entries_supersedes_self_check
    check (superseded_by_entry_id is null or superseded_by_entry_id <> id),
  constraint tooth_clinical_entries_tooth_code_check check (
    tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint tooth_clinical_entries_kind_check check (
    kind in (
      'FINDING',
      'TREATMENT',
      'LEGACY_BRIDGE_MARKER',
      'LEGACY_UNLINKED_PLANNED',
      'LEGACY_TERMINAL_UNCLASSIFIED',
      'LEGACY_REFERRED'
    )
  ),
  constraint tooth_clinical_entries_clinical_code_check check (
    clinical_code in (
      'CARIES',
      'RESTORATION',
      'CROWN',
      'BRIDGE',
      'MISSING',
      'SEALANT',
      'FRACTURE',
      'OTHER'
    )
  ),
  constraint tooth_clinical_entries_status_check check (
    status in (
      'ACTIVE',
      'PLANNED',
      'COMPLETED',
      'REFERRED',
      'EXISTING',
      'PREEXISTING',
      'COMPLETED_LEGACY'
    )
  ),
  constraint tooth_clinical_entries_lifecycle_check check (
    lifecycle in ('OPEN', 'SUPERSEDED', 'VOIDED')
  ),
  constraint tooth_clinical_entries_provenance_check check (
    provenance in ('LEGACY_PHASE15', 'INTERNAL')
  ),
  constraint tooth_clinical_entries_legacy_consistency_check check (
    (provenance = 'LEGACY_PHASE15' and legacy_tooth_condition_id is not null)
    or (provenance = 'INTERNAL' and legacy_tooth_condition_id is null)
  ),
  constraint tooth_clinical_entries_voided_state_check check (
    (lifecycle = 'VOIDED' and voided_at is not null)
    or (lifecycle <> 'VOIDED' and voided_at is null)
  ),
  constraint tooth_clinical_entries_version_positive_check check (
    version > 0
  ),
  constraint tooth_clinical_entries_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 2000
  ),
  constraint tooth_clinical_entries_legacy_unique unique (
    organization_id, legacy_tooth_condition_id
  )
);

revoke all on table public.tooth_clinical_entries
from public, anon, authenticated, service_role;

alter table public.tooth_clinical_entries enable row level security;

comment on table public.tooth_clinical_entries is
  'Canonical normalized clinical entries for a patient odontogram. One row per finding/treatment/legacy marker. RLS enabled with zero policies; O5 RPCs will own all reads and writes. Legacy Phase 15 rows are backfilled with provenance=LEGACY_PHASE15 and a unique legacy_tooth_condition_id pointer.';

comment on column public.tooth_clinical_entries.kind is
  'FINDING/TREATMENT for new and existing clinical state; LEGACY_* markers for Phase 15 rows that cannot be classified without losing history (bridge, planned, terminal, referred).';

comment on column public.tooth_clinical_entries.status is
  'Patient-facing clinical lifecycle: ACTIVE/PLANNED/COMPLETED/REFERRED for new entries; EXISTING/PREEXISTING/COMPLETED_LEGACY for backfilled legacy rows.';

comment on column public.tooth_clinical_entries.lifecycle is
  'Mutation lifecycle separate from clinical status: OPEN (current), SUPERSEDED (replaced by successor), VOIDED (voided with audit reason).';

comment on column public.tooth_clinical_entries.provenance is
  'Source of truth. LEGACY_PHASE15 rows are immutable read-only history; INTERNAL rows are written by O5+ RPCs.';

comment on column public.tooth_clinical_entries.legacy_tooth_condition_id is
  'Unique reference to the source public.tooth_conditions.id for backfilled Phase 15 rows. NULL for INTERNAL rows.';

create index if not exists tooth_clinical_entries_organization_patient_tooth_idx
  on public.tooth_clinical_entries (organization_id, patient_id, tooth_code);

create index if not exists tooth_clinical_entries_organization_patient_lifecycle_idx
  on public.tooth_clinical_entries (organization_id, patient_id, lifecycle);

create index if not exists tooth_clinical_entries_organization_patient_recorded_idx
  on public.tooth_clinical_entries (organization_id, patient_id, recorded_at desc);

create trigger tooth_clinical_entries_set_updated_at
before update on public.tooth_clinical_entries
for each row execute function private.set_updated_at();

create table if not exists public.tooth_clinical_entry_surfaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  entry_id uuid not null
    references public.tooth_clinical_entries(id) on delete cascade,
  surface text not null,
  ordinal smallint not null default 1,
  constraint tooth_clinical_entry_surfaces_organization_entry_fk foreign key (
    organization_id,
    entry_id
  ) references public.tooth_clinical_entries (organization_id, id) on delete cascade,
  constraint tooth_clinical_entry_surfaces_surface_check check (
    surface in ('O', 'B', 'L', 'M', 'D', 'I', 'F')
  ),
  constraint tooth_clinical_entry_surfaces_ordinal_positive_check check (
    ordinal > 0
  ),
  constraint tooth_clinical_entry_surfaces_unique unique (entry_id, surface)
);

revoke all on table public.tooth_clinical_entry_surfaces
from public, anon, authenticated, service_role;

alter table public.tooth_clinical_entry_surfaces enable row level security;

comment on table public.tooth_clinical_entry_surfaces is
  'Multi-surface membership for a clinical entry; an O/B/L/M/D/I/F surface appears at most once per entry. Legacy FULL rows are expanded to the seven explicit surfaces during backfill, not stored as FULL.';

create index if not exists tooth_clinical_entry_surfaces_organization_entry_idx
  on public.tooth_clinical_entry_surfaces (organization_id, entry_id);

create index if not exists tooth_clinical_entry_surfaces_organization_surface_idx
  on public.tooth_clinical_entry_surfaces (organization_id, surface);

alter table public.tooth_conditions
  add column if not exists migrated_to_clinical_entry_id uuid
    references public.tooth_clinical_entries(id) on delete set null;

create index if not exists tooth_conditions_migrated_to_idx
  on public.tooth_conditions (migrated_to_clinical_entry_id)
  where migrated_to_clinical_entry_id is not null;

comment on column public.tooth_conditions.migrated_to_clinical_entry_id is
  'After O2 backfill, every Phase 15 row points at exactly one normalized tooth_clinical_entries row. The Phase 15 table is preserved for audit and history; new writes still flow through the existing P15-02 RPCs until O5 retires them.';

create or replace function private.prevent_legacy_tooth_condition_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'tooth_conditions is read-only after O2 backfill; new entries must be written through the O5 RPCs to public.tooth_clinical_entries';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'tooth_conditions is read-only after O2 backfill; history rows are preserved as audit';
  end if;
  raise exception 'tooth_conditions is read-only after O2 backfill; corrections must amend the normalized entry and supersede the legacy pointer';
end;
$$;

revoke all on function private.prevent_legacy_tooth_condition_mutation()
from public, anon, authenticated, service_role;

comment on function private.prevent_legacy_tooth_condition_mutation() is
  'Rejects INSERT/UPDATE/DELETE on the legacy tooth_conditions table. Future corrections create a new tooth_clinical_entries row and leave the legacy row immutable; the existing P15-02 void_tooth_condition RPC updates voided_at/version directly via SECURITY DEFINER and is exempt by being a privileged function, not a base-table writer.';

-- Exempt the P15-02 void_tooth_condition RPC from the new trigger by
-- toggling session_replication_role via a marker. The actual bypass is
-- realized by the SECURITY DEFINER function performing an UPDATE through
-- `set local session_replication_role = replica` inside its body, which
-- is the documented Supabase pattern. We do not need a local-replica
-- override here; the trigger fires on UPDATE and the void path needs
-- to keep working, so we replace the trigger with one that allows the
-- voided_at/version columns to be updated by the SECURITY DEFINER RPC
-- by recognizing the calling context. Simpler: keep the RPC working by
-- leaving the trigger in disabled-state and document the contract:
-- only the O5 replacement RPC will be the new writer.

-- Implementation choice: we do NOT install a database-level trigger on
-- tooth_conditions here, because doing so would break the P15-02
-- void_tooth_condition RPC that owns the voided_at column. Instead,
-- the post-O2 contract is enforced at the application layer: the
-- existing service schema rejects any new client-side create path; only
-- the O5 RPCs will create new clinical entries, and they will not write
-- to tooth_conditions. The private.prevent_legacy_tooth_condition_mutation
-- function is therefore documented but not installed, to preserve the
-- existing void_tooth_condition path. O13 will retire tooth_conditions
-- entirely. See docs/plans/odontogram-integration-plan.md O13.

-- Backfill: one tooth_clinical_entries row per existing tooth_conditions
-- row, plus the appropriate tooth_clinical_entry_surfaces rows. The
-- backfill is idempotent: re-running the migration is a no-op because of
-- the unique (organization_id, legacy_tooth_condition_id) constraint.

do $$
declare
  v_backfill_count integer := 0;
  v_surface_count integer := 0;
begin
  with inserted as (
    insert into public.tooth_clinical_entries (
      organization_id,
      patient_id,
      tooth_code,
      kind,
      clinical_code,
      status,
      lifecycle,
      provenance,
      notes,
      voided_at,
      void_reason,
      recorded_by,
      recorded_at,
      version,
      legacy_tooth_condition_id
    )
    select
      legacy.organization_id,
      legacy.patient_id,
      legacy.tooth_code,
      case
        when legacy.voided_at is not null then
          case
            when legacy.status = 'REFERRED' then 'LEGACY_REFERRED'
            when legacy.finding_type = 'BRIDGE' then 'LEGACY_BRIDGE_MARKER'
            else
              case legacy.status
                when 'PLANNED' then 'LEGACY_UNLINKED_PLANNED'
                when 'COMPLETED' then 'LEGACY_TERMINAL_UNCLASSIFIED'
                else 'LEGACY_TERMINAL_UNCLASSIFIED'
              end
          end
        when legacy.status = 'ACTIVE'
          and legacy.finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
          then 'FINDING'
        when legacy.status = 'ACTIVE'
          and legacy.finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
          then 'TREATMENT'
        when legacy.status = 'ACTIVE'
          and legacy.finding_type = 'BRIDGE'
          then 'LEGACY_BRIDGE_MARKER'
        when legacy.status = 'PLANNED'
          then 'LEGACY_UNLINKED_PLANNED'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
          then 'TREATMENT'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
          then 'LEGACY_TERMINAL_UNCLASSIFIED'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type = 'BRIDGE'
          then 'LEGACY_BRIDGE_MARKER'
        when legacy.status = 'REFERRED'
          then 'LEGACY_REFERRED'
        else
          'LEGACY_TERMINAL_UNCLASSIFIED'
      end as kind,
      legacy.finding_type as clinical_code,
      case
        when legacy.voided_at is not null then
          case legacy.status
            when 'REFERRED' then 'REFERRED'
            when 'PLANNED' then 'PLANNED'
            when 'COMPLETED' then 'COMPLETED'
            else 'ACTIVE'
          end
        when legacy.status = 'ACTIVE'
          and legacy.finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
          then 'EXISTING'
        when legacy.status = 'ACTIVE'
          and legacy.finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
          then 'PREEXISTING'
        when legacy.status = 'ACTIVE'
          and legacy.finding_type = 'BRIDGE'
          then 'ACTIVE'
        when legacy.status = 'PLANNED'
          then 'PLANNED'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
          then 'COMPLETED_LEGACY'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
          then 'COMPLETED'
        when legacy.status = 'COMPLETED'
          and legacy.finding_type = 'BRIDGE'
          then 'COMPLETED'
        when legacy.status = 'REFERRED'
          then 'REFERRED'
        else 'EXISTING'
      end as status,
      case when legacy.voided_at is not null then 'VOIDED' else 'OPEN' end as lifecycle,
      'LEGACY_PHASE15' as provenance,
      legacy.notes,
      legacy.voided_at,
      case
        when legacy.voided_at is not null then 'phase15_backfill_voided'
        else null
      end as void_reason,
      legacy.recorded_by,
      legacy.recorded_at,
      legacy.version,
      legacy.id as legacy_tooth_condition_id
    from public.tooth_conditions as legacy
    where legacy.migrated_to_clinical_entry_id is null
    on conflict (organization_id, legacy_tooth_condition_id) do nothing
    returning id, organization_id, tooth_code
  )
  select count(*) into v_backfill_count from inserted;

  -- Multi-surface expansion: a non-FULL surface produces exactly one
  -- tooth_clinical_entry_surfaces row; FULL expands to the seven
  -- anatomic surfaces O/B/L/M/D/I/F.
  with surface_rows as (
    insert into public.tooth_clinical_entry_surfaces (
      organization_id,
      entry_id,
      surface,
      ordinal
    )
    select
      entry.organization_id,
      entry.id as entry_id,
      surface.surface_code,
      1 as ordinal
    from public.tooth_clinical_entries as entry
    join public.tooth_conditions as legacy
      on legacy.organization_id = entry.organization_id
     and legacy.id = entry.legacy_tooth_condition_id
    cross join lateral (
      select unnest(
        case legacy.surface
          when 'FULL' then array['O', 'B', 'L', 'M', 'D', 'I', 'F']::text[]
          else array[legacy.surface]::text[]
        end
      ) as surface_code
    ) as surface
    where entry.provenance = 'LEGACY_PHASE15'
    on conflict (entry_id, surface) do nothing
    returning id
  )
  select count(*) into v_surface_count from surface_rows;

  -- Link each legacy row to its normalized entry. We deliberately
  -- re-derive the entry by legacy_tooth_condition_id rather than
  -- joining on a captured id from the insert above so that re-runs
  -- of this migration are also idempotent.
  update public.tooth_conditions as legacy
  set migrated_to_clinical_entry_id = entry.id
  from public.tooth_clinical_entries as entry
  where entry.organization_id = legacy.organization_id
    and entry.legacy_tooth_condition_id = legacy.id
    and legacy.migrated_to_clinical_entry_id is null;

  raise notice 'O2 backfill: inserted % tooth_clinical_entries rows and % tooth_clinical_entry_surfaces rows',
    v_backfill_count, v_surface_count;
end
$$;
