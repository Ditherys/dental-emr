-- Unified Clinical Chart workspace, task 11 review round 2.
--
-- Two Low findings, both narrow. 20260901010240 through 20260901010244 are
-- applied and are not edited; both changes are guarded replaces of applied
-- bodies, re-created with EXECUTE rather than a literal CREATE so the existing
-- browser grants are preserved and no privilege moves. Every target is verified
-- to occur exactly once and every step fails closed on 55000. This migration
-- grants and revokes nothing and is not a grant-terminal.
--
-- 1. LOW. Round 1 made public.save_periodontal_measurements increment the
--    examination version so a write through the superseded boundary could no
--    longer hide from the versioned one. It incremented on EVERY accepted call,
--    including a batch of four empty arrays that writes nothing at all - so a
--    no-op call through the superseded boundary handed a versioned client a
--    spurious `stale version` conflict. That failed in the conservative
--    direction (a false conflict, never a silent overwrite) but it is a
--    behaviour change beyond "a v1 write becomes visible", and a client cannot
--    tell a real conflict from a phantom one. The increment is now gated on the
--    batch actually carrying rows, which is the same condition the audit event
--    already reports through saved_sites/plaque/tooth/furcation.
--
--    No assertion pins either value: the only suite that calls this boundary
--    asserts saved_sites, and both of this task's own assertions use a
--    non-empty batch. That was checked before changing it.
--
-- 2. LOW. On the incomplete-attribution-triple adoption path the superseded
--    attribution was replaced and nothing recorded what it had been.
--    private.audit_metadata_is_safe already allow-lists
--    attribution_previous_provider, which is exactly "the provider this record
--    was previously attributed to", so the amendment event now carries it -
--    emitted only when adoption actually replaced an attribution that named a
--    provider, and stripped otherwise.
--
--    The superseded examined_by is a USER id, and the allow-list carries no
--    user-id key at all. Widening a shared IMMUTABLE function that every
--    audited write in the system depends on, to carry one identifier for one
--    caller, is the same trap this task already declined for 'adopted' and the
--    one Task 8 hit. It is not done here. The acting user is already on the
--    event as actor_user_id, and in the only sub-case where a superseded author
--    exists to record - a successor left with a null provider by the revoked
--    three-argument boundary - that author is still recoverable from the audit
--    event which created the orphan successor against the same entity. In the
--    other sub-case the author column is null precisely because the user was
--    deleted, so there is nothing left to record.

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
        -- 1a. The stored version advances only when the batch wrote something.
        (
          'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
$target_a$ update public.periodontal_examinations set version=public.periodontal_examinations.version+1,updated_at=statement_timestamp() where organization_id=v_org and id=p_examination_id;$target_a$,
$replace_a$ update public.periodontal_examinations set version=public.periodontal_examinations.version+(case when v_sc+v_pc+v_tc+v_fc>0 then 1 else 0 end),updated_at=statement_timestamp() where organization_id=v_org and id=p_examination_id;$replace_a$,
          1
        ),
        -- 1b. And the returned version reports what was actually left behind.
        (
          'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)',
$target_b$version:=v_exam.version+1;$target_b$,
$replace_b$version:=v_exam.version+(case when v_sc+v_pc+v_tc+v_fc>0 then 1 else 0 end);$replace_b$,
          1
        ),
        -- 2a. Somewhere to hold the attribution adoption is about to replace.
        (
          'public.amend_periodontal_examination_v2(uuid,text,uuid)',
$target_c$  v_stored_adopted boolean;$target_c$,
$replace_c$  v_stored_adopted boolean;
  v_superseded_provider_id uuid;$replace_c$,
          1
        ),
        -- 2b. Captured BEFORE the adoption UPDATE, and only when the triple is
        --     incomplete - a complete triple is preserved, so there is no
        --     previous attribution to report.
        (
          'public.amend_periodontal_examination_v2(uuid,text,uuid)',
$target_d$  select successor.id, successor.status into v_successor_id, v_successor_status
  from public.periodontal_examinations as successor$target_d$,
$replace_d$  select successor.id, successor.status,
         case when pg_catalog.num_nonnulls(
                     successor.examined_at, successor.examined_by,
                     successor.examined_provider_id) = 3
           then null else successor.examined_provider_id end
    into v_successor_id, v_successor_status, v_superseded_provider_id
  from public.periodontal_examinations as successor$replace_d$,
          1
        ),
        -- 2c. The amendment event names the attribution it replaced.
        (
          'public.amend_periodontal_examination_v2(uuid,text,uuid)',
$target_e$    pg_catalog.jsonb_build_object(
      'predecessor_examination_id', p_predecessor_examination_id::text,
      'action', case when v_adopted then 'ADOPTED' else 'CREATED' end)$target_e$,
$replace_e$    -- attribution_previous_provider is already on
    -- private.audit_metadata_is_safe's allow-list and means exactly "the
    -- provider this record was previously attributed to". It is emitted only
    -- when adoption actually replaced an incomplete attribution that named a
    -- provider; jsonb_strip_nulls drops it in every other case, including the
    -- ordinary create path.
    --
    -- The superseded examined_by is a USER id and the allow-list carries no
    -- user-id key. That is deliberate and is not widened here: the acting user
    -- is already on the event as actor_user_id, and a superseded author only
    -- exists to record when the successor was left with a null provider by the
    -- revoked three-argument boundary - in which case it remains recoverable
    -- from the audit event that created that successor against this same
    -- entity. When the author column is null instead, it is null because the
    -- user was deleted, so there is nothing left to record.
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'predecessor_examination_id', p_predecessor_examination_id::text,
      'action', case when v_adopted then 'ADOPTED' else 'CREATED' end,
      'attribution_previous_provider', v_superseded_provider_id::text))$replace_e$,
          1
        )
      ) as step(signature, target, replacement, occurrences)
      where step.signature = v_signature
    loop
      v_definition := v_repaired;
      v_target := pg_catalog.replace(
        v_step.target, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
      v_replacement := pg_catalog.replace(
        v_step.replacement, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

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

-- Both repaired bodies must still be exactly what the boundary assertions in
-- 20260901010241 promised. EXECUTE of a pg_get_functiondef body preserves all
-- of it; this asserts it rather than assuming it.
do $boundary$
declare
  v_leak text;
begin
  select pg_catalog.string_agg(p.proname, ', ')
  into v_leak
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('save_periodontal_measurements', 'amend_periodontal_examination_v2')
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
end
$boundary$;

comment on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) is
  'The shipped periodontal autosave boundary, superseded for new work by public.save_periodontal_measurements_v2. It no longer coalesces an omitted gingival margin to 0 or an omitted bleeding, suppuration, or plaque assessment to false. It advances the examination version whenever the batch actually carries rows, and returns the version it left behind, so a write through here can no longer hide from the versioned boundary''s optimistic-concurrency guard - while a batch of empty arrays, which writes nothing, leaves the version alone rather than manufacturing a conflict for a versioned client.';
