-- O12 forward-only repair: photo RPCs use the clinical permission helper used
-- by the odontogram domain. The initial O12 migration was already applied in
-- local development, so this preserves history while correcting its guard.
do $do$
declare
  v_definition text;
  v_replacement text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)',
    'public.list_clinical_photos(uuid,uuid)',
    'public.rename_clinical_photo(uuid,uuid,integer,text)',
    'public.pair_clinical_photos(uuid,uuid,uuid)',
    'public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)'
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if v_definition is null then
      raise exception using errcode = '55000', message = 'expected clinical photo RPC is missing';
    end if;
    if v_definition not like '%private.has_patient_permission_at_branch%' then
      continue;
    end if;
    v_replacement := pg_catalog.replace(v_definition, 'private.has_patient_permission_at_branch', 'private.has_clinical_permission_at_branch');
    v_replacement := pg_catalog.replace(v_replacement, 'from public.file_objects where organization_id=v_org and id=p_source_file_id and patient_id=p_patient_id and status=''available''', 'from public.file_objects as file_object where file_object.organization_id=v_org and file_object.id=p_source_file_id and file_object.patient_id=p_patient_id and file_object.status=''available''');
    v_replacement := pg_catalog.replace(v_replacement, 'from public.patients where organization_id=v_org and id=p_patient_id', 'from public.patients as patient where patient.organization_id=v_org and patient.id=p_patient_id');
    execute v_replacement;
  end loop;
end;
$do$;
