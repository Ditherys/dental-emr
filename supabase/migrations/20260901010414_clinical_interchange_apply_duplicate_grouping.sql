-- Unified Clinical Chart workspace, task 15 review round 1 follow-up: the
-- grouping repair in 20260901010413 could not apply a batch that asserted the
-- same finding on the same tooth twice.
--
-- 20260901010413 groups candidates that share a clinical code, surface set,
-- clinical date and note into one public.record_visit_tooth_findings call. A
-- file may legitimately carry the same finding on the same tooth twice - a
-- sloppy export, or two visits recorded identically - and both candidates stage
-- as separate rows classified independently against the canonical chart. Handed
-- to one writer call, that group carries a duplicated tooth code, which the
-- writer correctly refuses with 22023, so the whole apply would fail rather than
-- appending either. Before grouping, each candidate had its own call and both
-- were appended.
--
-- The fix ranks each candidate by how many times its tooth has already appeared
-- within its group key, and includes that occurrence rank in the grouping. The
-- first assertion of every tooth travels in one call, the second in another, and
-- so on, so every group carries distinct tooth codes and the pre-grouping
-- behaviour is restored exactly. Chunking at 32 now happens within an occurrence
-- rank, so the writer's tooth-code ceiling still holds.
--
-- Nothing else moves: the same candidates are written, in the same order, with
-- the same deterministic per-group request key, through the same writer.
--
-- Guarded pg_get_functiondef replacement again, so the narrow EXECUTE grant
-- survives. Carriage returns are normalised before anchoring because the applied
-- body keeps the line endings of the checkout that applied it. Every guard fails
-- closed on 55000.
do $do$
declare
  v_definition text;
  v_replacement text;
  v_from_anchor constant text :=
$anchor$    from (
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
$anchor$;
  v_from_repaired constant text :=
$repaired$    from (
      select
        ranked.id,
        ranked.ordinal,
        ranked.tooth_code,
        ranked.clinical_code,
        ranked.surfaces,
        ranked.clinical_date,
        ranked.note,
        ranked.occurrence,
        -- Chunk WITHIN one occurrence rank, so a group never exceeds the 32
        -- tooth codes public.record_visit_tooth_findings accepts.
        ((pg_catalog.row_number() over (
           partition by
             ranked.clinical_code,
             ranked.surfaces,
             ranked.clinical_date,
             ranked.note,
             ranked.occurrence
           order by ranked.ordinal
         ) - 1) / 32) as chunk
      from (
        select
          candidate.id,
          candidate.ordinal,
          candidate.tooth_code,
          candidate.clinical_code,
          candidate.surfaces,
          candidate.clinical_date,
          candidate.note,
          -- REVIEW ROUND 1 follow-up. A file may legitimately assert the same
          -- finding on the same tooth twice, and both candidates stage as
          -- separate rows. Grouping them into ONE writer call would hand that
          -- writer a duplicated tooth code, which it correctly refuses, so a
          -- batch with a repeated finding would have failed outright. The
          -- occurrence rank puts the first, second and third assertion of a
          -- tooth into different groups, so each is written by its own call
          -- exactly as it was before grouping, and every group still carries
          -- distinct tooth codes.
          pg_catalog.row_number() over (
            partition by
              candidate.clinical_code,
              candidate.surfaces,
              candidate.clinical_date,
              candidate.note,
              candidate.tooth_code
            order by candidate.ordinal
          ) as occurrence
        from public.clinical_import_candidates as candidate
        where candidate.organization_id = v_organization_id
          and candidate.batch_id = p_batch_id
          and candidate.id = any(p_candidate_ids)
      ) as ranked
    ) as grouped
$repaired$;
  v_group_anchor constant text :=
$anchor$    group by
      grouped.clinical_code,
      grouped.surfaces,
      grouped.clinical_date,
      grouped.note,
      grouped.chunk
$anchor$;
  v_group_repaired constant text :=
$repaired$    group by
      grouped.clinical_code,
      grouped.surfaces,
      grouped.clinical_date,
      grouped.note,
      grouped.occurrence,
      grouped.chunk
$repaired$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  if v_definition is null then
    raise exception using errcode='55000', message='expected clinical import apply RPC is missing';
  end if;
  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='unexpected clinical import apply security posture';
  end if;
  -- The 20260901010413 repairs must both already be present: this follow-up
  -- narrows the grouping and must never resurrect a body that predates them.
  if v_definition not like '%private.clinical_import_candidate_classification(%'
     or v_definition not like '%v_candidate.tooth_codes%'
     or v_definition not like '%private.require_active_actor_provider(%'
     or v_definition not like '%public.record_visit_tooth_findings(%'
     or v_definition not like '%clinical.import.applied%'
     or v_definition not like '%candidate.classification not in (''NEW'', ''DUPLICATE'')%' then
    raise exception using errcode='55000', message='unexpected clinical import apply guard set';
  end if;

  if position(v_from_repaired in v_definition) > 0
     and position(v_group_repaired in v_definition) > 0 then
    v_definition := null;
  elsif (length(v_definition) - length(pg_catalog.replace(v_definition, v_from_anchor, '')))
          / length(v_from_anchor) <> 1
     or (length(v_definition) - length(pg_catalog.replace(v_definition, v_group_anchor, '')))
          / length(v_group_anchor) <> 1 then
    raise exception using errcode='55000', message='unexpected clinical import apply grouping statements';
  end if;

  if v_definition is not null then
    v_replacement := pg_catalog.replace(v_definition, v_from_anchor, v_from_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='clinical import apply grouping source anchor is missing';
    end if;
    v_definition := v_replacement;

    v_replacement := pg_catalog.replace(v_definition, v_group_anchor, v_group_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='clinical import apply grouping key anchor is missing';
    end if;

    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.apply_clinical_import_batch_v1(uuid,uuid,uuid,uuid[],uuid)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or v_definition not like '%ranked.occurrence%'
     or v_definition not like '%grouped.occurrence,%'
     or v_definition not like '%private.clinical_import_candidate_classification(%'
     or v_definition not like '%private.require_active_actor_provider(%' then
    raise exception using errcode='55000', message='clinical import apply grouping repair did not take';
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
