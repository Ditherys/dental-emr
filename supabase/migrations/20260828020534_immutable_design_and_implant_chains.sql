-- O5 forward repair: bind plan relationship designs to an immutable plan item
-- and make every implant relationship RPC operate on one complete 1..4 node
-- graph. CURRENT predecessors remain byte-identical; amendments only append a
-- successor graph.

create or replace function private.normalize_implant_chain(p_components jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_count integer;
  v_row record;
  v_tooth text;
  v_kinds text[] := array[]::text[];
  v_result jsonb := '[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_components) <> 'array' then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_components);
  if v_count not between 1 and 4 then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;

  for v_row in
    select value as node, ordinality::integer as position
    from pg_catalog.jsonb_array_elements(p_components) with ordinality
    order by ordinality
  loop
    if pg_catalog.jsonb_typeof(v_row.node) <> 'object'
       or nullif(v_row.node->>'ordinal','')::integer is distinct from v_row.position
       or (v_row.node->>'tooth_fdi') is null
       or not ((v_row.node->>'tooth_fdi') ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or (v_row.node->>'component_kind') not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;
    if v_tooth is null then v_tooth := v_row.node->>'tooth_fdi'; end if;
    if v_row.node->>'tooth_fdi' <> v_tooth then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if (v_row.node->>'component_kind') = 'ATTACHMENT' then
      if coalesce((v_row.node->>'attachment_value') not in ('locator','bar'), true) then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
    elsif nullif(v_row.node->>'attachment_value','') is not null then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if v_row.position = 1 then
      if v_row.node->>'component_kind' <> 'FIXTURE'
         or nullif(v_row.node->>'depends_on_ordinal','') is not null then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
    else
      declare v_parent integer := nullif(v_row.node->>'depends_on_ordinal','')::integer;
      begin
        if v_parent is null or v_parent < 1 or v_parent >= v_row.position then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') = 'ABUTMENT' and v_kinds[v_parent] <> 'FIXTURE' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') in ('CROWN','ATTACHMENT') and v_kinds[v_parent] <> 'ABUTMENT' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      end;
    end if;
    v_kinds := pg_catalog.array_append(v_kinds, v_row.node->>'component_kind');
    v_result := v_result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'tooth_fdi',v_tooth,
      'ordinal',v_row.position,
      'component_kind',v_row.node->>'component_kind',
      'attachment_value',nullif(v_row.node->>'attachment_value',''),
      'depends_on_ordinal',nullif(v_row.node->>'depends_on_ordinal','')::integer,
      'provenance',nullif(v_row.node->>'provenance','')
    )));
  end loop;
  return v_result;
exception when invalid_text_representation then
  raise invalid_parameter_value using message = 'invalid implant chain';
end;
$$;

revoke all on function private.normalize_implant_chain(jsonb)
from public, anon, authenticated, service_role;

create table public.treatment_plan_item_materialization_contracts (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null,
  item_id uuid not null,
  patient_id uuid not null,
  materialization_kind text not null,
  design_snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (organization_id,item_id),
  constraint treatment_item_materialization_plan_fk foreign key (organization_id,plan_id)
    references public.treatment_plans(organization_id,id) on delete restrict,
  constraint treatment_item_materialization_item_fk foreign key (organization_id,item_id)
    references public.treatment_plan_items(organization_id,id) on delete restrict,
  constraint treatment_item_materialization_patient_fk foreign key (organization_id,patient_id)
    references public.patients(organization_id,id) on delete restrict,
  constraint treatment_item_materialization_kind_check check (materialization_kind in ('CLINICAL','BRIDGE','IMPLANT')),
  constraint treatment_item_materialization_snapshot_object_check check (jsonb_typeof(design_snapshot)='object')
);

revoke all on table public.treatment_plan_item_materialization_contracts
from public,anon,authenticated,service_role;
alter table public.treatment_plan_item_materialization_contracts enable row level security;
create index treatment_item_materialization_patient_idx
on public.treatment_plan_item_materialization_contracts(organization_id,patient_id,item_id);

