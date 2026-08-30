-- Forward-only correction: qualify remaining OUT-parameter collisions.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'returning version into v_version;', 'returning public.tooth_clinical_entries.version into v_version;');
  v_definition := replace(v_definition, 'select version into v_version from public.tooth_clinical_entries where id=v_entry_id;', 'select entry.version into v_version from public.tooth_clinical_entries as entry where entry.id=v_entry_id;');
  if position('returning public.tooth_clinical_entries.version into v_version' in v_definition) = 0 then raise exception 'O2 RPC body did not contain expected version lookup'; end if;
  execute v_definition;
end;
$$;
