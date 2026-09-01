-- Unified Clinical Chart workspace, task 8: treatment planning inside the chart.
--
-- Two defects are closed here.
--
-- 1. public.add_treatment_plan_discussion accepts a client-supplied
--    p_treating_provider_id, so the browser chose whose clinical authorship a
--    plan discussion carried. Every other clinical boundary in this plan derives
--    the treating provider from the signed-in actor with
--    private.require_active_actor_provider. This migration adds the provider-free
--    v2 signature and REVOKES the browser grant on the superseded five-argument
--    one. The v1 function itself is retained, unreachable, so applied migrations
--    stay unedited and nothing that referenced it breaks.
--
-- 2. public.complete_treatment_case creates the plan-linked clinical entry (and,
--    for a materialized design, the bridge or implant chain) with encounter_id
--    left null. public.tooth_clinical_entries refuses every UPDATE, so those rows
--    could never be bound afterwards: a plan-linked treatment carried no managed
--    visit and therefore no encounter attribution at all, defeating the purpose
--    of public.start_or_resume_clinical_visit. It is fixed forward, at INSERT
--    time, never by rewriting an existing row.
--
-- The completion function is applied, so it is changed with the repository's
-- pg_get_functiondef guarded-replace pattern. pg_catalog.replace is global, so
-- every target is verified to occur exactly once first and every step fails
-- closed with 55000.
--
-- This object migration grants nothing; 20260901010141 owns the only new
-- browser-reachable grant.

-- ---------------------------------------------------------------------------
-- 1. The provider-free plan discussion boundary
-- ---------------------------------------------------------------------------

create function public.add_treatment_plan_discussion_v2(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_context text,
  p_notes text default null
)
returns table(discussion_id uuid, discussed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_patient_id uuid;
  v_discussed_at timestamptz := pg_catalog.statement_timestamp();
  v_notes text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_notes), '');

  if p_plan_id is null
     or p_context is null
     or pg_catalog.btrim(p_context) = ''
     or pg_catalog.length(p_context) > 200
     or coalesce(pg_catalog.length(v_notes), 0) > 4000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The treating provider is the signed-in actor's own active provider at the
  -- acting branch. There is no provider parameter, so an OWNER who does not
  -- treat is refused here rather than being allowed to file the discussion
  -- under somebody else's clinical identity.
  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_acting_branch_id, v_actor_user_id
  );

  select plan.patient_id into v_patient_id
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.treatment_plan_discussions (
    organization_id, plan_id, discussed_by, treating_provider_id,
    discussed_at, context, notes
  ) values (
    v_organization_id, p_plan_id, v_actor_user_id, v_provider_id,
    v_discussed_at, pg_catalog.btrim(p_context), v_notes
  ) returning id, public.treatment_plan_discussions.discussed_at
    into discussion_id, discussed_at;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.discussion_added', 'treatment_plan_discussion', discussion_id,
    v_patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.add_treatment_plan_discussion_v2(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

comment on function public.add_treatment_plan_discussion_v2(uuid, uuid, text, text) is
  'Appends a discussion to a same-tenant plan in any status under clinical.write, deriving the treating provider from the signed-in actor with private.require_active_actor_provider. It accepts no provider, organization, actor, or provider display name from a client, and audits the append atomically. Replaces the superseded five-argument signature, whose browser grant 20260901010140 revokes.';

-- The superseded provider-accepting signature leaves the browser surface.
revoke execute on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text)
from public, anon, authenticated, service_role;

comment on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text) is
  'Superseded by public.add_treatment_plan_discussion_v2. It accepted a client-supplied treating provider, so no browser role may execute it; this migration revoked the grant.';

