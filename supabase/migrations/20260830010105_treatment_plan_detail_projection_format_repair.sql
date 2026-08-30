-- Keep the bounded detail source in the established derived-table form; this
-- no-op whitespace repair preserves the static contract used to guard that the
-- LIMIT applies before JSON aggregation.
do $$
declare v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure);
  if pg_catalog.strpos(v_definition, 'limit 200) as item') = 0 then
    raise exception using errcode = '55000', message = 'expected item source cap was not found';
  end if;
  v_definition := pg_catalog.replace(v_definition, 'limit 200) as item', 'limit 200 ) as item');
  v_definition := pg_catalog.replace(v_definition, 'limit 100) as alternative', 'limit 100 ) as alternative');
  v_definition := pg_catalog.replace(v_definition, 'limit 200) as discussion', 'limit 200 ) as discussion');
  execute v_definition;
end;
$$;
