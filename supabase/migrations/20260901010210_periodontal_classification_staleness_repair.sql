-- Unified Clinical Chart workspace, task 9 review round 1.
--
-- Four changes, all forward-only. 20260901010200 and 20260901010201 are applied
-- and are not edited; every change to an applied function uses a guarded replace
-- in this new migration, with the target verified to occur exactly once and
-- every step failing closed on 55000. Newline conventions are normalized on both
-- sides before matching, because this file is checked out with the convention of
-- whatever machine replays it.
--
-- 1. IMPORTANT. A FINAL examination could permanently carry a fingerprint that
--    never matched its measurements. private.enforce_perio_classification_
--    fingerprint fired only when a fingerprint column itself changed, and only
--    on public.periodontal_examinations. So: write a true digest on a DRAFT,
--    edit a child measurement (legal on a DRAFT, and no child trigger touched
--    the parent), then finalize - the finalizing UPDATE changes status and the
--    finalized_* columns, not the fingerprint, so nothing re-verified. The row
--    became immutable with provenance that was a lie, and an immutable row
--    cannot be corrected. Task 11's compare and every "the clinician signed off
--    on this evidence" claim rest on that value.
--
--    Closed in the schema, in two independent layers. Statement-level triggers
--    on all four child tables and a row-level trigger on the examination reset
--    the WHOLE classification block - derived, confirmed, confirmer, and the
--    override reason - whenever anything the digest covers changes. And
--    finalization now re-verifies both fingerprints unconditionally, so a path
--    that somehow bypassed the reset still cannot produce an immutable lie.
--
-- 2. IMPORTANT. The digest omitted the examination-level risk inputs.
--    radiographic_bone_loss_percent, hba1c_percent, teeth_lost_to_periodontitis,
--    smoking_status, cigarettes_per_day and age_years_snapshot are all staging
--    and grading determinants - 20260901010200 says so in its own comments - and
--    they are mutable on a DRAFT, yet changing one left the fingerprint valid.
--    They are now a fifth segment of the canonical digest. Redefining the
--    function costs nothing today because no fingerprint has ever been stored;
--    after real examinations exist, every stored fingerprint would become
--    non-reproducible and a stale one indistinguishable from a valid one.
--
--    Consequence for task 11: the risk inputs and a fingerprint may not be
--    written in the same UPDATE. A SET expression sees the pre-update row while
--    the AFTER verification sees the post-update row, so a mixed statement fails
--    closed. Write the risk inputs, then derive.
--
-- 3. IMPORTANT. public.amend_periodontal_examination(uuid,uuid,uuid) is
--    reachable from shipped browser code and has no amendment-reason parameter,
--    so the DRAFT it creates can never be finalized. Worse, that DRAFT
--    permanently consumes the predecessor's only successor slot: both the RPC's
--    own duplicate guard and periodontal_examinations_one_amendment_idx key on
--    (organization_id, predecessor_examination_id) regardless of status, and no
--    delete path exists for a DRAFT examination. One click of Amend today would
--    make that examination unamendable forever. Its browser grant is revoked
--    here, so the path is unreachable rather than reachable-and-poisoning.
--
--    Requirement recorded for task 11: amend_periodontal_examination_v2 must be
--    able to ADOPT or DISCARD a pre-existing reason-less DRAFT successor, not
--    merely create a new one. Any predecessor amended before this revoke already
--    has one.
--
-- 4. MINOR. keratinized_gingiva_mm was integer-only while the adjacent
--    gingival_thickness_mm was numeric(3,1). Keratinized tissue width is
--    commonly charted to 0.5 mm, and two adjacent millimetre measurements with
--    different granularity is an odd shape for three later tasks to inherit.
--    Widened while the column is still empty.
--
-- This migration revokes one browser grant and adds none. 20260901010211 owns
-- the boundary assertion.

-- ---------------------------------------------------------------------------
-- 4. Keratinized tissue width is charted to half a millimetre
-- ---------------------------------------------------------------------------

alter table public.periodontal_tooth_measurements
  alter column keratinized_gingiva_mm type numeric(3,1);

