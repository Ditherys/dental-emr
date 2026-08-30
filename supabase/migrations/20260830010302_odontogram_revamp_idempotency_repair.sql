-- Forward repair: persist current bridge/implant idempotency beyond one transaction.
create table private.odontogram_revamp_current_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in ('CURRENT_BRIDGE','CURRENT_IMPLANT')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key=btrim(idempotency_key)),
  request_fingerprint text not null,
  entity_id uuid,
  entity_version integer,
  primary key (organization_id,actor_user_id,operation,idempotency_key)
);
revoke all on table private.odontogram_revamp_current_idempotency from public,anon,authenticated,service_role;

create or replace function public.record_current_bridge_v3(p_acting_branch_id uuid,p_patient_id uuid,p_units jsonb,p_occurred_at timestamptz,p_idempotency_key text)
returns table(bridge_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=(select auth.uid()); v_provider uuid; v_id uuid; v_version integer; v_fingerprint text;
begin
 select branch.organization_id into v_org from public.branches branch where branch.id=p_acting_branch_id and branch.status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_patient_id is null or jsonb_typeof(p_units)<>'array' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
 v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('patient',p_patient_id,'units',p_units,'occurred_at',p_occurred_at)::text);
 insert into private.odontogram_revamp_current_idempotency(organization_id,actor_user_id,operation,idempotency_key,request_fingerprint) values(v_org,v_actor,'CURRENT_BRIDGE',p_idempotency_key,v_fingerprint) on conflict do nothing;
 select entity_id,entity_version,request_fingerprint into v_id,v_version,v_fingerprint from private.odontogram_revamp_current_idempotency where organization_id=v_org and actor_user_id=v_actor and operation='CURRENT_BRIDGE' and idempotency_key=p_idempotency_key for update;
 if v_fingerprint<>pg_catalog.md5(pg_catalog.jsonb_build_object('patient',p_patient_id,'units',p_units,'occurred_at',p_occurred_at)::text) then raise exception using errcode='P0001',message='idempotency conflict'; end if;
 if v_id is not null then bridge_id:=v_id;version:=v_version;return next;return;end if;
 v_provider:=private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
 select b.bridge_id,b.version into v_id,v_version from public.record_current_bridge(p_acting_branch_id,p_patient_id,p_units,v_provider,coalesce(p_occurred_at,statement_timestamp()),null) b;
 update private.odontogram_revamp_current_idempotency set entity_id=v_id,entity_version=v_version where organization_id=v_org and actor_user_id=v_actor and operation='CURRENT_BRIDGE' and idempotency_key=p_idempotency_key;
 bridge_id:=v_id;version:=v_version;return next;
end;$$;
revoke all on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text) from public,anon,authenticated,service_role;

create or replace function public.record_current_implant_component_v3(p_acting_branch_id uuid,p_patient_id uuid,p_components jsonb,p_occurred_at timestamptz,p_idempotency_key text)
returns table(component_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=(select auth.uid()); v_provider uuid; v_id uuid; v_version integer; v_fingerprint text;
begin
 select branch.organization_id into v_org from public.branches branch where branch.id=p_acting_branch_id and branch.status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_patient_id is null or jsonb_typeof(p_components)<>'array' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
 v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('patient',p_patient_id,'components',p_components,'occurred_at',p_occurred_at)::text);
 insert into private.odontogram_revamp_current_idempotency(organization_id,actor_user_id,operation,idempotency_key,request_fingerprint) values(v_org,v_actor,'CURRENT_IMPLANT',p_idempotency_key,v_fingerprint) on conflict do nothing;
 select entity_id,entity_version,request_fingerprint into v_id,v_version,v_fingerprint from private.odontogram_revamp_current_idempotency where organization_id=v_org and actor_user_id=v_actor and operation='CURRENT_IMPLANT' and idempotency_key=p_idempotency_key for update;
 if v_fingerprint<>pg_catalog.md5(pg_catalog.jsonb_build_object('patient',p_patient_id,'components',p_components,'occurred_at',p_occurred_at)::text) then raise exception using errcode='P0001',message='idempotency conflict'; end if;
 if v_id is not null then component_id:=v_id;version:=v_version;return next;return;end if;
 v_provider:=private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
 select c.component_id,c.version into v_id,v_version from public.record_current_implant_component(p_acting_branch_id,p_patient_id,p_components,v_provider,coalesce(p_occurred_at,statement_timestamp()),null) c;
 update private.odontogram_revamp_current_idempotency set entity_id=v_id,entity_version=v_version where organization_id=v_org and actor_user_id=v_actor and operation='CURRENT_IMPLANT' and idempotency_key=p_idempotency_key;
 component_id:=v_id;version:=v_version;return next;
end;$$;
revoke all on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text) from public,anon,authenticated,service_role;
