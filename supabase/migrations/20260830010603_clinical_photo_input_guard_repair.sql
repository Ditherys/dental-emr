-- O12 forward-only repair: qualify patient/file metadata columns that collide
-- with PL/pgSQL OUT parameters in create_clinical_photo.
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
  if v_definition not like '%from public.file_objects where organization_id=v_org and id=p_source_file_id%' then
    raise exception using errcode = '55000', message = 'unexpected create clinical photo RPC body';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'from public.file_objects where organization_id=v_org and id=p_source_file_id and patient_id=p_patient_id and status=''available''',
    'from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=p_source_file_id and file_object.patient_id=p_patient_id and file_object.status=''available'''
  );
  v_replacement := pg_catalog.replace(
    v_replacement,
    'from public.patients where organization_id=v_org and id=p_patient_id',
    'from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id'
  );
  execute v_replacement;
end;
$do$;
