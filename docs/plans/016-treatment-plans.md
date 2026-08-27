# Phase 16 — Treatment Plans & Discussion Canvas

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 16 plus accepted architecture. No new
product requirements are invented.

**Goal:** Structured, versioned treatment plans with alternatives, an
acknowledgment flow that makes an acknowledged plan immutable, a
renderer-independent drawing canvas persisted to the patient record (original
X-rays/images unchanged), per-plan discussion notes documenting
dentist/time/context, and a printable plan via the Phase 11 document seam.

## Global Constraints

- All Phase 1–15 doctrine applies unchanged; clinical permissions reused.
- **An acknowledged plan cannot be silently overwritten**: a plan with status
  ACKNOWLEDGED (and PRESENTED) is immutable (trigger-enforced, mirroring the
  P14 finalized-note pattern); revisions are new plan versions.
- Drawing is stored renderer-independent (bounded JSON of strokes/points) in
  the tenant-scoped patient record; it never modifies any original image. X-ray
  annotation is deferred.
- Discussion documentation always captures dentist (provider), time
  (discussed_at), and context (bounded text).
- Treatment plan items carry an optional estimated fee (bounded numeric) —
  there is no fixed procedure price engine (deferred to Phase 21).
- Print uses the Phase 11 document seam: a new TREATMENT_PLAN document_type is
  added to the Phase 11 documents table + generate_document handling, so a plan
  snapshot (incl. drawing) is reproducible and print-able. The original
  X-ray/image is never part of the plan snapshot beyond a reference.
- Fees are estimated only (no currency engine, no invoice in this phase).

## Role matrix

- Clinical permissions reused: mutations `patient.clinical.write`
  (OWNER/ADMIN/DENTIST), reads `patient.clinical.read`. RECEPTIONIST neither.

## Tasks

- [x] **P16-01: Treatment plan schema**
  - `treatment_plans`: org, patient composite FK, title bounded, status
    (DRAFT/PRESENTED/ACKNOWLEDGED), version, created_by, timestamps. RLS +
    zero grants + indexes. **Immutability trigger**: PRESENTED/ACKNOWLEDGED
    plans cannot be UPDATE/DELETE.
  - `treatment_plan_items`: org, plan FK, line_no, procedure (org FK nullable),
    tooth_code (nullable FDI), description bounded, estimated_fee numeric
    nullable (>=0, bounded), timestamps. RLS + zero grants.
  - `treatment_plan_alternatives`: org, plan FK, alternative_no, summary
    bounded, timestamps. RLS + zero grants.
  - `treatment_plan_discussions`: org, plan FK, discussed_by (auth.users),
    treating_provider (org FK), discussed_at, context (bounded <=200), notes
    (bounded <=4000). RLS + zero grants.
  - `treatment_plan_drawings`: org, plan FK, drawing jsonb (bounded object,
    renderer-independent), updated_by, updated_at, version. RLS + zero grants.
  - pgTAP for all.

- [x] **P16-02: Treatment plan RPCs**
  - `create_treatment_plan` (clinical.write; status DRAFT; audit
    'treatment.plan.created' {}), `update_treatment_plan` (DRAFT only;
    versioned; audit), `present_treatment_plan` (DRAFT→PRESENTED; audit),
    `acknowledge_treatment_plan` (PRESENTED→ACKNOWLEDGED; after this the plan
    is immutable; audit), `add_treatment_plan_item` / `update_treatment_plan_item`
    / `remove_treatment_plan_item` (DRAFT only; audit each),
    `add_treatment_plan_alternative` (DRAFT only; audit),
    `add_treatment_plan_discussion` (any non-ACKNOWLEDGED? allow on DRAFT/
    PRESENTED/ACKNOWLEDGED — discussions are append-only, audit),
    `save_treatment_plan_drawing` (DRAFT/PRESENTED only — immutable after
    acknowledge; versioned; audit), `list_treatment_plans` /
    `get_treatment_plan_detail` (clinical.read; bounded; drawing included only
    in detail; no audit on read).
  - Immutable plan trigger + pgTAP (acknowledged cannot be overwritten via RPC
    or direct SQL; drawing persists; discussion captures dentist/time/context;
    audit per mutation with rollback test; tenant isolation; reception denied).

- [x] **P16-03: Document integration + services + UI**
  - Extend Phase 11: add `TREATMENT_PLAN` to the documents document_type CHECK
    (additive ALTER + column CHECK replace) and to generate_document handling
    (snapshot = plan detail incl. items/alternatives/drawing reference) +
    document permission tests + pgTAP update.
  - `src/lib/treatment-plan/` service layer (schemas/types/errors/service) +
    offline tests.
  - Patient Clinical "Treatment plan" tab: plan list, create/edit (DRAFT items/
    alternatives), present/acknowledge flow, drawing canvas (simple stroke
    capture persisted via save_treatment_plan_drawing; renderer-independent),
    discussion add + history (dentist/time/context), print button → Phase 11
    document snapshot print route. Gated on clinical.read/write; RECEPTIONIST
    sees nothing. 44px, phone/desktop, print CSS. Tests.

- [x] **P16-04: Integration verification + phase review**

## Explicitly deferred

- X-ray/photo annotation (deferred within phase scope).
- Fixed procedure prices / fee engine (Phase 21).
- Insurance/HMO estimation (Phase 21/23).
- Patient portal acknowledgment (Phase 24/digital consent Phase 17).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 16)

- drawing persists to patient record (treatment_plan_drawings + detail);
- drawing can be added to treatment-plan PDF (document snapshot includes
  drawing reference + print seam);
- original X-ray/image remains unchanged (drawing never writes images);
- acknowledged plan cannot be silently overwritten (immutable trigger);
- patient discussion documentation includes dentist/time/context.

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.