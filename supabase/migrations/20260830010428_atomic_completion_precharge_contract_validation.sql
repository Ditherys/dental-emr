-- Validate every plan-linked materialization against the acknowledged
-- contract before post_charge. This is intentionally a forward repair of the
-- O8 completion function; no existing migration is edited.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure)
  into v_definition;

  v_replacement:=pg_catalog.replace(
    v_definition,
    'select posted.charge_id into v_charge',
    'if p_plan_item_id is not null then if v_completion_kind=''BRIDGE'' then v_units:=p_completion->''units''; if v_units is distinct from v_contract.design_snapshot->''units'' then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,''CURRENT'',null,v_units); select bridge.id into v_design from public.dental_bridges bridge where bridge.organization_id=v_org and bridge.patient_id=v_case.patient_id and bridge.parent_plan_id=v_item.plan_id and bridge.parent_plan_item_id=p_plan_item_id and bridge.record_kind=''PLAN_DESIGN'' for key share; if not found then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; elsif v_completion_kind=''IMPLANT'' then v_chain:=private.normalize_implant_chain(p_completion->''components''); if v_chain is distinct from v_contract.design_snapshot->''components'' then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; select component.id into v_design from public.dental_implant_components component where component.organization_id=v_org and component.patient_id=v_case.patient_id and component.parent_plan_id=v_item.plan_id and component.parent_plan_item_id=p_plan_item_id and component.record_kind=''PLAN_DESIGN'' and component.component_kind=''FIXTURE'' and component.depends_on_component_id is null for key share; if not found then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; else v_detail:=p_completion; if v_item.tooth_code is distinct from v_contract.design_snapshot->>''tooth_code'' or not coalesce(case v_contract.design_snapshot->>''clinical_code'' when ''ROOT_CANAL'' then v_detail->>''code''=''ROOT_CANAL'' when ''CROWN'' then v_detail->>''code''=''RESTORATION'' and v_detail->>''restorationType''=''crown'' when ''OTHER'' then v_detail->>''code'' in (''RESTORATION'',''OTHER'') else false end,false) then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; end if; end if; select posted.charge_id into v_charge'
  );
  if pg_catalog.strpos(v_replacement,'if p_plan_item_id is not null then if v_completion_kind=''BRIDGE''')=0 then
    raise exception using errcode='55000',message='expected precharge immutable-contract target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'bridge.organization_id=v_org and bridge.parent_plan_item_id=p_plan_item_id and bridge.record_kind=''PLAN_DESIGN''',
    'bridge.organization_id=v_org and bridge.patient_id=v_case.patient_id and bridge.parent_plan_id=v_item.plan_id and bridge.parent_plan_item_id=p_plan_item_id and bridge.record_kind=''PLAN_DESIGN'''
  );
  if pg_catalog.strpos(v_replacement,'bridge.parent_plan_id=v_item.plan_id')=0 then
    raise exception using errcode='55000',message='expected scoped bridge design target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'component.organization_id=v_org and component.parent_plan_item_id=p_plan_item_id and component.record_kind=''PLAN_DESIGN''',
    'component.organization_id=v_org and component.patient_id=v_case.patient_id and component.parent_plan_id=v_item.plan_id and component.parent_plan_item_id=p_plan_item_id and component.record_kind=''PLAN_DESIGN'''
  );
  if pg_catalog.strpos(v_replacement,'component.parent_plan_id=v_item.plan_id')=0 then
    raise exception using errcode='55000',message='expected scoped implant design target was not found';
  end if;

  execute v_replacement;
end $do$;
