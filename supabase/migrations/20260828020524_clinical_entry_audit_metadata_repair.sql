-- Forward local-body repair: predecessor linkage is represented structurally;
-- audit metadata remains opaque under the approved CLINICAL contract.
revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;

do $$
declare
  v_definition text;
  v_repaired text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)'::regprocedure
  ) into v_definition;
  v_repaired := pg_catalog.replace(
    v_definition,
    'pg_catalog.jsonb_build_object(''predecessor_entry_id'', v_old.id::text)',
    '''{}''::jsonb'
  );
  if v_repaired = v_definition then
    if pg_catalog.strpos(v_definition, '''{}''::jsonb') = 0 then
      raise exception 'amend audit metadata repair target not found';
    end if;
  else
    execute v_repaired;
  end if;
end
$$;

revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;
