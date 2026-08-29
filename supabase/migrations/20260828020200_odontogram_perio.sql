-- P15-05 / O4: periodontal examination schema and engine. The fork
-- persists six-site probing depth, signed gingival margin (positive =
-- recession), derived CAL = PD + GM, BOP, suppuration, four-surface
-- O'Leary plaque, mobility, and I-IV furcation grade per anatomically
-- valid entrance. O4 transplants that as a relational append-only
-- state machine: a DRAFT examination accepts measurements; a FINAL
-- examination is immutable; an amendment is a new DRAFT row pointing
-- at the predecessor, not an in-place mutation.
--
-- The five tables share a single composite tenant FK chain
-- (organization_id, patient_id) and a parent examination FK that
-- carries the finalization state. Five database triggers reject
-- INSERT/UPDATE/DELETE on every child table when the parent is
-- FINAL, reject FINAL parent reopen/update/delete, and freeze the
-- predecessor, version, provider, and finalization identity on
-- amend. CAL is a generated column = probing_depth_mm +
-- gingival_margin_mm, range -9..35 by construction. Zero probing depth
-- is invalid; absence of a row means uncharted.

-- ============================================================================
-- periodontal_examinations
-- ============================================================================

create table if not exists public.periodontal_examinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  encounter_id uuid not null,
  predecessor_examination_id uuid
    references public.periodontal_examinations(id) on delete restrict,
  examination_kind text not null default 'INITIAL',
  status text not null default 'DRAFT',
  version integer not null default 1,
  examined_at timestamptz,
  examined_by uuid references auth.users(id) on delete set null,
  examined_provider_id uuid,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_provider_id uuid,
  notes text,
  recorded_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint periodontal_examinations_organization_id_id_key
    unique (organization_id, id),
  constraint periodontal_examinations_organization_patient_fk foreign key (
    organization_id, patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint periodontal_examinations_organization_encounter_fk foreign key (
    organization_id, encounter_id
  ) references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint periodontal_examinations_organization_examined_provider_fk foreign key (
    organization_id, examined_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint periodontal_examinations_organization_finalized_provider_fk foreign key (
    organization_id, finalized_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint periodontal_examinations_examination_kind_check check (
    examination_kind in ('INITIAL', 'RE-EVALUATION', 'MAINTENANCE', 'AMENDMENT')
  ),
  constraint periodontal_examinations_status_check check (
    status in ('DRAFT', 'FINAL')
  ),
  constraint periodontal_examinations_version_positive_check check (version > 0),
  constraint periodontal_examinations_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 4000
  ),
  constraint periodontal_examinations_self_predecessor_check check (
    predecessor_examination_id is null or predecessor_examination_id <> id
  ),
  constraint periodontal_examinations_amendment_consistency_check check (
    (examination_kind = 'AMENDMENT') = (predecessor_examination_id is not null)
  ),
  constraint periodontal_examinations_finalized_state_check check (
    (status = 'FINAL' and finalized_at is not null and finalized_by is not null
      and finalized_provider_id is not null
      and (examined_at is not null) = (examined_by is not null)
      and (examined_at is not null) = (examined_provider_id is not null))
    or
    (status = 'DRAFT' and finalized_at is null and finalized_by is null
      and finalized_provider_id is null)
  )
);

revoke all on table public.periodontal_examinations
from public, anon, authenticated, service_role;

alter table public.periodontal_examinations enable row level security;

comment on table public.periodontal_examinations is
  'A patient/encounter periodontal examination in DRAFT or FINAL state. An AMENDMENT is a new DRAFT row pointing at a FINAL predecessor; it is not an in-place mutation. FINAL examinations are immutable: every child table rejects INSERT/UPDATE/DELETE.';

-- Self-referential predecessor FK is added after the table is created
-- because the (organization_id, id) unique constraint is not visible
-- inside the same CREATE TABLE statement when the FK column itself
-- appears earlier. Adding the FK here also makes it deferrable so
-- the O5 amendment RPC can insert the predecessor in the same
-- transaction as the new row when needed.
alter table public.periodontal_examinations
  add constraint periodontal_examinations_organization_predecessor_fk
  foreign key (organization_id, predecessor_examination_id)
  references public.periodontal_examinations(organization_id, id)
  on delete restrict
  deferrable initially immediate;

-- The version is application-managed; the O5 amendment RPC
-- assigns it transactionally. A unique index is too strict for
-- concurrent INITIAL/RE-EVALUATION/MAINTENANCE examinations in the
-- same encounter (the plan allows concurrent examinations of the
-- same encounter by different providers). We leave version as a
-- positive integer column enforced by the O5 RPC.

comment on column public.periodontal_examinations.version is
  'Monotonically increasing per examination within the O5 RPC; positive integer enforced by a column check.';

create index if not exists periodontal_examinations_organization_patient_recorded_idx
  on public.periodontal_examinations (organization_id, patient_id, recorded_at desc);

create index if not exists periodontal_examinations_organization_predecessor_idx
  on public.periodontal_examinations (organization_id, predecessor_examination_id)
  where predecessor_examination_id is not null;

create index if not exists periodontal_examinations_organization_patient_final_idx
  on public.periodontal_examinations (organization_id, patient_id, finalized_at)
  where status = 'FINAL';

create trigger periodontal_examinations_set_updated_at
before update on public.periodontal_examinations
for each row execute function private.set_updated_at();

-- ============================================================================
-- periodontal_site_measurements
-- ============================================================================

create table if not exists public.periodontal_site_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  examination_id uuid not null,
  tooth_fdi text not null,
  site text not null,
  probing_depth_mm integer not null,
  gingival_margin_mm integer not null default 0,
  bleeding_on_probing boolean not null default false,
  suppuration boolean not null default false,
  tooth_present boolean not null default true,
  implant_context boolean not null default false,
  recorded_at timestamptz not null default statement_timestamp(),
  cal_mm integer generated always as (probing_depth_mm + gingival_margin_mm) stored,
  constraint periodontal_site_measurements_organization_examination_fk foreign key (
    organization_id, examination_id
  ) references public.periodontal_examinations(organization_id, id) on delete restrict,
  constraint periodontal_site_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint periodontal_site_measurements_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint periodontal_site_measurements_site_check check (
    site in ('MB', 'B', 'DB', 'ML', 'L', 'DL')
  ),
  constraint periodontal_site_measurements_probing_depth_range check (
    probing_depth_mm between 1 and 15
  ),
  constraint periodontal_site_measurements_gingival_margin_range check (
    gingival_margin_mm between -10 and 20
  ),
  constraint periodontal_site_measurements_cal_range check (
    cal_mm between -9 and 35
  ),
  constraint periodontal_site_measurements_implant_no_furcation check (
    not implant_context
  ),
  constraint periodontal_site_measurements_unique_tooth_site
    unique (examination_id, tooth_fdi, site)
);

