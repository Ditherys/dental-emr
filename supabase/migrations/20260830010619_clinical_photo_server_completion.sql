-- O12 server-only derivative completion. The service-role boundary is paired
-- with an explicit acting user so the audit event remains attributable.
create function public.complete_clinical_photo_derivatives(
  p_actor_user_id uuid,
  p_acting_branch_id uuid,
  p_photo_id uuid,
  p_source_checksum_sha256 text,
  p_source_size_bytes bigint,
  p_derivatives jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_photo public.clinical_photographs%rowtype;
  v_source_checksum text;
  v_source_size bigint;
  r jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise insufficient_privilege using message='not authorized';
  end if;
  select branch.organization_id into v_org
  from public.branches as branch
  where branch.id=p_acting_branch_id and branch.status='active';
  if v_org is null or p_actor_user_id is null or not exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id=branch.organization_id and organization.status='active'
    join public.organization_members as organization_member
      on organization_member.organization_id=organization.id
     and organization_member.user_id=p_actor_user_id
     and organization_member.membership_status='active'
    join public.member_roles as member_role
      on member_role.organization_id=organization_member.organization_id
     and member_role.organization_member_id=organization_member.id
    join public.roles as role
      on role.id=member_role.role_id
     and (role.organization_id is null or role.organization_id=organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id=role.id
    join public.permissions as permission
      on permission.id=role_permission.permission_id
     and permission.code='patient.clinical.write'
    where branch.id=p_acting_branch_id and branch.status='active'
      and (member_role.branch_id is null or (member_role.branch_id=branch.id and exists (
        select 1 from public.branch_memberships as branch_membership
        where branch_membership.organization_id=organization.id
          and branch_membership.organization_member_id=organization_member.id
          and branch_membership.branch_id=branch.id
          and branch_membership.access_status='active'
      )))
  ) then
    raise insufficient_privilege using message='not authorized';
  end if;
  if p_source_checksum_sha256 is null or p_source_checksum_sha256 !~ '^[0-9a-f]{64}$'
     or p_source_size_bytes is null or p_source_size_bytes<=0
     or jsonb_typeof(p_derivatives)<>'array' or jsonb_array_length(p_derivatives)<>3
     or (select count(distinct value->>'variant') from jsonb_array_elements(p_derivatives) as item(value))<>3 then
    raise invalid_parameter_value using message='invalid input';
  end if;
  select * into v_photo
  from public.clinical_photographs
  where organization_id=v_org and id=p_photo_id
  for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_photo.processing_status='READY' then return true; end if;
  select checksum_sha256,size_bytes into v_source_checksum,v_source_size
  from public.file_objects
  where organization_id=v_org and id=v_photo.source_file_id
    and patient_id=v_photo.patient_id and status='available';
  if v_source_size is null or v_source_size<>p_source_size_bytes
     or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then
    raise invalid_parameter_value using message='invalid input';
  end if;
  for r in select * from jsonb_array_elements(p_derivatives) loop
    if r->>'variant' not in ('thumbnail','preview','display')
       or (r->>'object_key') !~ ('^org/'||v_org::text||'/patients/'||v_photo.patient_id::text||'/clinical-photos/'||p_photo_id::text||'/(thumbnail|preview|display)\.jpg$')
       or r->>'mime_type'<>'image/jpeg'
       or coalesce((r->>'width')::integer,0)<=0
       or coalesce((r->>'height')::integer,0)<=0
       or coalesce((r->>'size_bytes')::bigint,0)<=0
       or r->>'checksum_sha256' !~ '^[0-9a-f]{64}$'
       or coalesce((r->>'size_bytes')::bigint,0)>26214400
       or (r->>'variant'='thumbnail' and (coalesce((r->>'width')::integer,0)>320 or coalesce((r->>'height')::integer,0)>240))
       or (r->>'variant'='preview' and (coalesce((r->>'width')::integer,0)>1280 or coalesce((r->>'height')::integer,0)>960))
       or (r->>'variant'='display' and (coalesce((r->>'width')::integer,0)>2048 or coalesce((r->>'height')::integer,0)>1536)) then
      raise invalid_parameter_value using message='invalid input';
    end if;
    insert into public.clinical_photo_derivatives(
      organization_id,photo_id,variant,object_key,mime_type,width,height,size_bytes,checksum_sha256,processing_attempts
    ) values (
      v_org,p_photo_id,r->>'variant',r->>'object_key',r->>'mime_type',
      (r->>'width')::integer,(r->>'height')::integer,(r->>'size_bytes')::bigint,
      r->>'checksum_sha256',1
    ) on conflict(organization_id,photo_id,variant) do update set
      object_key=excluded.object_key,mime_type=excluded.mime_type,width=excluded.width,
      height=excluded.height,size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,
      processing_attempts=clinical_photo_derivatives.processing_attempts+1;
  end loop;
  if v_photo.processing_status<>'PROCESSING' then
    raise exception using errcode='P0001', message='invalid state';
  end if;
  update public.clinical_photographs
  set source_checksum_sha256=p_source_checksum_sha256,source_size_bytes=p_source_size_bytes,
      processing_status='READY',version=version+1
  where organization_id=v_org and id=p_photo_id;
  insert into public.audit_events(
    organization_id,branch_id,actor_user_id,actor_type,category,action,
    entity_type,entity_id,patient_id,result,metadata
  ) values (
    v_org,p_acting_branch_id,p_actor_user_id,'USER','CLINICAL','clinical.photo.processed',
    'clinical_photograph',p_photo_id,v_photo.patient_id,'SUCCESS','{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)
from public,anon,authenticated,service_role;
