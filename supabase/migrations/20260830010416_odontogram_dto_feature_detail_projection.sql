-- O6 renderer read boundary: expose the already-constrained O2 feature detail
-- in the existing bounded patient DTO. This is read-only projection work; it
-- does not mutate clinical history or grant base-table access.

do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_patient_odontogram(uuid,uuid)'::regprocedure
  ) into v_definition;

  v_replacement := pg_catalog.replace(
    v_definition,
    $q$'provenance',e.provenance,'notes',e.notes$q$,
    $q$'provenance',e.provenance,'detail',(
      select d.detail
      from public.tooth_clinical_entry_details as d
      where d.organization_id=e.organization_id and d.entry_id=e.id
      limit 1
    ),'notes',e.notes$q$
  );

  if v_replacement = v_definition then
    raise exception using errcode='55000',
      message='expected odontogram DTO entry projection target was not found';
  end if;

  execute v_replacement;
end;
$do$;

revoke all on function public.get_patient_odontogram(uuid,uuid)
from public,anon,authenticated,service_role;

comment on function public.get_patient_odontogram(uuid,uuid) is
'Strict bounded tenant-scoped odontogram DTO with full attribution, derived event state, explicit implant chains, bounded periodontal children, bounded execution/event history, and constrained clinical feature detail.';
