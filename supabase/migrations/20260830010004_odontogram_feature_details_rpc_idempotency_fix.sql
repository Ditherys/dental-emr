-- Forward-only correction for the applied O2 RPC: qualify the OUT-parameter
-- collision in its idempotency lookup without changing the callable contract.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    'select entry_id into v_entry_id from private.tooth_clinical_entry_record_idempotency where organization_id=v_organization_id and actor_user_id=v_actor_user_id and idempotency_key=p_idempotency_key for update;',
    'select idem.entry_id into v_entry_id from private.tooth_clinical_entry_record_idempotency as idem where idem.organization_id=v_organization_id and idem.actor_user_id=v_actor_user_id and idem.idempotency_key=p_idempotency_key for update;'
  );
  if position('select idem.entry_id into v_entry_id' in v_definition) = 0 then
    raise exception 'O2 idempotency RPC body did not contain the expected lookup';
  end if;
  execute v_definition;
end;
$$;
