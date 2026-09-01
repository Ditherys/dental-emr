-- Unified Clinical Chart workspace, task 11 review round 1.
--
-- Four repairs, all forward-only. 20260901010240 and 20260901010242 are applied
-- and are not edited; every change below is a guarded replace of an applied
-- function body, with each target verified to occur exactly the expected number
-- of times and every step failing closed on 55000. Newline conventions are
-- normalized on both sides before matching, because this file is checked out
-- with the convention of whatever machine replays it. The repaired bodies are
-- re-created with EXECUTE rather than a literal CREATE, so the existing browser
-- grants are preserved untouched and no privilege moves. This migration grants
-- and revokes nothing, and is deliberately not a grant-terminal.
--
-- 1. IMPORTANT. public.get_periodontal_workspace_v2 failed outright for a
--    patient with no periodontal examination - the first read the workspace
--    performs for a newly registered patient.
--
--    v_derived is a record. It was assigned only inside
--    `if v_examination_id is not null`, and then read from the payload
--    expression under a `case when v_examination_id is null then null else ...`
--    guard. CASE does not protect it: PL/pgSQL resolves a record variable's
--    tuple structure when it PLANS the expression that reads it, not when the
--    branch is evaluated, so the whole payload expression fails with
--    "record v_derived is not assigned yet". Worse, the failure is
--    connection-state dependent - once a backend has planned that statement
--    with the record assigned, the null path then returns cleanly - so with
--    pooled connections it presents as an intermittent failure on exactly the
--    read a new patient triggers.
--
--    The record is now assigned on EVERY path. The set-returning helper returns
--    zero rows for a null examination and PL/pgSQL then assigns nulls to every
--    field, which is precisely the "no examination, no classification" answer
--    the payload wants. The structure comes from the helper's declared return
--    type, so it is resolved statically and the behaviour no longer depends on
--    what the backend has planned before.
--
-- 2. IMPORTANT. private.periodontal_derived_classification had already diverged
--    from the reviewed pure port it mirrors.
--
--    Arch adjacency compared `left_tooth.arch = right_tooth.arch` having
--    checked only that the LEFT arch is known. A deciduous tooth has no
--    permanent-arch sequence position, so its arch is NULL, the comparison is
--    NULL, `not (NULL)` is NULL, and the pair silently dropped out of the
--    EXISTS. The ported TypeScript returns false for such a pair - indexOf over
--    permanent-only sequences is -1 - and therefore COUNTS it. Because text
--    ordering always places the permanent code on the left, the asymmetry was
--    one-directional, and the batch validator explicitly accepts deciduous
--    codes, so it was reachable: in a mixed dentition whose only non-adjacent
--    affected pair is permanent plus deciduous, this derived GINGIVITIS or
--    HEALTH where the browser derived PERIODONTITIS.
--
--    That is worse than a wrong answer. A clinician confirming the value the
--    browser computed would have been forced to write an override reason for a
--    disagreement that was a bug, and the permanent record would then read
--    "the clinician overrode the server" when nothing was overridden. Requiring
--    both arches to be known makes the expression total and restores agreement.
--
-- 3. IMPORTANT. public.save_periodontal_measurements never incremented the
--    examination version - its trailing statement updated only updated_at - so
--    a write through the superseded boundary was INVISIBLE to the versioned
--    boundary's guard. Clinician A holds the draft at version N; anything
--    reaching the superseded boundary writes measurements and leaves the
--    version at N; A's next autosave passes its expected_version = N check and
--    silently overwrites those measurements, with no conflict surfaced to
--    anyone. It now increments the version like every other accepted batch and
--    returns the version it actually left behind, so the versioned boundary
--    sees the write and refuses. No shipped assertion pins either value.
--
-- 4. MINOR. Adoption was invisible in the audit trail, and it overwrote the
--    authorship of measurements someone else had autosaved into the orphan
--    DRAFT. The amendment event now records whether the successor was CREATED
--    or ADOPTED, and adoption preserves the charting clinician's identity
--    instead of restamping it with the adopter's.

