-- Completion materializes a CURRENT relationship from, never instead of, the
-- immutable plan design. Preserve that design edge for later clinical review.
do $do$
declare v_definition text; v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure) into v_definition;
  v_replacement:=pg_catalog.replace(v_definition,
    'v_code text; v_detail jsonb; v_units jsonb; v_chain jsonb; v_node jsonb;',
    'v_code text; v_detail jsonb; v_units jsonb; v_chain jsonb; v_node jsonb; v_design uuid;');
  if v_replacement=v_definition then raise exception using errcode='55000',message='expected completion provenance declaration target was not found';end if;
  v_replacement:=pg_catalog.replace(v_replacement,
    'v_units:=p_completion->''units''; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,''CURRENT'',null,v_units);',
    'v_units:=p_completion->''units''; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,''CURRENT'',null,v_units); if p_plan_item_id is not null then select bridge.id into v_design from public.dental_bridges bridge where bridge.organization_id=v_org and bridge.parent_plan_item_id=p_plan_item_id and bridge.record_kind=''PLAN_DESIGN'' for key share; if not found then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; end if;');
  if pg_catalog.strpos(v_replacement,'completion does not match immutable item design')=0 then raise exception using errcode='55000',message='expected bridge provenance target was not found';end if;
  v_replacement:=pg_catalog.replace(v_replacement,
    'insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,''CURRENT'',v_support,v_provider,statement_timestamp(),v_charge,v_actor,1,null)',
    'insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,source_plan_design_id,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,''CURRENT'',v_support,v_design,v_provider,statement_timestamp(),v_charge,v_actor,1,null)');
  if pg_catalog.strpos(v_replacement,'source_plan_design_id')=0 then raise exception using errcode='55000',message='expected current bridge provenance insert target was not found';end if;
  v_replacement:=pg_catalog.replace(v_replacement,
    'v_chain:=private.normalize_implant_chain(p_completion->''components'');',
    'v_chain:=private.normalize_implant_chain(p_completion->''components''); if p_plan_item_id is not null then select component.id into v_design from public.dental_implant_components component where component.organization_id=v_org and component.parent_plan_item_id=p_plan_item_id and component.record_kind=''PLAN_DESIGN'' and component.component_kind=''FIXTURE'' and component.depends_on_component_id is null for key share; if not found then raise invalid_parameter_value using message=''completion does not match immutable item design''; end if; end if;');
  if pg_catalog.strpos(v_replacement,'component.parent_plan_item_id=p_plan_item_id')=0 then raise exception using errcode='55000',message='expected implant provenance target was not found';end if;
  v_replacement:=pg_catalog.replace(v_replacement,
    'insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,v_node->>''tooth_fdi'',v_i,v_node->>''component_kind'',v_node->>''attachment_value'',v_parent,''CURRENT'',v_provider,statement_timestamp(),v_charge,v_actor,1,statement_timestamp())',
    'insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,source_plan_design_component_id,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,v_node->>''tooth_fdi'',v_i,v_node->>''component_kind'',v_node->>''attachment_value'',v_parent,''CURRENT'',case when v_i=1 then v_design end,v_provider,statement_timestamp(),v_charge,v_actor,1,statement_timestamp())');
  if pg_catalog.strpos(v_replacement,'source_plan_design_component_id')=0 then raise exception using errcode='55000',message='expected current implant provenance insert target was not found';end if;
  execute v_replacement;
end $do$;
