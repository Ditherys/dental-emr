-- O10 review repair: periodontal writes must not override the canonical
-- odontogram state with caller-supplied tooth_present/implant_context flags.
-- Replace only the already-authorized save RPC body; its SECURITY DEFINER,
-- empty search_path, tenant/branch authorization, and existing grants remain
-- unchanged. The replacement is forward-only and fails closed if the expected
-- current function body is not present.

do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected periodontal save RPC is missing';
  end if;

  -- The OUT column examination_id shadows the child-table column in PL/pgSQL
  -- conflict targets. Constraint targets preserve the same upsert behavior
  -- without relying on a mutable variable-conflict setting.
  v_replacement := pg_catalog.replace(
    v_definition,
    'on conflict(examination_id,tooth_fdi) do update',
    'on conflict on constraint periodontal_tooth_measurements_unique_tooth do update'
  );
  v_replacement := pg_catalog.replace(
    v_replacement,
    'on conflict(examination_id,tooth_fdi,site) do update',
    'on conflict on constraint periodontal_site_measurements_unique_tooth_site do update'
  );
  v_replacement := pg_catalog.replace(
    v_replacement,
    'on conflict(examination_id,tooth_fdi,surface) do update',
    'on conflict on constraint periodontal_plaque_measurements_unique_tooth_surface do update'
  );
  v_replacement := pg_catalog.replace(
    v_replacement,
    'on conflict(examination_id,tooth_fdi,entrance) do update',
    'on conflict on constraint periodontal_furcation_measurements_unique_tooth_entrance do update'
  );

  -- Every child payload category passes through the same canonical-state
  -- guard. A current MISSING entry (including the typed TOOTH_STATE detail)
  -- and a current implant fixture chain are both unchartable here. A
  -- successor or void event makes the historical row non-current, matching
  -- the patient DTO's event_state projection.
  v_replacement := pg_catalog.replace(
    v_replacement,
    'v_fdi:=btrim(r->>''tooth_fdi'');',
    'v_fdi:=btrim(r->>''tooth_fdi'');
  if exists (
    select 1
    from public.tooth_clinical_entries as entry
    where entry.organization_id = v_org
      and entry.patient_id = v_exam.patient_id
      and entry.tooth_code = v_fdi
      and entry.lifecycle = ''OPEN''
      and entry.voided_at is null
      and not exists (
        select 1
        from public.tooth_clinical_entry_voids as void_event
        where void_event.organization_id = entry.organization_id
          and void_event.entry_id = entry.id
      )
      and not exists (
        select 1
        from public.tooth_clinical_entries as successor
        where successor.organization_id = entry.organization_id
          and successor.supersedes_entry_id = entry.id
      )
      and (
        entry.clinical_code = ''MISSING''
        or (
          entry.clinical_code = ''TOOTH_STATE''
          and exists (
            select 1
            from public.tooth_clinical_entry_details as detail
            where detail.organization_id = entry.organization_id
              and detail.entry_id = entry.id
              and detail.feature_code = ''TOOTH_STATE''
              and detail.detail->>''state'' = ''MISSING''
          )
        )
      )
  ) or exists (
    select 1
    from public.dental_implant_components as component
    where component.organization_id = v_org
      and component.patient_id = v_exam.patient_id
      and component.tooth_fdi = v_fdi
      and component.record_kind = ''CURRENT''
      and component.component_kind = ''FIXTURE''
      and component.depends_on_component_id is null
      and component.voided_at is null
      and not exists (
        select 1
        from public.dental_implant_component_voids as void_event
        where void_event.organization_id = component.organization_id
          and void_event.component_id = component.id
      )
      and not exists (
        select 1
        from public.dental_implant_components as successor
        where successor.organization_id = component.organization_id
          and successor.supersedes_component_id = component.id
      )
  ) then
    raise invalid_parameter_value using message = ''invalid input'';
  end if;'
  );

  if v_replacement = v_definition
     or pg_catalog.strpos(v_replacement, 'periodontal_site_measurements_unique_tooth_site') = 0
     or pg_catalog.strpos(v_replacement, 'entry.patient_id = v_exam.patient_id') = 0 then
    raise exception using errcode = '55000', message = 'expected periodontal save RPC guard targets were not found';
  end if;

  execute v_replacement;
end $do$;
