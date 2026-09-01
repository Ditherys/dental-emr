# AI Handoff - Unified Clinical Chart workspace, Task 2

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 2 — Build the unified full-width Clinical workspace shell (2026-09-01)

### Bounded slice implemented

Task 2 of the accepted plan
`docs/superpowers/plans/2026-09-01-unified-clinical-chart-workspace.md`.
It replaces the inner `Records` / `Odontogram` / `Treatment plan` tabs and the
standalone photo-gallery section with one Clinical chart workspace: heading and
visit state, an always-visible medical-safety strip, three `aria-pressed` chart
modes, a full-width chart breakout, and a chronological progress record. It is
the first consumer of Task 1's `ClinicalVisitState` and `resumed` flag.

No renderer, tooth drawer, record composer, periodontal mount, chronology
rebuild, migration or RPC work is in this checkpoint. Those are Tasks 4, 5, 12
and 13.

### Why

The clinical record was split across three inner tabs plus a sibling gallery, so
allergies, the chart, the plan and the progress record were never visible in one
place, and the chart was squeezed into the patient profile's `max-w-7xl` reading
width. Task 1 also left `ClinicalVisitState` and the `resumed` flag with no
consumer and left `Start visit` without the idempotency key the RPC accepts.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-2-brief.md`
  and `global-constraints.md`.
- `docs/FRONTEND_ARCHITECTURE.md` composition rules as restated in `CLAUDE.md`
  (no card grid, no KPI row, no decorative pills, restrained radii, compact and
  information-forward, desktop/tablet/phone all supported).
- Task 1's managed visit contract in
  `supabase/migrations/20260901010100_unified_clinical_visit_lifecycle.sql`.

### Files added

- `src/components/clinical/clinical-chart-workspace.tsx` (+ test) — the workspace
  shell: the single `Clinical chart` landmark, the mode group, the full-width
  chart surface, the progress-record region, the photograph region, and one
  bounded `Retry` failure state per region.
- `src/components/clinical/clinical-visit-header.tsx` (+ test) — visit state and
  the `Start visit` / `Resume visit` / `Finalize visit` actions.
- `src/components/clinical/medical-safety-summary.tsx` (+ test) — the
  conditions / allergies / medications strip.

### Files changed

- `src/lib/clinical/types.ts` — adds the plan's `ClinicalChartMode` stable
  contract next to `ClinicalVisitState`.
- `src/app/(emr)/patients/[patientId]/clinical-actions.ts` (+ test) —
  `createClinicalEncounterAction` becomes `startClinicalVisitAction`, validated
  by `startOrResumeClinicalVisitInputSchema`, forwarding an optional
  `idempotencyKey` and returning `{ ok: true, resumed }`.
- `src/app/(emr)/patients/[patientId]/clinical-section.tsx` (+ test) — renders
  the workspace; legacy encounter table and medical-history management move into
  a small `More clinical actions` menu (`Medical history`, `Treatment history`).
- `src/app/(emr)/patients/[patientId]/patient-workspace.tsx` (+ test) — the
  profile keeps `max-w-7xl`; only the Clinical breakout spans the viewport. The
  photo gallery is now passed into the workspace instead of rendered as a
  sibling section.
- `src/app/(emr)/patients/[patientId]/page.tsx` — derives the read-only
  `ClinicalVisitState` on the server.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` — optional
  `renderProgressRecord` so the workspace owns the single chronology region.
- `e2e/support/odontogram.ts`, `e2e/odontogram-integration.spec.ts` — drop the
  click on the removed `Odontogram` inner tab; the chart is the default
  `Current status` mode and the `fork-odontogram` assertions are unchanged.

### Security and tenancy decisions

- Opening Clinical creates nothing. The visit summary is a read-only server
  derivation from data the page already loads; only an explicit `Start visit` or
  `Resume visit` press reaches `start_or_resume_clinical_visit`.
- The action boundary accepts only `branchId`, `patientId`, optional
  `appointmentId` and optional `idempotencyKey` through the strict Task 1 schema.
  `organizationId`, `treatingProviderId`, `createdBy`, `providerDisplay` and
  `clinicalDate` are rejected as `INVALID_INPUT` before authorization, and the
  RPC re-derives organization, provider and clinical date regardless.
- No UI path reaches the revoked `create_clinical_encounter_v2`; the superseded
  `Open encounter` dialog is gone and `Start visit` is the only create path.
