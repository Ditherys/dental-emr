-- Plan-linked completion must materialize precisely the acknowledged contract.
-- Validate the frozen contract before post_charge so a rejected browser payload
-- cannot leave financial, execution, or clinical side effects behind.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure)
  into v_definition;

  v_replacement:=pg_catalog.replace(
    v_definition,
    'v_code text; v_detail jsonb; v_units jsonb; v_chain jsonb; v_node jsonb; v_design uuid;',
    'v_code text; v_detail jsonb; v_units jsonb; v_chain jsonb; v_node jsonb; v_design uuid; v_contract public.treatment_plan_item_materialization_contracts%rowtype; v_completion_kind text;'
  );
  if v_replacement=v_definition then
    raise exception using errcode='55000',message='expected immutable-contract declaration target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'if not found or v_execution.current_state<>''IN_PROGRESS'' then raise exception using errcode=''P0001'',message=''invalid state''; end if;',
    'if not found or v_execution.current_state<>''IN_PROGRESS'' then raise exception using errcode=''P0001'',message=''invalid state''; end if; select * into v_contract from public.treatment_plan_item_materialization_contracts contract where contract.organization_id=v_org and contract.item_id=p_plan_item_id for key share; if not found or v_contract.plan_id is distinct from v_item.plan_id or v_contract.patient_id is distinct from v_case.patient_id then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if;'
  );
  if pg_catalog.strpos(v_replacement,'v_contract.plan_id is distinct from v_item.plan_id')=0 then
    raise exception using errcode='55000',message='expected immutable-contract lock target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'select posted.charge_id into v_charge',
    'v_completion_kind:=case when p_completion->>''kind'' in (''BRIDGE'',''IMPLANT'') then p_completion->>''kind'' else ''CLINICAL'' end; if p_plan_item_id is not null and v_contract.materialization_kind is distinct from v_completion_kind then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; select posted.charge_id into v_charge'
  );
  if pg_catalog.strpos(v_replacement,'v_contract.materialization_kind is distinct from v_completion_kind')=0 then
    raise exception using errcode='55000',message='expected immutable materialization-kind target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'v_units:=p_completion->''units''; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,''CURRENT'',null,v_units); if p_plan_item_id is not null then select bridge.id into v_design',
    'v_units:=p_completion->''units''; if p_plan_item_id is not null and v_units is distinct from v_contract.design_snapshot->''units'' then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,''CURRENT'',null,v_units); if p_plan_item_id is not null then select bridge.id into v_design'
  );
  if pg_catalog.strpos(v_replacement,'v_units is distinct from v_contract.design_snapshot->''units''')=0 then
    raise exception using errcode='55000',message='expected immutable bridge payload target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'v_chain:=private.normalize_implant_chain(p_completion->''components''); if p_plan_item_id is not null then select component.id into v_design',
    'v_chain:=private.normalize_implant_chain(p_completion->''components''); if p_plan_item_id is not null and v_chain is distinct from v_contract.design_snapshot->''components'' then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; if p_plan_item_id is not null then select component.id into v_design'
  );
  if pg_catalog.strpos(v_replacement,'v_chain is distinct from v_contract.design_snapshot->''components''')=0 then
    raise exception using errcode='55000',message='expected immutable implant payload target was not found';
  end if;

  execute v_replacement;
end $do$;
