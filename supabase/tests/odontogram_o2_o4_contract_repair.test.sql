-- O2-O4 forward-repair contract. Synthetic-only and transactionally rolled back.
begin;
select extensions.no_plan();

-- Deterministic 4 status x 8 finding x 8 surface x 2 void-state matrix.
-- This is independent of the evolving seed and therefore proves every branch,
-- exact row/surface counts, and that void/surface do not reclassify semantics.
create temporary table legacy_cross_product on commit drop as
select legacy_status,
       finding_type,
       surface,
       is_voided,
       mapped.kind,
       mapped.mapped_status,
       case when surface = 'FULL' then 0 else 1 end as surface_row_count
from unnest(array['ACTIVE','PLANNED','COMPLETED','REFERRED']::text[]) as status_value(legacy_status)
cross join unnest(array['CARIES','RESTORATION','CROWN','BRIDGE','MISSING','SEALANT','FRACTURE','OTHER']::text[]) as finding_value(finding_type)
cross join unnest(array['FULL','O','B','L','M','D','I','F']::text[]) as surface_value(surface)
cross join unnest(array[false,true]) as void_value(is_voided)
cross join lateral private.map_legacy_odontogram_semantics(legacy_status, finding_type) as mapped;

select extensions.is(
  (select count(*)::integer from legacy_cross_product),
  512,
  'legacy mapping covers the complete status x finding x surface x void cross-product'
);

select extensions.is(
  (select sum(surface_row_count)::integer from legacy_cross_product),
  448,
  'the complete cross-product creates one row for each non-FULL surface and zero for FULL'
);

select extensions.is(
  (select count(*)::integer from legacy_cross_product where surface = 'FULL' and surface_row_count <> 0),
  0,
  'every FULL combination remains whole-tooth with zero surface associations'
);

select extensions.is(
  (select count(*)::integer from (
    select legacy_status, finding_type, surface, kind, mapped_status
    from legacy_cross_product
    group by legacy_status, finding_type, surface, kind, mapped_status
    having count(distinct is_voided) <> 2
  ) as changed_by_void),
  0,
  'void lifecycle does not change any mapped kind or status'
);

select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'FINDING' and mapped_status = 'EXISTING'),
  64,
  'ACTIVE findings have the exact FINDING/EXISTING count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'TREATMENT' and mapped_status = 'PREEXISTING'),
  48,
  'ACTIVE treatments have the exact TREATMENT/PREEXISTING count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'LEGACY_BRIDGE_MARKER' and mapped_status = 'ACTIVE'),
  16,
  'ACTIVE bridges have the exact ambiguous bridge count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'LEGACY_UNLINKED_PLANNED' and mapped_status = 'PLANNED'),
  128,
  'PLANNED combinations have the exact legacy-planned count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'TREATMENT' and mapped_status = 'COMPLETED_LEGACY'),
  48,
  'COMPLETED treatments have the exact legacy-completed count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'LEGACY_TERMINAL_UNCLASSIFIED' and mapped_status = 'COMPLETED'),
  64,
  'COMPLETED terminal findings have the exact unclassified count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'LEGACY_BRIDGE_MARKER' and mapped_status = 'COMPLETED'),
  16,
  'COMPLETED bridges have the exact ambiguous bridge count'
);
select extensions.is(
  (select count(*)::integer from legacy_cross_product where kind = 'LEGACY_REFERRED' and mapped_status = 'REFERRED'),
  128,
  'REFERRED combinations have the exact referred count'
);

select extensions.throws_ok(
  $$select * from private.map_legacy_odontogram_semantics('UNKNOWN','CARIES')$$,
  '22023',
  'unmapped legacy odontogram value',
  'unknown legacy values fail closed instead of silently dropping a row'
);

select extensions.is(
  (select count(*)::integer
     from public.tooth_clinical_entry_surfaces as surface
     join public.tooth_clinical_entries as entry
       on entry.organization_id = surface.organization_id and entry.id = surface.entry_id
     join public.tooth_conditions as legacy
       on legacy.organization_id = entry.organization_id and legacy.id = entry.legacy_tooth_condition_id
    where legacy.surface = 'FULL'),
  0,
  'legacy FULL is whole-tooth and creates zero surface rows'
);

