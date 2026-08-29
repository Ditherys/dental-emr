do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'::regprocedure) into v_definition;
 v_definition:=pg_catalog.replace(v_definition,'where organization_id=v_organization_id and item_id=p_item_id and current_state=''PROPOSED'' and version=1','where organization_id=v_organization_id and public.treatment_plan_item_executions.item_id=p_item_id and current_state=''PROPOSED'' and version=1');
 v_definition:=pg_catalog.replace(v_definition,'where organization_id=v_organization_id and item_id=p_item_id and to_state=''PROPOSED''','where organization_id=v_organization_id and public.treatment_plan_item_execution_events.item_id=p_item_id and to_state=''PROPOSED''');
 execute v_definition;
end;
$do$;
