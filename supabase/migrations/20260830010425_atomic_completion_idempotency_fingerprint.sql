-- A request key belongs to exactly one completion request. The original O8
-- table serialized retries, but did not retain enough input identity to reject
-- accidental key reuse for another case or amount.
alter table private.procedure_case_completion_idempotency
  add column request_fingerprint text;

do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure)
  into v_definition;

  v_replacement:=pg_catalog.replace(
    v_definition,
    'v_ids uuid[]:=array[]::uuid[]; v_parent uuid; v_execution_event uuid; v_i integer; v_finding_count integer; v_plan_patient uuid;',
    'v_ids uuid[]:=array[]::uuid[]; v_parent uuid; v_execution_event uuid; v_i integer; v_finding_count integer; v_plan_patient uuid; v_request_fingerprint text;'
  );
  if v_replacement=v_definition then
    raise exception using errcode='55000',message='expected completion declaration target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||'':''||v_actor::text||'':''||p_idempotency_key,0));',
    'v_request_fingerprint:=pg_catalog.md5(p_case_id::text||''|''||coalesce(p_plan_item_id::text,'''')||''|''||p_expected_version::text||''|''||coalesce(array_to_string(p_resolved_finding_ids,'',''),'''')||''|''||p_amount_centavos::text||''|''||p_completion::text); perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||'':''||v_actor::text||'':''||p_idempotency_key,0));'
  );
  if pg_catalog.strpos(v_replacement,'v_request_fingerprint:=pg_catalog.md5')=0 then
    raise exception using errcode='55000',message='expected completion lock target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'if found then return query select v_existing.procedure_case_id,v_existing.charge_id,v_existing.clinical_entry_id,v_existing.bridge_id,v_existing.implant_component_id; return; end if;',
    'if found then if v_existing.procedure_case_id is distinct from p_case_id or v_existing.request_fingerprint is distinct from v_request_fingerprint then raise exception using errcode=''P0001'',message=''idempotency conflict''; end if; return query select v_existing.procedure_case_id,v_existing.charge_id,v_existing.clinical_entry_id,v_existing.bridge_id,v_existing.implant_component_id; return; end if;'
  );
  if pg_catalog.strpos(v_replacement,'v_existing.request_fingerprint is distinct from v_request_fingerprint')=0 then
    raise exception using errcode='55000',message='expected completion replay target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'insert into private.procedure_case_completion_idempotency(organization_id,actor_user_id,idempotency_key,procedure_case_id,charge_id,clinical_entry_id,bridge_id,implant_component_id) values(v_org,v_actor,p_idempotency_key,v_case.id,v_charge,v_clinical,v_bridge,v_implant);',
    'insert into private.procedure_case_completion_idempotency(organization_id,actor_user_id,idempotency_key,procedure_case_id,charge_id,clinical_entry_id,bridge_id,implant_component_id,request_fingerprint) values(v_org,v_actor,p_idempotency_key,v_case.id,v_charge,v_clinical,v_bridge,v_implant,v_request_fingerprint);'
  );
  if pg_catalog.strpos(v_replacement,'request_fingerprint) values')=0 then
    raise exception using errcode='55000',message='expected completion idempotency insert target was not found';
  end if;

  execute v_replacement;
end $do$;
