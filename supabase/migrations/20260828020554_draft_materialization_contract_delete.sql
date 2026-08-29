do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'::regprocedure) into v_definition;
 v_definition:=pg_catalog.replace(v_definition,
 '  perform pg_catalog.set_config(''app.execution_bootstrap_delete'',''on'',true);',
 E'  delete from public.treatment_plan_item_materialization_contracts where organization_id=v_organization_id and item_id=p_item_id;\n  perform pg_catalog.set_config(''app.execution_bootstrap_delete'',''on'',true);');
 execute v_definition;
end;
$do$;