create or replace function private.capture_treatment_item_materialization_contract()
returns trigger language plpgsql set search_path=''
as $$
declare v_patient uuid;v_text text;v_code text;
begin
 select p.patient_id,upper(coalesce(proc.code,'')||' '||coalesce(proc.name,'')||' '||new.description)
 into v_patient,v_text
 from public.treatment_plans p left join public.procedures proc
  on proc.organization_id=new.organization_id and proc.id=new.procedure_id
 where p.organization_id=new.organization_id and p.id=new.plan_id;
 v_code:=case when v_text like '%ROOT%CANAL%' or v_text like '%RCT%' then 'ROOT_CANAL'
              when v_text like '%EXTRACT%' then 'EXTRACTION'
              when v_text like '%CROWN%' then 'CROWN'
              else 'OTHER' end;
 insert into public.treatment_plan_item_materialization_contracts(
  organization_id,plan_id,item_id,patient_id,materialization_kind,design_snapshot)
 values(new.organization_id,new.plan_id,new.id,v_patient,'CLINICAL',
  pg_catalog.jsonb_build_object('tooth_code',new.tooth_code,'clinical_code',v_code));
 return new;
end $$;

revoke all on function private.capture_treatment_item_materialization_contract()
from public,anon,authenticated,service_role;
create trigger treatment_plan_items_capture_materialization
after insert on public.treatment_plan_items for each row
execute function private.capture_treatment_item_materialization_contract();

insert into public.treatment_plan_item_materialization_contracts(
 organization_id,plan_id,item_id,patient_id,materialization_kind,design_snapshot)
select i.organization_id,i.plan_id,i.id,p.patient_id,'CLINICAL',pg_catalog.jsonb_build_object(
 'tooth_code',i.tooth_code,
 'clinical_code',case when upper(coalesce(proc.code,'')||' '||coalesce(proc.name,'')||' '||i.description) like '%ROOT%CANAL%'
                       or upper(coalesce(proc.code,'')||' '||coalesce(proc.name,'')||' '||i.description) like '%RCT%' then 'ROOT_CANAL'
                      when upper(coalesce(proc.code,'')||' '||coalesce(proc.name,'')||' '||i.description) like '%EXTRACT%' then 'EXTRACTION'
                      when upper(coalesce(proc.code,'')||' '||coalesce(proc.name,'')||' '||i.description) like '%CROWN%' then 'CROWN'
                      else 'OTHER' end)
from public.treatment_plan_items i join public.treatment_plans p
 on p.organization_id=i.organization_id and p.id=i.plan_id
left join public.procedures proc on proc.organization_id=i.organization_id and proc.id=i.procedure_id
on conflict do nothing;

drop function public.create_plan_bridge_design(uuid,uuid,uuid,jsonb);
create function public.create_plan_bridge_design(
  p_acting_branch_id uuid, p_patient_id uuid, p_parent_plan_item_id uuid, p_units jsonb
) returns table(bridge_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_item public.treatment_plan_items%rowtype;
 v_plan public.treatment_plans%rowtype;v_id uuid;v_support text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 select item.* into v_item from public.treatment_plan_items item where item.organization_id=v_org and item.id=p_parent_plan_item_id for key share;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 select plan.* into v_plan from public.treatment_plans plan where plan.organization_id=v_org and plan.id=v_item.plan_id and plan.patient_id=p_patient_id for key share;
 if not found then raise invalid_parameter_value using message='invalid input';end if;
 if v_plan.status<>'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_support:=private.validate_bridge_units_payload(v_org,p_patient_id,'PLAN_DESIGN',v_plan.id,p_units);
 insert into public.dental_bridges(organization_id,patient_id,record_kind,parent_plan_id,parent_plan_item_id,support_kind,recorded_by,version)
 values(v_org,p_patient_id,'PLAN_DESIGN',v_plan.id,v_item.id,v_support,v_actor,1) returning id into v_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,v_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id
 from pg_catalog.jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 update public.treatment_plan_item_materialization_contracts set materialization_kind='BRIDGE',
  design_snapshot=pg_catalog.jsonb_build_object('units',p_units),updated_at=statement_timestamp()
 where organization_id=v_org and item_id=v_item.id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.plan_design.created','dental_bridge',v_id,p_patient_id,'SUCCESS',pg_catalog.jsonb_build_object('treatment_plan_item_id',v_item.id));
 return query select v_id,1,p_patient_id;
end $$;

revoke all on function public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)
from public,anon,authenticated,service_role;

