-- Unified Clinical Chart workspace, task 15 review round 1: two forward-only
-- repairs to public.apply_clinical_import_batch_v1.
--
-- ITEM 3 - the confirmed review could be stale. The apply gate checked the
-- classification STORED AT STAGE TIME. If another clinician charted the same
-- tooth between the review and the confirmation, a candidate staged NEW could
-- be appended even though it had become a CONFLICT. That is not a bypass - it
-- still appends through the reviewed writer, and two clinicians charting by
-- hand reach the same state - but the whole purpose of a review dialog is to
-- let a clinician decide against an accurate picture. The classification is now
-- re-derived inside the transaction, from the canonical chart, for every
-- selected candidate.
--
-- ITEM 2 - the 500-candidate ceiling was one click away from a statement
-- timeout. The dialog default-selects every NEW candidate, so the ceiling was
-- the default path rather than an edge case, and 500 nested writer calls each
-- opening or resuming the managed visit and taking three advisory locks is
-- plausibly beyond an 8s statement_timeout. Candidates that assert the same
-- code, surface set, clinical date and note are now one writer call carrying up
-- to 32 tooth codes, which that writer already accepts.
--
-- Neither change relaxes anything. The selection gate, the batch-scope gate,
-- the CONFLICT/UNSUPPORTED refusal, the provider derivation, the append-only
-- writer and the audit event are all untouched, and the per-call request key
-- stays deterministic so a retry still replays.
--
-- Replacement goes through the guarded pg_get_functiondef pattern rather than a
-- top-level CREATE OR REPLACE, so the existing narrow EXECUTE grant survives
-- and ADR-017's grant-last invariant is not disturbed. Every guard fails closed
-- on 55000, and both anchors are counted against the APPLIED body before
-- anything is written.
do $do$
declare
  v_definition text;
  v_replacement text;
  v_provider_anchor constant text :=
$anchor$  -- The treating provider is derived from the signed-in user before anything
  -- is written, so a clinician with no active provider link at this branch is
  -- refused without a managed visit having been opened on their behalf.
  perform private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );$anchor$;
  v_reclassify constant text :=
$repaired$  -- REVIEW ROUND 1, item 3. The classification the clinician confirmed was
  -- derived when the batch was STAGED. Another clinician may have charted this
  -- patient since, so every selected candidate is re-derived here, inside the
  -- transaction, against the canonical chart as it stands NOW. A candidate that
  -- has become a CONFLICT is refused rather than appended against a review that
  -- is no longer true. It is deliberately evaluated once, before the loop, so
  -- this apply's own appends cannot turn a later candidate in the same batch
  -- into a conflict against an entry that did not exist when the clinician
  -- confirmed.
  if exists (
    select 1
    from public.clinical_import_candidates as candidate
    where candidate.organization_id = v_organization_id
      and candidate.batch_id = p_batch_id
      and candidate.id = any(p_candidate_ids)
      and private.clinical_import_candidate_classification(
            v_organization_id, p_patient_id, candidate.tooth_code,
            candidate.clinical_code, candidate.surfaces
          ) not in ('NEW', 'DUPLICATE')
  ) then
    raise exception using message = 'invalid state';
  end if;
$repaired$;
  v_loop_anchor constant text :=
$anchor$  for v_candidate in
    select
      candidate.id,
      candidate.tooth_code,
      candidate.clinical_code,
      candidate.surfaces,
      candidate.clinical_date,
      candidate.note
    from public.clinical_import_candidates as candidate
    where candidate.organization_id = v_organization_id
      and candidate.batch_id = p_batch_id
      and candidate.id = any(p_candidate_ids)
    order by candidate.ordinal
  loop
    -- The existing reviewed writer, not a second insert path. It opens or
    -- resumes the managed visit, derives the treating provider again,
    -- revalidates the finding, appends the entry and audits it. Nothing here
    -- duplicates its authorization, and nothing here replaces a chart row.
    select visit.encounter_id into v_encounter_id
    from public.record_visit_tooth_findings(
      p_branch_id,
      p_patient_id,
      array[v_candidate.tooth_code],
      v_candidate.clinical_code,
      v_candidate.surfaces,
      'ACTIVE',
      v_candidate.clinical_date,
      v_candidate.note,
      (pg_catalog.md5(p_batch_id::text || ':' || v_candidate.id::text))::uuid
    ) as visit;

    if v_encounter_id is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;

    update public.clinical_import_candidates as candidate
    set applied_at = pg_catalog.statement_timestamp()
    where candidate.organization_id = v_organization_id
      and candidate.id = v_candidate.id;

    v_applied := v_applied + 1;
  end loop;$anchor$;
  v_loop_repaired constant text :=
