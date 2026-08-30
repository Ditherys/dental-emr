-- O12 forward-only repair: a confirmed file upload has a trusted server
-- size, while its checksum is populated by the server-only photo processor.
-- Accept a missing file-object checksum, but still reject a present mismatch;
-- the computed checksum is preserved on the clinical-photo metadata row.
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
  if v_definition not like '%v_source_checksum is null or v_source_size is null%' then
    raise exception using errcode='55000', message='unexpected derivative source guard';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'v_source_checksum is null or v_source_size is null or v_source_checksum<>p_source_checksum_sha256 or v_source_size<>p_source_size_bytes',
    'v_source_size is null or v_source_size<>p_source_size_bytes or (v_source_checksum is not null and v_source_checksum<>p_source_checksum_sha256)'
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='derivative source guard anchor is missing';
  end if;
  execute v_replacement;
end;
$do$;
