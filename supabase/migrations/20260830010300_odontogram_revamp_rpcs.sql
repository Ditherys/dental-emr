-- O5 revamp browser mutation boundary. New signatures prevent provider and
-- tenant forgery; historical signatures remain ungranted compatibility only.

create or replace function public.get_patient_odontogram_v3(p_acting_branch_id uuid, p_patient_id uuid)
returns table(entry_id uuid, data jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  return query select * from public.get_patient_odontogram(p_acting_branch_id, p_patient_id);
end;
$$;
revoke all on function public.get_patient_odontogram_v3(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.record_tooth_clinical_entry_v3(
  p_acting_branch_id uuid, p_patient_id uuid, p_tooth_code text, p_surfaces text[],
  p_kind text, p_clinical_code text, p_status text, p_detail jsonb, p_notes text,
  p_occurred_at timestamptz, p_idempotency_key text
) returns table(entry_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_provider uuid;
begin
  select branch.organization_id into v_org from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
  v_provider := private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
  return query select * from public.record_tooth_clinical_entry(p_acting_branch_id,p_patient_id,p_tooth_code,p_surfaces,p_kind,p_clinical_code,p_status,p_detail,p_notes,p_occurred_at,p_idempotency_key);
end;
$$;
revoke all on function public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) from public, anon, authenticated, service_role;

create or replace function public.record_current_bridge_v3(
  p_acting_branch_id uuid,p_patient_id uuid,p_units jsonb,p_occurred_at timestamptz,p_idempotency_key text
) returns table(bridge_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_provider uuid;
begin
  select branch.organization_id into v_org from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':'||v_actor::text||':'||p_idempotency_key,0));
  v_provider := private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
  return query select bridge_id,version from public.record_current_bridge(p_acting_branch_id,p_patient_id,p_units,v_provider,coalesce(p_occurred_at,statement_timestamp()),null);
end;
$$;
revoke all on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text) from public, anon, authenticated, service_role;

create or replace function public.record_current_implant_component_v3(
  p_acting_branch_id uuid,p_patient_id uuid,p_components jsonb,p_occurred_at timestamptz,p_idempotency_key text
) returns table(component_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_provider uuid;
begin
  select branch.organization_id into v_org from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':'||v_actor::text||':'||p_idempotency_key,0));
  v_provider := private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
  return query select component_id,version from public.record_current_implant_component(p_acting_branch_id,p_patient_id,p_components,v_provider,coalesce(p_occurred_at,statement_timestamp()),null);
end;
$$;
revoke all on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text) from public, anon, authenticated, service_role;

create table private.odontogram_revamp_idempotency (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 operation text not null check (operation in ('DIRECT_TREATMENT','PROCEDURE_FOLLOWUP')),
 idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key=btrim(idempotency_key)),
 event_id uuid, version integer, primary key(organization_id,actor_user_id,operation,idempotency_key)
);
revoke all on table private.odontogram_revamp_idempotency from public, anon, authenticated, service_role;

