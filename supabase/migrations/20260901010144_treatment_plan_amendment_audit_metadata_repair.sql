-- Unified Clinical Chart workspace, task 8 review round 1, follow-up.
--
-- public.create_treatment_plan_v2 as written by 20260901010142 put the
-- superseded plan identifier into its audit metadata. private.audit_metadata_is_safe
-- allows only a reviewed key set, so every explained plan version was refused by
-- the audit_events check constraint - the amendment could not be recorded at all.
--
-- The metadata becomes opaque, matching every other treatment-plan audit event in
-- the repository. Nothing is lost: the event's entity_id is the new plan, and the
-- plan row itself carries supersedes_plan_id and amendment_reason under RLS. The
-- distinct 'treatment.plan.amended' action still distinguishes an amendment from
-- a first plan.
--
-- 20260901010142 is applied and is not edited; this is a guarded replace whose
-- target is verified to occur exactly once and which fails closed with 55000.

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_treatment_plan_v2(uuid,uuid,text,uuid,text)'::regprocedure
  ) into v_definition;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'pg_catalog\.jsonb_build_object\(''supersedes_plan_id'', p_supersedes_plan_id\)', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'create_treatment_plan_v2 audit metadata anchor not found exactly once';
  end if;

  v_repaired := pg_catalog.replace(
    v_definition,
    $old$    case
      when p_supersedes_plan_id is null then '{}'::jsonb
      else pg_catalog.jsonb_build_object('supersedes_plan_id', p_supersedes_plan_id)
    end$old$,
    $new$    '{}'::jsonb$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'create_treatment_plan_v2 audit metadata replacement made no change';
  end if;

  -- Nothing may build audit metadata any more: the event is opaque.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_repaired, 'jsonb_build_object', 'g')) <> 0 then
    raise exception using errcode = '55000',
      message = 'create_treatment_plan_v2 must build no audit metadata at all';
  end if;
  -- The predecessor is still validated and still written to the plan row.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_repaired, 'supersedes_plan_id', 'g')) <> 7 then
    raise exception using errcode = '55000',
      message = 'create_treatment_plan_v2 lost a supersedes_plan_id reference it must keep';
  end if;

  execute v_repaired;
end
$migration$;

comment on function public.create_treatment_plan_v2(uuid, uuid, text, uuid, text) is
  'Creates a DRAFT treatment plan for a same-tenant patient under clinical.write, optionally as the explained successor of an existing plan. A predecessor and a bounded reason are accepted only together, the predecessor is revalidated against the derived tenant and the same patient, and a partial unique index refuses a second successor for the same plan. The predecessor row is never mutated. Accepts no organization, provider, actor, or author identity from a client, and audits atomically with opaque metadata: the amendment is distinguished by the treatment.plan.amended action, while the predecessor and the clinical reason stay on the RLS-protected plan row.';
