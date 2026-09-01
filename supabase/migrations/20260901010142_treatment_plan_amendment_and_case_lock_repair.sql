-- Unified Clinical Chart workspace, task 8 review round 1.
--
-- Three changes, all forward-only. 20260901010140 and 20260901010141 are applied
-- and are not edited; every change to an applied function uses the repository's
-- pg_get_functiondef guarded-replace pattern, with each target verified to occur
-- exactly once (pg_catalog.replace is global) and every step failing closed with
-- 55000.
--
-- 1. IMPORTANT. 20260901010140 introduced a `for key share` row lock on
--    public.procedure_cases ahead of the completion advisory lock, and the
--    function later takes `for update` on the same row. A transaction holding
--    KEY SHARE that afterwards requests FOR UPDATE deadlocks against any other
--    transaction doing the same, so two concurrent completions of one case now
--    fail 40P01 where the second used to serialize and replay cleanly. The same
--    cycle exists between a direct caller and the visit-bound v2 path.
--
--    The lock is dropped rather than upgraded. The looked-up patient identifies
--    the managed visit and nothing else; the authoritative case row is re-read
--    under `for update` a few statements later, so no guarantee is lost. The
--    visit-before-request-lock ordering that 20260901010140 established is
--    deliberately preserved: every caller still takes the visit identity lock
--    before the completion request lock, and now also before the case row lock,
--    which is the order public.record_treatment_event_v2 already used.
--
-- 2. IMPORTANT. A plan change had to create a new plan, but nothing recorded
--    WHY, and the successor carried no link to the plan it replaced. An
--    unexplained new version of finalized clinical history is a silent overwrite
--    with extra steps. public.treatment_plans gains a tenant-safe
--    supersedes_plan_id and a bounded amendment_reason, the reason is mandatory
--    whenever a predecessor is named, one plan may be superseded at most once,
--    and public.create_treatment_plan_v2 is the boundary that writes them.
--
-- 3. The bounded plan projection returns both new fields, so a reason that was
--    captured can actually be read.
--
-- This object migration grants nothing; 20260901010143 owns the only new
-- browser-reachable grant.

-- ---------------------------------------------------------------------------
-- 1. The completion path stops taking a row lock it later has to upgrade
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure
  ) into v_definition;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition,
        'from public\.procedure_cases as procedure_case where procedure_case\.organization_id=v_org and procedure_case\.id=p_case_id for key share;',
        'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case visit patient lookup not found exactly once';
  end if;

  v_repaired := pg_catalog.replace(
    v_definition,
    $old$from public.procedure_cases as procedure_case where procedure_case.organization_id=v_org and procedure_case.id=p_case_id for key share;$old$,
    $new$from public.procedure_cases as procedure_case where procedure_case.organization_id=v_org and procedure_case.id=p_case_id;$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case visit patient lookup replacement made no change';
  end if;

  -- Exactly one row lock on the case must remain: the authoritative
  -- `select * into v_case ... for update`.
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_repaired, 'from public\.procedure_cases[^;]*for (key share|update)', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'complete_treatment_case must retain exactly one procedure_cases row lock';
  end if;

  execute v_repaired;
end
$migration$;

comment on function public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text) is
  'Atomically completes one procedure case: it reads the case patient without a row lock, obtains the managed clinical visit from public.start_or_resume_clinical_visit before taking its completion request lock, then locks the authoritative case row FOR UPDATE, validates the immutable materialization contract of a plan-linked item, posts exactly one charge, materializes the clinical entry or the bridge/implant design with that encounter and the actor-derived treating provider, resolves the named findings, advances the plan item execution and closes the case. Only one procedure_cases row lock is taken, so no caller upgrades KEY SHARE to FOR UPDATE. No organization, provider, actor, or encounter is accepted from a client, and no completed row is ever updated to add its visit afterwards.';

-- ---------------------------------------------------------------------------
-- 2. A plan version records what it replaces, and why
-- ---------------------------------------------------------------------------

alter table public.treatment_plans
  add column supersedes_plan_id uuid,
  add column amendment_reason text;

-- Tenant-safe: a successor may only replace a plan in its own organization.
alter table public.treatment_plans
  add constraint treatment_plans_organization_supersedes_fk
  foreign key (organization_id, supersedes_plan_id)
  references public.treatment_plans (organization_id, id)
  on delete restrict;

