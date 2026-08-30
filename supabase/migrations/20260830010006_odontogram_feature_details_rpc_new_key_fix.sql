-- Forward-only correction: allocate the entry UUID after a newly claimed key.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)'::regprocedure) into v_definition;
  v_definition := replace(v_definition,
    'if exists(select 1 from public.tooth_clinical_entries where id=v_entry_id) then select entry.version into v_version from public.tooth_clinical_entries as entry where entry.id=v_entry_id; entry_id:=v_entry_id; version:=v_version; return next; return; end if;',
    'if v_entry_id is not null then select entry.version into v_version from public.tooth_clinical_entries as entry where entry.id=v_entry_id; entry_id:=v_entry_id; version:=v_version; return next; return; end if; v_entry_id:=gen_random_uuid();'
  );
  if position('v_entry_id:=gen_random_uuid()' in v_definition) = 0 then raise exception 'O2 RPC body did not contain expected new-key branch'; end if;
  execute v_definition;
end;
$$;
