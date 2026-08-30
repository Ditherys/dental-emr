-- Forward repair for the applied O8 clinical branch. Preserve the constrained
-- feature-detail FK for detail-bearing treatments and model a planned
-- extraction as the canonical EXTRACTION clinical entry without a detail row.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure)
  into v_definition;

  v_replacement:=pg_catalog.replace(
    v_definition,
    'when ''OTHER'' then v_detail->>''code'' in (''RESTORATION'',''OTHER'') else false end,false)',
    'when ''OTHER'' then v_detail->>''code'' in (''RESTORATION'',''OTHER'') when ''EXTRACTION'' then v_detail->>''code''=''TOOTH_STATE'' and v_detail->>''state''=''EXTRACTION_WOUND'' else false end,false)'
  );
  if v_replacement=v_definition then
    raise exception using errcode='55000',message='expected clinical extraction contract target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'v_detail->>''code'' not in (''RESTORATION'',''ROOT_CANAL'',''OTHER'')',
    'v_detail->>''code'' not in (''RESTORATION'',''ROOT_CANAL'',''OTHER'',''TOOTH_STATE'') or (v_detail->>''code''=''TOOTH_STATE'' and v_detail->>''state''<>''EXTRACTION_WOUND'')'
  );
  if pg_catalog.strpos(v_replacement,'v_detail->>''code'' not in (''RESTORATION'',''ROOT_CANAL'',''OTHER'',''TOOTH_STATE'')')=0 then
    raise exception using errcode='55000',message='expected clinical extraction input target was not found';
  end if;

  v_replacement:=pg_catalog.replace(
    v_replacement,
    'v_code:=case v_detail->>''code'' when ''RESTORATION'' then ''RESTORATION'' when ''ROOT_CANAL'' then ''ROOT_CANAL'' else ''OTHER'' end;',
    'v_code:=case v_detail->>''code'' when ''RESTORATION'' then ''RESTORATION'' when ''ROOT_CANAL'' then ''ROOT_CANAL'' when ''TOOTH_STATE'' then ''EXTRACTION'' else ''OTHER'' end;'
  );
  if pg_catalog.strpos(v_replacement,'when ''TOOTH_STATE'' then ''EXTRACTION''')=0 then
    raise exception using errcode='55000',message='expected clinical extraction materialization target was not found';
  end if;

  if pg_catalog.strpos(v_replacement,'insert into public.tooth_clinical_entry_details(organization_id,entry_id,detail) values(v_org,v_clinical,v_detail);')>0 then
    v_replacement:=pg_catalog.replace(
      v_replacement,
      'insert into public.tooth_clinical_entry_details(organization_id,entry_id,detail) values(v_org,v_clinical,v_detail);',
      'if v_code<>''EXTRACTION'' then insert into public.tooth_clinical_entry_details(organization_id,entry_id,feature_code,detail) values(v_org,v_clinical,v_code,v_detail); end if;'
    );
  elsif pg_catalog.strpos(v_replacement,'if v_code<>''EXTRACTION'' then insert into public.tooth_clinical_entry_details(organization_id,entry_id,feature_code,detail) values(v_org,v_clinical,v_code,v_detail); end if;')>0 then
    null;
  else
    raise exception using errcode='55000',message='expected clinical feature-detail repair target was not found';
  end if;

  execute v_replacement;
end $do$;
