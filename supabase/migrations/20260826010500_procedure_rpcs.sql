-- P3-05: bounded procedure configuration RPCs. This object migration grants nothing.

create function public.create_procedure(p_acting_branch_id uuid, p_procedure jsonb)
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if jsonb_typeof(p_procedure) <> 'object' or not (p_procedure ?& array['code','name'])
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key not in ('code','name','description','defaultDurationMinutes','preBufferMinutes','postBufferMinutes','status','websiteVisible','onlineBookingEnabled','bookingMode'))
    or (p_procedure ? 'code' and jsonb_typeof(p_procedure -> 'code') <> 'string')
    or (p_procedure ? 'name' and jsonb_typeof(p_procedure -> 'name') <> 'string')
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('description','status','bookingMode') and jsonb_typeof(p_procedure -> key) not in ('string','null'))
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('defaultDurationMinutes','preBufferMinutes','postBufferMinutes') and jsonb_typeof(p_procedure -> key) not in ('number','null'))
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('websiteVisible','onlineBookingEnabled') and jsonb_typeof(p_procedure -> key) <> 'boolean') then raise invalid_parameter_value using message = 'invalid input'; end if;
  if p_procedure ->> 'code' <> pg_catalog.upper(p_procedure ->> 'code') or p_procedure ->> 'code' !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(p_procedure ->> 'code') > 80
    or pg_catalog.btrim(p_procedure ->> 'name') = '' or pg_catalog.length(p_procedure ->> 'name') > 160
    or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_procedure ->> 'description'), '')), 0) > 4000
    or (p_procedure ? 'status' and p_procedure ->> 'status' not in ('active','inactive'))
    or (p_procedure ? 'bookingMode' and p_procedure ->> 'bookingMode' not in ('REQUIRES_REVIEW','REQUEST_ONLY')) then raise invalid_parameter_value using message = 'invalid input'; end if;
  begin
    if (p_procedure ? 'defaultDurationMinutes' and ((p_procedure ->> 'defaultDurationMinutes')::integer not between 1 and 1440))
      or (p_procedure ? 'preBufferMinutes' and ((p_procedure ->> 'preBufferMinutes')::integer not between 0 and 1440))
      or (p_procedure ? 'postBufferMinutes' and ((p_procedure ->> 'postBufferMinutes')::integer not between 0 and 1440))
      or (coalesce(p_procedure ->> 'defaultDurationMinutes', '') = '' and (coalesce((p_procedure ->> 'preBufferMinutes')::integer, 0) <> 0 or coalesce((p_procedure ->> 'postBufferMinutes')::integer, 0) <> 0)) then raise invalid_parameter_value using message = 'invalid input'; end if;
  exception when invalid_text_representation then raise invalid_parameter_value using message = 'invalid input'; end;
  insert into public.procedures (organization_id, code, name, description, default_duration_minutes, pre_buffer_minutes, post_buffer_minutes, status, website_visible, online_booking_enabled, booking_mode)
  values (v_organization_id, p_procedure ->> 'code', pg_catalog.btrim(p_procedure ->> 'name'), nullif(pg_catalog.btrim(p_procedure ->> 'description'), ''), nullif(p_procedure ->> 'defaultDurationMinutes','')::integer, coalesce((p_procedure ->> 'preBufferMinutes')::integer,0), coalesce((p_procedure ->> 'postBufferMinutes')::integer,0), coalesce(p_procedure ->> 'status','active'), coalesce((p_procedure ->> 'websiteVisible')::boolean,false), coalesce((p_procedure ->> 'onlineBookingEnabled')::boolean,false), coalesce(p_procedure ->> 'bookingMode','REQUIRES_REVIEW')) returning id, public.procedures.version into procedure_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.created','procedure',procedure_id,'SUCCESS','{}'::jsonb);
  return next;
end;
$$;
revoke all on function public.create_procedure(uuid, jsonb) from public, anon, authenticated, service_role;

