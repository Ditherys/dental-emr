-- O12 forward-only repair: validate derivative payloads before rejecting an
-- unclaimed lifecycle state, then enforce PROCESSING immediately before the
-- final READY transition. This preserves useful invalid-input errors without
-- allowing an unclaimed row to commit (the transaction rolls back on error).
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
  if v_definition like '%end loop;%if v_photo.processing_status<>''PROCESSING''%update public.clinical_photographs%' then
    return;
  end if;
  if v_definition not like '%if v_photo.processing_status<>''PROCESSING''%for r in%' then
    raise exception using errcode='55000', message='derivative lifecycle validation anchor is missing';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    $$if v_photo.processing_status<>'PROCESSING' then raise exception using errcode='P0001', message='invalid state'; end if;
 for r in select * from jsonb_array_elements(p_derivatives) loop$$,
    $$for r in select * from jsonb_array_elements(p_derivatives) loop$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='derivative lifecycle pre-loop anchor is missing';
  end if;
  v_replacement := pg_catalog.replace(
    v_replacement,
    'end loop;
 update public.clinical_photographs',
    $$end loop;
 if v_photo.processing_status<>'PROCESSING' then raise exception using errcode='P0001', message='invalid state'; end if;
 update public.clinical_photographs$$
  );
  if v_replacement = pg_catalog.replace(
    v_definition,
    $$if v_photo.processing_status<>'PROCESSING' then raise exception using errcode='P0001', message='invalid state'; end if;
 for r in select * from jsonb_array_elements(p_derivatives) loop$$,
    $$for r in select * from jsonb_array_elements(p_derivatives) loop$$
  ) then
    raise exception using errcode='55000', message='derivative lifecycle post-loop anchor is missing';
  end if;
  execute v_replacement;
end;
$do$;