create or replace function public.record_direct_treatment_with_charge(p_acting_branch_id uuid,p_patient_id uuid,p_procedure_id uuid,p_amount_centavos bigint,p_payload jsonb,p_idempotency_key text)
returns table(event_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_org uuid; v_provider uuid; v_charge uuid; v_case uuid; v_event uuid; v_version integer;
begin
 select branch.organization_id into v_org from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_billing_permission_at_branch(p_acting_branch_id,'billing.charge') then raise insufficient_privilege using message='not authorized'; end if;
 v_provider:=private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
 if p_patient_id is null or p_procedure_id is null or p_amount_centavos is null or p_amount_centavos<0 or p_amount_centavos>99999999999 or jsonb_typeof(p_payload)<>'object' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
 insert into private.odontogram_revamp_idempotency(organization_id,actor_user_id,operation,idempotency_key) values(v_org,v_actor,'DIRECT_TREATMENT',p_idempotency_key) on conflict do nothing;
 select idem.event_id,idem.version into v_event,v_version from private.odontogram_revamp_idempotency idem where idem.organization_id=v_org and idem.actor_user_id=v_actor and idem.operation='DIRECT_TREATMENT' and idem.idempotency_key=p_idempotency_key for update;
 if v_event is not null then event_id:=v_event; version:=v_version; return next; return; end if;
 if not exists(select 1 from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id for key share) or not exists(select 1 from public.procedures as procedure where procedure.organization_id=v_org and procedure.id=p_procedure_id) then raise insufficient_privilege using message='not authorized'; end if;
 select charge_id into v_charge from public.post_charge(p_acting_branch_id,p_patient_id,p_procedure_id,null,p_amount_centavos,null,false,case when p_amount_centavos=0 then 'Zero direct treatment charge' else null end,'odontogram-direct-'||p_idempotency_key);
 insert into public.procedure_cases(organization_id,patient_id,origin_branch_id,procedure_id,charge_id,opened_by) values(v_org,p_patient_id,p_acting_branch_id,p_procedure_id,v_charge,v_actor) returning id,version into v_case,v_version;
 insert into public.procedure_case_events(organization_id,procedure_case_id,event_type,occurred_at,recorded_by,notes) values(v_org,v_case,'TREATMENT',statement_timestamp(),v_actor,nullif(btrim(p_payload->>'notes'),'')) returning id into v_event;
 update private.odontogram_revamp_idempotency set event_id=v_event,version=v_version where organization_id=v_org and actor_user_id=v_actor and operation='DIRECT_TREATMENT' and idempotency_key=p_idempotency_key;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','procedure.case.direct_treatment.recorded','procedure_case_event',v_event,p_patient_id,'SUCCESS','{}'::jsonb);
 event_id:=v_event; version:=v_version; return next;
end;
$$;
revoke all on function public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text) from public, anon, authenticated, service_role;

create or replace function public.record_procedure_followup(p_acting_branch_id uuid,p_procedure_case_id uuid,p_notes text,p_occurred_at timestamptz,p_idempotency_key text)
returns table(event_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_actor_user_id uuid := (select auth.uid()); v_organization_id uuid; v_case public.procedure_cases%rowtype; v_event uuid; v_notes text;
begin
 select branch.organization_id into v_organization_id from public.branches as branch where branch.id=p_acting_branch_id and branch.status='active';
 if v_actor_user_id is null or v_organization_id is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 perform private.require_active_actor_provider(v_organization_id,p_acting_branch_id,v_actor_user_id);
 if p_procedure_case_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
 v_notes:=nullif(btrim(p_notes),''); if coalesce(length(v_notes),0)>4000 or (p_occurred_at is not null and p_occurred_at>statement_timestamp()+interval '5 minutes') then raise invalid_parameter_value using message='invalid input'; end if;
 insert into private.odontogram_revamp_idempotency(organization_id,actor_user_id,operation,idempotency_key) values(v_organization_id,v_actor_user_id,'PROCEDURE_FOLLOWUP',p_idempotency_key) on conflict do nothing;
 select * into v_case from public.procedure_cases where id=p_procedure_case_id and organization_id=v_organization_id for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 select idem.event_id,idem.version into v_event,version from private.odontogram_revamp_idempotency idem where idem.organization_id=v_organization_id and idem.actor_user_id=v_actor_user_id and idem.operation='PROCEDURE_FOLLOWUP' and idem.idempotency_key=p_idempotency_key for update;
 if v_event is not null then event_id:=v_event; return next; return; end if;
 if v_case.status<>'OPEN' then raise exception using errcode='P0001',message='invalid state'; end if;
 insert into public.procedure_case_events(organization_id,procedure_case_id,event_type,occurred_at,recorded_by,notes) values(v_organization_id,v_case.id,'FOLLOW_UP',coalesce(p_occurred_at,statement_timestamp()),v_actor_user_id,v_notes) returning id into v_event;
 update public.procedure_cases set version=version+1 where organization_id=v_organization_id and id=v_case.id returning version into version;
 update private.odontogram_revamp_idempotency set event_id=v_event,version=version where organization_id=v_organization_id and actor_user_id=v_actor_user_id and operation='PROCEDURE_FOLLOWUP' and idempotency_key=p_idempotency_key;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','CLINICAL','procedure.case.follow_up.recorded','procedure_case_event',v_event,v_case.patient_id,'SUCCESS','{}'::jsonb);
 event_id:=v_event; return next;
end;
$$;
revoke all on function public.record_procedure_followup(uuid,uuid,text,timestamptz,text) from public, anon, authenticated, service_role;
