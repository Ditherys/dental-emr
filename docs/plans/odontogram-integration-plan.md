# Customized Odontogram Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` when explicitly authorized and
> available, or `superpowers:executing-plans`, and follow test-driven development
> task by task.

**Status:** Accepted by the project owner on 2026-08-28. Execute O0-O4 only,
after billing B0-B11 is complete, under ADR-027; see
`docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`.

**Goal:** Replace the Phase 15 schematic chart with an EMR-native, database-
authoritative clinical odontogram using the customized fork's measured engine
and renderer while excluding Classic and the demo application.

**Architecture:** Evolve the existing relational condition/history model,
extract pure clinical behavior from the fork, adapt the measured renderer behind
a controlled component boundary, and rebuild workflows with the EMR's patient
workspace, authorization, audit, treatment-plan, and billing services.

**Source fork:**
`C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul` at `5e28d93` exactly.
Uncommitted and untracked fork content is not a source input.

**Target:** `C:\Users\Latitude 7430\Desktop\dental-emr` on main.

## Global Constraints

- Do not create a branch or worktree.
- Do not modify the source fork; selectively port reviewed code and preserve its
  MIT notice.
- Treat the fork's tracked worktree line-ending differences and untracked output
  directories as out of scope.
- Billing plan B0-B11 must be accepted and complete before O0.
- Use forward-only migrations; do not reset or wipe the database.
- Keep canonical data independent of fork status JSON and SVG geometry.
- Use FDI as canonical notation; Universal/Palmer are display conversions.
- Exclude Classic, demo shell, localStorage persistence, tour, demo settings,
  theme/language controls, and demo build/deployment infrastructure.
