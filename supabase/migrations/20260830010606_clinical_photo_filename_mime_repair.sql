-- O12 forward-only repair: display names keep the source image extension.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected create clinical photo RPC is missing';
  end if;
  if v_definition not like '%from public.file_objects as file_object where file_object.organization_id=v_org%' then
    raise exception using errcode = '55000', message = 'unexpected create clinical photo RPC body';
  end if;
  v_replacement := pg_catalog.replace(v_definition,
    $old$if not exists(select 1 from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id)
   or not exists(select 1 from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=p_source_file_id and file_object.patient_id=p_patient_id and file_object.status='available') then raise insufficient_privilege using message='not authorized'; end if;$old$,
    $new$if not exists(select 1 from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id) then raise insufficient_privilege using message='not authorized'; end if;
 select file_object.mime_type into v_source_mime from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=p_source_file_id and file_object.patient_id=p_patient_id and file_object.status='available';
 if v_source_mime is null or v_source_mime not in ('image/jpeg','image/png','image/webp') then raise insufficient_privilege using message='not authorized'; end if;
 if (v_source_mime='image/jpeg' and p_display_filename !~* '\.(jpe?g)$') or (v_source_mime='image/png' and p_display_filename !~* '\.png$') or (v_source_mime='image/webp' and p_display_filename !~* '\.webp$') then raise invalid_parameter_value using message='invalid input'; end if;$new$
  );
  v_replacement := pg_catalog.replace(v_replacement,
    'declare v_org uuid; v_actor uuid := (select auth.uid()); v_id uuid;',
    'declare v_org uuid; v_actor uuid := (select auth.uid()); v_id uuid; v_source_mime text;'
  );
  execute v_replacement;

  select pg_catalog.pg_get_functiondef(
    'public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected rename clinical photo RPC is missing';
  end if;
  if v_definition not like '%v_photo.version<>p_expected_version%' then
    raise exception using errcode = '55000', message = 'unexpected rename clinical photo RPC body';
  end if;
  v_replacement := pg_catalog.replace(v_definition,
    $old$if v_photo.version<>p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;$old$,
    $new$if v_photo.version<>p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;
 select file_object.mime_type into v_source_mime from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=v_photo.source_file_id and file_object.patient_id=v_photo.patient_id;
 if v_source_mime is null or (v_source_mime='image/jpeg' and p_display_filename !~* '\.(jpe?g)$') or (v_source_mime='image/png' and p_display_filename !~* '\.png$') or (v_source_mime='image/webp' and p_display_filename !~* '\.webp$') then raise invalid_parameter_value using message='invalid input'; end if;$new$
  );
  v_replacement := pg_catalog.replace(v_replacement,
    'declare v_org uuid; v_actor uuid := (select auth.uid()); v_photo public.clinical_photographs%rowtype; v_version integer;',
    'declare v_org uuid; v_actor uuid := (select auth.uid()); v_photo public.clinical_photographs%rowtype; v_version integer; v_source_mime text;'
  );
  execute v_replacement;
end;
$do$;
