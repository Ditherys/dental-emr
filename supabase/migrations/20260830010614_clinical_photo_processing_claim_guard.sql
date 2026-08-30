-- O12 forward-only repair: only a claimed PROCESSING row may be completed;
-- direct browser calls cannot manufacture a READY photo from PENDING state.
do $do$
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
    raise exception using errcode='55000', message='unexpected derivative lifecycle anchor';
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
$do$;