drop function public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb);
create function public.update_draft_plan_bridge_design(
 p_acting_branch_id uuid,p_bridge_id uuid,p_expected_version integer,p_units jsonb
) returns table(bridge_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.dental_bridges%rowtype;v_status text;v_support text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 select * into v_old from public.dental_bridges where organization_id=v_org and id=p_bridge_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_old.record_kind<>'PLAN_DESIGN' or v_old.parent_plan_item_id is null or v_old.sealed_at is not null or v_old.voided_at is not null then raise exception using errcode='P0001',message='invalid state';end if;
 if v_old.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 select status into v_status from public.treatment_plans where organization_id=v_org and id=v_old.parent_plan_id for key share;
 if v_status is distinct from 'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_support:=private.validate_bridge_units_payload(v_org,v_old.patient_id,'PLAN_DESIGN',v_old.parent_plan_id,p_units);
 delete from public.dental_bridge_units where organization_id=v_org and bridge_id=p_bridge_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,p_bridge_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id
 from pg_catalog.jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 update public.treatment_plan_item_materialization_contracts set materialization_kind='BRIDGE',
  design_snapshot=pg_catalog.jsonb_build_object('units',p_units),updated_at=statement_timestamp()
 where organization_id=v_org and item_id=v_old.parent_plan_item_id;
 update public.dental_bridges set support_kind=v_support,version=v_old.version+1,updated_at=statement_timestamp()
 where organization_id=v_org and id=p_bridge_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.plan_design.updated','dental_bridge',p_bridge_id,v_old.patient_id,'SUCCESS',pg_catalog.jsonb_build_object('treatment_plan_item_id',v_old.parent_plan_item_id));
 return query select p_bridge_id,v_old.version+1,v_old.patient_id;
end $$;

revoke all on function public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)
from public,anon,authenticated,service_role;

drop function public.create_plan_implant_design(uuid,uuid,uuid,jsonb);
create function public.create_plan_implant_design(
 p_acting_branch_id uuid,p_patient_id uuid,p_parent_plan_item_id uuid,p_components jsonb
) returns table(component_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_item public.treatment_plan_items%rowtype;v_plan public.treatment_plans%rowtype;
 v_chain jsonb;v_node jsonb;v_ids uuid[]:=array[]::uuid[];v_id uuid;v_parent uuid;v_i integer;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 select item.* into v_item from public.treatment_plan_items item where item.organization_id=v_org and item.id=p_parent_plan_item_id for key share;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 select plan.* into v_plan from public.treatment_plans plan where plan.organization_id=v_org and plan.id=v_item.plan_id and plan.patient_id=p_patient_id for key share;
 if not found then raise invalid_parameter_value using message='invalid input';end if;
 if v_plan.status<>'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_chain:=private.normalize_implant_chain(p_components);
 for v_i in 1..pg_catalog.jsonb_array_length(v_chain) loop
  v_node:=v_chain->(v_i-1);v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
  insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,parent_plan_id,parent_plan_item_id,recorded_by,version)
  values(v_org,p_patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'PLAN_DESIGN',v_plan.id,v_item.id,v_actor,1)
  returning id into v_id;v_ids:=pg_catalog.array_append(v_ids,v_id);
 end loop;
 update public.treatment_plan_item_materialization_contracts set materialization_kind='IMPLANT',
  design_snapshot=pg_catalog.jsonb_build_object('components',v_chain),updated_at=statement_timestamp()
 where organization_id=v_org and item_id=v_item.id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.implant.plan_design.created','dental_implant_component',v_ids[1],p_patient_id,'SUCCESS',pg_catalog.jsonb_build_object('treatment_plan_item_id',v_item.id,'component_count',pg_catalog.array_length(v_ids,1)));
 return query select v_ids[1],1,p_patient_id;
end $$;

revoke all on function public.create_plan_implant_design(uuid,uuid,uuid,jsonb)
from public,anon,authenticated,service_role;