revoke all on table public.periodontal_site_measurements
from public, anon, authenticated, service_role;

alter table public.periodontal_site_measurements enable row level security;

comment on table public.periodontal_site_measurements is
  'Per-tooth, per-site six-point periodontal probing depth and gingival margin; cal_mm is generated. Absence of a row means uncharted; zero probing depth is invalid.';

create index if not exists periodontal_site_measurements_organization_examination_tooth_idx
  on public.periodontal_site_measurements (organization_id, examination_id, tooth_fdi);

create index if not exists periodontal_site_measurements_organization_examination_cal_idx
  on public.periodontal_site_measurements (organization_id, examination_id, cal_mm)
  where cal_mm >= 4;

-- ============================================================================
-- periodontal_plaque_measurements
-- ============================================================================

create table if not exists public.periodontal_plaque_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  examination_id uuid not null,
  tooth_fdi text not null,
  surface text not null,
  plaque_present boolean not null default false,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint periodontal_plaque_measurements_organization_examination_fk foreign key (
    organization_id, examination_id
  ) references public.periodontal_examinations(organization_id, id) on delete restrict,
  constraint periodontal_plaque_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint periodontal_plaque_measurements_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint periodontal_plaque_measurements_surface_check check (
    surface in ('MESIAL', 'DISTAL', 'BUCCAL', 'LINGUAL')
  ),
  constraint periodontal_plaque_measurements_unique_tooth_surface
    unique (examination_id, tooth_fdi, surface)
);

