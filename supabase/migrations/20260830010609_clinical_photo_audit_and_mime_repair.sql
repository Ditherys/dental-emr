-- O12 forward-only repair: align the already-applied photo RPCs with the
-- clinical audit contract and reject unsupported source MIME types on rename.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected create clinical photo RPC is missing';
  end if;
  if v_definition like '%clinical.photo.created%' then
    v_definition := null;
  elsif v_definition not like '%returning id into v_id%' then
    raise exception using errcode='55000', message='unexpected create clinical photo RPC body';
  end if;
  if v_definition is not null then
    v_replacement := pg_catalog.replace(
      v_definition,
      'returning id into v_id;',
      $$returning id into v_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.created','clinical_photograph',v_id,p_patient_id,'SUCCESS','{}'::jsonb);$$
    );
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='create photo audit anchor is missing';
    end if;
    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.pair_clinical_photos(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected pair clinical photos RPC is missing';
  end if;
  if v_definition like '%clinical.photo.paired%' then
    v_definition := null;
  elsif v_definition not like '%insert into public.clinical_photo_pairings%' then
    raise exception using errcode='55000', message='unexpected pair clinical photos RPC body';
  end if;
  if v_definition is not null then
    v_replacement := pg_catalog.replace(
      v_definition,
      'insert into public.clinical_photo_pairings(organization_id,patient_id,before_photo_id,after_photo_id,created_by) values(v_org,v_before.patient_id,p_before_photo_id,p_after_photo_id,v_actor);',
    $$insert into public.clinical_photo_pairings(organization_id,patient_id,before_photo_id,after_photo_id,created_by) values(v_org,v_before.patient_id,p_before_photo_id,p_after_photo_id,v_actor);
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.photo.paired','clinical_photograph',p_before_photo_id,v_before.patient_id,'SUCCESS','{}'::jsonb);$$
    );
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='pair photo audit anchor is missing';
    end if;
    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected rename clinical photo RPC is missing';
  end if;
  if v_definition like '%v_source_mime not in (''image/jpeg'',''image/png'',''image/webp'')%' then
    return;
  end if;
  if v_definition not like '%v_source_mime is null or (v_source_mime=''image/jpeg''%' then
    raise exception using errcode='55000', message='unexpected rename clinical photo MIME guard';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$if v_source_mime is null or (v_source_mime='image/jpeg'$$,
    $$if v_source_mime is null or v_source_mime not in ('image/jpeg','image/png','image/webp') or (v_source_mime='image/jpeg'$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='rename photo MIME guard anchor is missing';
  end if;
  execute v_replacement;
end;
$do$;
