-- O12 forward-only repair: qualify the claim version arithmetic and keep
-- derivative payload validation ahead of the lifecycle-state guard.
do $claim$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.claim_clinical_photo_processing(uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected photo claim RPC is missing';
  end if;
  if v_definition not like '%version=photo.version+1%' then
    v_replacement := pg_catalog.replace(v_definition, 'version=version+1', 'version=photo.version+1');
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='claim version qualification anchor is missing';
    end if;
    execute v_replacement;
  end if;
end;
$claim$;

do $derivative$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected derivative RPC is missing';
  end if;
  if v_definition like '%select checksum_sha256%if v_source_size%if v_photo.processing_status<>''PROCESSING''%' then
    return;
  end if;
  if v_definition not like '%if v_photo.processing_status=''READY'' then return true; end if;%if v_photo.processing_status<>''PROCESSING''%' then
    raise exception using errcode='55000', message='derivative lifecycle guard order anchor is missing';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$if v_photo.processing_status='READY' then return true; end if;
 if v_photo.processing_status<>'PROCESSING' then raise exception using errcode='P0001', message='invalid state'; end if;
 select checksum_sha256,size_bytes into v_source_checksum,v_source_size from public.file_objects where organization_id=v_org and id=v_photo.source_file_id and patient_id=v_photo.patient_id and status='available';$$,
    $$if v_photo.processing_status='READY' then return true; end if;
 select checksum_sha256,size_bytes into v_source_checksum,v_source_size from public.file_objects where organization_id=v_org and id=v_photo.source_file_id and patient_id=v_photo.patient_id and status='available';$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='derivative lifecycle guard move anchor is missing';
  end if;
  v_replacement := pg_catalog.replace(
    v_replacement,
    'if v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then raise invalid_parameter_value using message=''invalid input''; end if;',
    'if v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then raise invalid_parameter_value using message=''invalid input''; end if;
 if v_photo.processing_status<>''PROCESSING'' then raise exception using errcode=''P0001'', message=''invalid state''; end if;'
  );
  execute v_replacement;
end;
$derivative$;
