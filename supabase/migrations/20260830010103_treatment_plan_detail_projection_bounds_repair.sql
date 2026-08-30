-- Forward repair: 20260830010100 extended the detail projection but flattened
-- its item source. Restore the pre-aggregation source bound without changing
-- its already-reviewed authorization or final EXECUTE grant.
do $$
declare
  v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure);
  if pg_catalog.strpos(v_definition, 'from (select * from public.treatment_plan_items') = 0
     or pg_catalog.strpos(v_definition, 'limit 200) item left join public.procedure_cases') = 0 then
    raise exception using errcode = '55000', message = 'expected procedure-case detail projection was not found';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'from (select * from public.treatment_plan_items where organization_id=plan.organization_id and plan_id=plan.id order by sequence_no,line_no,id limit 200) item left join public.procedure_cases',
    'from (select source.id,source.line_no,source.procedure_id,source.tooth_code,source.description,source.estimated_fee_centavos,source.priority,source.sequence_no,source.surfaces,source.notes,source.created_at from public.treatment_plan_items as source where source.organization_id=plan.organization_id and source.plan_id=plan.id order by source.sequence_no,source.line_no,source.id limit 200) as item left join public.procedure_cases'
  );
  v_definition := pg_catalog.replace(v_definition, 'limit 100) alternative', 'limit 100) as alternative');
  v_definition := pg_catalog.replace(v_definition, 'limit 200) discussion', 'limit 200) as discussion');
  execute v_definition;
end;
$$;
