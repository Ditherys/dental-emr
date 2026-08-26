# Phase 11 — Document & Print Engine

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §26 and §Phase 11 plus accepted architecture. No
new product requirements are invented.

**Goal:** Generate standardized, clinic-branded, A4-printable documents from the
structured EMR record. The database stays authoritative; each document is an
immutable, reproducible snapshot (template version + data snapshot captured at
generation time). Sensitive exports are permission-gated and audited.

## Global Constraints

- All Phase 1–10 doctrine applies unchanged.
- `Structured records → Document Renderer → Versioned output`; never store the
  authoritative patient record only as a PDF. PDF generation is an output.
- Each generated document stores `template_version` + `data_snapshot jsonb`
  (the finalized, reproducible data). Re-render uses the snapshot, so output is
  reproducible regardless of later record edits.
- Documents carry clinic branding (org business name, branch address, generated
  timestamp) rendered server-side.
- A4-usable output via print-styled HTML (a print route with `@media print`);
  real PDF conversion is an external dependency (NOT VERIFIED locally; the
  renderer emits HTML suitable for print-to-PDF).
- Configurable patient-record export: the generate action accepts an include
  set; only authorized/selected sections are included. Never blindly export
  everything.
- Sensitive exports (patient record summary, prescription, referral letter)
  require `document.generate` and create an audit event per generation/export.
- Initial template set (bounded): PATIENT_RECORD_SUMMARY, APPOINTMENT_SLIP,
  REFERRAL_LETTER. (Treatment estimate/statement/prescription/consent/treatment
  plan require Phase 16/21 data that does not exist yet; the table + registry
  supports them but only these three are rendered in this phase.)

## Role matrix

- `document.generate` (generate + view sensitive snapshots): OWNER, ADMIN,
  DENTIST.
- `document.view` (view generated document list/snapshots): OWNER, ADMIN,
  DENTIST, RECEPTIONIST.

## Tasks

- [ ] **P11-01: Document permission contract**
  - `document.generate` / `document.view` permission rows + matrix;
    `PermissionCode` + policy test; pgTAP proving the matrix.

- [ ] **P11-02: Document schema**
  - `documents`: org, branch, patient composite FK, document_type
    (PATIENT_RECORD_SUMMARY/APPOINTMENT_SLIP/REFERRAL_LETTER), template_version
    bounded, data_snapshot jsonb (the finalized reproducible data), include_set
    jsonb (configurable export selection), status (GENERATED), generated_by,
    generated_at, version, timestamps. RLS + zero base grants + indexes +
    CHECK data_snapshot is an object <= size. pgTAP.

- [ ] **P11-03: Document RPCs**
  - `private.has_document_permission_at_branch(acting_branch_id, code)` helper.
  - `generate_document(acting_branch_id, patient_id, document_type, include_set jsonb)`
    — document.generate gated; builds the data snapshot server-side from the
    authorized patient record (bounded projection per document_type +
    include_set, no internal operational notes, no communication history, no
    billing); stores template_version + snapshot; audit 'document.generated'
    metadata {document_type, include_set}. Snapshot never contains the full
    patient record — only the selected/authorized sections.
  - `list_documents(acting_branch_id, patient_id, document_type)` —
    document.view gated; bounded projection (no snapshot body); no audit.
  - `get_document_snapshot(acting_branch_id, document_id, expected_version)`
    — document.view gated (document.generate for sensitive types is enforced by
    the caller UI; keep the RPC gated on document.view but the snapshot only
    contains authorized sections); returns the stored snapshot for reproducible
    re-render; no audit.
  - Terminal grants + pgTAP (positive/negative/tenant isolation/audit on
    generate + configurable include set respected).

- [ ] **P11-04: Server renderer + services + print UI**
  - `src/lib/documents/` service layer (schemas/types/errors/service) mirroring
    `src/lib/calendar/`.
  - `src/lib/documents/render.ts`: server-only renderer producing clinic-
    branded A4 print HTML from a document snapshot (per document_type; no
    clinical content beyond the authorized snapshot; branch/org branding from
    the acting branch).
  - `/documents` page (list + Generate dialog with patient picker + type +
    include-set checkboxes, configurable export) + `/documents/[id]/print` route
    (A4 `@media print` HTML) + server actions (generate/list) rechecking
    document.generate/document.view + acting branch. Tests.

- [ ] **P11-05: Integration verification + phase review**

## Explicitly deferred

- PDF generation service (external dependency; HTML print path is the seam).
- Treatment estimate/statement of account/prescription/consent/treatment plan
  templates (need Phase 16/21 data).
- Odontogram/doc images in documents (Phase 15).
- Signature capture (Phase 24/consent).
- BIR-compliant tax invoice (Phase 21).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 11)

- A4 output is usable (print HTML route with print CSS);
- patient record export is configurable (include_set);
- documents have clinic branding (org/branch rendered server-side);
- sensitive exports are authorized/audited (document.generate + audit event);
- finalized document snapshot is reproducible (template_version + data_snapshot
  re-render).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Real PDF conversion is NOT VERIFIED (external).