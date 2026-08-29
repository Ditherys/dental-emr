do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'::regprocedure) into v_definition;
 v_definition:=pg_catalog.replace(v_definition,'delete from public.treatment_plan_item_materialization_contracts where organization_id=v_organization_id and item_id=p_item_id','delete from public.treatment_plan_item_materialization_contracts as materialization where materialization.organization_id=v_organization_id and materialization.item_id=p_item_id');
 execute v_definition;
end;
$do$;
