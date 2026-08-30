-- O12 forward-only repair: qualify the procedure-case patient column in the
-- create RPC, which otherwise collides with its OUT patient_id parameter.
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
  if v_definition like '%from public.procedure_cases as procedure_case%' then
    return;
  end if;
  if v_definition not like '%from public.procedure_cases where organization_id=v_org%' then
    raise exception using errcode = '55000', message = 'unexpected create clinical photo RPC body';
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'from public.procedure_cases where organization_id=v_org and id=p_procedure_case_id and patient_id=p_patient_id',
    'from public.procedure_cases as procedure_case where procedure_case.organization_id=v_org and procedure_case.id=p_procedure_case_id and procedure_case.patient_id=p_patient_id'
  );
  execute v_replacement;
end;
$do$;
