-- O12 forward-only repair: reject NULL array members before unnest-based
-- allow-list checks can accidentally treat them as an unknown-but-valid value.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure) into v_definition;
  if v_definition is null then raise exception using errcode='55000', message='expected create clinical photo RPC is missing'; end if;
  v_replacement := pg_catalog.replace(v_definition,
    $old$or p_capture_at is null or coalesce(array_length(p_tooth_codes,1),0)>32 or coalesce(array_length(p_surfaces,1),0)>32$old$,
    $new$or p_capture_at is null or coalesce(array_length(p_tooth_codes,1),0)>32 or coalesce(array_length(p_surfaces,1),0)>32 or (p_tooth_codes is not null and array_position(p_tooth_codes,null) is not null) or (p_surfaces is not null and array_position(p_surfaces,null) is not null)$new$
  );
  if v_replacement = v_definition then raise exception using errcode='55000', message='create array guard anchor is missing'; end if;
  execute v_replacement;
end;
$do$;
