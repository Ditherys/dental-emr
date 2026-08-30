-- Forward repair for the bounded projection rewrite: retain organization_id in
-- the derived item source for the tenant-qualified optional case join.
do $$
declare v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure);
  if pg_catalog.strpos(v_definition, 'select source.id,source.line_no') = 0 then
    raise exception using errcode = '55000', message = 'expected bounded item source was not found';
  end if;
  v_definition := pg_catalog.replace(v_definition, 'select source.id,source.line_no', 'select source.organization_id,source.id,source.line_no');
  execute v_definition;
end;
$$;
