-- A clinical implant amendment may replace a component kind (for example a
-- crown with an attachment) while preserving ordinal/tooth lineage.
do $do$
declare
  v_definition text;
  v_old text := $q$       or v_old.component_kind is distinct from new.component_kind
$q$;
begin
  select pg_catalog.pg_get_functiondef('private.validate_implant_component_scope()'::regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception using errcode='55000', message='expected implant successor kind guard was not found';
  end if;
  execute pg_catalog.replace(v_definition,v_old,'');
end;
$do$;

