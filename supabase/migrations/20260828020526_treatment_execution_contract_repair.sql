-- Forward-only O8 repair: align the execution projection/event schema and
-- replace the draft RPCs with an append-only, idempotent, tenant-safe contract.

alter table public.treatment_plan_item_executions
  add column if not exists current_event_id uuid;

alter table public.treatment_plan_item_execution_events
  alter column actor_user_id drop not null;

create unique index if not exists treatment_execution_events_one_successor_idx
  on public.treatment_plan_item_execution_events
  (organization_id, item_id, predecessor_event_id)
  where predecessor_event_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.treatment_plan_item_executions'::regclass
      and conname = 'treatment_plan_item_executions_current_event_fk'
  ) then
    alter table public.treatment_plan_item_executions
      add constraint treatment_plan_item_executions_current_event_fk
      foreign key (organization_id, current_event_id)
      references public.treatment_plan_item_execution_events(organization_id, id)
      on delete restrict not valid;
  end if;
end $$;

insert into public.treatment_plan_item_execution_events (
  organization_id, plan_id, item_id, predecessor_event_id, from_state,
  to_state, actor_user_id, reason, idempotency_key
)
select item.organization_id, item.plan_id, item.id, null, null,
       coalesce(exec.current_state, 'PROPOSED'), plan.created_by, null,
       'execution-bootstrap-' || item.id::text
from public.treatment_plan_items as item
join public.treatment_plans as plan
  on plan.organization_id = item.organization_id and plan.id = item.plan_id
left join public.treatment_plan_item_executions as exec
  on exec.organization_id = item.organization_id and exec.item_id = item.id
where not exists (
  select 1 from public.treatment_plan_item_execution_events as event
  where event.organization_id = item.organization_id and event.item_id = item.id
);

insert into public.treatment_plan_item_executions (
  organization_id, plan_id, item_id, current_state, version,
  current_event_id, last_actor_user_id, last_occurred_at
)
select event.organization_id, event.plan_id, event.item_id, event.to_state, 1,
       event.id, event.actor_user_id, event.occurred_at
from public.treatment_plan_item_execution_events as event
where event.predecessor_event_id is null
  and not exists (
    select 1 from public.treatment_plan_item_executions as exec
    where exec.organization_id = event.organization_id and exec.item_id = event.item_id
  );

with latest as (
  select distinct on (event.organization_id, event.item_id)
    event.organization_id, event.item_id, event.id, event.plan_id,
    event.to_state, event.actor_user_id, event.occurred_at
  from public.treatment_plan_item_execution_events as event
  order by event.organization_id, event.item_id,
           event.occurred_at desc, event.created_at desc, event.id desc
)
update public.treatment_plan_item_executions as exec
set current_event_id = latest.id,
    plan_id = latest.plan_id,
    current_state = latest.to_state,
    last_actor_user_id = latest.actor_user_id,
    last_occurred_at = latest.occurred_at
from latest
where exec.organization_id = latest.organization_id
  and exec.item_id = latest.item_id
  and exec.current_event_id is null;

alter table public.treatment_plan_item_executions
  alter column current_event_id set not null;
alter table public.treatment_plan_item_executions
  validate constraint treatment_plan_item_executions_current_event_fk;

create or replace function private.validate_treatment_execution_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_event public.treatment_plan_item_execution_events%rowtype;
begin
  select event.* into v_event
  from public.treatment_plan_item_execution_events as event
  where event.organization_id = new.organization_id
    and event.id = new.current_event_id;
  if not found or v_event.item_id <> new.item_id or v_event.plan_id <> new.plan_id
     or v_event.to_state <> new.current_state then
    raise exception using errcode = '23514', message = 'execution projection/event mismatch';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_treatment_execution_projection()
from public, anon, authenticated, service_role;

drop trigger if exists treatment_execution_projection_agreement
  on public.treatment_plan_item_executions;
create trigger treatment_execution_projection_agreement
before insert or update on public.treatment_plan_item_executions
for each row execute function private.validate_treatment_execution_projection();

