create or replace function private.validate_bridge_units_payload(
  p_organization_id uuid,p_patient_id uuid,p_record_kind text,p_parent_plan_id uuid,p_units jsonb
) returns text language plpgsql set search_path='' as $$
declare v_count integer; v_bad boolean; v_min integer; v_max integer; v_first text; v_last text;
v_natural boolean; v_implant boolean;
begin
 if p_units is null or jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)<2 or jsonb_array_length(p_units)>16 then raise invalid_parameter_value using message='invalid input'; end if;
 with units as (select * from jsonb_to_recordset(p_units) as x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid))
 select count(*),bool_or(tooth_fdi is null or not tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  or ordinal is null or ordinal<1 or role not in ('ABUTMENT','PONTIC') or support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT','NONE')
  or (role='PONTIC' and (support_kind<>'NONE' or support_component_id is not null))
  or (role='ABUTMENT' and (support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT') or ((support_kind='IMPLANT_COMPONENT')<>(support_component_id is not null))))),
  min(ordinal),max(ordinal),(array_agg(role order by ordinal))[1],(array_agg(role order by ordinal))[count(*)],
  bool_or(role='ABUTMENT' and support_kind='NATURAL_TOOTH'),bool_or(role='ABUTMENT' and support_kind='IMPLANT_COMPONENT')
 into v_count,v_bad,v_min,v_max,v_first,v_last,v_natural,v_implant from units;
 if v_count<>jsonb_array_length(p_units) or coalesce(v_bad,true) or v_min<>1 or v_max<>v_count or v_first<>'ABUTMENT' or v_last<>'ABUTMENT'
    or (select count(distinct tooth_fdi)<>v_count or count(distinct ordinal)<>v_count from jsonb_to_recordset(p_units) as x(tooth_fdi text,ordinal integer))
    or exists(select 1 from (select tooth_fdi,lag(tooth_fdi) over(order by ordinal) prev from jsonb_to_recordset(p_units) as x(tooth_fdi text,ordinal integer)) q
      where prev is not null and (substring(prev,1,1)<>substring(tooth_fdi,1,1) or substring(tooth_fdi,2,1)::integer<>substring(prev,2,1)::integer+1)) then
   raise invalid_parameter_value using message='invalid bridge span';
 end if;
 if exists(
  select 1 from jsonb_to_recordset(p_units) as x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid)
  left join public.dental_implant_components c on c.organization_id=p_organization_id and c.id=x.support_component_id
  where x.support_component_id is not null and (c.id is null or c.patient_id<>p_patient_id or c.tooth_fdi<>x.tooth_fdi or c.component_kind<>'ABUTMENT'
    or (p_record_kind='CURRENT' and (c.record_kind<>'CURRENT' or c.sealed_at is null or c.voided_at is not null))
    or (p_record_kind='PLAN_DESIGN' and c.record_kind='PLAN_DESIGN' and c.parent_plan_id is distinct from p_parent_plan_id))
 ) then raise invalid_parameter_value using message='invalid implant support'; end if;
 return case when v_natural and v_implant then 'MIXED' when v_implant then 'IMPLANT_COMPONENT' else 'NATURAL_TOOTH' end;
end $$;
revoke all on function private.validate_bridge_units_payload(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.record_current_bridge(
 p_acting_branch_id uuid,p_patient_id uuid,p_units jsonb,p_treating_provider_id uuid,p_executed_at timestamptz,p_charge_id uuid
) returns table(bridge_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_id uuid;v_support text;rec record;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write')
  or not private.has_branch_permission(p_acting_branch_id,'billing.charge') then raise insufficient_privilege using message='not authorized'; end if;
 if p_patient_id is null or p_treating_provider_id is null or p_executed_at is null or p_charge_id is null then raise invalid_parameter_value using message='invalid input'; end if;
 if not exists(select 1 from public.patients where organization_id=v_org and id=p_patient_id for key share)
  or not exists(select 1 from public.providers p join public.provider_branches pb on pb.organization_id=p.organization_id and pb.provider_id=p.id and pb.branch_id=p_acting_branch_id and pb.is_active where p.organization_id=v_org and p.id=p_treating_provider_id and p.status='active')
  or not exists(select 1 from public.charges where organization_id=v_org and id=p_charge_id and patient_id=p_patient_id for key share) then raise invalid_parameter_value using message='invalid input'; end if;
 v_support:=private.validate_bridge_units_payload(v_org,p_patient_id,'CURRENT',null,p_units);
 insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at)
 values(v_org,p_patient_id,'CURRENT',v_support,p_treating_provider_id,p_executed_at,p_charge_id,v_actor,1,null) returning id into v_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,v_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id from jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 update public.dental_bridges set sealed_at=statement_timestamp() where organization_id=v_org and id=v_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.current.recorded','dental_bridge',v_id,p_patient_id,'SUCCESS','{}');
 bridge_id:=v_id;version:=1;return next;
end $$;
revoke all on function public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;

create or replace function public.amend_current_bridge(
 p_acting_branch_id uuid,p_bridge_id uuid,p_expected_version integer,p_units jsonb
) returns table(bridge_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.dental_bridges%rowtype;v_id uuid;v_support text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_branch_permission(p_acting_branch_id,'patient.clinical.correct') then raise insufficient_privilege using message='not authorized'; end if;
 if p_bridge_id is null or p_expected_version is null or p_expected_version<1 then raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_old from public.dental_bridges where organization_id=v_org and id=p_bridge_id for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_old.record_kind<>'CURRENT' or v_old.sealed_at is null or v_old.voided_at is not null or v_old.version<>p_expected_version
  or exists(select 1 from public.dental_bridge_voids where organization_id=v_org and bridge_id=v_old.id)
  or exists(select 1 from public.dental_bridges where organization_id=v_org and supersedes_bridge_id=v_old.id) then raise exception using errcode='P0001',message='invalid state'; end if;
 v_support:=private.validate_bridge_units_payload(v_org,v_old.patient_id,'CURRENT',null,p_units);
 insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,provenance,treating_provider_id,executed_at,charge_id,supersedes_bridge_id,recorded_by,version,sealed_at)
 values(v_org,v_old.patient_id,'CURRENT',v_support,v_old.provenance,v_old.treating_provider_id,v_old.executed_at,v_old.charge_id,v_old.id,v_actor,v_old.version+1,null) returning id into v_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,v_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id from jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 update public.dental_bridges set sealed_at=statement_timestamp() where organization_id=v_org and id=v_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.current.amended','dental_bridge',v_id,v_old.patient_id,'SUCCESS',jsonb_build_object('predecessor_bridge_id',v_old.id::text));
 bridge_id:=v_id;version:=v_old.version+1;return next;
end $$;
revoke all on function public.amend_current_bridge(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