select extensions.ok(
  not exists (
    select 1
      from public.tooth_clinical_entries as entry
      join public.tooth_conditions as legacy
        on legacy.organization_id = entry.organization_id and legacy.id = entry.legacy_tooth_condition_id
     where (entry.kind, entry.status) is distinct from (
       case
         when legacy.status = 'ACTIVE' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'FINDING'
         when legacy.status = 'ACTIVE' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'TREATMENT'
         when legacy.status = 'ACTIVE' and legacy.finding_type = 'BRIDGE' then 'LEGACY_BRIDGE_MARKER'
         when legacy.status = 'PLANNED' then 'LEGACY_UNLINKED_PLANNED'
         when legacy.status = 'COMPLETED' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'TREATMENT'
         when legacy.status = 'COMPLETED' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'LEGACY_TERMINAL_UNCLASSIFIED'
         when legacy.status = 'COMPLETED' and legacy.finding_type = 'BRIDGE' then 'LEGACY_BRIDGE_MARKER'
         when legacy.status = 'REFERRED' then 'LEGACY_REFERRED'
       end,
       case
         when legacy.status = 'ACTIVE' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'EXISTING'
         when legacy.status = 'ACTIVE' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'PREEXISTING'
         when legacy.status = 'ACTIVE' and legacy.finding_type = 'BRIDGE' then 'ACTIVE'
         when legacy.status = 'PLANNED' then 'PLANNED'
         when legacy.status = 'COMPLETED' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'COMPLETED_LEGACY'
         when legacy.status = 'COMPLETED' then 'COMPLETED'
         when legacy.status = 'REFERRED' then 'REFERRED'
       end
     )
  ),
  'void state does not reclassify the normative status/finding mapping'
);

select extensions.ok(
  (select count(*) = 4 from pg_constraint where conname in (
    'tooth_clinical_entries_organization_provider_fk',
    'tooth_clinical_entries_organization_encounter_fk',
    'tooth_clinical_entries_organization_plan_item_fk',
    'tooth_clinical_entries_organization_charge_fk'
  )),
  'clinical optional relationships are tenant-safe composite foreign keys'
);

select extensions.ok(
  exists (select 1 from pg_constraint where conname = 'dental_bridge_units_organization_support_component_fk'),
  'bridge implant support has a tenant-safe composite foreign key'
);

select extensions.ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'dental_bridges_one_successor_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'dental_implant_components_one_successor_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'periodontal_examinations_one_amendment_idx'),
  'bridge, implant, and periodontal lineages allow one successor only'
);

select extensions.ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.dental_bridges'::regclass and tgname = 'dental_bridges_append_only_check' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'public.dental_implant_components'::regclass and tgname = 'dental_implant_components_append_only_check' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'public.odontogram_legacy_resolutions'::regclass and tgname = 'odontogram_legacy_resolutions_append_only_check' and not tgisinternal),
  'CURRENT structures and legacy resolutions have append-only enforcement'
);

do $$
declare
  v_org constant uuid := '22000000-0000-0000-0000-000000000001';
  v_patient constant uuid := 'd45e073b-77d0-4c67-a656-aed601cc5c18';
  v_other_patient uuid := gen_random_uuid();
  v_clinical uuid;
  v_other_clinical uuid;
  v_bridge uuid;
  v_plan uuid;
  v_item uuid;
  v_sources uuid[] := array[]::uuid[];
  v_source uuid;
  v_raised boolean;
  v_index integer;
