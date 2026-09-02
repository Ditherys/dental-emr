-- Task 14 round 2 forward-only repair: a procedure follow-up could never be
-- recorded.
--
-- public.record_procedure_followup declares RETURNS TABLE(event_id uuid,
-- version integer), so `version` is a PL/pgSQL OUT variable inside the body.
-- Two applied statements reference `version` unqualified against a relation
-- that also has a `version` column:
--
--   update public.procedure_cases set version=version+1 ... returning version into version
--   update private.odontogram_revamp_idempotency set event_id=..., version=version ...
--
-- PostgreSQL rejects both at runtime with 42702 "column reference version is
-- ambiguous", so every authorized follow-up failed. The boundary's coverage
-- asserted only grants and the anonymous denial - never a success - so nothing
-- caught it. This is the same defect class repaired for photographs in
-- 20260901010401 and is repaired the same way: the target relation is aliased,
-- and the OUT parameter is addressed through the function-name label so the two
-- can no longer be confused in either direction.
--
-- Behaviour is otherwise untouched: the same two columns are written, the same
-- `for update` lock is taken, the idempotency replay still short-circuits
-- before any write, and the audit event is unchanged.
--
-- Replacement goes through the guarded pg_get_functiondef pattern rather than a
-- top-level CREATE OR REPLACE, so the existing narrow EXECUTE grant survives
-- and ADR-017's grant-last invariant is not disturbed. Every guard fails closed
-- on 55000.
do $do$
declare
  v_definition text;
  v_replacement text;
  v_case_anchor constant text :=
    $anchor$ update public.procedure_cases set version=version+1 where organization_id=v_organization_id and id=v_case.id returning version into version;$anchor$;
  v_case_repaired constant text :=
    $repaired$ update public.procedure_cases as procedure_case set version=procedure_case.version+1 where procedure_case.organization_id=v_organization_id and procedure_case.id=v_case.id returning procedure_case.version into record_procedure_followup.version;$repaired$;
  v_idempotency_anchor constant text :=
    $anchor$ update private.odontogram_revamp_idempotency set event_id=v_event,version=version where organization_id=v_organization_id and actor_user_id=v_actor_user_id and operation='PROCEDURE_FOLLOWUP' and idempotency_key=p_idempotency_key;$anchor$;
  v_idempotency_repaired constant text :=
    $repaired$ update private.odontogram_revamp_idempotency as idempotency set event_id=v_event,version=record_procedure_followup.version where idempotency.organization_id=v_organization_id and idempotency.actor_user_id=v_actor_user_id and idempotency.operation='PROCEDURE_FOLLOWUP' and idempotency.idempotency_key=p_idempotency_key;$repaired$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_procedure_followup(uuid,uuid,text,timestamptz,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception using errcode='55000', message='expected record procedure follow-up RPC is missing';
  end if;
  if v_definition not like '%SECURITY DEFINER%' or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='unexpected record procedure follow-up security posture';
  end if;
  -- The authorization, provider-derivation, open-case and idempotency guards
  -- must already be present: this repair rewrites two statements and must never
  -- resurrect an older body or silently drop a guard.
  if v_definition not like '%has_clinical_permission_at_branch(p_acting_branch_id,''patient.clinical.write'')%'
     or v_definition not like '%require_active_actor_provider(v_organization_id,p_acting_branch_id,v_actor_user_id)%'
     or v_definition not like '%v_case.status<>''OPEN''%'
     or v_definition not like '%procedure.case.follow_up.recorded%' then
    raise exception using errcode='55000', message='unexpected record procedure follow-up guard set';
  end if;

  if position(v_case_repaired in v_definition) > 0
     and position(v_idempotency_repaired in v_definition) > 0 then
    v_definition := null;
  elsif (length(v_definition) - length(pg_catalog.replace(v_definition, v_case_anchor, ''))) / length(v_case_anchor) <> 1
     or (length(v_definition) - length(pg_catalog.replace(v_definition, v_idempotency_anchor, ''))) / length(v_idempotency_anchor) <> 1 then
    raise exception using errcode='55000', message='unexpected record procedure follow-up version statements';
  end if;

  if v_definition is not null then
    v_replacement := pg_catalog.replace(v_definition, v_case_anchor, v_case_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='procedure case version anchor is missing';
    end if;
    v_definition := v_replacement;
    v_replacement := pg_catalog.replace(v_definition, v_idempotency_anchor, v_idempotency_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='procedure follow-up idempotency anchor is missing';
    end if;
    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.record_procedure_followup(uuid,uuid,text,timestamptz,text)'::regprocedure
  ) into v_definition;

  if v_definition is null
     or position(v_case_repaired in v_definition) = 0
     or position(v_idempotency_repaired in v_definition) = 0 then
    raise exception using errcode='55000', message='the record procedure follow-up ambiguity was not resolved';
  end if;
  if position(v_case_anchor in v_definition) > 0
     or position(v_idempotency_anchor in v_definition) > 0 then
    raise exception using errcode='55000', message='an ambiguous record procedure follow-up statement is still present';
  end if;
  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or v_definition not like '%has_clinical_permission_at_branch(p_acting_branch_id,''patient.clinical.write'')%'
     or v_definition not like '%require_active_actor_provider(v_organization_id,p_acting_branch_id,v_actor_user_id)%'
     or v_definition not like '%v_case.status<>''OPEN''%'
     or v_definition not like '%procedure.case.follow_up.recorded%' then
    raise exception using errcode='55000', message='the record procedure follow-up contract was not preserved';
  end if;
  if not has_function_privilege('authenticated','public.record_procedure_followup(uuid,uuid,text,timestamptz,text)','EXECUTE')
     or has_function_privilege('anon','public.record_procedure_followup(uuid,uuid,text,timestamptz,text)','EXECUTE')
     or has_function_privilege('service_role','public.record_procedure_followup(uuid,uuid,text,timestamptz,text)','EXECUTE') then
    raise exception using errcode='55000', message='the record procedure follow-up grant boundary was not preserved';
  end if;
end;
$do$;
