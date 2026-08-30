-- O12 forward-only repair: enforce the filename control-character policy in
-- the already-applied table and both metadata mutation RPCs.
alter table public.clinical_photographs
  add constraint clinical_photographs_display_filename_control_check
  check (display_filename !~ '[[:cntrl:]]');

do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure) into v_definition;
  if v_definition is null then raise exception using errcode='55000', message='expected create clinical photo RPC is missing'; end if;
  v_replacement := pg_catalog.replace(v_definition,
    $old$p_display_filename ~ '[\\/\\0<>:"|?*]'$old$,
    $new$p_display_filename ~ '[\\/\\0<>:"|?*]' or p_display_filename ~ '[[:cntrl:]]'$new$);
  if v_replacement = v_definition then raise exception using errcode='55000', message='create filename guard anchor is missing'; end if;
  execute v_replacement;

  select pg_catalog.pg_get_functiondef('public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure) into v_definition;
  if v_definition is null then raise exception using errcode='55000', message='expected rename clinical photo RPC is missing'; end if;
  v_replacement := pg_catalog.replace(v_definition,
    $old$p_display_filename ~ '[\\/\\0<>:"|?*]'$old$,
    $new$p_display_filename ~ '[\\/\\0<>:"|?*]' or p_display_filename ~ '[[:cntrl:]]'$new$);
  if v_replacement = v_definition then raise exception using errcode='55000', message='rename filename guard anchor is missing'; end if;
  execute v_replacement;
end;
$do$;
