-- Independent O2-O4 review repairs: append-only clinical history, frozen plan
-- structures, canonical periodontal tooth context, and legacy target scope.

create table public.tooth_clinical_entry_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  reason text,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz not null default statement_timestamp(),
  constraint tooth_clinical_entry_voids_organization_entry_fk foreign key (organization_id, entry_id)
    references public.tooth_clinical_entries(organization_id,id) on delete restrict,
  constraint tooth_clinical_entry_voids_unique unique (organization_id,entry_id),
  constraint tooth_clinical_entry_voids_reason_check check (reason is null or length(reason) <= 500)
);
alter table public.tooth_clinical_entry_voids enable row level security;
revoke all on table public.tooth_clinical_entry_voids from public,anon,authenticated,service_role;
create trigger tooth_clinical_entry_voids_append_only before update or delete on public.tooth_clinical_entry_voids
for each row execute function private.reject_append_only_mutation();

create or replace function private.protect_tooth_clinical_entry_history()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'tooth clinical history is append-only'; end if;
  if old.provenance='LEGACY_PHASE15' then raise exception 'legacy clinical history is immutable'; end if;
  if old.lifecycle='OPEN' and new.lifecycle='SUPERSEDED'
     and new.superseded_by_entry_id is not null and new.version=old.version+1
     and exists(select 1 from public.tooth_clinical_entries as successor
       where successor.organization_id=old.organization_id and successor.id=new.superseded_by_entry_id
         and successor.patient_id=old.patient_id and successor.version=new.version)
     and (to_jsonb(new)-'lifecycle'-'superseded_by_entry_id'-'version'-'updated_at')
       =(to_jsonb(old)-'lifecycle'-'superseded_by_entry_id'-'version'-'updated_at') then return new;
  end if;
  if old.lifecycle='OPEN' and new.lifecycle='VOIDED' and new.voided_at is not null and new.version=old.version+1
     and exists(select 1 from public.tooth_clinical_entry_voids as event
       where event.organization_id=old.organization_id and event.entry_id=old.id and event.voided_at=new.voided_at)
     and (to_jsonb(new)-'lifecycle'-'voided_at'-'void_reason'-'version'-'updated_at')
       =(to_jsonb(old)-'lifecycle'-'voided_at'-'void_reason'-'version'-'updated_at') then return new;
  end if;
  raise exception 'tooth clinical history is append-only; use successor or void event';
end $$;
revoke all on function private.protect_tooth_clinical_entry_history() from public,anon,authenticated,service_role;
create trigger tooth_clinical_entries_append_only before update or delete on public.tooth_clinical_entries
for each row execute function private.protect_tooth_clinical_entry_history();

create or replace function public.amend_tooth_clinical_entry(p_acting_branch_id uuid,p_entry_id uuid,p_expected_version integer,p_tooth_code text,p_surfaces text[],p_notes text)
returns table(entry_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_old public.tooth_clinical_entries%rowtype;
v_new uuid; v_surface text; v_seen text[]:='{}'; v_notes text;
begin
 select organization_id into v_org from public.branches where id=$1 and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch($1,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if $2 is null or $3 is null or $3<1 or ($4 is not null and not $4 ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$') then raise invalid_parameter_value using message='invalid input'; end if;
 if $5 is not null then
   if cardinality($5)<1 or cardinality($5)>7 then raise invalid_parameter_value using message='invalid input'; end if;
   foreach v_surface in array $5 loop
    if v_surface not in ('O','B','L','M','D','I','F') or v_surface=any(v_seen) then raise invalid_parameter_value using message='invalid input'; end if;
    v_seen:=array_append(v_seen,v_surface);
   end loop;
 end if;
 v_notes:=case when $6 is null then null else nullif(btrim($6),'') end;
 if length(v_notes)>2000 then raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_old from public.tooth_clinical_entries where organization_id=v_org and id=$2 for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_old.lifecycle<>'OPEN' or v_old.provenance<>'INTERNAL' then raise exception using errcode='P0001',message='invalid state'; end if;
 if v_old.version<>$3 then raise exception using errcode='P0001',message='stale version'; end if;
 insert into public.tooth_clinical_entries(organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,notes,
  treating_provider_id,encounter_id,treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,recorded_at,version)
 values(v_org,v_old.patient_id,coalesce($4,v_old.tooth_code),v_old.kind,v_old.clinical_code,v_old.status,'OPEN','INTERNAL',
  case when $6 is null then v_old.notes else v_notes end,v_old.treating_provider_id,v_old.encounter_id,v_old.treatment_plan_item_id,v_old.charge_id,
  v_old.effective_at,v_old.completed_at,v_actor,statement_timestamp(),v_old.version+1) returning id into v_new;
 if $5 is null then
  insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface,ordinal)
  select organization_id,v_new,surface,ordinal from public.tooth_clinical_entry_surfaces where organization_id=v_org and entry_id=v_old.id;
 else
  foreach v_surface in array v_seen loop insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface,ordinal) values(v_org,v_new,v_surface,1); end loop;
 end if;
 update public.tooth_clinical_entries set lifecycle='SUPERSEDED',superseded_by_entry_id=v_new,version=v_old.version+1 where organization_id=v_org and id=v_old.id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,$1,v_actor,'USER','CLINICAL','clinical.tooth_entry.amended','tooth_clinical_entry',v_new,v_old.patient_id,'SUCCESS',jsonb_build_object('predecessor_entry_id',v_old.id::text));
 entry_id:=v_new; version:=v_old.version+1; return next;
