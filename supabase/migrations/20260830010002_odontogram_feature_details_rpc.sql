-- Forward-only O2 write boundary. No table grants are added: the narrow RPC
-- derives tenant authority from the active branch and persists entry/detail as
-- one transaction with actor-scoped idempotency.

alter table public.tooth_clinical_entries
  add constraint tooth_clinical_entries_organization_id_id_code_key
  unique (organization_id, id, clinical_code);

alter table public.tooth_clinical_entry_details
  add constraint tooth_clinical_entry_details_entry_feature_fk
  foreign key (organization_id, entry_id, feature_code)
  references public.tooth_clinical_entries (organization_id, id, clinical_code)
  on delete restrict;

create table private.tooth_clinical_entry_record_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key = btrim(idempotency_key)),
  entry_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, actor_user_id, idempotency_key),
  foreign key (organization_id, entry_id) references public.tooth_clinical_entries(organization_id, id) on delete restrict
);
revoke all on table private.tooth_clinical_entry_record_idempotency from public, anon, authenticated, service_role;

create or replace function public.record_tooth_clinical_entry(
  p_acting_branch_id uuid, p_patient_id uuid, p_tooth_code text, p_surfaces text[],
  p_kind text, p_clinical_code text, p_status text, p_detail jsonb, p_notes text,
  p_occurred_at timestamptz, p_idempotency_key text
)
returns table(entry_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_entry_id uuid;
  v_version integer; v_surface text; v_seen text[] := '{}'; v_notes text;
begin
  select organization_id into v_organization_id from public.branches where id=p_acting_branch_id and status='active';
  if v_organization_id is null or v_actor_user_id is null or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
  if p_tooth_code is null or p_tooth_code !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
    or p_kind not in ('FINDING','TREATMENT') or p_clinical_code not in ('CARIES','RESTORATION','CROWN','BRIDGE','MISSING','SEALANT','FRACTURE','OTHER','EXTRACTION','IMPLANT','ROOT_CANAL','TOOTH_STATE','ORTHODONTIC')
    or p_status not in ('ACTIVE','PLANNED','COMPLETED','REFERRED','EXISTING','PREEXISTING','COMPLETED_LEGACY')
    or p_detail is null or jsonb_typeof(p_detail) <> 'object' or p_detail->>'code' <> p_clinical_code
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key <> btrim(p_idempotency_key) then raise invalid_parameter_value using message='invalid input'; end if;
  if p_surfaces is null or array_length(p_surfaces,1) not between 1 and 7 then raise invalid_parameter_value using message='invalid input'; end if;
  foreach v_surface in array p_surfaces loop
    if v_surface is null or v_surface not in ('O','B','L','M','D','I','F') or v_surface=any(v_seen) then raise invalid_parameter_value using message='invalid input'; end if;
    v_seen := array_append(v_seen,v_surface);
  end loop;
  v_notes:=nullif(btrim(p_notes),''); if coalesce(length(v_notes),0)>2000 then raise invalid_parameter_value using message='invalid input'; end if;
  if not exists(select 1 from public.patients where id=p_patient_id and organization_id=v_organization_id for key share) then raise insufficient_privilege using message='not authorized'; end if;
  insert into private.tooth_clinical_entry_record_idempotency(organization_id,actor_user_id,idempotency_key,entry_id)
  values(v_organization_id,v_actor_user_id,p_idempotency_key,null) on conflict do nothing;
  select entry_id into v_entry_id from private.tooth_clinical_entry_record_idempotency where organization_id=v_organization_id and actor_user_id=v_actor_user_id and idempotency_key=p_idempotency_key for update;
  if exists(select 1 from public.tooth_clinical_entries where id=v_entry_id) then select version into v_version from public.tooth_clinical_entries where id=v_entry_id; entry_id:=v_entry_id; version:=v_version; return next; return; end if;
  insert into public.tooth_clinical_entries(id,organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,notes,recorded_by,recorded_at,version)
  values(v_entry_id,v_organization_id,p_patient_id,p_tooth_code,p_kind,p_clinical_code,p_status,'OPEN','INTERNAL',v_notes,v_actor_user_id,coalesce(p_occurred_at,statement_timestamp()),1) returning version into v_version;
  update private.tooth_clinical_entry_record_idempotency set entry_id=v_entry_id where organization_id=v_organization_id and actor_user_id=v_actor_user_id and idempotency_key=p_idempotency_key;
  insert into public.tooth_clinical_entry_details(organization_id,entry_id,feature_code,detail) values(v_organization_id,v_entry_id,p_clinical_code,p_detail);
  foreach v_surface in array v_seen loop insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface,ordinal) values(v_organization_id,v_entry_id,v_surface,1); end loop;
  insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
  values(v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','CLINICAL','clinical.tooth_entry.recorded','tooth_clinical_entry',v_entry_id,p_patient_id,'SUCCESS','{}'::jsonb);
  entry_id:=v_entry_id; version:=v_version; return next;
end; $$;

revoke all on function public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) from public, anon, authenticated, service_role;
