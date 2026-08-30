-- O12 authorized clinical-photo metadata and processing RPCs.

create or replace function public.create_clinical_photo(
 p_acting_branch_id uuid,p_patient_id uuid,p_source_file_id uuid,p_procedure_case_id uuid,
 p_category text,p_display_filename text,p_original_client_filename text,p_capture_at timestamptz,
 p_tooth_codes text[] default '{}',p_surfaces text[] default '{}',p_note text default null
) returns table(photo_id uuid,patient_id uuid,procedure_case_id uuid,category text,display_filename text,
 capture_at timestamptz,tooth_codes text[],surfaces text[],note text,
 processing_status text,paired_photo_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_id uuid; v_source_mime text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_category is null or p_category not in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER')
   or p_display_filename is null or length(p_display_filename)<1 or length(p_display_filename)>255
   or btrim(p_display_filename)<>p_display_filename or p_display_filename ~ '[\\/\\0<>:"|?*]' or p_display_filename ~ '[[:cntrl:]]'
   or p_original_client_filename is null or length(p_original_client_filename)<1 or length(p_original_client_filename)>255
   or p_capture_at is null or coalesce(array_length(p_tooth_codes,1),0)>32 or coalesce(array_length(p_surfaces,1),0)>32 or (p_tooth_codes is not null and array_position(p_tooth_codes,null) is not null) or (p_surfaces is not null and array_position(p_surfaces,null) is not null)
   or (p_note is not null and length(p_note)>2000) then raise invalid_parameter_value using message='invalid input'; end if;
 if not exists(select 1 from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id) then raise insufficient_privilege using message='not authorized'; end if;
 select file_object.mime_type into v_source_mime from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=p_source_file_id and file_object.patient_id=p_patient_id and file_object.status='available';
 if v_source_mime is null or v_source_mime not in ('image/jpeg','image/png','image/webp') then raise insufficient_privilege using message='not authorized'; end if;
 if (v_source_mime='image/jpeg' and p_display_filename !~* '\.(jpe?g)$') or (v_source_mime='image/png' and p_display_filename !~* '\.png$') or (v_source_mime='image/webp' and p_display_filename !~* '\.webp$') then raise invalid_parameter_value using message='invalid input'; end if;
 if p_procedure_case_id is not null and not exists(select 1 from public.procedure_cases as procedure_case where procedure_case.organization_id=v_org and procedure_case.id=p_procedure_case_id and procedure_case.patient_id=p_patient_id) then raise invalid_parameter_value using message='invalid input'; end if;
 if exists(select 1 from unnest(coalesce(p_tooth_codes,'{}')) as x(code) where code !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$') then raise invalid_parameter_value using message='invalid input'; end if;
 if exists(select 1 from unnest(coalesce(p_surfaces,'{}')) as x(surface) where surface not in ('O','B','L','M','D','I','F','FULL')) then raise invalid_parameter_value using message='invalid input'; end if;
 insert into public.clinical_photographs(organization_id,patient_id,source_file_id,procedure_case_id,category,display_filename,original_client_filename,capture_at,tooth_codes,surfaces,note,created_by)
 values(v_org,p_patient_id,p_source_file_id,p_procedure_case_id,p_category,p_display_filename,p_original_client_filename,p_capture_at,coalesce(p_tooth_codes,'{}'),coalesce(p_surfaces,'{}'),p_note,v_actor) returning id into v_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.created','clinical_photograph',v_id,p_patient_id,'SUCCESS','{}'::jsonb);
 return query select v_id,p_patient_id,p_procedure_case_id,p_category,p_display_filename,p_capture_at,coalesce(p_tooth_codes,'{}'),coalesce(p_surfaces,'{}'),p_note,'PENDING',null::uuid,1;
end; $$;
revoke all on function public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text) from public,anon,authenticated,service_role;

create or replace function public.list_clinical_photos(p_acting_branch_id uuid,p_patient_id uuid)
returns table(photo_id uuid,patient_id uuid,procedure_case_id uuid,category text,display_filename text,
 capture_at timestamptz,tooth_codes text[],surfaces text[],note text,
 processing_status text,paired_photo_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or (select auth.uid()) is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized'; end if;
 if not exists(select 1 from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id) then raise insufficient_privilege using message='not authorized'; end if;
 return query select p.id,p.patient_id,p.procedure_case_id,p.category,p.display_filename,p.capture_at,p.tooth_codes,p.surfaces,p.note,p.processing_status,coalesce(pb.after_photo_id,pa.before_photo_id),p.version
 from public.clinical_photographs p
 left join public.clinical_photo_pairings pb on pb.organization_id=p.organization_id and pb.before_photo_id=p.id
 left join public.clinical_photo_pairings pa on pa.organization_id=p.organization_id and pa.after_photo_id=p.id
 where p.organization_id=v_org and p.patient_id=p_patient_id order by p.capture_at,p.id limit 200;
end; $$;
revoke all on function public.list_clinical_photos(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.rename_clinical_photo(p_acting_branch_id uuid,p_photo_id uuid,p_expected_version integer,p_display_filename text)
returns table(photo_id uuid,patient_id uuid,procedure_case_id uuid,category text,display_filename text,
 capture_at timestamptz,tooth_codes text[],surfaces text[],note text,
 processing_status text,paired_photo_id uuid,version integer)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_photo public.clinical_photographs%rowtype; v_version integer; v_source_mime text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_expected_version is null or p_expected_version<1 or p_display_filename is null or length(p_display_filename)<1 or length(p_display_filename)>255 or btrim(p_display_filename)<>p_display_filename or p_display_filename ~ '[\\/\\0<>:"|?*]' or p_display_filename ~ '[[:cntrl:]]' then raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_photo from public.clinical_photographs where organization_id=v_org and id=p_photo_id for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_photo.version<>p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;
 select file_object.mime_type into v_source_mime from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=v_photo.source_file_id and file_object.patient_id=v_photo.patient_id;
 if v_source_mime is null or v_source_mime not in ('image/jpeg','image/png','image/webp') or (v_source_mime='image/jpeg' and p_display_filename !~* '\.(jpe?g)$') or (v_source_mime='image/png' and p_display_filename !~* '\.png$') or (v_source_mime='image/webp' and p_display_filename !~* '\.webp$') then raise invalid_parameter_value using message='invalid input'; end if;
 update public.clinical_photographs set display_filename=p_display_filename,version=version+1 where organization_id=v_org and id=p_photo_id returning version into v_version;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.renamed','clinical_photograph',p_photo_id,v_photo.patient_id,'SUCCESS','{}'::jsonb);
 return query select p.id,p.patient_id,p.procedure_case_id,p.category,p.display_filename,p.capture_at,p.tooth_codes,p.surfaces,p.note,p.processing_status,coalesce(pb.after_photo_id,pa.before_photo_id),p.version from public.clinical_photographs p left join public.clinical_photo_pairings pb on pb.organization_id=p.organization_id and pb.before_photo_id=p.id left join public.clinical_photo_pairings pa on pa.organization_id=p.organization_id and pa.after_photo_id=p.id where p.organization_id=v_org and p.id=p_photo_id;
end; $$;
revoke all on function public.rename_clinical_photo(uuid,uuid,integer,text) from public,anon,authenticated,service_role;

create or replace function public.pair_clinical_photos(p_acting_branch_id uuid,p_before_photo_id uuid,p_after_photo_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_before public.clinical_photographs%rowtype; v_after public.clinical_photographs%rowtype;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 select * into v_before from public.clinical_photographs where organization_id=v_org and id=p_before_photo_id for key share;
 select * into v_after from public.clinical_photographs where organization_id=v_org and id=p_after_photo_id for key share;
 if v_before.id is null or v_after.id is null or v_before.patient_id is distinct from v_after.patient_id or v_before.category<>'BEFORE' or v_after.category<>'AFTER' or p_before_photo_id=p_after_photo_id then raise invalid_parameter_value using message='invalid input'; end if;
 insert into public.clinical_photo_pairings(organization_id,patient_id,before_photo_id,after_photo_id,created_by) values(v_org,v_before.patient_id,p_before_photo_id,p_after_photo_id,v_actor);
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.paired','clinical_photograph',p_before_photo_id,v_before.patient_id,'SUCCESS','{}'::jsonb);
 return true;
end; $$;
revoke all on function public.pair_clinical_photos(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.record_clinical_photo_derivatives(p_acting_branch_id uuid,p_photo_id uuid,p_source_checksum_sha256 text,p_source_size_bytes bigint,p_derivatives jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_photo public.clinical_photographs%rowtype; v_source_checksum text; v_source_size bigint; r jsonb;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized'; end if;
 if p_source_checksum_sha256 is null or p_source_checksum_sha256 !~ '^[0-9a-f]{64}$' or p_source_size_bytes is null or p_source_size_bytes<=0 or jsonb_typeof(p_derivatives)<>'array' or jsonb_array_length(p_derivatives)<>3 or (select count(distinct value->>'variant') from jsonb_array_elements(p_derivatives) as item(value))<>3 then raise invalid_parameter_value using message='invalid input'; end if;
 select * into v_photo from public.clinical_photographs where organization_id=v_org and id=p_photo_id for update;
 if not found then raise insufficient_privilege using message='not authorized'; end if;
 if v_photo.processing_status='READY' then return true; end if;
 select checksum_sha256,size_bytes into v_source_checksum,v_source_size from public.file_objects where organization_id=v_org and id=v_photo.source_file_id and patient_id=v_photo.patient_id and status='available';
 if v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then raise invalid_parameter_value using message='invalid input'; end if;
 for r in select * from jsonb_array_elements(p_derivatives) loop
   if r->>'variant' not in ('thumbnail','preview','display') or (r->>'object_key') !~ ('^org/'||v_org::text||'/patients/'||v_photo.patient_id::text||'/clinical-photos/'||p_photo_id::text||'/(thumbnail|preview|display)\.jpg$') or r->>'mime_type'<>'image/jpeg' or coalesce((r->>'width')::integer,0)<=0 or coalesce((r->>'height')::integer,0)<=0 or coalesce((r->>'size_bytes')::bigint,0)<=0 or r->>'checksum_sha256' !~ '^[0-9a-f]{64}$' then raise invalid_parameter_value using message='invalid input'; end if;
   insert into public.clinical_photo_derivatives(organization_id,photo_id,variant,object_key,mime_type,width,height,size_bytes,checksum_sha256,processing_attempts) values(v_org,p_photo_id,r->>'variant',r->>'object_key',r->>'mime_type',(r->>'width')::integer,(r->>'height')::integer,(r->>'size_bytes')::bigint,r->>'checksum_sha256',1) on conflict(organization_id,photo_id,variant) do update set object_key=excluded.object_key,mime_type=excluded.mime_type,width=excluded.width,height=excluded.height,size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,processing_attempts=clinical_photo_derivatives.processing_attempts+1;
 end loop;
 update public.clinical_photographs set source_checksum_sha256=p_source_checksum_sha256,source_size_bytes=p_source_size_bytes,processing_status='READY',version=version+1 where organization_id=v_org and id=p_photo_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.processed','clinical_photograph',p_photo_id,v_photo.patient_id,'SUCCESS','{}'::jsonb);
 return true;
end; $$;
revoke all on function public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated,service_role;

revoke all on function public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text),public.list_clinical_photos(uuid,uuid),public.rename_clinical_photo(uuid,uuid,integer,text),public.pair_clinical_photos(uuid,uuid,uuid),public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated,service_role;
