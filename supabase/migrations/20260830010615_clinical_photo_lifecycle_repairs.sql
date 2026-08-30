-- O12 forward-only repair for lifecycle functions already applied locally:
-- qualify the claim UPDATE target and keep derivative input validation ahead of
-- the PROCESSING-state guard so malformed browser payloads remain invalid input.
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
  if v_definition not like '%update public.clinical_photographs as photo%' then
    v_replacement := pg_catalog.replace(v_definition,
      'update public.clinical_photographs
    set processing_status=''PROCESSING'', version=version+1
    where organization_id=v_org and id=p_photo_id
    returning processing_status,version into v_status,v_version;',
      'update public.clinical_photographs as photo
    set processing_status=''PROCESSING'', version=photo.version+1
    where photo.organization_id=v_org and photo.id=p_photo_id
    returning photo.processing_status,photo.version into v_status,v_version;'
    );
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='claim update qualification anchor is missing';
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
  if v_definition like '%v_photo.processing_status<>''PROCESSING''%' then
    return;
  end if;
  if v_definition not like '%v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256)%' then
    raise exception using errcode='55000', message='derivative source guard anchor is missing';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'if v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then raise invalid_parameter_value using message=''invalid input''; end if;',
    $$if v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256) then raise invalid_parameter_value using message='invalid input'; end if;
 if v_photo.processing_status<>'PROCESSING' then raise exception using errcode='P0001', message='invalid state'; end if;$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='derivative lifecycle guard anchor is missing';
  end if;
  execute v_replacement;
end;
$derivative$;