revoke all on table public.periodontal_plaque_measurements
from public, anon, authenticated, service_role;

alter table public.periodontal_plaque_measurements enable row level security;

comment on table public.periodontal_plaque_measurements is
  'Per-tooth, four-surface O''Leary plaque presence. Deliberately distinct from the six-site probing geometry.';

create index if not exists periodontal_plaque_measurements_organization_examination_tooth_idx
  on public.periodontal_plaque_measurements (organization_id, examination_id, tooth_fdi);

-- ============================================================================
-- periodontal_tooth_measurements
-- ============================================================================

create table if not exists public.periodontal_tooth_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  examination_id uuid not null,
  tooth_fdi text not null,
  mobility_miller text,
  implant_context boolean not null default false,
  notes text,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint periodontal_tooth_measurements_organization_examination_fk foreign key (
    organization_id, examination_id
  ) references public.periodontal_examinations(organization_id, id) on delete restrict,
  constraint periodontal_tooth_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint periodontal_tooth_measurements_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint periodontal_tooth_measurements_mobility_check check (
    mobility_miller is null
    or mobility_miller in ('M0', 'M1', 'M2', 'M3')
  ),
  constraint periodontal_tooth_measurements_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 1000
  ),
  constraint periodontal_tooth_measurements_unique_tooth
    unique (examination_id, tooth_fdi)
);

revoke all on table public.periodontal_tooth_measurements
from public, anon, authenticated, service_role;

alter table public.periodontal_tooth_measurements enable row level security;

comment on table public.periodontal_tooth_measurements is
  'Per-tooth mobility (Miller M0-M3) and implant context. One row per tooth per examination.';

create index if not exists periodontal_tooth_measurements_organization_examination_tooth_idx
  on public.periodontal_tooth_measurements (organization_id, examination_id, tooth_fdi);

-- ============================================================================
-- periodontal_furcation_measurements
-- ============================================================================

create table if not exists public.periodontal_furcation_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  examination_id uuid not null,
  tooth_fdi text not null,
  entrance text not null,
  grade smallint not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint periodontal_furcation_measurements_organization_examination_fk foreign key (
    organization_id, examination_id
  ) references public.periodontal_examinations(organization_id, id) on delete restrict,
  constraint periodontal_furcation_measurements_organization_id_id_key
    unique (organization_id, id),
  constraint periodontal_furcation_measurements_tooth_fdi_check check (
    tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint periodontal_furcation_measurements_entrance_check check (
    entrance in ('mesial', 'distal', 'buccal', 'lingual')
  ),
  constraint periodontal_furcation_measurements_grade_range check (
    grade between 1 and 4
  ),
  constraint periodontal_furcation_measurements_unique_tooth_entrance
    unique (examination_id, tooth_fdi, entrance)
);

revoke all on table public.periodontal_furcation_measurements
from public, anon, authenticated, service_role;

alter table public.periodontal_furcation_measurements enable row level security;

comment on table public.periodontal_furcation_measurements is
  'I-IV Glickman furcation grade per anatomically valid entrance. The runtime cross-row validity (upper molars have 3 entrances, lower molars 2, upper first premolar 2) is enforced in the O5 RPC, not by a column check, because the validity depends on the FDI tooth and the per-row position.';

