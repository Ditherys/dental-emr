-- Forward repair for the already-local 20519 bodies. Fresh replay already has
-- the qualified form; this idempotently upgrades the locally applied bodies.
revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;
revoke all on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_repaired text;
begin
  foreach v_signature in array array[
    'public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)'::regprocedure,
    'public.void_tooth_clinical_entry(uuid,uuid,integer,text)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
    v_repaired := pg_catalog.replace(
      v_definition,
      'select 1 from public.tooth_clinical_entries' || chr(10) ||
        '       where organization_id = v_org and supersedes_entry_id = v_old.id',
      'select 1 from public.tooth_clinical_entries as successor' || chr(10) ||
        '       where successor.organization_id = v_org and successor.supersedes_entry_id = v_old.id'
    );
    v_repaired := pg_catalog.replace(
      v_repaired,
      'select 1 from public.tooth_clinical_entry_voids' || chr(10) ||
        '       where organization_id = v_org and entry_id = v_old.id',
      'select 1 from public.tooth_clinical_entry_voids as event' || chr(10) ||
        '       where event.organization_id = v_org and event.entry_id = v_old.id'
    );
    v_repaired := pg_catalog.replace(
      v_repaired,
      'from public.tooth_clinical_entry_surfaces' || chr(10) ||
        '    where organization_id = v_org and entry_id = v_old.id;',
      'from public.tooth_clinical_entry_surfaces as predecessor_surface' || chr(10) ||
        '    where predecessor_surface.organization_id = v_org' || chr(10) ||
        '      and predecessor_surface.entry_id = v_old.id;'
    );
    execute v_repaired;
  end loop;
end
$$;

revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;
revoke all on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;