end $$;
revoke all on function public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text) from public,anon,authenticated,service_role;

create or replace function public.void_tooth_clinical_entry(p_acting_branch_id uuid,p_entry_id uuid,p_expected_version integer,p_reason text)
returns table(entry_id uuid,version integer) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid:=(select auth.uid()); v_old public.tooth_clinical_entries%rowtype; v_reason text; v_at timestamptz:=statement_timestamp();
begin
 select organization_id into v_org from public.branches where id=$1 and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch($1,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 v_reason:=nullif(btrim($4),''); if $2 is null or $3 is null or $3<1 or length(v_reason)>500 then raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_old from public.tooth_clinical_entries where organization_id=v_org and id=$2 for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_old.lifecycle<>'OPEN' or v_old.provenance<>'INTERNAL' then raise exception using errcode='P0001',message='invalid state'; end if;
 if v_old.version<>$3 then raise exception using errcode='P0001',message='stale version'; end if;
 insert into public.tooth_clinical_entry_voids(organization_id,entry_id,reason,voided_by,voided_at) values(v_org,v_old.id,v_reason,v_actor,v_at);
 update public.tooth_clinical_entries set lifecycle='VOIDED',voided_at=v_at,void_reason=v_reason,version=v_old.version+1 where organization_id=v_org and id=v_old.id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,$1,v_actor,'USER','CLINICAL','clinical.tooth_entry.voided','tooth_clinical_entry',v_old.id,v_old.patient_id,'SUCCESS',jsonb_strip_nulls(jsonb_build_object('reason',v_reason)));
 entry_id:=v_old.id;version:=v_old.version+1;return next;
end $$;
revoke all on function public.void_tooth_clinical_entry(uuid,uuid,integer,text) from public,anon,authenticated,service_role;

create or replace function private.enforce_draft_plan_odontogram_structure()
returns trigger language plpgsql set search_path='' as $$
declare v_plan uuid; v_org uuid; v_status text; v_kind text;
begin
 v_kind:=case when tg_op='DELETE' then old.record_kind else new.record_kind end;
 if v_kind<>'PLAN_DESIGN' then return case when tg_op='DELETE' then old else new end; end if;
 v_plan:=case when tg_op='DELETE' then old.parent_plan_id else new.parent_plan_id end;
 v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 if v_plan is null then return case when tg_op='DELETE' then old else new end; end if;
 select status into v_status from public.treatment_plans where organization_id=v_org and id=v_plan for key share;
 if v_status<>'DRAFT' then raise exception 'PLAN_DESIGN structures are mutable only while the plan is DRAFT'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.enforce_draft_plan_odontogram_structure() from public,anon,authenticated,service_role;
create trigger dental_bridges_draft_plan_check before insert or update or delete on public.dental_bridges
for each row execute function private.enforce_draft_plan_odontogram_structure();
create trigger dental_implant_components_draft_plan_check before insert or update or delete on public.dental_implant_components
for each row execute function private.enforce_draft_plan_odontogram_structure();

alter table public.periodontal_tooth_measurements add column tooth_present boolean not null default true;
alter table public.periodontal_tooth_measurements add constraint periodontal_tooth_presence_context_check
check (tooth_present or (mobility_miller is null and not implant_context));

