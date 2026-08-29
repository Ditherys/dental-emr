-- Keep execution bootstrap on item creation. A DRAFT item can still be
-- removed by deleting only its untouched bootstrap projection/event through
-- the owner RPC; all transitioned events remain immutable.
do $do$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef('private.initialize_treatment_item_execution()'::regprocedure) into v_definition;
 v_definition:=pg_catalog.replace(v_definition,' if v_status <> ''ACKNOWLEDGED'' then return new; end if;','');
 execute v_definition;
 drop trigger if exists treatment_plans_bootstrap_executions on public.treatment_plans;

 select pg_catalog.pg_get_functiondef('private.treatment_item_execution_events_no_mutate()'::regprocedure) into v_definition;
 v_definition:=pg_catalog.replace(v_definition,
 $q$begin
  raise exception 'treatment_plan_item_execution_events is append-only; UPDATE/DELETE are not allowed';
  return null;
end;$q$,
 $q$begin
  if tg_op='DELETE' and old.to_state='PROPOSED' and old.from_state is null and old.idempotency_key like 'execution-bootstrap-%' and pg_catalog.current_setting('app.execution_bootstrap_delete',true)='on' then
   return old;
  end if;
  raise exception 'treatment_plan_item_execution_events is append-only; UPDATE/DELETE are not allowed';
  return null;
end;$q$);
 execute v_definition;
end;
$do$;

do $do$
declare v_definition text; v_old text := $q$  delete from public.treatment_plan_items
  where id = p_item_id and organization_id = v_organization_id
  returning id into item_id;$q$;
 v_new text := $q$  perform pg_catalog.set_config('app.execution_bootstrap_delete','on',true);
  delete from public.treatment_plan_item_executions
  where organization_id=v_organization_id and item_id=p_item_id and current_state='PROPOSED' and version=1;
  delete from public.treatment_plan_item_execution_events
  where organization_id=v_organization_id and item_id=p_item_id and to_state='PROPOSED' and from_state is null and idempotency_key like 'execution-bootstrap-%';
  perform pg_catalog.set_config('app.execution_bootstrap_delete','off',true);
  delete from public.treatment_plan_items
  where id = p_item_id and organization_id = v_organization_id
  returning id into item_id;$q$;
begin
 select pg_catalog.pg_get_functiondef('public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'::regprocedure) into v_definition;
 if pg_catalog.strpos(v_definition,v_old)=0 then raise exception using errcode='55000',message='expected draft item delete was not found'; end if;
 execute pg_catalog.replace(v_definition,v_old,v_new);
end;
$do$;