do $migration$
declare
  v_signature text;
  v_definition text;
  v_repaired text;
  v_target text;
  v_replacement text;
  v_found integer;
  v_step record;
begin
  for v_signature in
    select unnest(array[
      'public.get_periodontal_workspace_v2(uuid,uuid,uuid)',
      'private.periodontal_derived_classification(uuid,uuid)',
      'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
      'public.amend_periodontal_examination_v2(uuid,text,uuid)'
    ])
  loop
    select pg_catalog.replace(
      pg_catalog.pg_get_functiondef(v_signature::regprocedure),
      pg_catalog.chr(13) || pg_catalog.chr(10),
      pg_catalog.chr(10)
    ) into v_repaired;

    for v_step in
      select step.target, step.replacement, step.occurrences
      from (values
        -- 1. The derived record is assigned on every path.
        (
          'public.get_periodontal_workspace_v2(uuid,uuid,uuid)',
$target_a$  if v_examination_id is not null then
    select * into v_derived
    from private.periodontal_derived_classification(v_organization_id, v_examination_id) as derivation;
  end if;$target_a$,
$replace_a$  -- Assigned on EVERY path, including the one where there is no examination
  -- to classify. PL/pgSQL resolves a record variable's tuple structure when it
  -- plans the expression that reads it, not when the branch runs, so guarding
  -- the assignment behind an `if` while reading it under a `case` made the
  -- payload expression fail with "record v_derived is not assigned yet" - and
  -- fail only until some other call in the same backend had planned it with the
  -- record assigned. The helper returns zero rows for a null examination and
  -- PL/pgSQL then assigns nulls to every field, which is exactly the answer the
  -- payload wants, and the tuple structure comes from the helper's declared
  -- return type rather than from what this backend happens to have planned.
  select * into v_derived
  from private.periodontal_derived_classification(v_organization_id, v_examination_id) as derivation;$replace_a$,
          1
        ),
        -- 2. Arch adjacency is total: both arches must be known.
        (
          'private.periodontal_derived_classification(uuid,uuid)',
$target_b$      and not (
        left_tooth.arch is not null
        and left_tooth.arch = right_tooth.arch
        and pg_catalog.abs(left_tooth.arch_index - right_tooth.arch_index) = 1
      )$target_b$,
$replace_b$      -- BOTH arches must be known before two teeth can be called adjacent. A
      -- deciduous tooth has no permanent-arch sequence position, so comparing
      -- its NULL arch yielded NULL, `not (NULL)` yielded NULL, and the pair
      -- silently dropped out of this EXISTS - while the ported TypeScript
      -- returns false for exactly that pair and therefore counts it. The
      -- expression is now total, so a permanent tooth paired with a deciduous
      -- one is non-adjacent in both implementations.
      and not (
        left_tooth.arch is not null
        and right_tooth.arch is not null
        and left_tooth.arch = right_tooth.arch
        and pg_catalog.abs(left_tooth.arch_index - right_tooth.arch_index) = 1
      )$replace_b$,
          1
        ),
        -- 3. The superseded autosave boundary advances the version it writes.
        (
          'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
$target_c$ update public.periodontal_examinations set updated_at=statement_timestamp() where organization_id=v_org and id=p_examination_id;$target_c$,
-- The increment is schema-qualified because `version` is also the name of one
-- of this function's OUT parameters, and an unqualified reference on the right
-- of the SET is ambiguous between the two at run time.
$replace_c$ update public.periodontal_examinations set version=public.periodontal_examinations.version+1,updated_at=statement_timestamp() where organization_id=v_org and id=p_examination_id;$replace_c$,
          1
        ),
        (
          'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
$target_d$version:=v_exam.version;$target_d$,
$replace_d$version:=v_exam.version+1;$replace_d$,
          1
        ),
        -- 4. Adoption preserves authorship and is named in the audit trail.
        (
          'public.amend_periodontal_examination_v2(uuid,text,uuid)',
$target_e$    set amendment_reason = v_reason,
        encounter_id = v_encounter_id,
        examined_at = pg_catalog.statement_timestamp(),
        examined_by = v_actor_user_id,
        examined_provider_id = v_provider_id,
        version = successor.version + 1,$target_e$,
$replace_e$    set amendment_reason = v_reason,
        encounter_id = v_encounter_id,
        -- Authorship of measurements already autosaved into this orphan DRAFT
        -- belongs to whoever charted them. Adoption supplies the explanation
        -- the successor never had and rebinds the correction to the visit it is
        -- actually being made in; it does not rewrite the record to claim the
        -- adopter took those measurements. The adopter is named as the audit
        -- actor, and as finalized_by / finalized_provider_id once the amendment
        -- is signed.
        --
        -- The exception is an INCOMPLETE attribution triple, which
        -- periodontal_examinations_finalized_state_check would refuse to
        -- finalize - it requires examined_at, examined_by and
        -- examined_provider_id to be present together. That is reachable: the
        -- revoked three-argument amend boundary could leave the provider null,
        -- and examined_by is ON DELETE SET NULL, so deleting the authoring user
        -- empties one column of an otherwise complete triple. Preserving a
        -- partial triple would turn the orphan into a second dead end, so all
        -- three are stamped with the adopting clinician instead, which
        -- attributes the record to the person actually doing the work rather
        -- than to somebody else. num_nonnulls is used so the test is over the
        -- whole triple rather than one column of it.
        examined_at = case when pg_catalog.num_nonnulls(
                            successor.examined_at, successor.examined_by,
                            successor.examined_provider_id) = 3
                        then successor.examined_at else pg_catalog.statement_timestamp() end,
        examined_by = case when pg_catalog.num_nonnulls(
                            successor.examined_at, successor.examined_by,
                            successor.examined_provider_id) = 3
                        then successor.examined_by else v_actor_user_id end,
        examined_provider_id = case when pg_catalog.num_nonnulls(
                            successor.examined_at, successor.examined_by,
                            successor.examined_provider_id) = 3
                        then successor.examined_provider_id else v_provider_id end,
        version = successor.version + 1,$replace_e$,
          1
        ),
        (
          'public.amend_periodontal_examination_v2(uuid,text,uuid)',
$target_f$    pg_catalog.jsonb_build_object(
      'predecessor_examination_id', p_predecessor_examination_id::text)$target_f$,
$replace_f$    -- Whether the successor was created or adopted is lineage, not clinical
    -- content, and it belongs in the trail: an adopted successor can carry
    -- measurements a different clinician autosaved. 'action' is already on
    -- private.audit_metadata_is_safe's allow-list and accepts an uppercase
    -- token; 'adopted' is not, and widening that shared allow-list with a
    -- boolean for one caller would enlarge a security surface every audited
    -- write depends on.
    pg_catalog.jsonb_build_object(
      'predecessor_examination_id', p_predecessor_examination_id::text,
      'action', case when v_adopted then 'ADOPTED' else 'CREATED' end)$replace_f$,
          1
        )
      ) as step(signature, target, replacement, occurrences)
      where step.signature = v_signature
    loop
      v_definition := v_repaired;
      -- Both sides normalized for the same reason the definition was.
      v_target := pg_catalog.replace(
        v_step.target, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
      v_replacement := pg_catalog.replace(
        v_step.replacement, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

      -- Exact substring counting, never a regex: an unescaped metacharacter in
      -- a SQL anchor would make the count meaningless.
      v_found := (pg_catalog.length(v_definition)
                  - pg_catalog.length(pg_catalog.replace(v_definition, v_target, '')))
                 / pg_catalog.length(v_target);

      if v_found <> v_step.occurrences then
        raise exception using errcode = '55000',
          message = v_signature || ' repair target was found ' || v_found::text
            || ' times, expected ' || v_step.occurrences::text;
      end if;

      v_repaired := pg_catalog.replace(v_definition, v_target, v_replacement);

      if v_repaired = v_definition then
        raise exception using errcode = '55000',
          message = v_signature || ' repair replacement made no change';
      end if;
    end loop;

    execute v_repaired;
  end loop;
end
$migration$;

-- The repaired bodies must still be exactly what the boundary assertions in
-- 20260901010241 and 20260901010243 promised: definer-scoped, empty search
-- path, and unreachable from every role but `authenticated`. EXECUTE of a
-- pg_get_functiondef body preserves all of that, and this asserts it rather
-- than assuming it.
do $boundary$
declare
  v_leak text;
begin
  select pg_catalog.string_agg(p.proname, ', ')
  into v_leak
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_periodontal_workspace_v2', 'amend_periodontal_examination_v2',
      'save_periodontal_measurements'
    )
    and (
      not p.prosecdef
      or p.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('public', p.oid, 'execute')
      or pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      or pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
      or not pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
    );

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'a repaired periodontal boundary lost its definer posture or its browser grant: ' || v_leak;
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated', 'private.periodontal_derived_classification(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege(
       'anon', 'private.periodontal_derived_classification(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege(
       'service_role', 'private.periodontal_derived_classification(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege(
       'public', 'private.periodontal_derived_classification(uuid,uuid)', 'execute') then
    raise exception using errcode = '55000',
      message = 'the repaired periodontal derivation must not be browser or service callable';
  end if;
end
$boundary$;

comment on function public.get_periodontal_workspace_v2(uuid, uuid, uuid) is
  'The read-only projection the periodontal workspace is rebuilt from on every load. It derives organization and actor inside a stable SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, validates the patient and any named examination against the derived tenant, and refuses a foreign examination as unauthorized rather than reporting it absent. It answers a patient who has never been charted with a null examination and a null classification rather than failing. It returns the canonical measurements, the classification recomputed server-side from them, the classification the clinician actually signed, and the patient''s examination timeline. It writes nothing at all.';

comment on function private.periodontal_derived_classification(uuid, uuid) is
  'The 2017/2018 periodontal classification recomputed from the canonical rows of one examination, plus the completeness summary finalization gates on. It is the SQL counterpart of the reviewed pure port in src/lib/odontogram/perio-classification.ts and shares its two properties: deterministic, and unknown is excluded from every numerator and denominator rather than counted as zero. Arch adjacency requires both teeth to have a permanent-arch position, so a permanent tooth paired with a deciduous one is non-adjacent in this implementation and in the ported one alike. An examination is complete only when it has at least one present tooth and every present tooth carries six charted sites with a known attachment level. The clinical mapping is subject to the dentist acceptance gate recorded in docs/AI_HANDOFF.md.';

comment on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) is
  'The shipped periodontal autosave boundary, superseded for new work by public.save_periodontal_measurements_v2. It no longer coalesces an omitted gingival margin to 0 or an omitted bleeding, suppuration, or plaque assessment to false, and it now increments the examination version and returns the version it left behind. Before that, a write through here was invisible to the versioned boundary''s optimistic-concurrency guard, so a clinician holding the draft at the same version could silently overwrite measurements this path had just written.';

comment on function public.amend_periodontal_examination_v2(uuid, text, uuid) is
  'The explained periodontal amendment boundary that replaces the revoked reason-less three-argument signature. It derives organization, patient, acting branch, actor, provider and encounter server-side, requires patient.clinical.write plus patient.clinical.correct at the acting branch and an active linked provider there, and refuses an empty or unbounded reason. Because periodontal_examinations_one_amendment_idx keys on the predecessor regardless of status and no delete path exists for a DRAFT examination, a pre-existing reason-less DRAFT successor is ADOPTED and given the reason it lacked rather than being duplicated or discarded; a FINAL successor means the chain is already amended and is refused. Adoption preserves the authorship of whoever charted the measurements already in that successor and records itself in the audit trail as ADOPTED rather than CREATED. Otherwise it clones the predecessor''s full measurement set and risk snapshot, never its classification, and never mutates the predecessor.';
