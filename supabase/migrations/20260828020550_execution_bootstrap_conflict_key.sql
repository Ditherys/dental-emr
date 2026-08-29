do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('private.initialize_treatment_item_execution()'::regprocedure) into v_definition;
 execute pg_catalog.replace(v_definition,'on conflict (organization_id,idempotency_key)','on conflict (organization_id,item_id,idempotency_key)');
 select pg_catalog.pg_get_functiondef('private.bootstrap_acknowledged_plan_executions()'::regprocedure) into v_definition;
 execute pg_catalog.replace(v_definition,'on conflict (organization_id,idempotency_key)','on conflict (organization_id,item_id,idempotency_key)');
end;
$do$;