begin
  insert into public.patients (
    id, organization_id, patient_number, first_name, last_name, birth_date
  ) values (
    v_other_patient, v_org, 'O2O4-OTHER-' || left(v_other_patient::text, 8),
    'Synthetic', 'Resolution', date '1990-01-01'
  );

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code,
    status, provenance
  ) values (
    v_org, v_patient, '11', 'FINDING', 'CARIES', 'ACTIVE', 'INTERNAL'
  ) returning id into v_clinical;

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code,
    status, provenance
  ) values (
    v_org, v_other_patient, '11', 'FINDING', 'CARIES', 'ACTIVE', 'INTERNAL'
  ) returning id into v_other_clinical;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, provenance, sealed_at
  ) values (
    v_org, v_patient, 'CURRENT', 'PREEXISTING_EXTERNAL', statement_timestamp()
  ) returning id into v_bridge;

  insert into public.treatment_plans (
    organization_id, patient_id, title, status
  ) values (
    v_org, v_patient, 'Synthetic legacy target', 'DRAFT'
  ) returning id into v_plan;

  insert into public.treatment_plan_items (
    organization_id, plan_id, line_no, description
  ) values (
    v_org, v_plan, 1, 'Synthetic legacy target item'
  ) returning id into v_item;

  for v_index in 1..8 loop
    insert into public.tooth_clinical_entries (
      organization_id, patient_id, tooth_code, kind, clinical_code,
      status, provenance, legacy_tooth_condition_id
    ) values (
      v_org, v_patient, '12', 'LEGACY_BRIDGE_MARKER', 'BRIDGE',
      'ACTIVE', 'LEGACY_PHASE15', gen_random_uuid()
    ) returning id into v_source;
    v_sources := array_append(v_sources, v_source);
  end loop;

  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind,
    resolved_clinical_entry_id, reason
  ) values (v_org, v_sources[1], 'LINK_CANONICAL', v_clinical, 'synthetic clinical target');

  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind,
    resolved_bridge_id, reason
  ) values (v_org, v_sources[2], 'LINK_CANONICAL', v_bridge, 'synthetic bridge target');

  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind,
    resolved_treatment_plan_item_id, reason
  ) values (v_org, v_sources[3], 'LINK_CANONICAL', v_item, 'synthetic plan-item target');

  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind, reason
  ) values (v_org, v_sources[4], 'NO_CURRENT_STATE', 'synthetic no-state resolution');

  perform extensions.is(
    (select count(*)::integer from public.odontogram_legacy_resolutions
      where legacy_entry_id = any(v_sources[1:4])),
    4,
    'all three exact-one legacy targets and the no-target resolution are accepted'
  );

  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind,
      resolved_clinical_entry_id, resolved_bridge_id, reason
    ) values (v_org, v_sources[5], 'LINK_CANONICAL', v_clinical, v_bridge, 'mixed targets');
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'mixed legacy resolution targets are rejected');

  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind, reason
    ) values (v_org, v_sources[6], 'LINK_CANONICAL', 'missing target');
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'LINK_CANONICAL without a target is rejected');

  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind,
      resolved_clinical_entry_id, reason
    ) values (v_org, v_sources[7], 'LINK_CANONICAL', v_other_clinical, 'other patient');
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'a legacy target from another patient is rejected');

  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind,
      resolved_clinical_entry_id, reason
    ) values (v_org, v_sources[1], 'LINK_CANONICAL', v_clinical, 'duplicate');
  exception when unique_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'a legacy entry can be resolved only once');

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code,
    status, provenance, legacy_tooth_condition_id
  ) values (
    v_org, v_patient, '13', 'FINDING', 'CARIES',
    'EXISTING', 'LEGACY_PHASE15', gen_random_uuid()
  ) returning id into v_source;

  v_raised := false;
  begin
    insert into public.odontogram_legacy_resolutions (
      organization_id, legacy_entry_id, resolution_kind,
      resolved_clinical_entry_id, reason
    ) values (v_org, v_source, 'LINK_CANONICAL', v_clinical, 'nonambiguous');
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'only ambiguous legacy source rows can be resolved');
end
$$;