drop trigger periodontal_sites_cross_row_check on public.periodontal_site_measurements;
drop trigger periodontal_furcation_cross_row_check on public.periodontal_furcation_measurements;
create or replace function private.enforce_periodontal_tooth_context()
returns trigger language plpgsql set search_path='' as $$
declare v_context public.periodontal_tooth_measurements%rowtype;
begin
 if tg_table_name='periodontal_tooth_measurements' then
  if not new.tooth_present and (exists(select 1 from public.periodontal_site_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi)
    or exists(select 1 from public.periodontal_plaque_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi)
    or exists(select 1 from public.periodontal_furcation_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi)) then raise check_violation using message='missing tooth cannot have periodontal child measurements'; end if;
  if new.implant_context and (new.mobility_miller is not null or exists(select 1 from public.periodontal_furcation_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi)) then raise check_violation using message='implant tooth cannot have mobility or furcation'; end if;
  if exists(select 1 from public.periodontal_site_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi and implant_context is distinct from new.implant_context) then raise check_violation using message='site/tooth implant context mismatch'; end if;
  return new;
 end if;
 select * into v_context from public.periodontal_tooth_measurements where organization_id=new.organization_id and examination_id=new.examination_id and tooth_fdi=new.tooth_fdi for key share;
 if not found then
  insert into public.periodontal_tooth_measurements(organization_id,examination_id,tooth_fdi,tooth_present,implant_context)
  values(new.organization_id,new.examination_id,new.tooth_fdi,true,case when tg_table_name='periodontal_site_measurements' then new.implant_context else false end)
  returning * into v_context;
 end if;
 if not v_context.tooth_present then raise check_violation using message='missing tooth cannot have periodontal child measurements'; end if;
 if tg_table_name='periodontal_site_measurements' and v_context.implant_context is distinct from new.implant_context then raise check_violation using message='site/tooth implant context mismatch'; end if;
 if tg_table_name='periodontal_furcation_measurements' and v_context.implant_context then raise check_violation using message='implant tooth cannot have furcation'; end if;
 return new;
end $$;
revoke all on function private.enforce_periodontal_tooth_context() from public,anon,authenticated,service_role;
create trigger periodontal_tooth_context_check before insert or update on public.periodontal_tooth_measurements for each row execute function private.enforce_periodontal_tooth_context();
create trigger periodontal_site_context_check before insert or update on public.periodontal_site_measurements for each row execute function private.enforce_periodontal_tooth_context();
create trigger periodontal_plaque_context_check before insert or update on public.periodontal_plaque_measurements for each row execute function private.enforce_periodontal_tooth_context();
create trigger periodontal_furcation_context_check before insert or update on public.periodontal_furcation_measurements for each row execute function private.enforce_periodontal_tooth_context();

create or replace function private.validate_legacy_resolution_scope()
returns trigger language plpgsql set search_path='' as $$
declare v_patient uuid; v_target_patient uuid; v_kind text; v_provenance text;
begin
 select patient_id,kind,provenance into v_patient,v_kind,v_provenance from public.tooth_clinical_entries
 where organization_id=new.organization_id and id=new.legacy_entry_id for key share;
 if v_provenance<>'LEGACY_PHASE15' or v_kind not in ('LEGACY_BRIDGE_MARKER','LEGACY_UNLINKED_PLANNED','LEGACY_TERMINAL_UNCLASSIFIED') then raise check_violation using message='only ambiguous legacy entries can be resolved'; end if;
 if new.resolved_clinical_entry_id is not null then select patient_id into v_target_patient from public.tooth_clinical_entries where organization_id=new.organization_id and id=new.resolved_clinical_entry_id; end if;
 if new.resolved_bridge_id is not null then select patient_id into v_target_patient from public.dental_bridges where organization_id=new.organization_id and id=new.resolved_bridge_id; end if;
 if new.resolved_treatment_plan_item_id is not null then select plan.patient_id into v_target_patient from public.treatment_plan_items item join public.treatment_plans plan on plan.organization_id=item.organization_id and plan.id=item.plan_id where item.organization_id=new.organization_id and item.id=new.resolved_treatment_plan_item_id; end if;
 if v_target_patient is not null and v_target_patient is distinct from v_patient then raise check_violation using message='legacy resolution target must belong to the same patient'; end if;
 return new;
end $$;
revoke all on function private.validate_legacy_resolution_scope() from public,anon,authenticated,service_role;
create trigger odontogram_legacy_resolutions_scope_check before insert on public.odontogram_legacy_resolutions
for each row execute function private.validate_legacy_resolution_scope();
