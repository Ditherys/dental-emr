-- Correct the event-table clauses after projection OUT-parameter
-- qualification: event and projection references must use their own tables.
do $$
declare v_def text;v_new text;v_signature regprocedure;
begin
 foreach v_signature in array array[
  'public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)'::regprocedure,
  'public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)'::regprocedure
 ] loop
  select pg_get_functiondef(v_signature) into v_def;
  v_new:=replace(v_def,
   'from public.treatment_plan_item_execution_events
  where treatment_plan_item_executions.organization_id=v_org and treatment_plan_item_executions.item_id=$2',
   'from public.treatment_plan_item_execution_events as existing_event
  where existing_event.organization_id=v_org and existing_event.item_id=$2');
  if v_new=v_def then raise exception 'event qualification target not found for %',v_signature;end if;
  execute v_new;
 end loop;
end $$;

revoke all on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text) from public,anon,authenticated,service_role;
