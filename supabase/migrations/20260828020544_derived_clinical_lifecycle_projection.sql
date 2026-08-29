-- The byte-preserving clinical lineage model derives terminal lifecycle from
-- successor/event rows. Keep the DTO's legacy lifecycle field consistent with
-- that derived state while retaining the separate event_state field.
do $do$
declare
  v_definition text;
  v_replacement text :=
    $q$'lifecycle',e.lifecycle,$q$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_patient_odontogram(uuid,uuid)'::regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, v_replacement) = 0 then
    raise exception using errcode = '55000',
      message = 'expected clinical lifecycle projection expression was not found';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    v_replacement,
    $q$'lifecycle',case
      when e.voided_at is not null or exists (
        select 1 from public.tooth_clinical_entry_voids as x
        where x.organization_id=e.organization_id and x.entry_id=e.id
      ) then 'VOIDED'
      when exists (
        select 1 from public.tooth_clinical_entries as successor
        where successor.organization_id=e.organization_id
          and successor.supersedes_entry_id=e.id
      ) then 'SUPERSEDED'
      else 'OPEN'
    end,$q$
  );
  execute v_definition;
end;
$do$;
