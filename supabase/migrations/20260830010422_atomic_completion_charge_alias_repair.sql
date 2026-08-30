-- Forward repair for the already-applied local O8 function body.
do $do$
declare v_definition text; v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure) into v_definition;
  v_replacement:=pg_catalog.replace(v_definition,
    'from public.post_charge(p_acting_branch_id,v_case.patient_id,v_case.procedure_id,p_plan_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then ''Zero actual charge confirmed at completion'' else null end,''case-complete-''||p_idempotency_key);',
    'from public.post_charge(p_acting_branch_id,v_case.patient_id,v_case.procedure_id,p_plan_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then ''Zero actual charge confirmed at completion'' else null end,''case-complete-''||p_idempotency_key) as posted;');
  if v_replacement=v_definition then raise exception using errcode='55000',message='expected completion charge alias repair target was not found'; end if;
  execute v_replacement;
end $do$;