- Preserve current Phase 15 rows and audit history through explicit migration.
- Every production behavior uses RED -> GREEN -> REFACTOR.
- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/` before
  changing App Router/server-action code.
- ADR-030 amends O12 for staged FHIR/JSON interchange, authorized output,
  private clinical photographs, and chronological progress; it preserves
  ADR-029's local-only completion and deferred Cloud TEST release gate.

## Planned Target Structure

Existing domain files evolve under `src/lib/odontogram/`:

- `types.ts`, `schema.ts`, `errors.ts`, `service.ts`
- `dentition.ts` — FDI tooth/dentition/notation conversion
- `clinical-codes.ts` — accepted finding/treatment/material vocabulary
- `validation.ts` — pure tooth/surface/component/span validators
- `state.ts` — renderer-independent patient chart projection
- `bridge.ts` — bridge validation and unit projection
- `implant.ts` — implant component validation/projection
- `perio.ts` — measurement validation and fork-derived calculations
- Matching focused unit tests

Renderer files live under `src/components/odontogram/`:

- `measured-chart.tsx`
- `measured-tooth.tsx`
- `measured-assets.ts`
- `overlay-registry.ts`
- `bridge-overlay.tsx`
- `perio-chart.tsx`
- `renderer-adapter.ts`
- `styles.css`
- `assets/measured/*.svg`
- Focused renderer/a11y/regression tests

Patient workspace files:

- Evolve `src/app/(emr)/patients/[patientId]/odontogram-section.tsx`
- Evolve `odontogram-actions.ts` and their tests
- Add `odontogram-toolbar.tsx`, `tooth-inspector.tsx`,
  `bridge-workflow.tsx`, `implant-workflow.tsx`, `perio-workspace.tsx`, and tests

Database sequence starts after billing at `20260828020000`:

- `20260828020000_odontogram_domain_expansion.sql`
- `20260828020100_odontogram_relationships.sql`
- `20260828020200_odontogram_perio.sql`
- `20260828020300_treatment_item_execution.sql`
- `20260828020350_odontogram_permission_contract.sql`
- `20260828020400_odontogram_rpcs.sql`
- `20260828020401_odontogram_rpcs_grants.sql`

These numbers are reserved by the accepted sequential plan. If a conflicting
migration is committed before execution, stop for plan revision rather than
renumbering silently.

ADR-030 adds the following guarded forward-only revamp sequence. These files
extend rather than rewrite the existing migration history:

- `20260830010000_odontogram_feature_details.sql`
- `20260830010100_procedure_cases_and_plan_details.sql`
- `20260830010200_odontogram_revamp_permission_contract.sql`
- `20260830010300_odontogram_revamp_rpcs.sql`
- `20260830010301_odontogram_revamp_rpcs_grants.sql`
- `20260830010400_procedure_installment_schedules.sql`
- `20260830010500_clinical_photographs.sql`
- `20260830010600_clinical_photo_rpcs.sql`
- `20260830010601_clinical_photo_rpcs_grants.sql`
- `20260830010700_odontogram_import_staging.sql`
- `20260830010800_odontogram_interchange_and_progress_rpcs.sql`
- `20260830010801_odontogram_interchange_and_progress_grants.sql`
- `20260830010900_odontogram_drawing_retirement.sql`
- `20260830011000_odontogram_revamp_terminal_grants.sql`

Each remains subject to the existing RLS, zero-base-grant, composite tenant-FK,
safe-definer, audit, idempotency, and local-only verification requirements.

## Fork Dependency Disposition

Do not copy the fork manifest or lockfile. The audited fork dependencies are
classified exhaustively:

| Fork package(s) | Disposition in EMR |
| --- | --- |
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | Already present; use EMR React 19/Next versions, never downgrade to fork React 18 |
| `@testing-library/react`, `@testing-library/jest-dom`, `vitest`, `jsdom` | Already present; port tests to the EMR versions/configuration |
| `eslint`, `typescript` | Already present; use EMR strict TypeScript and ESLint configuration |
| `tailwindcss` | Already present as Tailwind 4; reimplement styles with EMR tokens rather than copying Tailwind 3 configuration |
| `dompurify` | Unnecessary: plugin/runtime SVG injection is omitted and static SVG renders as React nodes |
| `jspdf` | Unnecessary: fork PDF export is omitted; use existing EMR print behavior |
| `@types/fhir` | Unnecessary in this phase: FHIR import/export is omitted and reference mappings are ported only as dependency-free domain fixtures where accepted |
| `vite`, `@vitejs/plugin-react`, `vite-plugin-dts`, `@microsoft/api-extractor`, `typedoc` | Source-library build/publishing only; omit because Next.js owns the target build |
| `gh-pages` | Demo hosting only; omit |
| `autoprefixer`, `postcss` | Replace with the existing Next.js/Tailwind pipeline; do not add fork versions |
| `@eslint/js`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`, `globals`, `jiti` | Fork lint/config support; use the existing EMR lint/toolchain and add none solely for this port |

No new runtime dependency is currently justified. If implementation discovers a
new necessity, stop that task for license, maintenance, security, Next.js 16,
React 19, and migration-cost review rather than silently installing it.

## Task Gate Matrix

This matrix is normative. It supplies each task's dependencies, exact primary
files, tests, verification, and done condition; the task sections supply the
detailed source mapping and actions.

| Task | Depends on | Exact primary files | Exact tests | Verification | Done condition |
| --- | --- | --- | --- | --- | --- |
| O0 | Accepted billing B11 | Odontogram spec/plan, new renderer ADR, `THIRD_PARTY_NOTICES.md`, `docs/AI_HANDOFF.md`, acceptance record | Existing fork suite and current EMR odontogram/treatment-plan suites | Fork `test`/`build:lib`; focused EMR unit/pgTAP | SHA/license/baselines reviewed independently and accepted |
| O1 | O0 | `src/lib/odontogram/{dentition,clinical-codes,validation,state}.ts` plus existing schema/types | Matching `*.test.ts` files and sanitized fixtures | Focused Vitest, lint, typecheck | Pure engine has no DOM/React/storage/renderer dependency |
| O2 | O1 | Domain-expansion migration, `src/lib/odontogram/{schema,types,service}.ts`, generated types | `odontogram_domain_expansion.test.sql`, existing odontogram unit/pgTAP | pgTAP, migration lint, types check | Every Phase 15 status/finding/surface combination maps once without invented semantics |
| O3 | O1-O2 | Relationship migration, `src/lib/odontogram/{bridge,implant}.ts` | Bridge/implant unit tests, `odontogram_relationships.test.sql`, concurrency probe | Unit/pgTAP/concurrency | Frozen designs, materialized current relationships, amendments, voids, and component chains persist atomically |
| O4 | O1-O2 | Perio migration, `src/lib/odontogram/perio.ts` | `perio.test.ts`, `periodontal_charting.test.sql` | Unit/pgTAP | Six-site measurements/CAL/final history round-trip |
| O5 | O2-O4 | RPC/grant migrations, clinical correction permission, odontogram service/schema/types/errors, patient actions, generated types | `odontogram_rpcs_v2.test.sql`, permission/service/action tests | Unit/pgTAP/grant lint/types check | Only bounded authorized DTOs/RPCs are reachable; correction is OWNER/ADMIN-only by default |
| O6 | O1, O3-O5 | `src/components/odontogram/*`, measured SVG assets, `THIRD_PARTY_NOTICES.md` | Renderer/a11y/regression tests under the same component directory | Vitest, lint, typecheck, build | Measured fixes pass; Classic/demo/injection code is absent |
| O7 | O5-O6 | Patient odontogram section/actions, toolbar, inspector | Existing and new patient odontogram `*.test.ts(x)` | Vitest plus approved responsive E2E | Correct patient chart persists/reloads and UI state resets on patient change |
| O8 | Billing B11, O2-O7 | Treatment execution migration; treatment-plan and odontogram services/actions/UI | Execution-history pgTAP and treatment-plan/odontogram integration tests | Unit/pgTAP/reload integration | Acknowledged proposal content stays immutable; execution is append-only and completion returns clinical/charge IDs atomically |
| O9 | O3, O6-O8 | Bridge/implant workflow components/actions and renderer overlays | Matching workflow tests plus relationship pgTAP | Unit/component/action/pgTAP | Draft edit, frozen design, completion materialization, current amendment/void preserve unit/component semantics |
| O10 | O4-O7 | Perio workspace/actions and renderer chart | Perio component/action tests plus perio pgTAP | Unit/component/pgTAP/responsive E2E | Exam entry/finalize/amend is keyboard-safe and persistent |
| O11 | O6-O10 | Odontogram components/styles and guarded Playwright specs | Component a11y tests and Playwright axe/keyboard/responsive specs | Vitest and guarded Playwright | Core workflows are keyboard/touch/non-color operable |
| O12 | O5-O11 | Staged interchange/progress migrations and RPCs, private clinical media, patient print/history components | Import/export/progress/media component/action/pgTAP tests | Unit/build/manual synthetic print and local storage review | Staged import, authorized output, private photo gallery, and attributable chronology work without a second canonical channel |
| O13 | O2-O12 | Guarded drawing-retirement/terminal-grant migrations, obsolete Phase 15 RPC/service/UI removal | Migration compatibility, synthetic-drawing guard, and absence checks | pgTAP, `rg`, full unit/build/security | One canonical write model and measured renderer remain; unrecognized drawing data fails closed |
| O14 | O1-O13 | Test registries, generated types, evidence/handoff/local acceptance record | Full required local matrix plus guarded hosted-spec discovery | Full authorized local command set; Cloud TEST deferred | Locally implemented and verified only; Cloud TEST, independent release review, and final owner acceptance remain pending |

## O0 — Independent Review, Baseline, and Source Pin

**Objective:** Approve the exact integration boundary and prove both baselines.

**Inspect:**

- This specification and plan
- `docs/plans/015-odontogram.md`
- `docs/plans/016-treatment-plans.md`
- Billing specification/plan/acceptance evidence
- `src/lib/odontogram/*`
- Existing odontogram migrations/tests/UI
- Fork `package.json`, `LICENSE`, `src/index.ts`, `src/App.tsx`,
  `src/odontogram.ts`, and fork regression suites

**Create/modify:**

- Create a proposed odontogram renderer/domain ADR after billing ADR numbers.
- Record independent review and explicit owner acceptance.
- Create `THIRD_PARTY_NOTICES.md` containing the fork's upstream MIT notice,
  controlled source URL, and pinned source commit.
- Update `docs/AI_HANDOFF.md` at the accepted checkpoint.

**Steps:**

1. Confirm `git rev-parse HEAD` is exactly `5e28d93` and record SHA/license in
   the ADR. Any later source change requires a committed, reviewed, newly pinned
   SHA and plan revision.
2. Confirm the tracked fork is semantically clean with
   `git diff --ignore-space-at-eol --ignore-cr-at-eol --exit-code`. Untracked
   files and any remaining semantic diff are excluded; stop if clinical code
   differs.
3. Run fork test/build commands without updating goldens or lockfiles.
4. Run existing EMR odontogram/treatment-plan tests.
5. Independently review local-fix preservation, tenancy, lifecycle, bridge,
   implant, perio, migration, and dependency decisions.
6. Obtain explicit acceptance before O1.

**Verification:**

```powershell
npm test -- --run
npm run build:lib
```

Run those in the fork. In the EMR run focused existing odontogram and treatment-
plan unit/pgTAP suites.

**Acceptance:** Exact source revision, license, semantic-clean result, baseline
results, excluded untracked paths, and approval are recorded. No implementation
proceeds otherwise.

## O1 — Fork Domain Extraction and Compatibility Fixtures

**Objective:** Extract pure clinical types/validation without DOM, module-global
state, React context, FHIR, PDF, or persistence.

**Source:**

- `src/odontogram.ts`
- `src/registry/types.ts`
- `src/registry/axes.ts`
- `src/registry/restorations.ts`
- `src/registry/validate.ts`
- `src/utils/numbering.ts`
- Relevant registry and parity tests

**Target:** `src/lib/odontogram/` files in the planned target structure.

**Steps:**

1. Write failing EMR tests defining canonical FDI teeth, primary/permanent
   dentition, display notation, surfaces, entry kinds, materials, restoration
   types, endodontic states, wear/discoloration/orthodontic codes, and invalid
   combinations.
2. Create sanitized compatibility fixtures from synthetic fork states; include
   no patient data and no full fork status blob in production interfaces.
3. Port the minimum pure constants/validators and rename library-specific values
   at the adapter boundary.
4. Ensure domain modules contain no `window`, DOM query, React, localStorage,
   jsPDF, FHIR, CSS, or asset imports.
5. Document mapping failures explicitly; never coerce an unknown clinical value
   to OTHER silently during persistence.

**Dependencies:** O0 only.

**Data/auth/UI impact:** None yet.

**Tests:** Unit tests for every accepted code, invalid tooth/surface/component
combination, primary dentition, and notation round trip.

**Verification:** Focused Vitest, `lint`, `typecheck`.

**Acceptance:** Pure domain fixtures reproduce accepted fork semantics without
fork globals or renderer types.

## O2 — Relational Clinical Schema Evolution

**Objective:** Evolve `tooth_conditions` into structured findings/treatments
without losing Phase 15 history.

**Inspect:**

- Existing tooth-condition schema/RPC migrations and pgTAP
- `src/lib/odontogram/*`
- `src/types/database.generated.ts`
- Audit and tenant-FK conventions

**Create/modify:**

- Create `20260828020000_odontogram_domain_expansion.sql`.
- Add `supabase/tests/odontogram_domain_expansion.test.sql`.
- Modify generated types only through the guarded workflow.

**Schema design:**

- Add stable clinical vocabulary tables or constrained codes for entry kind,
  clinical code, material, subtype, and lifecycle.
- Preserve every `tooth_conditions.id` as a unique
  `legacy_tooth_condition_id`, together with source status/finding/surface,
  notes, recorder, timestamps, void state, and version. The target row has
  provenance `LEGACY_PHASE15`; no provider, bridge span, implant, plan item, or
  clinical completion is inferred.
- Add normalized `tooth_clinical_entries` when extension of the existing table
  would retain incompatible one-surface/coarse semantics; otherwise rename only
  through a proved forward migration. Do not maintain two writable truths.
- Add `tooth_clinical_entry_surfaces` for multi-surface membership.
- Include treating provider, encounter, treatment-plan item, charge, effective/
  completed/void/amend timestamps, recorder, and optimistic version.
- Use entries plus revisions/voids for history; terminal clinical records are
  amended/superseded, not overwritten.

**Steps:**

1. Write pgTAP cross-product fixtures for every Phase 15 status/finding class and
   all eight surfaces before the migration. Assert this normative mapping:
   ACTIVE CARIES/FRACTURE/MISSING/OTHER -> FINDING/EXISTING; ACTIVE
   RESTORATION/CROWN/SEALANT -> TREATMENT/PREEXISTING; ACTIVE BRIDGE ->
   LEGACY_BRIDGE_MARKER; every PLANNED row -> LEGACY_UNLINKED_PLANNED;
   COMPLETED RESTORATION/CROWN/SEALANT -> TREATMENT/COMPLETED_LEGACY;
   COMPLETED CARIES/FRACTURE/MISSING/OTHER -> LEGACY_TERMINAL_UNCLASSIFIED;
   COMPLETED BRIDGE -> LEGACY_BRIDGE_MARKER; and every REFERRED row ->
   LEGACY_REFERRED. Terminal-unclassified, referred, and voided rows cannot alter
   the current-state projection.
2. Assert O/B/L/M/D/I/F creates exactly one normalized surface association and
   FULL sets whole-tooth with none. Unknown or unmapped values abort instead of
   coercing to OTHER. Assert source/target counts, unique legacy identifiers,
   rerun idempotency, and preservation of original fields.
3. Test buccal amalgam, multi-surface composite, crown, missing, planned
   extraction, completed extraction, root canal, and pre-existing external work.
4. Add tenant-safe FKs, constraints, indexes, RLS, comments, and zero grants.
5. Backfill Phase 15 rows transactionally; assert row counts and mapping totals.
6. Keep the old public RPC contract operational only through a temporary adapter
   until O5 switches application reads, then remove it in a later forward
   migration rather than leaving competing mutation paths.
7. Project ambiguous bridge/planned/terminal legacy rows as reconciliation flags.
   Resolution either links an explicitly created canonical entry/bridge/plan
   relationship or records NO_CURRENT_STATE; it never edits legacy provenance or
   fills historical provider/span fields.

**Authorization:** No new browser grants.

**Verification:** pgTAP, migration lint, type generation/check.

**Acceptance:** Every existing Phase 15 row is represented once, queryable in
history, and no opaque renderer data or SVG geometry exists in the schema.

## O3 — Bridge and Implant Relationships

**Objective:** Persist prosthetic relationships atomically and independently of
icons.

**Source:**

- Fork `src/bridgeOverlay.ts`
- Bridge/prosthesis/status-extra logic in `src/odontogram.ts`
- `src/registry/restorations.ts`
- `src/registry/__tests__/prosthesis.test.ts`
- `src/__tests__/bridgeOverlay.test.ts`
- `src/__tests__/sp15-bridge.test.ts`

**Target:**

- `src/lib/odontogram/bridge.ts`
- `src/lib/odontogram/implant.ts`
- New relationship migration and pgTAP suites

**Schema:**

- `dental_bridges`: organization, patient, record kind PLAN_DESIGN/CURRENT,
  support/prosthesis type, nullable parent plan item for designs, provenance,
  treating provider/execution/charge for current records, nullable
  `supersedes_bridge_id`, nullable `sealed_at`, version, and timestamps.
  PLAN_DESIGN and CURRENT
  columns have exact conditional checks; current state is the latest nonvoid
  successor, not a mutable lifecycle field.
- `dental_bridge_units`: organization, bridge, tooth position, ordinal, role
  ABUTMENT/PONTIC, support kind NATURAL_TOOTH/IMPLANT_COMPONENT/NONE, and nullable
  `support_component_id`. ABUTMENT requires natural or implant support; implant
  support requires a compatible component chain at that patient/position;
  PONTIC requires NONE and no component. Bridge natural/implant/mixed mode is
  derived from units rather than independently mutable.
- `dental_implant_components`: patient/tooth position, FIXTURE/ABUTMENT/CROWN,
  PLAN_DESIGN/CURRENT record kind, `depends_on_component_id`, nullable parent
  plan item for designs, INTERNAL/PREEXISTING_EXTERNAL provenance for current
  records, provider/execution/charge fields, nullable `supersedes_component_id`,
  version, and timestamps. A pre-existing external implant with unknown fixture
  history uses an explicit PREEXISTING_EXTERNAL CURRENT fixture placeholder with
  UNKNOWN details, not a missing dependency.
- Append-only `dental_bridge_voids` and `dental_implant_component_voids`. A
  sealed CURRENT bridge rejects unit INSERT/UPDATE/DELETE and structural parent
  UPDATE/DELETE. A CURRENT implant component rejects dependency/position/type
  UPDATE/DELETE; correction uses a successor or void.
  Amendment creates a successor row/units linked through `supersedes_*`; void
  creates an event. Current projection excludes superseded/void records.
- `odontogram_legacy_resolutions`: append-only and uniquely keyed to an ambiguous
  legacy entry, with LINK_CANONICAL/NO_CURRENT_STATE kind; separate nullable
  tenant-safe FKs for resolved clinical entry, bridge, and treatment-plan item;
  an exact-one-or-none check based on resolution kind; actor/time/reason/audit.

**Steps:**

1. Write failing pure tests for arbitrary spans, 24-25-26 roles, mixed natural/
   implant support, derived support mode, duplicate positions, invalid gaps, and
   edit/remove behavior.
2. Write failing pgTAP for atomic creation/edit/void/amendment, tenant FKs,
   PLAN_DESIGN/CURRENT separation, rollback, and concurrency. Cover: internal
   abutment -> same-patient/position fixture, crown -> abutment, CURRENT component
   -> CURRENT predecessor, PLAN_DESIGN component -> compatible design or CURRENT
   predecessor, completion-time revalidation, PREEXISTING_EXTERNAL placeholder
   provenance, record-kind/execution compatibility, and invalid implant-supported
   pontic/abutment combinations.
3. Add schema and constraints.
4. Port only geometry-independent bridge validation; renderer coordinates stay
   in O6.
5. Lock and validate component chains and ordered bridge units in the same
   transaction. Construct a CURRENT bridge/successor and all units while
   `sealed_at` is null, validate the complete relationship, set `sealed_at` once,
   and expose only sealed rows. A failed operation leaves no partial units/
   components; concurrent construction cannot publish an incomplete bridge.
6. Permit PLAN_DESIGN insert/update/delete only while its linked parent plan is
   DRAFT. Parent-plan triggers also reject direct design/unit/component mutation
   after PRESENTED/ACKNOWLEDGED. Completion creates separate CURRENT records and
   never changes the frozen design. Database triggers reject UPDATE/DELETE of
   sealed CURRENT bridges/units, including unit INSERT, and reject in-place
   CURRENT component mutation; amendment/void are append-only and each bridge
   successor is atomically sealed.
7. Prove initial atomic bridge/unit creation succeeds; post-seal unit INSERT/
   UPDATE/DELETE and structural parent edits fail; amendment seals a complete
   successor; predecessor units remain byte-for-byte unchanged; and failed/
   concurrent construction exposes no partial bridge.

**Verification:** Focused unit/pgTAP/concurrency tests.

**Acceptance:** Bridges and implants survive reload as clinical relationships;
no three-unit hardcoding or icon-only implant state.

## O4 — Periodontal Examination Schema and Engine

**Objective:** Persist fork-compatible periodontal examinations and reuse its
validated calculations.

**Source:**

- `src/PerioChart.tsx`, `src/perioGraphic.ts`, `src/perioClassification.ts`
- `src/registry/axes.ts`, `src/registry/validate.ts`
- Fork perio P1/P2/P2b/PG* tests, keyboard tests, implant tests

**Target:**

- `src/lib/odontogram/perio.ts`
- `20260828020200_odontogram_perio.sql`
- `supabase/tests/periodontal_charting.test.sql`

**Schema:**

- `periodontal_examinations`: organization, patient, encounter, status DRAFT/
  FINAL, examined/finalized actor/provider/time, nullable predecessor examination,
  and monotonically increasing examination version. An amendment is a new row,
  never an AMENDED mutation of the predecessor.
- `periodontal_site_measurements`: examination, tooth, canonical site
  MB/B/DB/ML/L/DL, integer `probing_depth_mm` 1..15, signed integer
  `gingival_margin_mm` -10..20 defaulting to zero for a charted site, generated/
  constrained `cal_mm = probing_depth_mm + gingival_margin_mm`, bleeding,
  suppuration, and presence/implant context. No row means uncharted; zero probing
  depth is invalid.
- `periodontal_plaque_measurements`: examination, tooth, distinct O'Leary surface
  MESIAL/DISTAL/BUCCAL/LINGUAL and presence.
- `periodontal_tooth_measurements`: examination, tooth, mobility and implant
  context; `periodontal_furcation_measurements` stores grade I-IV per
  anatomically valid entrance.

**Steps:**

1. Write failing tests that transplant exact fork semantics: MB/B/DB/ML/L/DL;
   PD 1..15 with absence rather than zero; signed gingival margin -10..20 where
   positive is recession; CAL = PD + gingival margin (range -9..35); BOP/
   suppuration only at charted sites; separate four-surface plaque; missing-tooth
   behavior; mobility/furcation constraints; and implant exclusions.
2. Isolate calculations from DOM/chart rendering.
3. Add relational schema with timestamped finalized history. Database triggers
   reject INSERT/UPDATE/DELETE in every child table when its parent is FINAL,
   reject FINAL parent reopen/update/delete, and freeze predecessor, version,
   provider, and finalization identity. Amendment atomically creates a new DRAFT
   examination with predecessor/version, copies prior children, applies
   authorized edits, and can then be finalized.
4. Prohibit measurements for missing/non-applicable positions according to
   accepted fork behavior.
5. Keep advanced indices/classifications hidden until all required inputs are
   persisted and tested.

**Authorization:** `patient.clinical.read/write`; no client-only enforcement.

**Verification:** Unit/pgTAP, including six-site navigation fixtures and direct
post-FINAL insert/update/delete/reopen attempts for every child/parent table.

**Acceptance:** Measurements and derived CAL round-trip exactly and finalized
history cannot be silently overwritten.

## O5 — RPCs, Service DTOs, Authorization, and Audit

**Objective:** Expose granular patient-scoped clinical mutations and bounded
chart reads.

**Inspect:** Existing odontogram, treatment-plan, billing, authorization, and
audit services/migrations.

**Create/modify:**

- Create `20260828020400_odontogram_rpcs.sql` and
  `20260828020401_odontogram_rpcs_grants.sql`.
- Create `20260828020350_odontogram_permission_contract.sql` and
  `supabase/tests/odontogram_permission_contract.test.sql`.
- Rewrite `src/lib/odontogram/service.ts`, schemas/types/errors and tests.
- Rewrite patient `odontogram-actions.ts` and tests.
- Add pgTAP authorization/RPC suites and register them in test guards.

**Required operations:**

- `get_patient_odontogram`
- `record_tooth_clinical_entry`
- `amend_tooth_clinical_entry`
- `void_tooth_clinical_entry`
- `resolve_legacy_odontogram_entry`
- `create_plan_bridge_design`, `update_draft_plan_bridge_design`
- `record_current_bridge`, `amend_current_bridge`, `void_current_bridge`
- `create_plan_implant_design`, `update_draft_plan_implant_design`
- `record_current_implant_component`, `amend_current_implant_component`,
  `void_current_implant_component`
- `create_periodontal_examination`
- `save_periodontal_measurements`
- `finalize_periodontal_examination`
- `amend_periodontal_examination`
- `transition_treatment_plan_item_execution` for ACCEPTED/IN_PROGRESS/CANCELLED
- `complete_treatment_plan_item_with_charge` for atomic COMPLETED clinical/
  financial creation
- `correct_treatment_plan_item_execution` for the elevated append-only
  nonterminal-only superseding-event path

**Steps:**

1. Write failing service and direct-RPC authorization tests first.
2. Add `patient.clinical.correct` to the permission contract, application union,
   and tests, with fixed OWNER/ADMIN defaults only. The permission does not imply
   clinical read/write and is required in addition to the applicable patient
   permission for execution correction.
3. Derive organization and actor from authenticated context/acting branch.
4. Validate patient, provider, encounter, plan item, charge, bridge units, and
   perio relations in the same organization.
5. Use safe denials for missing/foreign targets and optimistic versions for edits.
6. Append bounded clinical audit events atomically.
7. Return a renderer-independent patient chart DTO; never return fork state JSON.
8. Cap projections and measurement batches with documented clinical-safe limits.
9. Require both `patient.clinical.write` and `patient.clinical.correct` for every
   `resolve_legacy_odontogram_entry`, whether LINK_CANONICAL or NO_CURRENT_STATE;
   reject ADMIN without applicable patient access, ordinary dentist without the
   correction permission, and duplicate resolution. Require reason/audit and
   preserve the legacy row.

**Verification:** Service tests, pgTAP positive/negative, grant inventory,
migration lint, secret scan.

**Acceptance:** Only authorized patient-scoped DTOs and mutations are reachable;
base tables remain inaccessible.

## O6 — Measured Renderer and SVG Asset Transplant

**Objective:** Reuse the customized measured rendering behavior while leaving
Classic and demo UI behind.

**Source:**

- `src/assets/teeth-svgs/measured/*`
- `src/odontogram.ts` measured-profile builders only
- `src/registry/svgActivate.ts`, `svgLayers.ts`, `restorations.ts`
- `src/bridgeOverlay.ts`, `src/perioGraphic.ts`
- `src/index.css` measured selectors only
- `tools/toothgen/*` as provenance/verification tooling

**Target:** `src/components/odontogram/` renderer structure and third-party
notices.

**Steps:**

1. Write failing renderer fixtures for every permanent/primary template,
   front/occlusal hit area, surface activation, crown/filling/root-canal/onlay,
   implant, bridge/pontic, and selected/hover/focus state.
2. Copy measured assets without reauthoring anatomy.
3. Build a declarative React renderer from domain DTOs. Do not transplant the
   fork's module-global engine or DOM query/wiring wholesale.
4. Port overlay registration and bridge geometry through stable renderer asset
   descriptors.
5. Render only reviewed static measured assets through React/SVG nodes. Do not
   use `dangerouslySetInnerHTML`, plugin SVG, or runtime HTML/SVG injection.
6. Copy only measured CSS, rename/scope selectors to the component, and prevent
   global EMR style leakage.
7. Do not copy Classic assets, Classic profile switch, demo settings, jsPDF,
   FHIR, tour, persistence, or Vite tooling.

**Dependency audit:** React/React DOM/testing are already present. Add no fork
runtime dependency: DOMPurify is unnecessary because injection is prohibited,
and jsPDF is unnecessary. No fork package.json or lockfile is copied.

**Verification:** Renderer/unit tests, visual snapshots limited to stable DOM/
asset semantics, `lint`, `typecheck`, `build`.

**Acceptance:** Measured chart matches fork regression behavior, Classic code is
absent, and replacing an SVG requires no domain/schema change.

## O7 — Native Patient Odontogram Workspace

**Objective:** Replace the schematic Phase 15 grid with a dense EMR-native chart
and contextual editor.

**Source reference:** Fork composable surfaces/cards for behavior only:
`src/surfaces/*` and `src/surfaces/cards/*`.

**Target:** Patient odontogram section/actions plus new workspace components.

**Steps:**

1. Write failing component tests for load, patient change reset, tooth/surface
   selection, multi-select, read-only state, error recovery, and reload.
2. Server-load only the selected patient's bounded odontogram DTO.
3. Make the measured chart visually central. Put notation, dentition, current/
   planned view, and perio entry in a compact toolbar.
4. Put selected-tooth details and contextual finding/treatment actions in a
   side inspector on desktop/tablet and sheet/step flow on phone.
5. Use existing shadcn buttons, dialogs, popovers, tabs, form fields, tokens,
   and feedback components.
6. Key all transient state by `patientId`; clear selection/hover/dialog/drafts
   when it changes.
7. Keep rare options out of the primary chart surface.
8. Show ambiguous Phase 15 reconciliation flags in the tooth inspector/history.
   Gate both LINK_CANONICAL and NO_CURRENT_STATE on clinical write plus
   `patient.clinical.correct`, require a reason, and preserve the read-only
   original legacy facts beside the resolution.

**Authorization/UI impact:** Read data only after server authorization. Hide
write affordances without clinical write but still reject direct actions.

**Verification:** Testing Library, action tests, patient A/B rerender regression,
responsive Playwright in approved TEST.

**Acceptance:** Native workspace persists granular edits, reloads correctly,
and cannot carry chart/selection state between patients.

## O8 — Treatment-plan Item Lifecycle and Completion

**Objective:** Make current/planned semantics explicit and connect completion to
clinical/provider/billing records.

**Inspect/modify:**

- `supabase/migrations/20260827013300_treatment_plans.sql` and treatment-plan
  RPC/grant migrations/tests
- `src/lib/treatment-plan/{schema,types,service,service.test}.ts`
- `src/app/(emr)/patients/[patientId]/treatment-plan-actions.ts`,
  `treatment-plan-section.tsx`, and their existing tests
- Billing completion boundary
- Odontogram domain/RPC/service/UI

**Create:**

- `20260828020300_treatment_item_execution.sql`
- `supabase/tests/treatment_item_execution.test.sql`
- Add `src/lib/treatment-plan/execution.ts` and `execution.test.ts`

**Schema:** Keep plan header DRAFT/PRESENTED/ACKNOWLEDGED and keep
`treatment_plan_items` as proposal content. Add a trigger that rejects item
insert/update/delete when its parent is PRESENTED or ACKNOWLEDGED. Add one
`treatment_plan_item_executions` projection per item with current state/version
and nullable completion clinical-entry/bridge/implant/charge links. Add
append-only `treatment_plan_item_execution_events` with state, predecessor event,
actor, event time, reason where required, idempotency, and bounded audit linkage.

**Steps:**

1. Write failing tests proving acknowledged proposal/item content and its
   snapshot cannot be edited/deleted while execution can progress separately.
   Cover legal PROPOSED -> ACCEPTED/CANCELLED, ACCEPTED -> IN_PROGRESS/CANCELLED,
   IN_PROGRESS -> COMPLETED/CANCELLED transitions, every illegal skip, duplicate
   idempotency, stale versions, and direct-table denial. PROPOSED is the only
   state allowed before parent ACKNOWLEDGED; ACCEPTED/IN_PROGRESS/COMPLETED require
   the acknowledged parent and cancellation may terminalize any nonterminal
   execution without editing proposal content.
2. Treat the execution projection as derived from the latest valid event. A
   correction requires `patient.clinical.correct` plus applicable patient access
   and may supersede only latest ACCEPTED -> PROPOSED or IN_PROGRESS -> ACCEPTED,
   with reason/audit. It never updates/deletes history or the proposal item.
   COMPLETED and CANCELLED are terminal in this release: correction RPC attempts
   reject before mutation, including when a completed charge has allocations/
   earnings. Later clinical/charge amendment or void preserves COMPLETED history
   and exposes the linked downstream void state; it does not rewrite execution.
3. Render planned execution states separately from current clinical entries.
4. Implement accept/start/cancel operations without creating existing clinical
   state.
5. Implement completion through the billing transaction: provider required,
   append COMPLETED execution event, update the projection, create the clinical
   entry/bridge/implant change and charge links, and append audits in one
   transaction. Do not mutate the proposal snapshot.
6. In the completion dialog show the frozen estimate and current procedure fee
   only as suggestions, require a decimal-string actual charge input, and show
   provider/service date as server-resolved read-only attribution unless the
   actor uses the separately authorized override flow. Payment entry remains a
   separate account workflow.
7. Test a planned crown, extraction, implant, root canal, and bridge through
   cancellation and completion.
8. Direct-RPC test every nonterminal correction and prove COMPLETED/CANCELLED
   correction rejects atomically with an already allocated charge/provider
   earning unchanged.

**Verification:** Unit, pgTAP, action/component integration, reload.

**Acceptance:** Planned state never masquerades as current; acknowledged plan
content remains immutable; execution history is append-only; completion is
atomic and returns clinical and charge identifiers.

## O9 — Bridge and Implant Workflows

**Objective:** Provide guided, validated editing for relationship-based
prosthetics.

**Create/modify:** `bridge-workflow.tsx`, `implant-workflow.tsx`, actions,
renderer overlays, and tests.

**Steps:**

1. Write failing UI/action tests for arbitrary span selection, ordered unit roles,
   natural/implant/NONE support rules, fixture -> abutment -> crown dependencies,
   pre-existing external placeholders, record-kind/execution compatibility,
   DRAFT design edit, frozen presented design, CURRENT amendment/void,
   cancellation, completion materialization, and rollback.
2. Guide selection as span -> unit roles -> support -> plan/current provenance ->
   confirmation.
3. Render connectors from the bridge DTO; do not infer bridge membership from
   crown overlays.
4. Render fixture, abutment, crown, and supported bridge components separately.
5. Require explicit confirmation before destructive/void operations.
6. Never call a generic in-place update for CURRENT/completed relationships.
   DRAFT plan designs may use versioned update; PRESENTED/ACKNOWLEDGED designs are
   read-only; completion creates separate CURRENT records; current correction
   uses append-only successor/void operations and preserves prior units/components.

**Verification:** Unit/component/action/pgTAP and fork bridge regression fixtures.

**Acceptance:** 24-25-26 and longer DRAFT designs edit atomically, frozen designs
materialize without mutation, current amendment/void preserves history, and
pontic/abutment semantics remain distinct after reload.

## O10 — Periodontal Workspace

**Objective:** Rebuild the fork's useful periodontal workflow in the EMR UI.

**Source:** Fork Perio components/graphics and perio keyboard/validation suites.

**Target:** `perio-workspace.tsx`, renderer perio chart, actions, services/tests.

**Steps:**

1. Write failing tests for six-site keyboard progression, numeric bounds,
   recession/CAL, bleeding, suppuration, plaque, mobility, furcation, missing
   teeth, implant context, save/reload, finalize, and amend.
2. Render a dense chart with synchronized numeric grid and visualization.
3. Support keyboard-first data entry and pointer/touch alternatives.
4. Save bounded granular batches; do not replace the entire patient odontogram.
5. Show examination date/provider/status and historical comparison.

**Verification:** Unit/component/action/pgTAP; tablet/phone/desktop Playwright.

**Acceptance:** Complete synthetic periodontal examination persists with exact
CAL and history; missing/implant validations match accepted fork behavior.

## O11 — Accessibility, Keyboard, and Responsive Hardening

**Objective:** Make graphical interactions operable and understandable without
a mouse or color-only cues.

**Source:** Fork `src/__tests__/a11y.test.ts`, `touch.test.ts`,
`perio-p2-keyboard.test.ts`, and relevant composable surface tests.

**Steps:**

1. Add accessible names for tooth, notation, surface, clinical state, and bridge
   role.
2. Implement roving focus or equivalent predictable tooth navigation.
3. Test focus visibility/return, disabled state, dialogs, inspector/sheet, and
   escape behavior.
4. Add text/pattern/icon semantics for current/planned and clinical states.
5. Verify no horizontal page overflow at representative phone/tablet/desktop
   widths; allow deliberate internal chart pan/zoom where needed.
6. Provide a safe phone viewing and stepwise edit experience.

**Verification:** Testing Library, axe Playwright, keyboard Playwright,
responsive screenshots in guarded TEST.

**Acceptance:** Core charting and perio workflows are keyboard operable,
touch-safe, and non-color dependent.

## O12 — Staged Import, Authorized Export, Private Media, Print, and Progress

**Objective:** Deliver a complete authorized longitudinal record without
importing fork demo infrastructure or creating a second canonical channel.

**Steps:**

1. Stage bounded FHIR R4 and versioned EMR JSON imports only after patient/actor
   authorization; validate supported content and tenant association, show a
   diff, and require dentist confirmation before a transaction appends accepted
   canonical records with provenance. Parsing alone never writes clinical truth.
2. Generate audited, server-authorized FHIR R4, versioned EMR JSON, PDF/print,
   and bounded SVG/PNG output from canonical data. Never export raw fork state,
   use jsPDF, or send protected payloads to unreviewed third parties.
3. Add a private clinical-photo gallery through the approved MinIO/R2 adapter:
   preserve originals, use fixed approved derivatives, permission-check delivery,
   retain processing/failure status, and prevent derivative recursion.
4. Display a bounded stable-cursor chronological projection of authorized
   clinical, plan/execution, case/follow-up, billing, perio, photo, and accepted
   import events while preserving branch-specific financial visibility.
5. Extend the existing EMR print view with measured chart, legend, provider/date,
   current/planned distinction, and attributable history.

**Tests:** Import staging/tenant-isolation and acceptance denial; mapping/version
validation; export authorization/audit; private media source/derivative and
processing tests; chronology ordering/hidden-branch denial; and print DOM/CSS
semantics with synthetic data.

**Verification:** Unit/component/pgTAP/build, local storage smoke/review, and
manual synthetic print review.

**Acceptance:** The four stages—staged import, authorized export, private photo
gallery, and chronological progress projection—are attributable, tenant-safe,
and preserve one canonical persistence model.

## O13 — Migration Compatibility and Cleanup

**Objective:** Complete the Phase 15 upgrade and remove temporary/demo/Classic
compatibility paths.

**Steps:**

1. Prove old Phase 15 rows appear in the new read DTO and UI.
2. Switch all application mutations to new RPCs.
3. Revoke and remove obsolete old mutation RPCs in terminal migration order.
4. Remove the schematic grid only after measured renderer tests pass.
5. Remove temporary translation adapters after data backfill and read cutover.
6. Retire drawing UI and write paths immediately. In a later guarded forward
   migration, revoke drawing mutations, verify every physical drawing row has
   the accepted deterministic synthetic-development marker, delete only those
   rows, then drop the obsolete drawing objects. Any unrecognized row aborts the
   migration with data/schema intact; ambiguous or non-synthetic data is a stop
   condition.
7. Search the target for Classic/demo/localStorage/fork-global/jsPDF/Vite and
   drawing-authoring imports.
8. Verify third-party notices and source pin.

**Verification:** Migration pgTAP, `rg` absence checks, full unit/build/security.

**Acceptance:** One canonical write model and one measured renderer remain; no
Classic, demo, or drawing-authoring infrastructure is maintained, and physical
drawing retirement is fail-closed.

## O14 — Full Regression and Acceptance Gate

**Objective:** Prove clinical behavior, security, local-fork fixes, and local
completion evidence without representing the deferred hosted gate as release
readiness.

**Create/modify:** Add `e2e/odontogram-integration.spec.ts`; extend
`e2e/responsive-accessibility.spec.ts`, guarded test registries, generated-type
checks, evidence, and `docs/AI_HANDOFF.md`.

**Required test mapping:**

| Scenario | Primary layer |
| --- | --- |
| Correct patient load/reload | Action/integration + Playwright |
| Patient and tenant isolation | pgTAP + direct action |
| Authorized/unauthorized clinical edit | pgTAP + action |
| Tooth/surface/multi-selection | Component |
| Caries/restoration/amalgam/crown/missing | Unit + pgTAP + UI |
| Extraction/planned extraction | Lifecycle pgTAP + integration |
| Root canal/post/core | Domain + renderer + persistence |
| Implant fixture/abutment/crown | Domain + pgTAP + renderer |
| Bridge draft/freeze/materialize/amend/void | Unit + pgTAP + integration |
| Pontic vs abutment | Domain + renderer + reload |
| Current/planned/completed/cancelled | Lifecycle pgTAP + UI |
| Treating provider and charge | Atomic database integration |
| Patient plan -> execution -> completed chart -> charge -> payment -> earnings | Database integration + Playwright |
| Audit logging | pgTAP |
| Periodontal recording/CAL/history | Unit + pgTAP + UI |
| Post-FINAL perio child insert/update/delete denial | pgTAP |
| Elevated legacy reconciliation and ordinary-dentist denial | pgTAP + action |
| Dentist payment record allowed only for clinically authorized patient/active receiving branch; adjustment/refund/void/analytics denied | pgTAP + action + Playwright |
| Staged import, authorized FHIR/JSON/PDF/SVG/PNG output, private clinical photo, and chronological progress | pgTAP + action/component + Playwright |
| Unrecognized drawing cleanup row fails closed | pgTAP |
| Responsive/keyboard/accessibility | Playwright/axe |
| Customized fork fixes | Ported regression fixtures/render tests |

**Commands:**

```powershell
npm run db:start:local
npm run db:migrate:local
npm run db:provision:local
npm run test:db:local
npm run db:types:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run security:migrations
npm run security:secrets
npm run security:audit
npm run test:e2e
git diff --check
```

Use only the accepted forward-only local migration command. Do not use
`db:reset:local`. Cloud TEST database, hosted authenticated E2E,
responsive/accessibility, advisor, and security checks remain deferred but
mandatory before production deployment or real provider/patient use.

**Acceptance:** O14 may be recorded only as **locally implemented and verified;
Cloud TEST, independent release review, and final owner acceptance pending**.
It is not release-ready, production-ready, or approved for real provider/patient
use until ADR-029's deferred hosted gate is completed.

## Decision Log

| Decision | Outcome |
| --- | --- |
| Classic | Excluded; no compatibility code |
| Renderer | Customized measured renderer at source commit `5e28d93` |
| Integration method | Selective source transplant, not demo embedding or moving dependency |
| Persistence | EMR relational tables/RPCs; no fork JSON/localStorage truth |
| Canonical notation | FDI; Universal/Palmer display-only |
| Current/planned | Immutable plan-item proposal plus separate append-only execution history and current projection |
| Bridges | Frozen PLAN_DESIGN and separately materialized/amended/voided CURRENT groups with ordered units |
| Implants | Frozen designs and separately materialized CURRENT dependency chains/bridge support references |
| Perio | Exact fork PD/GM/CAL/site semantics; immutable finalized relational versions; rebuilt UI |
| SVG strategy | Measured assets behind adapter; anatomy refinement deferred |
| FHIR | Omitted from first release; isolated later candidate |
| Import/export | Fork JSON/PDF/image omitted; EMR print retained |
| Pricing/provider | Completed in-clinic treatment links to billing charge and treating provider |

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Local fork fixes lost | Pin SHA, transplant regression fixtures, explicit preservation list |
| Existing Phase 15 history lost or reinterpreted | Normative cross-product mapping, preserved source fields, forward count/idempotency assertions, and no inferred provider/span |
| Clinical execution mutates acknowledged plan | Immutable item trigger plus separate append-only execution events/projection |
| Terminal execution correction strands clinical/financial effects | Terminal correction rejected atomically; downstream amendment/void remains linked history |
| Planned state corrupts current state | Separate rows/DTO layers and atomic completion only |
| Partial bridge writes | One locked transactional RPC with unit validation |
| Completed bridge/implant silently rewritten | Immutable CURRENT triggers plus successor/void records; only DRAFT designs update in place |
| Implant reduced to icon or broken dependency chain | Separate dependency-linked components, explicit external placeholder provenance, transactional validation, and renderer projection |
| SVG coupled to database | Adapter-only geometry/asset IDs |
| Patient selection leaks | Patient-keyed transient state and rerender regression |
| Cross-tenant RLS/FK error | Composite tenant FKs and forged-ID pgTAP |
| Ordinary clinical writer dismisses ambiguous legacy state | Require clinical write plus elevated clinical-correct, reason, audit, and unique resolution |
| Fork globals cause React loops | Declarative adapter; no module-global canonical state |
| Dependency conflict | Selective source port; add only reviewed runtime necessity |
| Perio final history mutates or formulas drift | Exact source ranges/formula tests plus FINAL parent/child immutability triggers and versioned amendments |
| Perio performance | Bounded exam DTOs/batches, memoized renderer, measured profiling |
| Anatomy blocks delivery | Preserve best measured set; defer tooth-by-tooth perfection |
| Demo persistence becomes canonical | Do not port `persistence.ts` or fork status import |
| Future SVG replacement is costly | Stable semantic overlay registry and snapshot tests |

## Open Questions

No implementation decision is left to the coding agent. BIR-regulated document
requirements remain a separate Phase 21 owner/accountant question and do not
block the internal ledger or odontogram integration because this plan emits no
regulated invoice or receipt.
