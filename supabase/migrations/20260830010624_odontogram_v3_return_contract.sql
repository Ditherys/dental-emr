-- O13 forward-only repair: the aggregate odontogram DTO now returns one row,
-- while the v3 wrapper still declared the old per-entry return shape. Keep the
-- approved v3 signature and provide the declared columns without dropping or
-- recreating the public function.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_patient_odontogram_v3(uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode='55000', message='expected v3 odontogram RPC is missing';
  end if;
  if v_definition like '%null::uuid as entry_id%' then
    return;
  end if;
  v_replacement := pg_catalog.replace(
    v_definition,
    'return query select * from public.get_patient_odontogram(p_acting_branch_id, p_patient_id);',
    $$return query
  select null::uuid as entry_id, dto.data
  from public.get_patient_odontogram(p_acting_branch_id, p_patient_id) as dto;$$
  );
  if v_replacement = v_definition then
    raise exception using errcode='55000', message='v3 odontogram return-shape anchor is missing';
  end if;
  execute v_replacement;
end;
$do$;