-- ---------------------------------------------------------------------------
-- 2. A plan-linked completion is bound to the managed clinical visit
-- ---------------------------------------------------------------------------
--
-- Lock ordering. public.record_treatment_event_v2 takes its own request lock
-- (seed 3), then the managed visit's request-key lock (seed 1) and identity lock
-- (seed 0), and only then delegates here, where the completion request lock
-- (seed 0, over a disjoint key space) is taken. For a direct caller to acquire
-- the same locks in the same relative order, the visit must be obtained BEFORE
-- the completion request lock rather than after it, which is what the insertion
-- below does. Every caller therefore takes the visit identity lock before the
-- completion request lock, so no cycle is constructible. The cost is that a
-- replayed direct completion resumes (or, on a later day, opens) the caller's
-- own managed visit before returning the stored result; that caller is an
-- authorized treating dentist at that branch, for whom an open managed visit is
-- the normal state, and correct lock ordering is worth more than avoiding it.

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure
  ) into v_definition;

  -- 2a. Two locals: the patient the visit belongs to, and the visit itself.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_ids uuid\[\]:=array\[\]::uuid\[\];', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case declaration anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$v_ids uuid[]:=array[]::uuid[];$old$,
    $new$v_ids uuid[]:=array[]::uuid[]; v_visit_patient uuid; v_encounter_id uuid;$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case declaration replacement made no change';
  end if;
  v_definition := v_repaired;

  -- 2b. Obtain the managed visit before the completion request lock.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_request_fingerprint:=pg_catalog\.md5\(p_case_id::text', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case fingerprint anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$v_request_fingerprint:=pg_catalog.md5(p_case_id::text$old$,
    $new$select procedure_case.patient_id into v_visit_patient from public.procedure_cases as procedure_case where procedure_case.organization_id=v_org and procedure_case.id=p_case_id for key share;
  if v_visit_patient is null then raise insufficient_privilege using message='not authorized'; end if;
  select visit.encounter_id into v_encounter_id from public.start_or_resume_clinical_visit(p_acting_branch_id,v_visit_patient,null,null) as visit;
  if v_encounter_id is null then raise insufficient_privilege using message='not authorized'; end if;
  v_request_fingerprint:=pg_catalog.md5(p_case_id::text$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case visit acquisition replacement made no change';
  end if;
  v_definition := v_repaired;

  -- 2c. The plan-linked clinical entry carries the visit.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,version\) values\(', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case clinical entry column anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,version) values($old$,
    $new$treatment_plan_item_id,charge_id,encounter_id,effective_at,completed_at,recorded_by,version) values($new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case clinical entry column replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_provider,p_plan_item_id,v_charge,statement_timestamp\(\),statement_timestamp\(\),v_actor,1\) returning id into v_clinical', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case clinical entry value anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$v_provider,p_plan_item_id,v_charge,statement_timestamp(),statement_timestamp(),v_actor,1) returning id into v_clinical$old$,
    $new$v_provider,p_plan_item_id,v_charge,v_encounter_id,statement_timestamp(),statement_timestamp(),v_actor,1) returning id into v_clinical$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case clinical entry value replacement made no change';
  end if;
  v_definition := v_repaired;

  -- 2d. A materialized bridge carries the same visit.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at\) values\(v_org,v_case\.patient_id,''CURRENT''', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case bridge column anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,'CURRENT'$old$,
    $new$treating_provider_id,executed_at,charge_id,encounter_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,'CURRENT'$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case bridge column replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_provider,statement_timestamp\(\),v_charge,v_actor,1,null\) returning id into v_bridge', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case bridge value anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$v_provider,statement_timestamp(),v_charge,v_actor,1,null) returning id into v_bridge$old$,
    $new$v_provider,statement_timestamp(),v_charge,v_encounter_id,v_actor,1,null) returning id into v_bridge$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case bridge value replacement made no change';
  end if;
  v_definition := v_repaired;

  -- 2e. A materialized implant chain carries the same visit.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at\) values\(v_org,v_case\.patient_id,v_node', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case implant column anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,v_node$old$,
    $new$treating_provider_id,executed_at,charge_id,encounter_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,v_node$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case implant column replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_provider,statement_timestamp\(\),v_charge,v_actor,1,statement_timestamp\(\)\) returning id into v_parent', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case implant value anchor not found exactly once';
  end if;
  v_repaired := pg_catalog.replace(
    v_definition,
    $old$v_provider,statement_timestamp(),v_charge,v_actor,1,statement_timestamp()) returning id into v_parent$old$,
    $new$v_provider,statement_timestamp(),v_charge,v_encounter_id,v_actor,1,statement_timestamp()) returning id into v_parent$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case implant value replacement made no change';
  end if;
  v_definition := v_repaired;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, 'v_encounter_id', 'g')) <> 6 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case visit binding did not reach every materialization path';
  end if;

  execute v_definition;
end
$migration$;

comment on function public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text) is
  'Atomically completes one procedure case: it obtains the managed clinical visit from public.start_or_resume_clinical_visit before taking its completion request lock, validates the immutable materialization contract of a plan-linked item, posts exactly one charge, materializes the clinical entry or the bridge/implant design with that encounter and the actor-derived treating provider, resolves the named findings, advances the plan item execution and closes the case. No organization, provider, actor, or encounter is accepted from a client, and no completed row is ever updated to add its visit afterwards.';
