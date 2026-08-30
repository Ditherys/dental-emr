-- The initial O8 migration emitted two literal backslashes in PostgreSQL
-- regexes. Replace only that serialized function text forward-only; `[0-9]`
-- avoids backslash escaping altogether and preserves the reviewed bodies.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.create_procedure_installment_schedule_unlocked(uuid,uuid,jsonb,text)'::regprocedure) into v_definition;
  execute replace(v_definition, chr(92) || chr(92) || 'd', '[0-9]');
  select pg_get_functiondef('public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text)'::regprocedure) into v_definition;
  execute replace(v_definition, chr(92) || chr(92) || 'd', '[0-9]');
end $$;
revoke all on function public.create_procedure_installment_schedule_unlocked(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