- One idempotency key per mounted workspace, generated in the browser with
  `crypto.randomUUID()`, so a double-pressed `Start visit` serializes on one
  token server-side. The key is not visit identity.
- `Finalize visit` continues through the existing confirmation alert dialog and
  the existing optimistic-version `finalizeClinicalEncounterAction`.
- When the clinical read failed, the derived visit is `null` and the header says
  `Visit status unavailable` with no start action, rather than rendering a false
  `NOT_STARTED`.
- No migration, RPC, grant or RLS change in this checkpoint.

### Negative and degradation cases covered (component level)

Clinical reader (no `patient.clinical.write`) sees no `Start visit`, no `Add`,
no `Void`, no `Add note`, no `Finalize`, no `Amend`, and no provider selector
anywhere. A finalized visit offers no start, resume or finalize action. Chart,
progress-record and photograph load failures each render a bounded `Retry`
region that keeps the medical-safety strip visible and removes the failed
region's content instead of showing stale data as current.

### Existing test assertions changed, and why

- `clinical-section.test.tsx`: the legacy `Clinical` heading assertion becomes
  `Clinical chart`; assertions that reached the encounter table and the medical
  history lists directly now open them from `More clinical actions` first,
  because Task 2 moves both out of the primary layout. The
  `Open encounter` dialog test becomes a `Start visit` test — same capability,
  same "no provider selector" assertion, new control. Nothing was removed; the
  file gained visit-lifecycle, IA and bounded-failure coverage.
- `clinical-actions.test.ts`: `createClinicalEncounterAction` renamed to
  `startClinicalVisitAction` with the new input shape, and the over-posting case
  was widened from `organizationId` alone to also cover `treatingProviderId`,
  `createdBy`, `providerDisplay` and `clinicalDate`.
- `patient-workspace.test.tsx`: the `ClinicalSection` mock now renders its
  `gallery` child, because the gallery moved inside the workspace. The
  `0 photos · write` assertion is unchanged.

### Commands run and observed results

All local only.

- `npm run test:unit -- src/components/clinical/clinical-chart-workspace.test.tsx src/components/clinical/medical-safety-summary.test.tsx "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx"`
  — RED gate before implementation: 3 files failed, 17 failed / 1 passed, the two
  new component files unresolvable and the legacy `Clinical tabs` nav still
  present.
- `npm run test:unit -- src/components/clinical "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx" "src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx" "src/app/(emr)/patients/[patientId]/clinical-actions.test.ts"`
  — 6 files, 59/59 passed, no warnings.
- `npm run typecheck` — passed, no output.
- `npm run lint` — 0 errors, 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:unit` (whole suite), four runs — 1602/1607/1609/1610 of 1612
  passed. Every failure in every run was `Error: Test timed out` in heavy
  odontogram fork suites this task does not touch. The same folder run alone,
  `npm run test:unit -- src/components/odontogram`, passes 45/45; run while
  another suite was active it failed 10/45. The failures are machine
  contention, not regressions.

### Not run, and why

- `npm run build`, Playwright E2E, responsive/accessibility device verification,
  Cloud TEST, `npm run test:db`, database advisors: no database or grant change
  in this checkpoint and hosted access is not authorized for this work. This work
  may be described only as locally implemented and locally verified.

### Known residual risks and open questions

- `list_clinical_encounters` does not expose `clinical_date` or `managed_visit`,
  so the server derivation matches today's encounters on the Manila calendar day
  of `created_at`. A pre-workspace unmanaged OPEN encounter created today would
  therefore be shown as the current visit. A later task should add a managed
  visit read that returns `clinical_date` and `managed_visit` directly.
- `PERIODONTAL` mode is a bounded seam that points at the chart's existing
  periodontal entry; Task 12 mounts the real periodontal work surface.
- The progress-record region uses the same server-derived events the chart was
  already given, so it inherits the existing behaviour where an in-chart fork
  save refreshes the chart but not the record until the next route refresh.
  Task 13 owns the chronology.
- `Resume visit` calls the same idempotent lifecycle action as `Start visit`.
  Whether an explicit `Resume visit` control is wanted at all, and whether a
  finalized same-day visit should offer starting a second visit, are open
  questions for the controller.
- `createClinicalEncounter` in `src/lib/clinical/service.ts` and
  `createClinicalEncounterInputSchema` are now unreferenced by any UI path and
  remain for Task 17's superseded-path sweep.

### Next bounded task

Task 3 of the plan. Do not start it until Task 2 is independently reviewed and
accepted.
