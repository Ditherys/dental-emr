-- Task 14 forward-only widening: RADIOGRAPH joins the canonical clinical photo
-- categories.
--
-- A radiograph is a distinct clinical artefact from a DIAGNOSTIC clinical
-- photograph, so it is added ALONGSIDE the existing seven categories. Nothing
-- is removed and no stored row is rewritten: a category is a label on the
-- clinical record, and reclassifying history would be a clinical claim this
-- migration has no authority to make.
--
-- The applied RPC is replaced through the guarded pg_get_functiondef pattern
-- rather than a top-level CREATE OR REPLACE, so the existing EXECUTE privilege
-- survives untouched and ADR-017's grant-last invariant is not disturbed. Every
-- guard fails closed on 55000, and the post-guards assert the boundary in both
-- directions: the new category present AND every old one still present, with
-- the SECURITY DEFINER posture and the narrow grant unchanged.
do $do$
declare
  v_constraint text;
  v_definition text;
  v_replacement text;
  v_legacy constant text[] := array['BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER'];
  v_missing text;
  v_anchor constant text :=
    $anchor$p_category not in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER')$anchor$;
  v_widened constant text :=
    $widened$p_category not in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','RADIOGRAPH','INTRAORAL','EXTRAORAL','OTHER')$widened$;
begin
  -- 1. The stored category envelope -----------------------------------------
  select pg_catalog.pg_get_constraintdef(oid) into v_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.clinical_photographs'::regclass
    and conname = 'clinical_photographs_category_check';

  if v_constraint is null then
    raise exception using errcode='55000', message='expected clinical photograph category constraint is missing';
  end if;

  if v_constraint not like '%RADIOGRAPH%' then
    select legacy into v_missing
    from unnest(v_legacy) as legacy
    where v_constraint not like '%''' || legacy || '''%'
    limit 1;
    if v_missing is not null then
      raise exception using errcode='55000',
        message='unexpected clinical photograph category constraint: ' || v_missing || ' is absent';
    end if;

    alter table public.clinical_photographs
      drop constraint clinical_photographs_category_check;
    alter table public.clinical_photographs
      add constraint clinical_photographs_category_check
      check (category in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','RADIOGRAPH','INTRAORAL','EXTRAORAL','OTHER'));
  end if;

  select pg_catalog.pg_get_constraintdef(oid) into v_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.clinical_photographs'::regclass
    and conname = 'clinical_photographs_category_check';

  if v_constraint is null or v_constraint not like '%''RADIOGRAPH''%' then
    raise exception using errcode='55000', message='the clinical photograph category constraint was not widened';
  end if;
  select legacy into v_missing
  from unnest(v_legacy) as legacy
  where v_constraint not like '%''' || legacy || '''%'
  limit 1;
  if v_missing is not null then
    raise exception using errcode='55000',
      message='the clinical photograph category constraint lost an existing category: ' || v_missing;
  end if;

  -- 2. The authorized clinical write path ------------------------------------
  select pg_catalog.pg_get_functiondef(
    'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception using errcode='55000', message='expected create clinical photo RPC is missing';
  end if;
  if v_definition not like '%SECURITY DEFINER%' or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='unexpected create clinical photo security posture';
  end if;

  if position(v_widened in v_definition) > 0 then
    v_definition := null;
  elsif (length(v_definition) - length(pg_catalog.replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception using errcode='55000', message='unexpected create clinical photo category guard';
  end if;

  if v_definition is not null then
    v_replacement := pg_catalog.replace(v_definition, v_anchor, v_widened);
    if v_replacement = v_definition then
      raise exception using errcode='55000', message='create clinical photo category anchor is missing';
    end if;
    execute v_replacement;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'::regprocedure
  ) into v_definition;

  if v_definition is null or position(v_widened in v_definition) = 0 then
    raise exception using errcode='55000', message='the create clinical photo category guard was not widened';
  end if;
  select legacy into v_missing
  from unnest(v_legacy) as legacy
  where v_definition not like '%''' || legacy || '''%'
  limit 1;
  if v_missing is not null then
    raise exception using errcode='55000',
      message='the create clinical photo category guard lost an existing category: ' || v_missing;
  end if;
  if v_definition not like '%SECURITY DEFINER%' or v_definition not like '%SET search_path TO ''''%' then
    raise exception using errcode='55000', message='the create clinical photo security posture was not preserved';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)',
       'EXECUTE')
     or has_function_privilege(
       'anon',
       'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)',
       'EXECUTE')
     or has_function_privilege(
       'service_role',
       'public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)',
       'EXECUTE') then
    raise exception using errcode='55000', message='the create clinical photo grant boundary was not preserved';
  end if;
end;
$do$;
