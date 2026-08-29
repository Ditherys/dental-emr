-- O13: odontogram migration compatibility and cleanup — retire legacy Phase 15 mutation RPCs.
--
-- Every tooth_conditions row was backfilled into tooth_clinical_entries by
-- 20260828020000 (normative cross-product mapping, unique
-- legacy_tooth_condition_id, idempotent rerun, FULL→seven-surface expansion).
-- Those rows are now projected by public.get_patient_odontogram (O5, bounded
-- 200 rows, renderer-independent jsonb DTO) and therefore appear in the new
-- read DTO and in the measured-chart UI. The schematic grid was replaced in O7
-- by src/components/odontogram/measured-chart.tsx after measured-renderer
-- regression/a11y tests passed, and the temporary translation adapter
-- conditionsToDto() in odontogram-section.tsx was retired after the read
-- cutover — the patient page now hydrates through the new DTO rather than
-- list_tooth_conditions. Application mutations have been switched to the O5
-- RPCs (record/amend/void_tooth_clinical_entry, bridge/implant/perio and
-- execution RPCs); the old P15-02 RPCs below are no longer called from new
-- application code (verify with: rg -n "create_tooth_condition" src/app src/components).
--
-- Classic/demo/localStorage/fork-global/jsPDF/Vite: excluded per
-- docs/plans/odontogram-integration-plan.md Global Constraints; search the
-- target repository with:
--   rg -i "classic|demo.*shell|localStorage|fork-global|jsPDF|jspdf" src \
--     --glob '!*.test.*' --glob '!*.svg'
-- and verify THIRD_PARTY_NOTICES.md pins https://github.com/Ditherys/React-Odontogram-Modul
-- at 5e28d93 (upstream ZoliQua/React-Odontogram-Modul, MIT) and that measured
-- assets under src/components/odontogram/assets/measured/*.svg are the only
-- transplanted SVG set. The source fork at C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul
-- pinned at 5e28d93 is the reference; do not follow a moving branch.
--
-- This terminal forward migration revokes browser execution from the obsolete
-- P15-02 RPCs. The functions remain present for audit/history introspection
-- but are unreachable from authenticated clients. Service-role is also
-- revoked for defense in depth (object migration already revoked every role;
-- 20260827013201 had restored authenticated only).

-- ---------------------------------------------------------------------------
-- Revoke legacy mutation/read RPCs
-- ---------------------------------------------------------------------------

revoke execute on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text)
  from authenticated;

revoke execute on function public.void_tooth_condition(uuid, uuid, integer, text)
  from authenticated;

revoke execute on function public.list_tooth_conditions(uuid, uuid, boolean)
  from authenticated;

-- Belt-and-suspenders: ensure anon, public and service_role cannot regain
-- execution through future default-privilege drift.
revoke execute on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text)
  from public, anon, service_role;
revoke execute on function public.void_tooth_condition(uuid, uuid, integer, text)
  from public, anon, service_role;
revoke execute on function public.list_tooth_conditions(uuid, uuid, boolean)
  from public, anon, service_role;

comment on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text) is
  'DEPRECATED — retired in O13 (20260828020500). Use record_tooth_clinical_entry; legacy tooth_conditions rows remain readable via tooth_clinical_entries / get_patient_odontogram.';
comment on function public.void_tooth_condition(uuid, uuid, integer, text) is
  'DEPRECATED — retired in O13 (20260828020500). Use void_tooth_clinical_entry; legacy rows are projected in the new DTO.';
comment on function public.list_tooth_conditions(uuid, uuid, boolean) is
  'DEPRECATED — retired in O13 (20260828020500). Use get_patient_odontogram; every Phase-15 row was backfilled by 20260828020000.';