comment on column public.periodontal_tooth_measurements.keratinized_gingiva_mm is
  'Apico-coronal width of keratinized gingiva or peri-implant keratinized mucosa in millimetres, 0.0-15.0 to one decimal place because the band is commonly charted to 0.5 mm. NULL when not measured.';

-- The confirming user reference mirrors the pre-existing examined_by and
-- finalized_by pattern.
comment on column public.periodontal_examinations.confirmed_by is
  'The confirming Supabase Auth user. ON DELETE SET NULL mirrors examined_by and finalized_by. Deleting a confirming user therefore cannot succeed while a confirmation stands: on a DRAFT it violates perio_exam_confirmed_complete_check, and on a FINAL examination the immutability trigger refuses the UPDATE outright. That is deliberate and fails closed - a signed clinical record does not quietly lose its author - and it is consistent with the two identity columns that came before it rather than novel.';

-- ---------------------------------------------------------------------------
-- 2. The canonical digest covers the staging and grading risk inputs
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_anchor text := 'furcation.entrance collate "C")';
begin
  select pg_catalog.replace(
    pg_catalog.pg_get_functiondef('private.periodontal_measurement_digest(uuid,uuid)'::regprocedure),
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  ) into v_definition;

  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_anchor, '')))
     / pg_catalog.length(v_anchor) <> 1 then
    raise exception using errcode = '55000',
      message = 'periodontal_measurement_digest furcation segment not found exactly once';
  end if;

  if pg_catalog.strpos(v_definition, 'radiographic_bone_loss_percent') <> 0 then
    raise exception using errcode = '55000',
      message = 'periodontal_measurement_digest already covers the risk inputs';
  end if;
end
$migration$;