$repaired$  -- REVIEW ROUND 1, item 2. Candidates that assert the SAME clinical code on
  -- the SAME surface set, on the same clinical date, with the same note are one
  -- writer call carrying up to 32 tooth codes, which is exactly what
  -- public.record_visit_tooth_findings already accepts. A 500-candidate batch
  -- that used to make 500 nested calls - each opening or resuming the managed
  -- visit and taking three advisory locks - now makes as many calls as there
  -- are genuinely distinct findings. Grouping changes no clinical fact: the
  -- writer revalidates surface anatomy per tooth against the shared surface
  -- set, and staging already refused any tooth whose anatomy contradicts it.
  for v_candidate in
    select
      grouped.clinical_code,
      grouped.surfaces,
      grouped.clinical_date,
      grouped.note,
      pg_catalog.array_agg(grouped.tooth_code order by grouped.ordinal) as tooth_codes,
      pg_catalog.array_agg(grouped.id order by grouped.ordinal) as candidate_ids
    from (
      select
        candidate.id,
        candidate.ordinal,
        candidate.tooth_code,
        candidate.clinical_code,
        candidate.surfaces,
        candidate.clinical_date,
        candidate.note,
        ((pg_catalog.row_number() over (
           partition by
             candidate.clinical_code,
             candidate.surfaces,
             candidate.clinical_date,
             candidate.note
           order by candidate.ordinal
         ) - 1) / 32) as chunk
      from public.clinical_import_candidates as candidate
      where candidate.organization_id = v_organization_id
        and candidate.batch_id = p_batch_id
        and candidate.id = any(p_candidate_ids)
    ) as grouped
    group by
      grouped.clinical_code,
      grouped.surfaces,
      grouped.clinical_date,
      grouped.note,
      grouped.chunk
    order by pg_catalog.min(grouped.ordinal)
  loop
    -- The existing reviewed writer, not a second insert path. It opens or
    -- resumes the managed visit, derives the treating provider again,
    -- revalidates the finding, appends the entries and audits each one. Nothing
    -- here duplicates its authorization, and nothing here replaces a chart row.
    select visit.encounter_id into v_encounter_id
    from public.record_visit_tooth_findings(
      p_branch_id,
      p_patient_id,
      v_candidate.tooth_codes,
      v_candidate.clinical_code,
      v_candidate.surfaces,
      'ACTIVE',
      v_candidate.clinical_date,
      v_candidate.note,
      -- Deterministic per-group key: the batch plus the exact candidate set
      -- this call writes, so a retry replays instead of appending twice.
      (pg_catalog.md5(p_batch_id::text || ':' || v_candidate.candidate_ids::text))::uuid
    ) as visit;

    if v_encounter_id is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;

    update public.clinical_import_candidates as candidate
    set applied_at = pg_catalog.statement_timestamp()
    where candidate.organization_id = v_organization_id
      and candidate.id = any(v_candidate.candidate_ids);

    v_applied := v_applied + pg_catalog.cardinality(v_candidate.candidate_ids);
  end loop;$repaired$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)'::regprocedure
  ) into v_definition;

  -- The applied body keeps the line endings of the checkout that applied it, so
  -- a CRLF working tree stores CRLF inside the function source and a LF one
  -- does not. Carriage returns are normalised out BEFORE the anchors are
  -- counted, so these multi-line anchors match on either checkout and the
  -- replacement is written with one consistent newline style. CR is whitespace
  -- in PL/pgSQL and appears in no string literal in this body, so removing it
  -- changes nothing that executes.
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  if v_definition is null then
    raise exception using errcode='55000', message='expected clinical import apply RPC is missing';
  end if;
  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='unexpected clinical import apply security posture';
  end if;
  -- Every gate this repair must not resurrect an older body past.
  if v_definition not like '%has_clinical_permission_at_branch(%'
     or v_definition not like '%private.require_active_actor_provider(%'
     or v_definition not like '%public.record_visit_tooth_findings(%'
     or v_definition not like '%clinical.import.applied%'
     or v_definition not like '%candidate.classification not in (''NEW'', ''DUPLICATE'')%'
     or v_definition not like '%raise insufficient_privilege using message = ''not authorized''%' then
    raise exception using errcode='55000', message='unexpected clinical import apply guard set';
  end if;

  if position(v_reclassify in v_definition) > 0
     and position(v_loop_repaired in v_definition) > 0 then
    -- Already repaired. Nothing to do, and nothing to re-count.
    v_definition := null;
  elsif (length(v_definition) - length(pg_catalog.replace(v_definition, v_provider_anchor, '')))
          / length(v_provider_anchor) <> 1
     or (length(v_definition) - length(pg_catalog.replace(v_definition, v_loop_anchor, '')))
          / length(v_loop_anchor) <> 1 then
    raise exception using errcode='55000', message='unexpected clinical import apply statement set';
  end if;

  if v_definition is not null then
    v_replacement := pg_catalog.replace(
      v_definition, v_provider_anchor, v_reclassify || pg_catalog.chr(10) || v_provider_anchor
    );
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='clinical import apply provider anchor is missing';
    end if;
    v_definition := v_replacement;

    v_replacement := pg_catalog.replace(v_definition, v_loop_anchor, v_loop_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='clinical import apply loop anchor is missing';
    end if;

    execute v_replacement;
  end if;

  -- Post-guards. Assert the boundary in BOTH directions after the replacement,
  -- because CREATE OR REPLACE through EXECUTE would silently keep an ACL this
  -- migration has no authority to re-issue if it had dropped one.
  select pg_catalog.pg_get_functiondef(
    'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or v_definition not like '%private.clinical_import_candidate_classification(%'
     or v_definition not like '%pg_catalog.row_number() over (%'
     or v_definition not like '%v_candidate.tooth_codes%'
     or v_definition not like '%private.require_active_actor_provider(%'
     or v_definition not like '%candidate.classification not in (''NEW'', ''DUPLICATE'')%' then
    raise exception using errcode='55000', message='clinical import apply repair did not take';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)',
       'execute'
     ) then
    raise exception using errcode='55000', message='clinical import apply grant boundary moved';
  end if;
end
$do$;
