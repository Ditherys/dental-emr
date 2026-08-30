-- O2 follow-up: retain every already-authorized execution code while adding
-- the feature-detail vocabulary. The preceding migration has already been
-- applied locally, so this correction is deliberately forward-only.

alter table public.tooth_clinical_entries
  drop constraint if exists tooth_clinical_entries_clinical_code_check_o2;

alter table public.tooth_clinical_entries
  add constraint tooth_clinical_entries_clinical_code_check_o2 check (
    clinical_code in (
      'CARIES', 'RESTORATION', 'CROWN', 'BRIDGE', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER',
      'EXTRACTION', 'IMPLANT', 'ROOT_CANAL', 'TOOTH_STATE', 'ORTHODONTIC'
    )
  );