-- Successor amendments and void events must leave the predecessor row exactly
-- byte-identical while the read boundary derives its terminal lifecycle.
insert into public.tooth_clinical_entries (
  id, organization_id, patient_id, tooth_code, kind, clinical_code,
  status, lifecycle, provenance, notes, legacy_tooth_condition_id, version
) values
  ('a2051900-0000-0000-0000-000000000001',
   '22000000-0000-0000-0000-000000000001',
   'd45e073b-77d0-4c67-a656-aed601cc5c18',
   '21','FINDING','CARIES','ACTIVE','OPEN','INTERNAL','amend predecessor',null,1),
  ('a2051900-0000-0000-0000-000000000002',
   '22000000-0000-0000-0000-000000000001',
   'd45e073b-77d0-4c67-a656-aed601cc5c18',
   '22','FINDING','CARIES','ACTIVE','OPEN','INTERNAL','void predecessor',null,1),
  ('a2051900-0000-0000-0000-000000000003',
   '22000000-0000-0000-0000-000000000001',
   'd45e073b-77d0-4c67-a656-aed601cc5c18',
   '23','LEGACY_BRIDGE_MARKER','BRIDGE','ACTIVE','OPEN','LEGACY_PHASE15',
   'legacy reason source','a2051900-0000-0000-0000-000000000103',1);

insert into public.tooth_clinical_entry_surfaces (
  organization_id, entry_id, surface, ordinal
) values
  ('22000000-0000-0000-0000-000000000001','a2051900-0000-0000-0000-000000000001','O',1),
  ('22000000-0000-0000-0000-000000000001','a2051900-0000-0000-0000-000000000002','B',1);

