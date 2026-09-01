-- Task 14 forward-only repair: a clinical photograph could never actually be
-- renamed.
--
-- public.rename_clinical_photo declares RETURNS TABLE(..., version integer), so
-- `version` is a PL/pgSQL OUT variable inside the body. The applied UPDATE says
-- `version=version+1 ... returning version into v_version` against
-- public.clinical_photographs, which PostgreSQL rejects at runtime with 42702
-- "column reference version is ambiguous". Every authorized rename therefore
-- failed; the existing suite only asserted the rejection paths, so nothing
-- caught it. Task 14 requires a safe display-name rename, so the ambiguity is
-- resolved here by aliasing the target relation.
--
-- This changes no stored object key and no original byte: the statement still
-- writes only display_filename and the optimistic-concurrency version.
--
-- Replacement goes through the guarded pg_get_functiondef pattern so the
-- existing narrow EXECUTE grant survives and ADR-017's grant-last invariant is
-- untouched. Guards fail closed on 55000.
do $do$
declare
  v_definition text;
  v_replacement text;
  v_anchor constant text :=
    $anchor$ update public.clinical_photographs set display_filename=p_display_filename,version=version+1 where organization_id=v_org and id=p_photo_id returning version into v_version;$anchor$;
  v_repaired constant text :=
    $repaired$ update public.clinical_photographs as photo set display_filename=p_display_filename,version=photo.version+1 where photo.organization_id=v_org and photo.id=p_photo_id returning photo.version into v_version;$repaired$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception using errcode='55000', message='expected rename clinical photo RPC is missing';
  end if;
  if v_definition not like '%SECURITY DEFINER%' or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='unexpected rename clinical photo security posture';
  end if;
  -- The archive, stale-version and source-MIME guards must already be present:
  -- this repair rewrites one statement and must never resurrect an older body.
  if v_definition not like '%archived_at is not null%'
     or v_definition not like '%stale version%'
     or v_definition not like '%v_source_mime not in (''image/jpeg'',''image/png'',''image/webp'')%' then
    raise exception using errcode='55000', message='unexpected rename clinical photo guard set';
  end if;

  if position(v_repaired in v_definition) > 0 then
    v_definition := null;
  elsif (length(v_definition) - length(pg_catalog.replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception using errcode='55000', message='unexpected rename clinical photo update statement';
  end if;

  if v_definition is not null then
    v_replacement := pg_catalog.replace(v_definition, v_anchor, v_repaired);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='rename clinical photo update anchor is missing';
    end if;
    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure
  ) into v_definition;

  if v_definition is null or position(v_repaired in v_definition) = 0 then
    raise exception using errcode='55000', message='the rename clinical photo ambiguity was not resolved';
  end if;
  if position(v_anchor in v_definition) > 0 then
    raise exception using errcode='55000', message='the ambiguous rename statement is still present';
  end if;
  if v_definition not like '%SECURITY DEFINER%'
     or v_definition not like '%SET search_path TO ''''%'
     or v_definition not like '%archived_at is not null%'
     or v_definition not like '%stale version%'
     or v_definition not like '%clinical.photo.renamed%' then
    raise exception using errcode='55000', message='the rename clinical photo contract was not preserved';
  end if;
  if not has_function_privilege('authenticated','public.rename_clinical_photo(uuid,uuid,integer,text)','EXECUTE')
     or has_function_privilege('anon','public.rename_clinical_photo(uuid,uuid,integer,text)','EXECUTE')
     or has_function_privilege('service_role','public.rename_clinical_photo(uuid,uuid,integer,text)','EXECUTE') then
    raise exception using errcode='55000', message='the rename clinical photo grant boundary was not preserved';
  end if;
end;
$do$;