alter table public.treatment_plans
  add constraint treatment_plans_amendment_reason_bounded_check
  check (
    amendment_reason is null
    or (pg_catalog.btrim(amendment_reason) <> '' and pg_catalog.length(amendment_reason) <= 2000)
  );

-- A predecessor without a reason is the silent overwrite this exists to stop.
alter table public.treatment_plans
  add constraint treatment_plans_amendment_reason_required_check
  check (supersedes_plan_id is null or amendment_reason is not null);

-- A plan may not be forked into two competing successors.
create unique index treatment_plans_single_successor_idx
  on public.treatment_plans (organization_id, supersedes_plan_id)
  where supersedes_plan_id is not null;

comment on column public.treatment_plans.supersedes_plan_id is
  'The same-tenant plan this one replaces. Null for a first plan. A superseded plan is never mutated: its row stays exactly as it was acknowledged.';
comment on column public.treatment_plans.amendment_reason is
  'Why this plan replaces its predecessor. Mandatory whenever supersedes_plan_id is set, bounded to 2000 characters, and never copied into an audit event.';

create function public.create_treatment_plan_v2(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_title text,
  p_supersedes_plan_id uuid default null,
  p_amendment_reason text default null
)
returns table(plan_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_reason text;
  v_predecessor_patient uuid;
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

  v_reason := nullif(pg_catalog.btrim(p_amendment_reason), '');

  if p_patient_id is null
     or p_title is null
     or pg_catalog.btrim(p_title) = ''
     or pg_catalog.length(p_title) > 200
     or coalesce(pg_catalog.length(v_reason), 0) > 2000
     -- A reason without a predecessor describes nothing, and a predecessor
     -- without a reason is the unexplained amendment this boundary exists to
     -- refuse. They are accepted only together.
     or (p_supersedes_plan_id is null) <> (v_reason is null) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_supersedes_plan_id is not null then
    select plan.patient_id into v_predecessor_patient
    from public.treatment_plans as plan
    where plan.id = p_supersedes_plan_id
      and plan.organization_id = v_organization_id;

    if v_predecessor_patient is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;

    -- A plan may only be replaced for the patient it belongs to.
    if v_predecessor_patient <> p_patient_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.treatment_plans (
    organization_id, patient_id, title, status, created_by,
    supersedes_plan_id, amendment_reason
  ) values (
    v_organization_id, p_patient_id, pg_catalog.btrim(p_title), 'DRAFT', v_actor_user_id,
    p_supersedes_plan_id, v_reason
  ) returning id, public.treatment_plans.version into plan_id, version;

  -- The reason is clinical narrative and stays on the plan row. The audit event
  -- records that an amendment happened and which plan it replaced, never its
  -- text.
  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    case when p_supersedes_plan_id is null then 'treatment.plan.created' else 'treatment.plan.amended' end,
    'treatment_plan', plan_id, p_patient_id, 'SUCCESS',
    case
      when p_supersedes_plan_id is null then '{}'::jsonb
      else pg_catalog.jsonb_build_object('supersedes_plan_id', p_supersedes_plan_id)
    end
  );

  return next;
end;
$$;

revoke all on function public.create_treatment_plan_v2(uuid, uuid, text, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.create_treatment_plan_v2(uuid, uuid, text, uuid, text) is
  'Creates a DRAFT treatment plan for a same-tenant patient under clinical.write, optionally as the explained successor of an existing plan. A predecessor and a bounded reason are accepted only together, the predecessor is revalidated against the derived tenant and the same patient, and a partial unique index refuses a second successor for the same plan. The predecessor row is never mutated. Accepts no organization, provider, actor, or author identity from a client and audits atomically without copying the reason text.';

-- ---------------------------------------------------------------------------
-- 3. The bounded plan projection returns the amendment provenance
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_treatment_plan_detail(uuid,uuid)'::regprocedure
  ) into v_definition;

  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(
        v_definition, '''createdBy'',plan\.created_by\)', 'g')) <> 1 then
    raise exception using errcode = '55000',
      message = 'get_treatment_plan_detail plan projection anchor not found exactly once';
  end if;

  v_repaired := pg_catalog.replace(
    v_definition,
    $old$'createdBy',plan.created_by)$old$,
    $new$'createdBy',plan.created_by,'supersedesPlanId',plan.supersedes_plan_id,'amendmentReason',plan.amendment_reason)$new$
  );
  if v_repaired = v_definition then
    raise exception using errcode = '55000',
      message = 'get_treatment_plan_detail plan projection replacement made no change';
  end if;

  execute v_repaired;
end
$migration$;