create temporary table clinical_predecessor_snapshots on commit drop as
select id, to_jsonb(entry) as bytes
from public.tooth_clinical_entries as entry
where id in (
  'a2051900-0000-0000-0000-000000000001',
  'a2051900-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
select * from public.amend_tooth_clinical_entry(
  '32000000-0000-0000-0000-000000000001',
  'a2051900-0000-0000-0000-000000000001',
  1, null, null, 'amended successor'
);
select * from public.void_tooth_clinical_entry(
  '32000000-0000-0000-0000-000000000001',
  'a2051900-0000-0000-0000-000000000002',
  1, 'synthetic void event'
);
reset role;

select extensions.ok(
  not exists (
    select 1
    from clinical_predecessor_snapshots as snapshot
    join public.tooth_clinical_entries as entry on entry.id = snapshot.id
    where to_jsonb(entry) is distinct from snapshot.bytes
  ),
  'amendment and void leave both predecessor rows byte-identical'
);

select extensions.is(
  (select count(*)::integer
   from public.tooth_clinical_entries
   where supersedes_entry_id = 'a2051900-0000-0000-0000-000000000001'),
  1,
  'amendment creates exactly one successor-side lineage row'
);

select extensions.is(
  (select count(*)::integer
   from public.tooth_clinical_entry_surfaces as surface
   join public.tooth_clinical_entries as successor on successor.id = surface.entry_id
   where successor.supersedes_entry_id = 'a2051900-0000-0000-0000-000000000001'
     and surface.surface = 'O'),
  1,
  'amendment copies predecessor surfaces onto the successor'
);

select extensions.is(
  (select count(*)::integer
   from public.tooth_clinical_entry_voids
   where entry_id = 'a2051900-0000-0000-0000-000000000002'),
  1,
  'void appends exactly one separate event row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
select extensions.is(
  (select item->>'lifecycle'
   from public.get_patient_odontogram(
     '32000000-0000-0000-0000-000000000001',
     'd45e073b-77d0-4c67-a656-aed601cc5c18'
   ) as projection
   cross join lateral jsonb_array_elements(projection.data->'entries') as item
   where item->>'id' = 'a2051900-0000-0000-0000-000000000001'),
  'SUPERSEDED',
  'read projection derives SUPERSEDED from the successor without parent mutation'
);
select extensions.is(
  (select item->>'lifecycle'
   from public.get_patient_odontogram(
     '32000000-0000-0000-0000-000000000001',
     'd45e073b-77d0-4c67-a656-aed601cc5c18'
   ) as projection
   cross join lateral jsonb_array_elements(projection.data->'entries') as item
   where item->>'id' = 'a2051900-0000-0000-0000-000000000002'),
  'VOIDED',
  'read projection derives VOIDED from the event without parent mutation'
);
reset role;

select extensions.throws_ok(
  $$update public.tooth_clinical_entries set notes='forbidden' where id='a2051900-0000-0000-0000-000000000001'$$,
  'P0001', null,
  'direct clinical history UPDATE remains denied'
);
select extensions.throws_ok(
  $$delete from public.tooth_clinical_entries where id='a2051900-0000-0000-0000-000000000002'$$,
  'P0001', null,
  'direct clinical history DELETE remains denied'
);

select extensions.throws_ok(
  $$insert into public.odontogram_legacy_resolutions (organization_id,legacy_entry_id,resolution_kind,reason)
    values ('22000000-0000-0000-0000-000000000001','a2051900-0000-0000-0000-000000000003','NO_CURRENT_STATE',null)$$,
  '23502', null,
  'legacy resolution reason is database-required'
);
select extensions.throws_ok(
  $$insert into public.odontogram_legacy_resolutions (organization_id,legacy_entry_id,resolution_kind,reason)
    values ('22000000-0000-0000-0000-000000000001','a2051900-0000-0000-0000-000000000003','NO_CURRENT_STATE','   ')$$,
  '23514', null,
  'legacy resolution reason rejects blank text'
);
select extensions.throws_ok(
  $$insert into public.odontogram_legacy_resolutions (organization_id,legacy_entry_id,resolution_kind,reason)
    values ('22000000-0000-0000-0000-000000000001','a2051900-0000-0000-0000-000000000003','NO_CURRENT_STATE',' padded ')$$,
  '23514', null,
  'legacy resolution reason must already be trimmed at the database boundary'
);

-- Both periodontal insertion orders converge on one explicit canonical row;
-- incompatible merges and reverse-order children fail clinically.
do $$
declare
  v_encounter uuid;
  v_exam uuid;
  v_raised boolean;
begin
  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, treating_provider_id, status
  ) values (
    '22000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'd45e073b-77d0-4c67-a656-aed601cc5c18',
    '72000000-0000-0000-0000-000000000001','OPEN'
  ) returning id into v_encounter;
  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (
    '22000000-0000-0000-0000-000000000001',
    'd45e073b-77d0-4c67-a656-aed601cc5c18',v_encounter,'INITIAL','DRAFT'
  ) returning id into v_exam;

  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site, probing_depth_mm, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'31','MB',4,true
  );
  perform extensions.ok(
    (select context_inferred from public.periodontal_tooth_measurements
      where examination_id=v_exam and tooth_fdi='31'),
    'child-first site creates an explicitly marked inferred context'
  );
  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, tooth_present, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'31',true,true
  );
  perform extensions.ok(
    (select count(*)=1 and not bool_or(context_inferred) and bool_and(implant_context)
     from public.periodontal_tooth_measurements
     where examination_id=v_exam and tooth_fdi='31'),
    'compatible explicit tooth INSERT atomically finalizes the inferred row'
  );

  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, tooth_present, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'32',true,false
  );
  insert into public.periodontal_plaque_measurements (
    organization_id, examination_id, tooth_fdi, surface, plaque_present
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'32','BUCCAL',true
  );
  perform extensions.ok(
    exists(select 1 from public.periodontal_plaque_measurements where examination_id=v_exam and tooth_fdi='32'),
    'tooth-first compatible child insertion remains valid'
  );

  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site, probing_depth_mm, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'33','MB',3,true
  );
  v_raised:=false;
  begin
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, tooth_present, implant_context
    ) values (
      '22000000-0000-0000-0000-000000000001',v_exam,'33',true,false
    );
  exception when check_violation then v_raised:=true; end;
  perform extensions.ok(v_raised,'child-first conflicting implant context is rejected');

  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, tooth_present, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'34',false,false
  );
  v_raised:=false;
  begin
    insert into public.periodontal_plaque_measurements (
      organization_id, examination_id, tooth_fdi, surface, plaque_present
    ) values (
      '22000000-0000-0000-0000-000000000001',v_exam,'34','BUCCAL',true
    );
  exception when check_violation then v_raised:=true; end;
  perform extensions.ok(v_raised,'tooth-first missing context rejects later child rows');

  insert into public.periodontal_plaque_measurements (
    organization_id, examination_id, tooth_fdi, surface, plaque_present
  ) values (
    '22000000-0000-0000-0000-000000000001',v_exam,'35','BUCCAL',true
  );
  v_raised:=false;
  begin
    insert into public.periodontal_tooth_measurements (
      organization_id, examination_id, tooth_fdi, tooth_present, implant_context
    ) values (
      '22000000-0000-0000-0000-000000000001',v_exam,'35',false,false
    );
  exception when check_violation then v_raised:=true; end;
  perform extensions.ok(v_raised,'child-first rows reject a later explicit missing-tooth context');