create or replace function private.periodontal_measurement_digest(
  p_organization_id uuid,
  p_examination_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        coalesce((
          select pg_catalog.string_agg(
            site.tooth_fdi || ':' || site.site || ':'
              || coalesce(site.probing_depth_mm::text, '~') || ':'
              || coalesce(site.gingival_margin_mm::text, '~') || ':'
              || coalesce(site.bleeding_on_probing::text, '~') || ':'
              || coalesce(site.suppuration::text, '~') || ':'
              || coalesce(site.tooth_present::text, '~') || ':'
              || coalesce(site.implant_context::text, '~'),
            ';' order by site.tooth_fdi collate "C", site.site collate "C")
          from public.periodontal_site_measurements as site
          where site.organization_id = p_organization_id
            and site.examination_id = p_examination_id
        ), '') || '|' ||
        coalesce((
          select pg_catalog.string_agg(
            surface.tooth_fdi || ':' || surface.surface || ':'
              || coalesce(surface.plaque_present::text, '~') || ':'
              || coalesce(surface.plaque_index::text, '~') || ':'
              || coalesce(surface.gingival_index::text, '~') || ':'
              || coalesce(surface.modified_plaque_index::text, '~') || ':'
              || coalesce(surface.modified_bleeding_index::text, '~'),
            ';' order by surface.tooth_fdi collate "C", surface.surface collate "C")
          from public.periodontal_plaque_measurements as surface
          where surface.organization_id = p_organization_id
            and surface.examination_id = p_examination_id
        ), '') || '|' ||
        coalesce((
          select pg_catalog.string_agg(
            tooth.tooth_fdi || ':'
              || coalesce(tooth.mobility_miller, '~') || ':'
              || coalesce(tooth.tooth_present::text, '~') || ':'
              || coalesce(tooth.implant_context::text, '~') || ':'
              || coalesce(tooth.keratinized_gingiva_mm::text, '~') || ':'
              || coalesce(tooth.gingival_thickness_mm::text, '~') || ':'
              || coalesce(tooth.gingival_phenotype, '~') || ':'
              || coalesce(tooth.miller_recession_class, '~') || ':'
              || coalesce(tooth.cej_visible::text, '~') || ':'
              || coalesce(tooth.root_concavity::text, '~'),
            ';' order by tooth.tooth_fdi collate "C")
          from public.periodontal_tooth_measurements as tooth
          where tooth.organization_id = p_organization_id
            and tooth.examination_id = p_examination_id
        ), '') || '|' ||
        coalesce((
          select pg_catalog.string_agg(
            furcation.tooth_fdi || ':' || furcation.entrance || ':'
              || coalesce(furcation.grade::text, '~'),
            ';' order by furcation.tooth_fdi collate "C", furcation.entrance collate "C")
          from public.periodontal_furcation_measurements as furcation
          where furcation.organization_id = p_organization_id
            and furcation.examination_id = p_examination_id
        ), '') || '|' ||
        -- The examination-level staging and grading determinants are part of the
        -- canonical measurement set. A grade computed from an HbA1c of 8.1 is
        -- not the grade for an HbA1c of 6.2.
        coalesce((
          select coalesce(exam.age_years_snapshot::text, '~') || ':'
              || coalesce(exam.smoking_status, '~') || ':'
              || coalesce(exam.cigarettes_per_day::text, '~') || ':'
              || coalesce(exam.diabetes_status, '~') || ':'
              || coalesce(exam.hba1c_percent::text, '~') || ':'
              || coalesce(exam.teeth_lost_to_periodontitis::text, '~') || ':'
              || coalesce(exam.radiographic_bone_loss_percent::text, '~')
          from public.periodontal_examinations as exam
          where exam.organization_id = p_organization_id
            and exam.id = p_examination_id
        ), ''),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

revoke all on function private.periodontal_measurement_digest(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.periodontal_measurement_digest(uuid, uuid) is
  'Deterministic SHA-256 hex digest over the canonical measurements of one periodontal examination in one organization: the site, surface, tooth and furcation records plus the examination-level staging and grading risk inputs. The single definition of what a classification fingerprint covers. Because a SET expression sees the pre-update row while the AFTER verification sees the post-update row, the risk inputs and a fingerprint must not be written in the same UPDATE. Not browser or service callable.';

-- ---------------------------------------------------------------------------
-- 1a. Any change to the covered measurements withdraws the classification
-- ---------------------------------------------------------------------------

-- The whole block, not only the fingerprints: a diagnosis without the digest it
-- came from would violate perio_exam_derived_complete_check, and a confirmation
-- whose evidence has moved is no longer a confirmation of anything.
create function private.reset_perio_stale_classification(
  p_organization_id uuid,
  p_examination_id uuid
)
returns void
language sql
set search_path = ''
as $$
  update public.periodontal_examinations as exam
     set derived_diagnosis = null,
         derived_stage = null,
         derived_grade = null,
         derived_extent = null,
         derived_measurement_fingerprint = null,
         confirmed_diagnosis = null,
         confirmed_stage = null,
         confirmed_grade = null,
         confirmed_extent = null,
         confirmed_measurement_fingerprint = null,
         confirmed_at = null,
         confirmed_by = null,
         confirmed_provider_id = null,
         classification_override_reason = null
   where exam.organization_id = p_organization_id
     and exam.id = p_examination_id
     -- Nothing to withdraw is the common case; do not touch the row for it.
     and (exam.derived_diagnosis is not null
          or exam.derived_measurement_fingerprint is not null
          or exam.confirmed_at is not null
          or exam.confirmed_measurement_fingerprint is not null
          or exam.classification_override_reason is not null);
$$;

revoke all on function private.reset_perio_stale_classification(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function private.reset_perio_stale_classification(uuid, uuid) is
  'Withdraws the entire derived and clinician-confirmed classification of one periodontal examination, including the confirmer identity and the override reason, because the measurements it was computed from have changed. A no-op when there is nothing to withdraw.';

create function private.reset_perio_classification_on_measurement_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected record;
begin
  -- Statement level with transition tables: one pass per statement rather than
  -- one per row, which matters for a 200-row batch save. PL/pgSQL prepares only
  -- the branch it takes, so a transition table absent for this operation is
  -- never referenced.
  if tg_op = 'INSERT' then
    for affected in
      select distinct changed.organization_id, changed.examination_id from new_rows as changed
    loop
      perform private.reset_perio_stale_classification(
        affected.organization_id, affected.examination_id);
    end loop;
  elsif tg_op = 'DELETE' then
    for affected in
      select distinct changed.organization_id, changed.examination_id from old_rows as changed
    loop
      perform private.reset_perio_stale_classification(
        affected.organization_id, affected.examination_id);
    end loop;
  else
    for affected in
      select distinct combined.organization_id, combined.examination_id
      from (
        select changed.organization_id, changed.examination_id from new_rows as changed
        union
        select changed.organization_id, changed.examination_id from old_rows as changed
      ) as combined
    loop
      perform private.reset_perio_stale_classification(
        affected.organization_id, affected.examination_id);
    end loop;
  end if;

  return null;
end
$$;

revoke all on function private.reset_perio_classification_on_measurement_change()
from public, anon, authenticated, service_role;

comment on function private.reset_perio_classification_on_measurement_change() is
  'Withdraws the classification of every periodontal examination whose site, surface, tooth or furcation measurements were touched by the firing statement, so a stored fingerprint can never outlive the measurements it covers.';

create trigger perio_site_reset_classification_insert
after insert on public.periodontal_site_measurements
referencing new table as new_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_site_reset_classification_update
after update on public.periodontal_site_measurements
referencing new table as new_rows old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_site_reset_classification_delete
after delete on public.periodontal_site_measurements
referencing old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_plaque_reset_classification_insert
after insert on public.periodontal_plaque_measurements
referencing new table as new_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_plaque_reset_classification_update
after update on public.periodontal_plaque_measurements
referencing new table as new_rows old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_plaque_reset_classification_delete
after delete on public.periodontal_plaque_measurements
referencing old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_tooth_reset_classification_insert
after insert on public.periodontal_tooth_measurements
referencing new table as new_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_tooth_reset_classification_update
after update on public.periodontal_tooth_measurements
referencing new table as new_rows old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_tooth_reset_classification_delete
after delete on public.periodontal_tooth_measurements
referencing old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_furcation_reset_classification_insert
after insert on public.periodontal_furcation_measurements
referencing new table as new_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_furcation_reset_classification_update
after update on public.periodontal_furcation_measurements
referencing new table as new_rows old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

create trigger perio_furcation_reset_classification_delete
after delete on public.periodontal_furcation_measurements
referencing old table as old_rows
for each statement execute function private.reset_perio_classification_on_measurement_change();

-- ---------------------------------------------------------------------------
-- 1b. The same rule for the examination-level risk inputs
-- ---------------------------------------------------------------------------

create function private.reset_perio_classification_on_risk_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The caller is rewriting the provenance in this same statement. The AFTER
  -- verification checks the new fingerprint against the digest of the row as
  -- updated, so a mixed statement fails closed rather than being silently
  -- reconciled here.
  if new.derived_measurement_fingerprint is distinct from old.derived_measurement_fingerprint
     or new.confirmed_measurement_fingerprint is distinct from old.confirmed_measurement_fingerprint then
    return new;
  end if;

  if new.age_years_snapshot is distinct from old.age_years_snapshot
     or new.smoking_status is distinct from old.smoking_status
     or new.cigarettes_per_day is distinct from old.cigarettes_per_day
     or new.diabetes_status is distinct from old.diabetes_status
     or new.hba1c_percent is distinct from old.hba1c_percent
     or new.teeth_lost_to_periodontitis is distinct from old.teeth_lost_to_periodontitis
     or new.radiographic_bone_loss_percent is distinct from old.radiographic_bone_loss_percent then
    new.derived_diagnosis := null;
    new.derived_stage := null;
    new.derived_grade := null;
    new.derived_extent := null;
    new.derived_measurement_fingerprint := null;
    new.confirmed_diagnosis := null;
    new.confirmed_stage := null;
    new.confirmed_grade := null;
    new.confirmed_extent := null;
    new.confirmed_measurement_fingerprint := null;
    new.confirmed_at := null;
    new.confirmed_by := null;
    new.confirmed_provider_id := null;
    new.classification_override_reason := null;
  end if;

  return new;
end
$$;

revoke all on function private.reset_perio_classification_on_risk_change()
from public, anon, authenticated, service_role;

comment on function private.reset_perio_classification_on_risk_change() is
  'Withdraws the classification of a periodontal examination when one of its staging or grading risk inputs changes without the provenance being rewritten in the same statement. Named to sort after private.protect_finalized_perio_examination, so a FINAL row is refused before anything is reset.';

create trigger periodontal_examinations_reset_stale_classification
before update on public.periodontal_examinations
for each row execute function private.reset_perio_classification_on_risk_change();

-- ---------------------------------------------------------------------------
-- 1c. Finalization re-verifies unconditionally
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_anchor text := 'confirmed measurement fingerprint does not match the examination measurements';
begin
  select pg_catalog.replace(
    pg_catalog.pg_get_functiondef('private.enforce_perio_classification_fingerprint()'::regprocedure),
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  ) into v_definition;

  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_anchor, '')))
     / pg_catalog.length(v_anchor) <> 1 then
    raise exception using errcode = '55000',
      message = 'enforce_perio_classification_fingerprint anchor not found exactly once';
  end if;

  if pg_catalog.strpos(v_definition, 'v_finalizing') <> 0 then
    raise exception using errcode = '55000',
      message = 'enforce_perio_classification_fingerprint already re-verifies at finalization';
  end if;
