-- O2 clinical feature detail persistence. This is additive to the existing
-- append-only clinical entry history: exactly one typed detail may describe an
-- entry, and its tenant and clinical code must be the entry's own.

create table if not exists public.tooth_clinical_entry_details (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    entry_id uuid not null,
    feature_code text not null,
    detail jsonb not null,
    created_at timestamptz not null default statement_timestamp(),
    constraint tooth_clinical_entry_details_entry_fk foreign key (organization_id, entry_id)
      references public.tooth_clinical_entries(organization_id, id) on delete restrict,
    constraint tooth_clinical_entry_details_entry_key unique (organization_id, entry_id),
    constraint tooth_clinical_entry_details_object_check check (
      jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096
    ),
    constraint tooth_clinical_entry_details_feature_code_check check (
      feature_code in ('CARIES', 'RESTORATION', 'ROOT_CANAL', 'TOOTH_STATE', 'ORTHODONTIC', 'OTHER')
    ),
    constraint tooth_clinical_entry_details_caries_check check (
      feature_code <> 'CARIES' or (
        detail->>'code' = 'CARIES'
        and detail - 'code' - 'depth' - 'icdas' - 'cars' - 'radiographicDepth' = '{}'::jsonb
        and detail ?& array['code', 'depth', 'icdas', 'cars', 'radiographicDepth']
        and detail->>'depth' in ('ENAMEL', 'DENTIN', 'PULPAL')
        and (jsonb_typeof(detail->'icdas') = 'null' or detail->>'icdas' in ('0', '1', '2', '3', '4', '5', '6'))
        and (jsonb_typeof(detail->'cars') = 'null' or (jsonb_typeof(detail->'cars') = 'string' and length(detail->>'cars') between 1 and 100 and detail->>'cars' = btrim(detail->>'cars'))
        and (jsonb_typeof(detail->'radiographicDepth') = 'null' or (jsonb_typeof(detail->'radiographicDepth') = 'string' and length(detail->>'radiographicDepth') between 1 and 100 and detail->>'radiographicDepth' = btrim(detail->>'radiographicDepth')))))
    ),
    constraint tooth_clinical_entry_details_restoration_check check (
      feature_code <> 'RESTORATION' or (
        detail->>'code' = 'RESTORATION'
        and detail - 'code' - 'restorationType' - 'material' - 'marginalLeakage' = '{}'::jsonb
        and detail ?& array['code', 'restorationType', 'material', 'marginalLeakage']
        and detail->>'restorationType' in ('none', 'crown', 'inlay', 'onlay', 'veneer', 'bridge')
        and detail->>'material' in ('none', 'emax', 'gold', 'gradia', 'zircon', 'metal', 'metal-ceramic', 'telescope', 'temporary', 'amalgam', 'composite', 'gic')
        and jsonb_typeof(detail->'marginalLeakage') = 'boolean')
    ),
    constraint tooth_clinical_entry_details_root_canal_check check (
      feature_code <> 'ROOT_CANAL' or (
        detail->>'code' = 'ROOT_CANAL'
        and detail - 'code' - 'state' = '{}'::jsonb
        and detail ?& array['code', 'state']
        and detail->>'state' in ('endo-medical-filling', 'endo-filling', 'endo-filling-incomplete', 'endo-glass-pin', 'endo-metal-pin'))
    ),
    constraint tooth_clinical_entry_details_tooth_state_check check (
      feature_code <> 'TOOTH_STATE' or (
        detail->>'code' = 'TOOTH_STATE'
        and detail - 'code' - 'state' = '{}'::jsonb
        and detail ?& array['code', 'state']
        and detail->>'state' in ('PRESENT', 'MISSING', 'EXTRACTION_WOUND', 'SUBGINGIVAL', 'RADIX', 'BROKEN', 'CROWN_PREPARATION'))
    ),
    constraint tooth_clinical_entry_details_orthodontic_check check (
      feature_code <> 'ORTHODONTIC' or (
        detail->>'code' = 'ORTHODONTIC'
        and detail - 'code' - 'appliance' - 'movement' = '{}'::jsonb
        and detail ?& array['code', 'appliance', 'movement']
        and detail->>'appliance' in ('BRACKET', 'BAND')
        and (jsonb_typeof(detail->'movement') = 'null' or detail->>'movement' in ('DRIFT', 'INTRUSION', 'EXTRUSION', 'ROTATION')))
    ),
    constraint tooth_clinical_entry_details_other_check check (
      feature_code <> 'OTHER' or (
        detail->>'code' = 'OTHER'
        and detail - 'code' - 'controlledCode' = '{}'::jsonb
        and detail ?& array['code', 'controlledCode']
        and jsonb_typeof(detail->'controlledCode') = 'string'
        and length(detail->>'controlledCode') between 1 and 100
        and detail->>'controlledCode' = btrim(detail->>'controlledCode'))
    )
);

-- Fail closed if legacy rows contain a code that this approved extension does
-- not recognize; the following replacement constraint cannot silently coerce.
alter table public.tooth_clinical_entries drop constraint if exists tooth_clinical_entries_clinical_code_check;
alter table public.tooth_clinical_entries add constraint tooth_clinical_entries_clinical_code_check_o2 check (
  clinical_code in (
    'CARIES', 'RESTORATION', 'CROWN', 'BRIDGE', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER',
    'ROOT_CANAL', 'TOOTH_STATE', 'ORTHODONTIC'
  )
);

revoke all on table public.tooth_clinical_entry_details from public, anon, authenticated, service_role;
alter table public.tooth_clinical_entry_details enable row level security;

comment on table public.tooth_clinical_entry_details is
  'One constrained, renderer-independent clinical feature detail per append-only tooth clinical entry. Direct access is denied; a later narrow audited RPC owns writes.';