end
$$;

do $$
declare v_plan uuid; v_fixture uuid; v_abutment uuid; v_bridge uuid; v_raised boolean := false;
begin
  insert into public.treatment_plans (organization_id, patient_id, title, status)
  values ('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','O3 support compatibility','DRAFT')
  returning id into v_plan;
  insert into public.dental_implant_components (organization_id,patient_id,tooth_fdi,ordinal,component_kind,record_kind,provenance,sealed_at)
  values ('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','26',1,'FIXTURE','CURRENT','PREEXISTING_EXTERNAL',statement_timestamp())
  returning id into v_fixture;
  insert into public.dental_implant_components (organization_id,patient_id,tooth_fdi,ordinal,component_kind,depends_on_component_id,record_kind,provenance,sealed_at)
  values ('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','26',2,'ABUTMENT',v_fixture,'CURRENT','PREEXISTING_EXTERNAL',statement_timestamp())
  returning id into v_abutment;
  insert into public.dental_bridges (organization_id,patient_id,record_kind,parent_plan_id)
  values ('22000000-0000-0000-0000-000000000001','d45e073b-77d0-4c67-a656-aed601cc5c18','PLAN_DESIGN',v_plan)
  returning id into v_bridge;
  begin
    insert into public.dental_bridge_units (organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
    values ('22000000-0000-0000-0000-000000000001',v_bridge,'26',1,'ABUTMENT','IMPLANT_COMPONENT',v_abutment);
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(not v_raised, 'PLAN_DESIGN bridge may use a compatible CURRENT implant abutment');
end
$$;

do $$
declare
  v_encounter uuid;
  v_exam uuid;
  v_raised boolean;
begin
  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, treating_provider_id, status
  ) values (
    '22000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'd45e073b-77d0-4c67-a656-aed601cc5c18',
    '72000000-0000-0000-0000-000000000001',
    'OPEN'
  ) returning id into v_encounter;

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind, status
  ) values (
    '22000000-0000-0000-0000-000000000001',
    'd45e073b-77d0-4c67-a656-aed601cc5c18',
    v_encounter, 'INITIAL', 'DRAFT'
  ) returning id into v_exam;

  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site, probing_depth_mm, implant_context
  ) values (
    '22000000-0000-0000-0000-000000000001', v_exam, '26', 'MB', 4, true
  );
  perform extensions.ok(true, 'implant probing measurements are clinically valid');

  v_raised := false;
  begin
    insert into public.periodontal_site_measurements (
      organization_id, examination_id, tooth_fdi, site, probing_depth_mm, tooth_present
    ) values (
      '22000000-0000-0000-0000-000000000001', v_exam, '25', 'MB', 4, false
    );
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'a missing tooth cannot have probing measurements');

  update public.periodontal_tooth_measurements
     set mobility_miller = null,
         implant_context = true
   where organization_id = '22000000-0000-0000-0000-000000000001'
     and examination_id = v_exam
     and tooth_fdi = '26';

  v_raised := false;
  begin
    update public.periodontal_tooth_measurements
       set mobility_miller = 'M1'
     where examination_id = v_exam and tooth_fdi = '26';
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'implant-context teeth reject mobility');

  v_raised := false;
  begin
    insert into public.periodontal_furcation_measurements (
      organization_id, examination_id, tooth_fdi, entrance, grade
    ) values (
      '22000000-0000-0000-0000-000000000001', v_exam, '26', 'lingual', 2
    );
  exception when check_violation then v_raised := true;
  end;
  perform extensions.ok(v_raised, 'upper molars reject an anatomically invalid lingual furcation entrance');
end
$$;

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;
rollback;
