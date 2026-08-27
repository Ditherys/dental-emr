# Phase 15 — Odontogram / Dental Chart

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §22.4 and §Phase 15 plus accepted architecture and
AGENTS.md odontogram rules. No new product requirements are invented.

**Goal:** A canonical, renderer-independent dental chart data model (FDI tooth
numbering, permanent + primary dentition, missing teeth, conditions with
EXISTING/PLANNED/COMPLETED/REFERRAL statuses) with a legible graphical chart in
the patient clinical workspace, treatment-history integration, and a printable
chart. The data model is fully independent of any renderer so the controlled
`Ditherys/React-Odontogram-Modul` fork (preferred prototype renderer) can be
swapped in later without migrating canonical chart data.

**Renderer decision (deliberate deviation):** Adding the third-party odontogram
component is a material dependency decision that would require an ADR and full
clinical/touch/security/data-mapping evaluation. To keep this phase bounded and
to guarantee renderer independence from the start, the prototype renders the
canonical data with a **self-built legible SVG/grid chart**. The data model and
RPC boundaries are renderer-agnostic; the fork remains the documented preferred
future renderer. Printable legibility is proven by tests + print CSS.

## Global Constraints

- All Phase 1–14 doctrine applies unchanged.
- Canonical chart data lives in tenant-scoped, RLS-protected tables; the
  renderer consumes DTOs via RPCs and never becomes the source of truth.
- Historical chart is never destroyed: conditions are versioned and voided
  (voided rows + audit preserved); a new state is a new/voided condition, never
  a silent overwrite.
- Clinical permissions reused: mutations gated on `patient.clinical.write`,
  reads on `patient.clinical.read` (RECEPTIONIST has neither).
- FDI tooth numbering with permanent (11–48) + primary (51–85) notation,
  validated server-side.
- Print/export uses the Phase 11 print seam (print CSS / print route).

## Tasks

- [ ] **P15-01: Tooth condition schema**
  - `tooth_conditions`: org, patient composite FK, tooth_code (FDI bounded,
    validated: permanent 11-48 or primary 51-85), surface (O/B/L/M/D/I/F or
    FULL/WHOLE for whole-tooth), status (ACTIVE/PLANNED/COMPLETED/REFERRED),
    finding_type (CARIES/RESTORATION/CROWN/BRIDGE/MISSING/SEALANT/FRACTURE/OTHER),
    notes bounded, recorded_by, recorded_at, version, voided_at, timestamps.
    RLS + zero base grants + indexes (org, patient). pgTAP (tooth/surface/status
    validators, tenant FKs).

- [ ] **P15-02: Odontogram RPCs**
  - `private.has_clinical_permission_at_branch` reused (from P14).
  - `create_tooth_condition(acting_branch_id, patient_id, tooth_code, surface,
    status, finding_type, notes)` — clinical.write gated; validate tooth/surface/
    status/finding; audit 'clinical.tooth_condition.created' {}.
  - `void_tooth_condition(acting_branch_id, condition_id, expected_version,
    reason)` — clinical.write gated; ACTIVE/PLANNED → VOIDED (voided_at, version
    bump; COMPLETED/REFERRED records are kept as history and NOT voided —
    returning 'invalid state' for terminal statuses); audit
    'clinical.tooth_condition.voided' {reason}. Historical preservation: voided
    rows remain queryable in history.
  - `list_tooth_conditions(acting_branch_id, patient_id, include_history boolean)`
    — clinical.read gated; bounded projection (tooth, surface, status, finding,
    notes, version, recorded_by, voided_at); no audit.
  - Terminal grants (authenticated only) + pgTAP (positive/negative/void of
    terminal status rejected/history preserved/tenant isolation/permission
    denials/audit rollback).

- [ ] **P15-03: Server services + odontogram UI**
  - `src/lib/odontogram/` service layer (schemas/types/errors/service) +
    offline tests.
  - Patient Clinical section "Odontogram" tab: self-built legible SVG/grid
    chart (two arches; FDI numbering; per-tooth status color + legend for
    EXISTING/PLANNED/COMPLETED/REFERRED; missing teeth rendered); click-to-edit
    dialog (condition editor); void action with confirmation; history view.
    Gated on clinical.read (write actions on clinical.write); RECEPTIONIST sees
    nothing. 44px, phone/desktop composition, print CSS for a legible printable
    chart. Tests (renders canonical data, status legend, void/history preserved,
    print CSS, 44px, no clinical data outside the section).

- [ ] **P15-04: Integration verification + phase review**

## Explicitly deferred

- Full odontogram renderer swap to the controlled fork (ADR + clinical gate
  required; data model is ready).
- Tooth-level clinical note linking (conditions carry notes already).
- Complex bridge/crown geometry rendering (self-built chart is schematic).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 15)

- dentists validate terminology/workflow (FDI + status vocabulary, pgTAP +
  UI tests);
- historical chart is not destroyed by new state (void + audit + history);
- printable chart is legible (print CSS + tests).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.