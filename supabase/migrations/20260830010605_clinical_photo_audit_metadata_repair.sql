-- O12 forward-only repair: use the repository's existing sanitized audit
-- metadata contract; derivative counts are already represented by the action.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected derivative RPC is missing';
  end if;
  if v_definition not like '%jsonb_build_object(''variants'',jsonb_array_length(p_derivatives))%' then
    return;
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'jsonb_build_object(''variants'',jsonb_array_length(p_derivatives))',
    '''{}''::jsonb'
  );
  execute v_replacement;
end;
$do$;
