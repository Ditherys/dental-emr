# Phase 14 — Clinical Notes & Dental EMR

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §22 and §Phase 14 plus accepted architecture. No
new product requirements are invented.

**Goal:** The clinical core: encounters that link appointment/provider/patient
correctly, clinical notes with draft/finalized lifecycle and non-destructive
amendment history, treatment history, prescription linkage, and richer
medical/dental history. Finalized clinical records are versioned/amended rather
than silently overwritten; every clinical change is audited; reception cannot
edit clinical notes.

## Global Constraints

- All Phase 1–13 doctrine applies unchanged, plus the clinical data rules from
  `docs/SECURITY_ARCHITECTURE.md` and DATABASE_DESIGN §10/§22.
- **Finalized notes are immutable**: a FINALIZED note row cannot be UPDATE/DELETE
  (trigger-enforced). Amendments are new child note rows (parent_note_id),
  preserving full history.
- **Reception cannot edit clinical notes**: clinical write requires
  `patient.clinical.write` (OWNER/ADMIN/DENTIST); `patient.clinical.read`
  (OWNER/ADMIN/DENTIST/DENTAL_ASSISTANT). RECEPTIONIST has neither.
- Every clinical mutation is audited atomically with bounded metadata
  (clinical.encounter.opened, clinical.note.created, clinical.note.finalized,
  clinical.note.amended, clinical.prescription.created, etc.).
- Clinical content never leaves the clinical surface: no public/communication/
  document route may expose note content. Documents use the Phase 11 authorized
  snapshot mechanism only (clinical export gated on document.generate AND
  clinical.read).
- Encounters link to an appointment and a treating provider (or standalone
  encounters without appointment are allowed but always require a provider).
- Treatment history = the ordered list of finalized encounters + notes.

## Role matrix (clinical permissions)

- `patient.clinical.write`: OWNER, ADMIN, DENTIST.
- `patient.clinical.read`: OWNER, ADMIN, DENTIST, DENTAL_ASSISTANT.
- Neither: RECEPTIONIST, VISITING_SPECIALIST (VISITING_SPECIALIST may be granted
  clinical read in Phase 10 workflow; keep least privilege for now), BILLING.

## Tasks

- [ ] **P14-01: Clinical permission contract**
  - `patient.clinical.read` / `patient.clinical.write` permission rows +
    matrix; `PermissionCode` + policy test; pgTAP proving the matrix and that
    RECEPTIONIST gets neither.

- [ ] **P14-02: Clinical schema**
  - `clinical_encounters`: org, branch, patient composite FK, appointment
    composite FK (nullable), treating_provider (org FK, required), status
    (OPEN/FINALIZED), version, timestamps. RLS + zero base grants + indexes.
  - `clinical_notes`: org, encounter FK, parent_note_id (self FK, nullable),
    note_type (PROGRESS/CONSULTATION/PROCEDURE/POST_OP/REFERRAL/FREE_FORM/
    AMENDMENT), content (bounded), status (DRAFT/FINALIZED), finalized_at,
    version, timestamps. **Immutable-finalized trigger** (no UPDATE/DELETE once
    FINALIZED; amendments must be child rows). RLS + zero grants.
  - `patient_medical_conditions`, `patient_allergies`, `patient_medications`
    (DATABASE_DESIGN §10, bounded, recorded_by/at, status, voided_at nullable;
    record-audited via RPCs).
  - `prescriptions`: org, encounter FK, patient FK, provider FK, items jsonb
    (bounded array of {medicationName, dosage, frequency}), status
    (DRAFT/FINALIZED), finalized_at, version. RLS + zero grants.
  - pgTAP for all.

- [ ] **P14-03: Clinical RPCs**
  - `private.has_clinical_permission_at_branch(acting_branch_id, code)` helper
    (clinical.read/write).
  - `create_clinical_encounter` (clinical.write gated; link appointment/
    provider/patient org-scoped; audit), `finalize_clinical_encounter`
    (finalizes all DRAFT notes + encounter; audit).
  - `create_clinical_note` (clinical.write gated; DRAFT), `finalize_clinical_note`
    (DRAFT→FINALIZED, immutable after; audit), `amend_clinical_note` (creates a
    child AMENDMENT note on a FINALIZED parent; audit), `update_clinical_note`
    (DRAFT only edit; audit).
  - `list_clinical_encounters` / `get_clinical_encounter_detail` (clinical.read
    gated; bounded projection incl. notes + history; audit NONE on read).
  - Medical/allergy/medication CRUD RPCs (clinical.write gated, void =
    voided_at + audit; read gated on clinical.read).
  - `create_prescription` / `finalize_prescription` (clinical.write gated,
    immutable after finalize, audit).
  - Terminal grants (authenticated only) + pgTAP (finalized-immutability
    trigger, amendment chain, reception denied read/write, clinical changes
    audited atomically with audit-rollback trigger test, tenant isolation,
    appointment/provider linkage correctness).

- [ ] **P14-04: Server services + clinical UI**
  - `src/lib/clinical/` service layer mirroring `src/lib/specialist/` +
    offline tests.
  - Patient workspace "Clinical" section: encounter list (treatment history),
    open/create encounter, per-encounter notes (draft/finalize/amend), medical
    history (conditions/allergies/medications), prescriptions. Gated on
    clinical.read; write actions gated on clinical.write; RECEPTIONIST sees no
    clinical section. Dense/phone composition, 44px. Tests (reception sees no
    clinical UI; draft→finalize→amend flow; history preserved).

- [ ] **P14-05: Integration verification + phase review**

## Explicitly deferred

- Odontogram/dental chart (Phase 15).
- SOAP template forcing (free-form + note types only).
- Treatment plans/estimate (Phase 16).
- Recall/follow-up automation (Phase 18).
- Consent/digital intake (Phase 17).
- BIR-compliant billing/prescription invoicing (Phase 21).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 14)

- finalized notes preserve history (immutable + amendment chain);
- clinical changes are audited (per-mutation audit + rollback test);
- reception cannot edit clinical notes (no clinical permission + UI hidden);
- clinical encounter links appointment/provider correctly (composite FKs +
  RPC validation + tests).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.