-- Unified Clinical Chart workspace, task 7 review round 2.
--
-- A void of a dental implant component is an append-only event row in
-- public.dental_implant_component_voids. public.void_current_implant_component
-- writes that row and deliberately does NOT mutate the sealed component, so
-- public.dental_implant_components.voided_at is never populated for this table -
-- the column exists but no code path sets it.
--
-- Three functions added in 20260901010134 and 20260901010135 tested liveness with
-- `voided_at is null` alone, which is therefore always true. The consequences:
--
--   1. The one-fixture-per-tooth trigger treated a voided fixture as live, so
--      after a clinician voided a mis-recorded fixture, recording the correct one
--      on that tooth failed 23505 through every insert path. Amendment was no
--      escape either: public.amend_current_implant_component refuses a voided
--      predecessor. A mis-recorded implant became permanently uncorrectable on
--      that tooth. That is a worse defect than the browser-only guard it
--      replaced, because it traps legitimate clinical correction.
--   2. private.normalize_visit_implant_chain accepted a voided component as the
--      parent of a staged continuation.
--   3. public.get_clinical_composer_context still projected a voided component as
--      bridge support, as the tooth's implant stage, and as the tip a staged
--      continuation attaches to.
--
-- All three now consult the void-event table, which is the authority. The
-- redundant `voided_at is null` clause is retained rather than removed: it is the
-- pre-existing repository convention, it is harmless, and it stays correct if the
-- column is ever populated. This migration deliberately adds no NEW bare use of
-- that predicate.
--
-- It also corrects an overstated claim in 20260901010135's in-body comment about
-- what FOR KEY SHARE guarantees. See step 2b.
--
-- 20260901010134 and 20260901010135 are applied and are not edited. Every change
-- below uses the repository's pg_get_functiondef guarded-replace pattern, with
-- each target's occurrence count verified exactly and every step failing closed
-- with 55000.

-- ---------------------------------------------------------------------------
-- 1. The one-fixture-per-tooth trigger stops counting voided fixtures
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.reject_duplicate_current_implant_fixture()'::regprocedure
  ) into v_definition;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'existing\.voided_at is null', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'reject_duplicate_current_implant_fixture liveness precondition not found exactly once';
  end if;

  v_repaired := pg_catalog.replace(
    v_definition,
    $old$existing.voided_at is null$old$,
    $new$existing.voided_at is null and not exists (select 1 from public.dental_implant_component_voids as void_event where void_event.organization_id = existing.organization_id and void_event.component_id = existing.id)$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'reject_duplicate_current_implant_fixture liveness replacement made no change';
  end if;

  execute v_repaired;
end
$migration$;

comment on function private.reject_duplicate_current_implant_fixture() is
  'Refuses a second live CURRENT implant fixture on a tooth that already carries one, on every insert path. Liveness is read from public.dental_implant_component_voids, the append-only table public.void_current_implant_component actually writes, because dental_implant_components.voided_at is never populated. A voided fixture is not live, so the void-then-re-record correction path stays open; a successor carrying supersedes_component_id is an amendment and is always allowed. The check is preceded by an advisory lock on the tooth identity so two concurrent inserts cannot both observe an empty tooth.';

-- ---------------------------------------------------------------------------
-- 2. The staged-chain normalizer stops accepting a voided parent, and stops
--    overstating what its row lock guarantees
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.normalize_visit_implant_chain(uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;

  -- 2a. Liveness.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'existing\.voided_at is null', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain liveness precondition not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$existing.voided_at is null$old$,
    $new$existing.voided_at is null and not exists (select 1 from public.dental_implant_component_voids as void_event where void_event.organization_id = existing.organization_id and void_event.component_id = existing.id)$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain liveness replacement made no change';
  end if;
  v_definition := v_repaired;

  -- 2b. The comment claimed FOR KEY SHARE prevents the parent being voided or
  -- superseded. Neither is true: a void is an insert into another table, and a
  -- supersede is an insert of a different row. KEY SHARE blocks deletion and key
  -- changes, the same lock an FK reference takes. The next reader takes a comment
  -- as the contract, so it is corrected rather than left flattering.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'FOR KEY SHARE pins it for the rest of the', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 1 not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$component may sit on. FOR KEY SHARE pins it for the rest of the$old$,
    $new$component may sit on. FOR KEY SHARE takes the same row lock an FK$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 1 replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'transaction, so it cannot be voided or superseded between this check', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 2 not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$transaction, so it cannot be voided or superseded between this check$old$,
    $new$reference takes: it stops the row being deleted or its key changed. It$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 2 replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'and the insert that depends on it\.', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 3 not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$and the insert that depends on it.$old$,
    $new$does NOT stop a void, which appends a row to another table, nor a supersede, which inserts a different row; the void-event predicate above is what excludes both.$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain lock-comment line 3 replacement made no change';
  end if;

  execute v_repaired;
end
$migration$;

comment on function private.normalize_visit_implant_chain(uuid,uuid,jsonb) is
  'Validates and normalizes an implant chain that may continue an existing one. Identical to private.normalize_implant_chain for a chain that places its own fixture; additionally accepts a root ABUTMENT, CROWN or ATTACHMENT carrying depends_on_component_id, which must resolve to a CURRENT component of the same organization, patient and tooth position that is sealed, carries no void event, is not superseded, and is exactly the required parent kind. Liveness is read from public.dental_implant_component_voids because dental_implant_components.voided_at is never populated. The named component is revalidated against the derived tenant, never trusted from a client.';

-- ---------------------------------------------------------------------------
-- 3. The composer projection stops offering voided components
-- ---------------------------------------------------------------------------
--
-- Three places read implant liveness: the bridge support list, the implant stage
-- per tooth, and the tip a staged continuation attaches to. All three carry the
-- identical predicate and all three are repaired in one pass, so the projection
-- cannot disagree with itself about whether a component is live.

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_clinical_composer_context(uuid,uuid)'::regprocedure
  ) into v_definition;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'component\.voided_at is null', 'g')) <> 3 then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context liveness precondition not found exactly three times';
  end if;

  v_repaired := pg_catalog.replace(
    v_definition,
    $old$component.voided_at is null$old$,
    $new$component.voided_at is null and not exists (select 1 from public.dental_implant_component_voids as void_event where void_event.organization_id = component.organization_id and void_event.component_id = component.id)$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context liveness replacement made no change';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_repaired, 'dental_implant_component_voids', 'g')) <> 3 then
    raise exception using errcode = '55000',
      message = 'get_clinical_composer_context liveness replacement did not reach all three projections';
  end if;

  execute v_repaired;
end
$migration$;