drop function public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb);
create function public.update_draft_plan_implant_design(
 p_acting_branch_id uuid,p_component_id uuid,p_expected_version integer,p_components jsonb
) returns table(component_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.dental_implant_components%rowtype;v_status text;
 v_chain jsonb;v_node jsonb;v_ids uuid[]:=array[]::uuid[];v_id uuid;v_parent uuid;v_i integer;v_delete record;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 select * into v_old from public.dental_implant_components where organization_id=v_org and id=p_component_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_old.record_kind<>'PLAN_DESIGN' or v_old.component_kind<>'FIXTURE' or v_old.depends_on_component_id is not null or v_old.parent_plan_item_id is null then raise exception using errcode='P0001',message='invalid state';end if;
 if v_old.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 select status into v_status from public.treatment_plans where organization_id=v_org and id=v_old.parent_plan_id for key share;
 if v_status is distinct from 'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_chain:=private.normalize_implant_chain(p_components);
 perform 1 from public.dental_implant_components c where c.organization_id=v_org and c.parent_plan_item_id=v_old.parent_plan_item_id and c.record_kind='PLAN_DESIGN' and c.tooth_fdi=v_old.tooth_fdi for update;
 for v_delete in select c.id from public.dental_implant_components c where c.organization_id=v_org and c.parent_plan_item_id=v_old.parent_plan_item_id and c.record_kind='PLAN_DESIGN' and c.tooth_fdi=v_old.tooth_fdi order by c.ordinal desc loop
  delete from public.dental_implant_components where organization_id=v_org and id=v_delete.id;
 end loop;
 for v_i in 1..pg_catalog.jsonb_array_length(v_chain) loop
  v_node:=v_chain->(v_i-1);v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
  insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,parent_plan_id,parent_plan_item_id,recorded_by,version)
  values(v_org,v_old.patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'PLAN_DESIGN',v_old.parent_plan_id,v_old.parent_plan_item_id,v_actor,v_old.version+1)
  returning id into v_id;v_ids:=pg_catalog.array_append(v_ids,v_id);
 end loop;
 update public.treatment_plan_item_materialization_contracts set materialization_kind='IMPLANT',
  design_snapshot=pg_catalog.jsonb_build_object('components',v_chain),updated_at=statement_timestamp()
 where organization_id=v_org and item_id=v_old.parent_plan_item_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.implant.plan_design.updated','dental_implant_component',v_ids[1],v_old.patient_id,'SUCCESS',pg_catalog.jsonb_build_object('replaces_root_id',p_component_id,'component_count',pg_catalog.array_length(v_ids,1)));
 return query select v_ids[1],v_old.version+1,v_old.patient_id;
end $$;

revoke all on function public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)
from public,anon,authenticated,service_role;

drop function public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid);
create function public.record_current_implant_component(
 p_acting_branch_id uuid,p_patient_id uuid,p_components jsonb,p_treating_provider_id uuid,p_executed_at timestamptz,p_charge_id uuid
) returns table(component_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_chain jsonb;v_node jsonb;v_ids uuid[]:=array[]::uuid[];v_id uuid;v_parent uuid;v_i integer;v_external boolean;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 if not exists(select 1 from public.patients where organization_id=v_org and id=p_patient_id for key share) then raise insufficient_privilege using message='not authorized';end if;
 v_chain:=private.normalize_implant_chain(p_components);v_external:=coalesce(v_chain->0->>'provenance','INTERNAL')='PREEXISTING_EXTERNAL';
 if v_external then
  if pg_catalog.jsonb_array_length(v_chain)<>1 or p_treating_provider_id is not null or p_executed_at is not null or p_charge_id is not null then raise invalid_parameter_value using message='invalid input';end if;
 elsif p_treating_provider_id is null or p_executed_at is null or p_charge_id is null
  or not exists(select 1 from public.providers p join public.provider_branches pb on pb.organization_id=p.organization_id and pb.provider_id=p.id where p.organization_id=v_org and p.id=p_treating_provider_id and p.status='active' and pb.branch_id=p_acting_branch_id and pb.is_active)
  or not exists(select 1 from public.charges c where c.organization_id=v_org and c.id=p_charge_id and c.patient_id=p_patient_id for key share) then raise invalid_parameter_value using message='invalid input';end if;
 for v_i in 1..pg_catalog.jsonb_array_length(v_chain) loop
  v_node:=v_chain->(v_i-1);v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
  insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,provenance,treating_provider_id,executed_at,charge_id,sealed_at,recorded_by,version)
  values(v_org,p_patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'CURRENT',case when v_external then 'PREEXISTING_EXTERNAL' end,p_treating_provider_id,p_executed_at,p_charge_id,statement_timestamp(),v_actor,1)
  returning id into v_id;v_ids:=pg_catalog.array_append(v_ids,v_id);
 end loop;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.implant.current.recorded','dental_implant_component',v_ids[1],p_patient_id,'SUCCESS',pg_catalog.jsonb_build_object('component_count',pg_catalog.array_length(v_ids,1)));
 return query select v_ids[1],1,p_patient_id;