drop function if exists public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text);
create function public.transition_treatment_plan_item_execution(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_target_state text,
  p_reason text,
  p_idempotency_key text
)
returns table(item_id uuid, execution_state text, version integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid; v_actor uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_exec public.treatment_plan_item_executions%rowtype;
  v_event_id uuid; v_reason text := nullif(btrim(p_reason), '');
  v_existing public.treatment_plan_item_execution_events%rowtype;
begin
  select organization_id into v_org from public.branches
  where id = p_acting_branch_id and status = 'active';
  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or p_target_state not in ('ACCEPTED','IN_PROGRESS','CANCELLED')
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or (p_target_state = 'CANCELLED' and (v_reason is null or length(v_reason) > 500)) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select event.* into v_existing
  from public.treatment_plan_item_execution_events as event
  where event.organization_id = v_org and event.item_id = p_item_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.to_state <> p_target_state then
      raise exception using errcode = 'P0001', message = 'idempotency conflict';
    end if;
    return query select p_item_id, v_existing.to_state,
      (select exec.version from public.treatment_plan_item_executions exec
       where exec.organization_id=v_org and exec.item_id=p_item_id);
    return;
  end if;

  select plan.* into v_plan
  from public.treatment_plan_items item
  join public.treatment_plans plan
    on plan.organization_id=item.organization_id and plan.id=item.plan_id
  where item.organization_id=v_org and item.id=p_item_id
  for update of plan;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_plan.status <> 'ACKNOWLEDGED' then raise exception using errcode='P0001',message='invalid state'; end if;

  select * into v_exec from public.treatment_plan_item_executions
  where organization_id=v_org and item_id=p_item_id for update;
  if not found then raise exception using errcode='P0001',message='invalid state'; end if;
  if v_exec.version <> p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;
  if not ((v_exec.current_state='PROPOSED' and p_target_state in ('ACCEPTED','CANCELLED'))
       or (v_exec.current_state='ACCEPTED' and p_target_state in ('IN_PROGRESS','CANCELLED'))
       or (v_exec.current_state='IN_PROGRESS' and p_target_state='CANCELLED')) then
    raise exception using errcode='P0001',message='invalid state';
  end if;

  insert into public.treatment_plan_item_execution_events(
    organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,
    actor_user_id,reason,idempotency_key
  ) values (v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,
    v_exec.current_state,p_target_state,v_actor,v_reason,p_idempotency_key)
  returning id into v_event_id;
  update public.treatment_plan_item_executions set
    current_state=p_target_state, version=v_exec.version+1,
    current_event_id=v_event_id,last_actor_user_id=v_actor,
    last_occurred_at=statement_timestamp()
  where organization_id=v_org and item_id=p_item_id;
  insert into public.audit_events(
    organization_id,branch_id,actor_user_id,actor_type,category,action,
    entity_type,entity_id,patient_id,result,metadata
  ) values (v_org,p_acting_branch_id,v_actor,'USER','CLINICAL',
    'treatment.plan.item_execution.transitioned','treatment_plan_item',p_item_id,
    v_plan.patient_id,'SUCCESS',jsonb_strip_nulls(jsonb_build_object(
      'from_state',v_exec.current_state,'to_state',p_target_state,
      'reason',v_reason,'idempotency_key',p_idempotency_key)));
  return query select p_item_id,p_target_state,v_exec.version+1;
end;
$$;

revoke all on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

drop function if exists public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text);
create function public.correct_treatment_plan_item_execution(
  p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,
  p_target_state text,p_reason text,p_idempotency_key text
)
returns table(item_id uuid,execution_state text,version integer)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_plan public.treatment_plans%rowtype;
 v_exec public.treatment_plan_item_executions%rowtype;v_event uuid;v_reason text:=nullif(btrim(p_reason),'');
 v_existing public.treatment_plan_item_execution_events%rowtype;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null
  or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write')
  or not private.has_branch_permission(p_acting_branch_id,'patient.clinical.correct') then
  raise insufficient_privilege using message='not authorized'; end if;
 if p_item_id is null or p_expected_version is null or p_expected_version<1
  or p_target_state not in ('PROPOSED','ACCEPTED') or v_reason is null or length(v_reason)>500
  or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
  raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_existing from public.treatment_plan_item_execution_events
  where organization_id=v_org and item_id=p_item_id and idempotency_key=p_idempotency_key;
 if found then
  if v_existing.to_state<>p_target_state then raise exception using errcode='P0001',message='idempotency conflict'; end if;
  return query select p_item_id,v_existing.to_state,(select e.version from public.treatment_plan_item_executions e where e.organization_id=v_org and e.item_id=p_item_id);return;
 end if;
 select plan.* into v_plan from public.treatment_plan_items item join public.treatment_plans plan
  on plan.organization_id=item.organization_id and plan.id=item.plan_id
  where item.organization_id=v_org and item.id=p_item_id for key share of plan;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 select * into v_exec from public.treatment_plan_item_executions where organization_id=v_org and item_id=p_item_id for update;
 if not found then raise exception using errcode='P0001',message='invalid state'; end if;
 if v_exec.version<>p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;
 if not ((v_exec.current_state='ACCEPTED' and p_target_state='PROPOSED') or (v_exec.current_state='IN_PROGRESS' and p_target_state='ACCEPTED'))
  or v_exec.completion_charge_id is not null then raise exception using errcode='P0001',message='invalid state'; end if;
 insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,reason,idempotency_key)
 values(v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,v_exec.current_state,p_target_state,v_actor,v_reason,p_idempotency_key) returning id into v_event;
 update public.treatment_plan_item_executions set current_state=p_target_state,version=v_exec.version+1,current_event_id=v_event,
  last_actor_user_id=v_actor,last_occurred_at=statement_timestamp() where organization_id=v_org and item_id=p_item_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','treatment.plan.item_execution.corrected','treatment_plan_item',p_item_id,v_plan.patient_id,'SUCCESS',
  jsonb_build_object('from_state',v_exec.current_state,'to_state',p_target_state,'reason',v_reason,'idempotency_key',p_idempotency_key));
 return query select p_item_id,p_target_state,v_exec.version+1;
end;
$$;

revoke all on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

comment on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) is
  'Tenant-scoped, append-only, optimistic and idempotent ACCEPTED/IN_PROGRESS/CANCELLED execution transition; ACKNOWLEDGED proposal required and cancellation reason mandatory.';
comment on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) is
  'Elevated append-only correction limited to ACCEPTED->PROPOSED and IN_PROGRESS->ACCEPTED with patient access, patient.clinical.correct, reason and idempotency.';
