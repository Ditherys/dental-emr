-- Treatment execution begins when a plan is acknowledged. Draft items remain
-- removable without orphaning an append-only execution history.
create or replace function private.initialize_treatment_item_execution()
returns trigger language plpgsql set search_path=''
as $$
declare v_event uuid; v_actor uuid:=coalesce((select auth.uid()),(select created_by from public.treatment_plans where organization_id=new.organization_id and id=new.plan_id)); v_status text;
begin
 select status into v_status from public.treatment_plans where organization_id=new.organization_id and id=new.plan_id;
 if v_status <> 'ACKNOWLEDGED' then return new; end if;
 insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,idempotency_key)
 values(new.organization_id,new.plan_id,new.id,null,null,'PROPOSED',v_actor,'execution-bootstrap-'||new.id::text)
 on conflict (organization_id,item_id,idempotency_key) do nothing returning id into v_event;
 if v_event is not null then
  insert into public.treatment_plan_item_executions(organization_id,plan_id,item_id,current_state,version,current_event_id,last_actor_user_id,last_occurred_at)
  values(new.organization_id,new.plan_id,new.id,'PROPOSED',1,v_event,v_actor,statement_timestamp())
  on conflict (organization_id,item_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.initialize_treatment_item_execution() from public,anon,authenticated,service_role;

create or replace function private.bootstrap_acknowledged_plan_executions()
returns trigger language plpgsql set search_path=''
as $$
declare item_row record; v_event uuid; v_actor uuid:=coalesce((select auth.uid()),new.created_by);
begin
 if new.status='ACKNOWLEDGED' and old.status is distinct from new.status then
  for item_row in select i.* from public.treatment_plan_items i where i.organization_id=new.organization_id and i.plan_id=new.id loop
   if not exists(select 1 from public.treatment_plan_item_executions e where e.organization_id=item_row.organization_id and e.item_id=item_row.id) then
    insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,idempotency_key)
    values(item_row.organization_id,item_row.plan_id,item_row.id,null,null,'PROPOSED',v_actor,'execution-bootstrap-'||item_row.id::text)
    on conflict (organization_id,item_id,idempotency_key) do nothing returning id into v_event;
    if v_event is not null then
     insert into public.treatment_plan_item_executions(organization_id,plan_id,item_id,current_state,version,current_event_id,last_actor_user_id,last_occurred_at)
     values(item_row.organization_id,item_row.plan_id,item_row.id,'PROPOSED',1,v_event,v_actor,statement_timestamp())
     on conflict (organization_id,item_id) do nothing;
    end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.bootstrap_acknowledged_plan_executions() from public,anon,authenticated,service_role;

drop trigger if exists treatment_plans_bootstrap_executions on public.treatment_plans;
create trigger treatment_plans_bootstrap_executions
after update of status on public.treatment_plans
for each row execute function private.bootstrap_acknowledged_plan_executions();
