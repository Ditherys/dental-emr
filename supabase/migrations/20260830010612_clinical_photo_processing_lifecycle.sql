-- O12 authorized processing lifecycle. A worker first claims the metadata row,
-- then records verified derivatives or an attributed failure. Source identity
-- is returned by the claim rather than accepted from an arbitrary job payload.

create function public.claim_clinical_photo_processing(
  p_acting_branch_id uuid,
  p_photo_id uuid
)
returns table(
  photo_id uuid,
  organization_id uuid,
  patient_id uuid,
  source_object_key text,
  source_mime_type text,
  processing_status text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_photo public.clinical_photographs%rowtype;
  v_status text;
  v_version integer;
begin
  select branch.organization_id into v_org
  from public.branches as branch
  where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then
    raise insufficient_privilege using message='not authorized';
  end if;

  select photo.* into v_photo
  from public.clinical_photographs as photo
  where photo.organization_id=v_org and photo.id=p_photo_id
  for update;
  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;

  if v_photo.processing_status in ('PENDING','FAILED') then
    update public.clinical_photographs as photo
    set processing_status='PROCESSING', version=photo.version+1
    where photo.organization_id=v_org and photo.id=p_photo_id
    returning photo.processing_status,photo.version into v_status,v_version;
    insert into public.audit_events(
      organization_id,branch_id,actor_user_id,actor_type,category,action,
      entity_type,entity_id,patient_id,result,metadata
    ) values (
      v_org,p_acting_branch_id,v_actor,'USER','CLINICAL',
      'clinical.photo.processing_started','clinical_photograph',p_photo_id,
      v_photo.patient_id,'SUCCESS','{}'::jsonb
    );
  else
    v_status := v_photo.processing_status;
    v_version := v_photo.version;
  end if;

  return query
  select v_photo.id,v_org,v_photo.patient_id,file_object.object_key,
    file_object.mime_type,v_status,v_version
  from public.file_objects as file_object
  where file_object.organization_id=v_org
    and file_object.id=v_photo.source_file_id
    and file_object.patient_id=v_photo.patient_id
    and file_object.status='available'
    and file_object.mime_type in ('image/jpeg','image/png','image/webp');
  if not found then
    raise exception using errcode='P0001', message='invalid state';
  end if;
end;
$$;

revoke all on function public.claim_clinical_photo_processing(uuid,uuid)
from public,anon,authenticated,service_role;

create function public.fail_clinical_photo_processing(
  p_acting_branch_id uuid,
  p_photo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_photo public.clinical_photographs%rowtype;
begin
  select branch.organization_id into v_org
  from public.branches as branch
  where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then
    raise insufficient_privilege using message='not authorized';
  end if;

  select photo.* into v_photo
  from public.clinical_photographs as photo
  where photo.organization_id=v_org and photo.id=p_photo_id
  for update;
  if not found then
    raise insufficient_privilege using message='not authorized';
  end if;
  if v_photo.processing_status='READY' then
    return false;
  end if;
  if v_photo.processing_status='FAILED' then
    return true;
  end if;
  if v_photo.processing_status<>'PROCESSING' then
    raise exception using errcode='P0001', message='invalid state';
  end if;
  update public.clinical_photographs
  set processing_status='FAILED', version=version+1
  where organization_id=v_org and id=p_photo_id;
  insert into public.audit_events(
    organization_id,branch_id,actor_user_id,actor_type,category,action,
    entity_type,entity_id,patient_id,result,metadata
  ) values (
    v_org,p_acting_branch_id,v_actor,'USER','CLINICAL',
    'clinical.photo.processing_failed','clinical_photograph',p_photo_id,
    v_photo.patient_id,'SUCCESS','{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.fail_clinical_photo_processing(uuid,uuid)
from public,anon,authenticated,service_role;

comment on function public.claim_clinical_photo_processing(uuid,uuid) is
  'Claims a same-tenant clinical photo for server processing, deriving source identity and advancing PENDING/FAILED to PROCESSING under clinical.write.';

comment on function public.fail_clinical_photo_processing(uuid,uuid) is
  'Idempotently marks an authorized clinical photo processing attempt FAILED and audits the lifecycle transition without storing failure details.';