create function public.update_procedure(p_acting_branch_id uuid, p_procedure_id uuid, p_expected_version integer, p_patch jsonb)
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_procedure public.procedures%rowtype;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_patch) <> 'object' or not (p_patch ?| array['code','name','description','defaultDurationMinutes','preBufferMinutes','postBufferMinutes','status','websiteVisible','onlineBookingEnabled','bookingMode'])
    or exists (select 1 from jsonb_object_keys(p_patch) as key where key not in ('code','name','description','defaultDurationMinutes','preBufferMinutes','postBufferMinutes','status','websiteVisible','onlineBookingEnabled','bookingMode'))
    or (p_patch ? 'code' and jsonb_typeof(p_patch -> 'code') <> 'string')
    or (p_patch ? 'name' and jsonb_typeof(p_patch -> 'name') <> 'string')
    or exists (select 1 from jsonb_object_keys(p_patch) as key where key in ('description','status','bookingMode') and jsonb_typeof(p_patch -> key) not in ('string','null'))
    or exists (select 1 from jsonb_object_keys(p_patch) as key where key in ('defaultDurationMinutes','preBufferMinutes','postBufferMinutes') and jsonb_typeof(p_patch -> key) not in ('number','null'))
    or exists (select 1 from jsonb_object_keys(p_patch) as key where key in ('websiteVisible','onlineBookingEnabled') and jsonb_typeof(p_patch -> key) <> 'boolean') then raise invalid_parameter_value using message='invalid input'; end if;
  select procedure.* into v_procedure from public.procedures as procedure where procedure.id=p_procedure_id and procedure.organization_id=v_organization_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_procedure.version <> p_expected_version then raise exception using errcode='P0001', message='stale version'; end if;
  if v_procedure.status='archived' or (p_patch ? 'status' and p_patch ->> 'status' not in ('active','inactive'))
    or (p_patch ? 'code' and (p_patch ->> 'code' <> pg_catalog.upper(p_patch ->> 'code') or p_patch ->> 'code' !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(p_patch ->> 'code') > 80))
    or (p_patch ? 'name' and (pg_catalog.btrim(p_patch ->> 'name')='' or pg_catalog.length(p_patch ->> 'name')>160))
    or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'description'),'')),0)>4000
    or (p_patch ? 'bookingMode' and p_patch ->> 'bookingMode' not in ('REQUIRES_REVIEW','REQUEST_ONLY')) then raise invalid_parameter_value using message='invalid input'; end if;
  begin
    if (p_patch ? 'defaultDurationMinutes' and ((p_patch ->> 'defaultDurationMinutes')::integer not between 1 and 1440)) or (p_patch ? 'preBufferMinutes' and ((p_patch ->> 'preBufferMinutes')::integer not between 0 and 1440)) or (p_patch ? 'postBufferMinutes' and ((p_patch ->> 'postBufferMinutes')::integer not between 0 and 1440)) then raise invalid_parameter_value using message='invalid input'; end if;
  exception when invalid_text_representation then raise invalid_parameter_value using message='invalid input'; end;
  if coalesce(case when p_patch ? 'defaultDurationMinutes' then nullif(p_patch ->> 'defaultDurationMinutes','')::integer else v_procedure.default_duration_minutes end, 0)=0
    and (case when p_patch ? 'preBufferMinutes' then coalesce((p_patch ->> 'preBufferMinutes')::integer,0) else v_procedure.pre_buffer_minutes end <> 0
      or case when p_patch ? 'postBufferMinutes' then coalesce((p_patch ->> 'postBufferMinutes')::integer,0) else v_procedure.post_buffer_minutes end <> 0) then raise invalid_parameter_value using message='invalid input'; end if;
  update public.procedures set code=case when p_patch ? 'code' then p_patch ->> 'code' else v_procedure.code end, name=case when p_patch ? 'name' then pg_catalog.btrim(p_patch ->> 'name') else v_procedure.name end, description=case when p_patch ? 'description' then nullif(pg_catalog.btrim(p_patch ->> 'description'),'') else v_procedure.description end, default_duration_minutes=case when p_patch ? 'defaultDurationMinutes' then nullif(p_patch ->> 'defaultDurationMinutes','')::integer else v_procedure.default_duration_minutes end, pre_buffer_minutes=case when p_patch ? 'preBufferMinutes' then coalesce((p_patch ->> 'preBufferMinutes')::integer,0) else v_procedure.pre_buffer_minutes end, post_buffer_minutes=case when p_patch ? 'postBufferMinutes' then coalesce((p_patch ->> 'postBufferMinutes')::integer,0) else v_procedure.post_buffer_minutes end, status=case when p_patch ? 'status' then p_patch ->> 'status' else v_procedure.status end, website_visible=case when p_patch ? 'websiteVisible' then (p_patch ->> 'websiteVisible')::boolean else v_procedure.website_visible end, online_booking_enabled=case when p_patch ? 'onlineBookingEnabled' then (p_patch ->> 'onlineBookingEnabled')::boolean else v_procedure.online_booking_enabled end, booking_mode=case when p_patch ? 'bookingMode' then p_patch ->> 'bookingMode' else v_procedure.booking_mode end, version=v_procedure.version+1 where id=v_procedure.id and organization_id=v_organization_id returning id, public.procedures.version into procedure_id, version;
  insert into public.audit_events (organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,result,metadata) values (v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.updated','procedure',procedure_id,'SUCCESS','{}'::jsonb); return next;
end;
$$;
revoke all on function public.update_procedure(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create function public.archive_procedure(p_acting_branch_id uuid, p_procedure_id uuid, p_expected_version integer)
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_procedure public.procedures%rowtype;
begin
  perform private.require_aal2();
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise invalid_parameter_value using message='invalid input'; end if;
  select procedure.* into v_procedure from public.procedures as procedure where procedure.id=p_procedure_id and procedure.organization_id=v_organization_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_procedure.version <> p_expected_version then raise exception using errcode='P0001', message='stale version'; end if;
  if v_procedure.status='archived' then raise exception using errcode='P0001', message='invalid state'; end if;
  update public.procedures set status='archived', archived_at=pg_catalog.statement_timestamp(), version=v_procedure.version+1 where id=v_procedure.id and organization_id=v_organization_id returning id, public.procedures.version into procedure_id, version;
  insert into public.audit_events (organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,result,metadata) values (v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.archived','procedure',procedure_id,'SUCCESS','{}'::jsonb); return next;
end;
$$;
revoke all on function public.archive_procedure(uuid, uuid, integer) from public, anon, authenticated, service_role;

create function public.set_procedure_specialties(p_acting_branch_id uuid, p_procedure_id uuid, p_expected_version integer, p_specialties jsonb)
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_procedure public.procedures%rowtype; v_count integer;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  if p_expected_version is null or p_expected_version<1 or jsonb_typeof(p_specialties)<>'array' or exists (select 1 from jsonb_array_elements(p_specialties) as item where jsonb_typeof(item)<>'object' or not (item ?& array['specialtyId','requirementLevel']) or exists(select 1 from jsonb_object_keys(item) as key where key not in ('specialtyId','requirementLevel')) or jsonb_typeof(item->'specialtyId')<>'string' or jsonb_typeof(item->'requirementLevel')<>'string' or item->>'requirementLevel' not in ('REQUIRED','PREFERRED')) then raise invalid_parameter_value using message='invalid input'; end if;
  begin perform (item->>'specialtyId')::uuid from jsonb_array_elements(p_specialties) as item; exception when others then raise invalid_parameter_value using message='invalid input'; end;
  if (select count(*) from jsonb_array_elements(p_specialties))<>(select count(distinct item->>'specialtyId') from jsonb_array_elements(p_specialties) as item) then raise invalid_parameter_value using message='invalid input'; end if;
  select procedure.* into v_procedure from public.procedures as procedure where procedure.id=p_procedure_id and procedure.organization_id=v_organization_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_procedure.version<>p_expected_version then raise exception using errcode='P0001', message='stale version'; end if;
  if v_procedure.status='archived' then raise invalid_parameter_value using message='invalid input'; end if;
  select count(*) into v_count from public.specialties as specialty join jsonb_array_elements(p_specialties) as item on specialty.id=(item->>'specialtyId')::uuid where specialty.is_active and (specialty.organization_id is null or specialty.organization_id=v_organization_id);
  if v_count<>jsonb_array_length(p_specialties) then raise invalid_parameter_value using message='invalid input'; end if;
  delete from public.procedure_specialties as relation where relation.organization_id=v_organization_id and relation.procedure_id=v_procedure.id;
  insert into public.procedure_specialties (organization_id,procedure_id,specialty_id,requirement_level) select v_organization_id,v_procedure.id,(item->>'specialtyId')::uuid,item->>'requirementLevel' from jsonb_array_elements(p_specialties) as item;
  update public.procedures set version=v_procedure.version+1 where id=v_procedure.id and organization_id=v_organization_id returning id, public.procedures.version into procedure_id,version;
  insert into public.audit_events (organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,result,metadata) values(v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.specialties.updated','procedure',procedure_id,'SUCCESS','{}'::jsonb); return next;
end;
$$;
revoke all on function public.set_procedure_specialties(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create function public.set_procedure_eligible_providers(p_acting_branch_id uuid, p_procedure_id uuid, p_expected_version integer, p_provider_ids uuid[])
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_procedure public.procedures%rowtype;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  if p_expected_version is null or p_expected_version<1 or p_provider_ids is null or cardinality(p_provider_ids)<>(select count(distinct provider_id) from unnest(p_provider_ids) as provider_id) then raise invalid_parameter_value using message='invalid input'; end if;
  select procedure.* into v_procedure from public.procedures as procedure where procedure.id=p_procedure_id and procedure.organization_id=v_organization_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_procedure.version<>p_expected_version then raise exception using errcode='P0001', message='stale version'; end if;
  if v_procedure.status='archived' or (select count(*) from public.providers as provider where provider.organization_id=v_organization_id and provider.id=any(p_provider_ids) and provider.status='active')<>cardinality(p_provider_ids) then raise invalid_parameter_value using message='invalid input'; end if;
  delete from public.procedure_eligible_providers as relation where relation.organization_id=v_organization_id and relation.procedure_id=v_procedure.id;
  insert into public.procedure_eligible_providers (organization_id,procedure_id,provider_id) select v_organization_id,v_procedure.id,provider_id from unnest(p_provider_ids) as provider_id;
  update public.procedures set version=v_procedure.version+1 where id=v_procedure.id and organization_id=v_organization_id returning id, public.procedures.version into procedure_id,version;
  insert into public.audit_events (organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,result,metadata) values(v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.eligible_providers.updated','procedure',procedure_id,'SUCCESS','{}'::jsonb); return next;
end;
$$;
revoke all on function public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[]) from public, anon, authenticated, service_role;

create function public.list_procedures(p_acting_branch_id uuid)
returns table(procedure_id uuid, code text, name text, status text, default_duration_minutes integer, pre_buffer_minutes integer, post_buffer_minutes integer, website_visible boolean, online_booking_enabled boolean, booking_mode text, specialty_count bigint, eligible_provider_count bigint)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or (select auth.uid()) is null or not private.can_read_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  return query select procedure.id,procedure.code,procedure.name,procedure.status,procedure.default_duration_minutes,procedure.pre_buffer_minutes,procedure.post_buffer_minutes,procedure.website_visible,procedure.online_booking_enabled,procedure.booking_mode,(select count(*) from public.procedure_specialties as specialty where specialty.organization_id=procedure.organization_id and specialty.procedure_id=procedure.id),(select count(*) from public.procedure_eligible_providers as provider where provider.organization_id=procedure.organization_id and provider.procedure_id=procedure.id) from public.procedures as procedure where procedure.organization_id=v_organization_id and procedure.status<>'archived' order by procedure.name,procedure.id;
end;
$$;
revoke all on function public.list_procedures(uuid) from public, anon, authenticated, service_role;

create function public.get_procedure_configuration(p_acting_branch_id uuid, p_procedure_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_result jsonb;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_organization_id is null or (select auth.uid()) is null or not private.can_read_provider_configuration(v_organization_id) then raise insufficient_privilege using message='not authorized'; end if;
  select jsonb_build_object('procedureId',procedure.id,'code',procedure.code,'name',procedure.name,'description',procedure.description,'defaultDurationMinutes',procedure.default_duration_minutes,'preBufferMinutes',procedure.pre_buffer_minutes,'postBufferMinutes',procedure.post_buffer_minutes,'status',procedure.status,'websiteVisible',procedure.website_visible,'onlineBookingEnabled',procedure.online_booking_enabled,'bookingMode',procedure.booking_mode,'version',procedure.version,'specialties',coalesce((select jsonb_agg(jsonb_build_object('specialtyId',relation.specialty_id,'requirementLevel',relation.requirement_level) order by relation.specialty_id) from public.procedure_specialties as relation where relation.organization_id=procedure.organization_id and relation.procedure_id=procedure.id),'[]'::jsonb),'eligibleProviderIds',coalesce((select jsonb_agg(relation.provider_id order by relation.provider_id) from public.procedure_eligible_providers as relation where relation.organization_id=procedure.organization_id and relation.procedure_id=procedure.id),'[]'::jsonb)) into v_result from public.procedures as procedure where procedure.organization_id=v_organization_id and procedure.id=p_procedure_id;
  if v_result is null then raise insufficient_privilege using message='not authorized'; end if; return v_result;
end;
$$;
revoke all on function public.get_procedure_configuration(uuid, uuid) from public, anon, authenticated, service_role;