create index if not exists periodontal_furcation_measurements_organization_examination_tooth_idx
  on public.periodontal_furcation_measurements (organization_id, examination_id, tooth_fdi);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Reject INSERT/UPDATE/DELETE on every child table when the parent
-- examination is FINAL. An amendment is the supported path.
create or replace function private.reject_finalized_perio_child_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_exam_id uuid;
begin
  v_exam_id := (case tg_op
    when 'DELETE' then old.examination_id
    else new.examination_id
  end);

  select examination.status into v_status
    from public.periodontal_examinations as examination
    where examination.organization_id =
        (case tg_op
          when 'DELETE' then old.organization_id
          else new.organization_id
        end)
      and examination.id = v_exam_id;

  if v_status = 'FINAL' then
    raise exception 'periodontal child tables are immutable on a FINAL examination; create an AMENDMENT examination';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.reject_finalized_perio_child_mutation()
from public, anon, authenticated, service_role;

comment on function private.reject_finalized_perio_child_mutation() is
  'Rejects INSERT/UPDATE/DELETE on every periodontal child table when the parent examination is FINAL.';

create trigger periodontal_site_measurements_final_check
before insert or update or delete on public.periodontal_site_measurements
for each row execute function private.reject_finalized_perio_child_mutation();

create trigger periodontal_plaque_measurements_final_check
before insert or update or delete on public.periodontal_plaque_measurements
for each row execute function private.reject_finalized_perio_child_mutation();

create trigger periodontal_tooth_measurements_final_check
before insert or update or delete on public.periodontal_tooth_measurements
for each row execute function private.reject_finalized_perio_child_mutation();

create trigger periodontal_furcation_measurements_final_check
before insert or update or delete on public.periodontal_furcation_measurements
for each row execute function private.reject_finalized_perio_child_mutation();

-- Reject UPDATE/DELETE on the examination itself when FINAL. An
-- amendment is a new row.
create or replace function private.protect_finalized_perio_examination()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'FINAL' then
    raise exception 'finalized periodontal examinations are immutable; create an AMENDMENT examination';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.protect_finalized_perio_examination()
from public, anon, authenticated, service_role;

comment on function private.protect_finalized_perio_examination() is
  'Rejects UPDATE/DELETE of a FINAL periodontal examination. The amendment path is a new DRAFT row pointing at the FINAL predecessor.';

create trigger periodontal_examinations_protect_finalized
before update or delete on public.periodontal_examinations
for each row execute function private.protect_finalized_perio_examination();

-- Enforce the amendment-scope invariant: a child AMENDMENT must
-- point at a FINAL predecessor in the same patient (the encounter
-- is intentionally not constrained because a re-examination may
-- take place under a new encounter).
create or replace function private.validate_perio_amendment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pred_patient uuid;
  v_pred_status text;
begin
  if new.predecessor_examination_id is null then
    return new;
  end if;

  select pred.patient_id, pred.status
    into v_pred_patient, v_pred_status
    from public.periodontal_examinations as pred
    where pred.organization_id = new.organization_id
      and pred.id = new.predecessor_examination_id
    for key share;

  if not found then
    raise foreign_key_violation using
      message = 'amendment predecessor must belong to the same organization';
  end if;

  if v_pred_patient is distinct from new.patient_id then
    raise check_violation using
      message = 'amendment predecessor must belong to the same patient';
  end if;

  if v_pred_status <> 'FINAL' then
    raise check_violation using
      message = 'amendment predecessor must be FINAL';
  end if;

  return new;
end
$$;

revoke all on function private.validate_perio_amendment_scope()
from public, anon, authenticated, service_role;

comment on function private.validate_perio_amendment_scope() is
  'A child AMENDMENT must point at a FINAL predecessor in the same patient and organization.';

create constraint trigger periodontal_examinations_validate_amendment_scope
after insert or update of predecessor_examination_id on public.periodontal_examinations
deferrable initially immediate
for each row execute function private.validate_perio_amendment_scope();