end $$;

revoke all on function public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid)
from public,anon,authenticated,service_role;

drop function public.amend_current_implant_component(uuid,uuid,integer,jsonb);
create function public.amend_current_implant_component(
 p_acting_branch_id uuid,p_component_id uuid,p_expected_version integer,p_components jsonb
) returns table(component_id uuid,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.dental_implant_components%rowtype;v_chain jsonb;v_node jsonb;
 v_old_ids uuid[];v_ids uuid[]:=array[]::uuid[];v_id uuid;v_parent uuid;v_i integer;v_count integer;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_branch_permission(p_acting_branch_id,'patient.clinical.correct') then raise insufficient_privilege using message='not authorized';end if;
 select * into v_old from public.dental_implant_components where organization_id=v_org and id=p_component_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_old.record_kind<>'CURRENT' or v_old.component_kind<>'FIXTURE' or v_old.depends_on_component_id is not null or v_old.sealed_at is null or v_old.provenance='PREEXISTING_EXTERNAL' or exists(select 1 from public.dental_implant_component_voids where organization_id=v_org and component_id=v_old.id) or exists(select 1 from public.dental_implant_components where organization_id=v_org and supersedes_component_id=v_old.id) then raise exception using errcode='P0001',message='invalid state';end if;
 if v_old.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 with recursive chain as (
  select c.id,c.ordinal from public.dental_implant_components c where c.organization_id=v_org and c.id=p_component_id
  union all select c.id,c.ordinal from public.dental_implant_components c join chain p on c.organization_id=v_org and c.depends_on_component_id=p.id
 ) select pg_catalog.array_agg(id order by ordinal),count(*) into v_old_ids,v_count from chain;
 perform 1 from public.dental_implant_components c where c.organization_id=v_org and c.id=any(v_old_ids) order by c.ordinal for update;
 if exists(select 1 from public.dental_implant_components c where c.organization_id=v_org and c.id=any(v_old_ids) and (exists(select 1 from public.dental_implant_component_voids x where x.organization_id=v_org and x.component_id=c.id) or exists(select 1 from public.dental_implant_components s where s.organization_id=v_org and s.supersedes_component_id=c.id))) then raise exception using errcode='P0001',message='invalid state';end if;
 v_chain:=private.normalize_implant_chain(p_components);
 if pg_catalog.jsonb_array_length(v_chain)<>v_count then raise invalid_parameter_value using message='invalid implant chain';end if;
 for v_i in 1..v_count loop
  v_node:=v_chain->(v_i-1);v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
  insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,treating_provider_id,executed_at,charge_id,supersedes_component_id,sealed_at,recorded_by,version)
  values(v_org,v_old.patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'CURRENT',v_old.treating_provider_id,v_old.executed_at,v_old.charge_id,v_old_ids[v_i],statement_timestamp(),v_actor,v_old.version+1)
  returning id into v_id;v_ids:=pg_catalog.array_append(v_ids,v_id);
 end loop;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.implant.current.amended','dental_implant_component',v_ids[1],v_old.patient_id,'SUCCESS',pg_catalog.jsonb_build_object('supersedes_component_id',v_old.id,'component_count',v_count));
 return query select v_ids[1],v_old.version+1,v_old.patient_id;
end $$;

revoke all on function public.amend_current_implant_component(uuid,uuid,integer,jsonb)
from public,anon,authenticated,service_role;
