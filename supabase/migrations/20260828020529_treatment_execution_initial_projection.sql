-- Every proposal item receives its PROPOSED event/projection in the same item
-- creation transaction. This closes the gap for items created after O8 deploy.

create or replace function private.initialize_treatment_item_execution()
returns trigger language plpgsql set search_path=''
as $$
declare v_event uuid;v_actor uuid:=coalesce((select auth.uid()),(select created_by from public.treatment_plans where organization_id=new.organization_id and id=new.plan_id));
begin
 insert into public.treatment_plan_item_execution_events(
  organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,
  actor_user_id,idempotency_key
 ) values(new.organization_id,new.plan_id,new.id,null,null,'PROPOSED',v_actor,
  'execution-bootstrap-'||new.id::text) returning id into v_event;
 insert into public.treatment_plan_item_executions(
  organization_id,plan_id,item_id,current_state,version,current_event_id,
  last_actor_user_id,last_occurred_at
 ) values(new.organization_id,new.plan_id,new.id,'PROPOSED',1,v_event,v_actor,statement_timestamp());
 return new;
end $$;
revoke all on function private.initialize_treatment_item_execution()
from public,anon,authenticated,service_role;

drop trigger if exists treatment_plan_items_initialize_execution on public.treatment_plan_items;
create trigger treatment_plan_items_initialize_execution
after insert on public.treatment_plan_items
for each row execute function private.initialize_treatment_item_execution();