end
$migration$;

create or replace function private.enforce_perio_classification_fingerprint()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_digest text;
  v_finalizing boolean;
begin
  -- The DRAFT -> FINAL transition is the last moment at which the record can
  -- still be refused, so it re-verifies whether or not the fingerprint itself
  -- moved. This is the independent second layer behind the reset triggers.
  v_finalizing := (tg_op = 'UPDATE' and old.status = 'DRAFT' and new.status = 'FINAL');

  if new.derived_measurement_fingerprint is not null
     and (tg_op = 'INSERT'
          or v_finalizing
          or new.derived_measurement_fingerprint is distinct from old.derived_measurement_fingerprint) then
    v_digest := private.periodontal_measurement_digest(new.organization_id, new.id);
    if new.derived_measurement_fingerprint <> v_digest then
      raise check_violation using
        message = 'derived measurement fingerprint does not match the examination measurements';
    end if;
  end if;

  if new.confirmed_measurement_fingerprint is not null
     and (tg_op = 'INSERT'
          or v_finalizing
          or new.confirmed_measurement_fingerprint is distinct from old.confirmed_measurement_fingerprint) then
    v_digest := private.periodontal_measurement_digest(new.organization_id, new.id);
    if new.confirmed_measurement_fingerprint <> v_digest then
      raise check_violation using
        message = 'confirmed measurement fingerprint does not match the examination measurements';
    end if;
  end if;

  return new;
end
$$;

revoke all on function private.enforce_perio_classification_fingerprint()
from public, anon, authenticated, service_role;

comment on function private.enforce_perio_classification_fingerprint() is
  'Refuses a derived or confirmed measurement fingerprint that is not the true private.periodontal_measurement_digest of the examination. It runs when a fingerprint column changes and, unconditionally, on the DRAFT to FINAL transition, so an immutable record can never be created carrying provenance that never matched its measurements.';

-- ---------------------------------------------------------------------------
-- 3. The reason-less amend boundary becomes unreachable
-- ---------------------------------------------------------------------------

revoke execute on function public.amend_periodontal_examination(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.amend_periodontal_examination(uuid, uuid, uuid) is
  'SUPERSEDED and unreachable from the browser: this migration revoked its EXECUTE grant. It accepts no amendment reason, so perio_exam_final_amendment_reason_check refuses to finalize the DRAFT it creates, and that unfinalizable DRAFT permanently consumes the predecessor''s only successor slot because periodontal_examinations_one_amendment_idx keys on the predecessor regardless of status and no delete path exists for a DRAFT examination. Its replacement must accept a bounded amendment reason and must be able to adopt or discard a pre-existing reason-less DRAFT successor rather than only inserting a new one.';
