-- Qualify the void lookup because the TABLE return column component_id is
-- also a PL/pgSQL variable in amend_current_implant_component.
do $do$
declare
  v_definition text;
  v_old text := $q$exists(select 1 from public.dental_implant_component_voids where organization_id=v_org and component_id=v_old.id)$q$;
  v_new text := $q$exists(select 1 from public.dental_implant_component_voids as void_row where void_row.organization_id=v_org and void_row.component_id=v_old.id)$q$;
begin
  select pg_catalog.pg_get_functiondef('public.amend_current_implant_component(uuid,uuid,integer,jsonb)'::regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception using errcode='55000', message='expected implant amendment void lookup was not found';
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end;
$do$;

