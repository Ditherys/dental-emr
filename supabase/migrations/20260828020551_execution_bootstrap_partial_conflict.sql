do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('private.initialize_treatment_item_execution()'::regprocedure) into v_definition;
 execute pg_catalog.replace(v_definition,'on conflict (organization_id,item_id,idempotency_key) do nothing','on conflict (organization_id,item_id,idempotency_key) where idempotency_key is not null do nothing');
 select pg_catalog.pg_get_functiondef('private.bootstrap_acknowledged_plan_executions()'::regprocedure) into v_definition;
 execute pg_catalog.replace(v_definition,'on conflict (organization_id,item_id,idempotency_key) do nothing','on conflict (organization_id,item_id,idempotency_key) where idempotency_key is not null do nothing');
end;
$do$;
