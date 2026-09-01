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

The only database work here is the additive read-only projection described below.
No renderer, tooth drawer, record composer, periodontal mount or chronology
rebuild is in this checkpoint. Those are Tasks 4, 5, 12 and 13.

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

This handoff covers three commits: `48d792d` (the workspace shell), `bae046f`
(the two controller corrections — the read-only current-managed-visit projection
replacing the `created_at` approximation, and `Start visit` after a same-day
visit is finalized), and the review fix round on top of them (errors surfaced
inside the two history dialogs, and the per-group medical-safety rule).

### Files added

- `supabase/migrations/20260901010112_current_managed_visit_projection.sql` —
  `public.get_current_managed_visit(uuid, uuid)`.
- `supabase/migrations/20260901010113_current_managed_visit_projection_grants.sql`
  — one additive `authenticated` EXECUTE.
- `supabase/tests/current_managed_visit.test.sql` (21 pgTAP assertions).
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
- `src/lib/clinical/{schema,service,service.test}.ts` — `getCurrentManagedVisit`
  with its strict input schema and row contract.
- `src/app/(emr)/patients/[patientId]/page.tsx` — reads the visit through the new
  projection. The former `created_at` approximation is deleted.
- `scripts/approved-final-grants.mjs` — new grant terminal for the projection.
- `scripts/remote-database-test-guard.mjs` (+ its test) — registers the suite.
- `scripts/migration-privilege-lint.test.mjs`,
  `scripts/boundary-privilege-invariant.test.mjs` — counters and the final
  effective-boundary fixture follow the two new migrations and the new grant.
- `src/types/database.generated.ts` — regenerated, never hand-edited.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` — optional
  `renderProgressRecord` so the workspace owns the single chronology region.
- `e2e/support/odontogram.ts`, `e2e/odontogram-integration.spec.ts` — drop the
  click on the removed `Odontogram` inner tab; the chart is the default
  `Current status` mode and the `fork-odontogram` assertions are unchanged.

### Security and tenancy decisions

- Opening Clinical creates nothing. The visit summary comes from
  `public.get_current_managed_visit`, a strictly read-only `security definer`
  projection with an empty search path: no insert, no update, no delete, no audit
  event. Only an explicit `Start visit` or `Resume visit` press reaches
  `start_or_resume_clinical_visit`.
- The projection derives organization, treating provider and the Philippine
  clinical date server-side exactly as the write lifecycle does, requires live
  `patient.clinical.read` at an active acting branch plus an active linked
  provider there, and validates the patient against the derived tenant. It
  accepts no organization, provider, actor, provider display name or date.
- It returns only `managed_visit` rows, scoped to the acting provider and today's
  clinical date, so the visit displayed is always the visit a write would land
  in. A pre-workspace unmanaged encounter is never reported as the current visit
  and stays readable and unchanged through `list_clinical_encounters`.
- Additive only: no existing function signature, grant or RLS policy changed.
  `list_clinical_encounters` is untouched.
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
- The medical-safety strip applies a per-group, direction-of-harm rule rather
  than one blanket filter: medications and conditions show `active` only, so a
  stopped medication or resolved condition can never read as current; allergies
  show every non-voided record with a `resolved` one explicitly qualified and
  de-emphasised, so an allergy is never silently dropped. This is a conservative
  safe-direction default pending clinical-owner confirmation, not a clinical
  sign-off; it is on the clinical-owner validation gate.
- Failed detail loads, finalizes and voids raised inside the `Treatment history`
  and `Medical history` dialogs render their error inside that dialog, so an
  optimistic-concurrency `STALE_VERSION` is never swallowed.
- The two new migrations are additive and forward-only. No existing function
  signature, grant, policy, column or RLS rule changed.

### Negative authorization cases covered (database)

`current_managed_visit.test.sql` asserts with `throws_ok`: receptionist denied;
owner with no active provider link denied exactly as the write lifecycle denies
them; dentist whose provider is not active at the requested branch denied;
cross-tenant patient denied; foreign-tenant dentist denied; null patient
rejected as `22023 invalid input`. It further proves a legacy unmanaged OPEN
encounter created today is not returned, yesterday's managed visit is not
returned, another provider's managed visit for the same patient and day is not
returned as this actor's, a finalized visit reports FINALIZED without being
reopened, and that every read left the encounter set and the audit log unchanged.

### Negative and degradation cases covered (component level)

Clinical reader (no `patient.clinical.write`) sees no `Start visit`, no `Add`,
no `Void`, no `Add note`, no `Finalize`, no `Amend`, and no provider selector
anywhere — including on a finalized visit. A finalized visit offers a writer
`Start visit` but never `Resume visit` or `Finalize visit`. A `null` visit
reports `Visit status unavailable` and offers no start action. Chart,
progress-record and photograph load failures each render a bounded `Retry`
region that keeps the medical-safety strip visible and removes the failed
region's content instead of showing stale data as current. A failed detail load,
finalize or void inside either history dialog renders its message inside that
dialog. A resolved condition and a stopped medication are absent from the safety
strip; a resolved allergy stays present, qualified and de-emphasised.

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
- `clinical-visit-header.test.tsx` (correction round): the finalized-visit test
  asserted no start action; it now asserts `Start visit` present with
  `Resume visit` and `Finalize visit` absent, per the controller ruling. A new
  test keeps the read-only case (a clinical reader still gets no `Start visit`
  on a finalized visit), so no coverage was lost.
- `medical-safety-summary.test.tsx` (fix round): the long-value assertion now
  targets `{ selector: "span" }`, because each value is its own element so a
  resolved allergy can be de-emphasised independently. The assertion itself —
  wraps, is not truncated, is not `whitespace-nowrap` — is unchanged.

### Commands run and observed results

All local only.

- `npm run test:unit -- src/components/clinical/clinical-chart-workspace.test.tsx src/components/clinical/medical-safety-summary.test.tsx "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx"`
  — RED gate before implementation: 3 files failed, 17 failed / 1 passed, the two
  new component files unresolvable and the legacy `Clinical tabs` nav still
  present.
- `npm run test:unit -- src/components/clinical "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx" "src/app/(emr)/patients/[patientId]/patient-workspace.test.tsx"`
  (the brief's Step 5 command, re-run after the review fix round) — 5 files,
  **52/52 passed**, no warnings.
- `npm run typecheck` — passed, no output.
- `npm run lint` — 0 errors, 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:unit` (whole suite), four runs before the fix round —
  1602/1607/1609/1610 of 1612 passed, rising to 1617/1619 after the corrections.
  Every failure in every run was `Error: Test timed out` in heavy odontogram fork
  suites this task does not touch. The same folder run alone,
  `npm run test:unit -- src/components/odontogram`, passes 45/45; run while
  another suite was active it failed 10/45. The failures are machine
  contention, not regressions.

Review corrections, all local:

- `supabase/tests/current_managed_visit.test.sql` run directly against
  `supabase_db_local` — RED before the migration
  (`ERROR: function "public.get_current_managed_visit(uuid,uuid)" does not exist`),
  then **21/21 ok, `P1_TEST_PASS`**.
- `unified_clinical_visit.test.sql` and `clinical_rpcs.test.sql` re-run directly
  — both `P1_TEST_PASS`.
- `npm run db:migrate:local` — applied `20260901010112` and `20260901010113`
  forward; no reset.
- `npm run db:types:local` — `Updated src/types/database.generated.ts.`
- `npm run security:migrations` — passed; 302 files, 84 grant-terminal
  migrations, 390 approved privileges.
- `npm run test:db:local` — reaches and passes
  `PASS supabase/tests/current_managed_visit.test.sql`, then halts at the
  **pre-existing** `treatment_plans.test.sql` failure (assertion 7,
  `treatment_plan_items` approved-field set), reproduced directly and unrelated
  to this work. The runner therefore never reaches the suites registered after
  it, including the `.local.mjs` concurrency tests.
- `npm run test:unit -- src/lib/clinical/service.test.ts` — 27/27 passed
  (5 failed before the implementation, as required by TDD).
- `npm run test:unit -- scripts src/lib/clinical "…/clinical-actions.test.ts"` —
  19 files, 349/349 passed.

Review fix round, all local, no database change:

- `npm run test:unit -- src/components/clinical/medical-safety-summary.test.tsx "…/clinical-section.test.tsx"`
  — RED first: 8 failed / 21 passed, including three `Unable to find role="alert"`
  reproducing the swallowed-error regression exactly. After the fix, **29/29
  passed**.
- Step 5 command, `npm run typecheck` and `npm run lint` re-run as recorded
  above.

### Not run, and why

- `npm run build`, Playwright E2E, responsive/accessibility device verification,
  Cloud TEST, `npm run test:db` (hosted), database advisors: hosted access is not
  authorized for this work. This work may be described only as locally
  implemented and locally verified.
- R6-D boundary-privilege file-mode replay: hosted-only, still UNRUN, unchanged
  from Task 1. The new grant terminal is additive and carries no supersede pivot.

### Known residual risks and open questions

- The projection denies any actor without an active linked provider at the acting
  branch, which is correct — a managed visit belongs to a provider — but it means
  a clinical *reader* such as a dental assistant sees `Visit status unavailable`
  rather than a visit summary. The chart, record, safety strip and history
  dialogs are all still readable for them.
- The `NOT_STARTED` label's date is formatted in the server component from
  `Asia/Manila`. It is a label only; every encounter decision uses the
  server-derived date. Across local midnight the label could be one day off for a
  request in flight, which is cosmetic.
- `PERIODONTAL` mode is a bounded seam that points at the chart's existing
  periodontal entry; Task 12 mounts the real periodontal work surface.
- The progress-record region uses the same server-derived events the chart was
  already given, so it inherits the existing behaviour where an in-chart fork
  save refreshes the chart but not the record until the next route refresh.
  Task 13 owns the chronology.
- `Resume visit` calls the same idempotent lifecycle action as `Start visit`;
  the controller ruled this the faithful reading of brief Step 4. A finalized
  same-day visit now offers `Start visit` (and no `Resume visit`), because the
  partial unique index covers only managed OPEN rows, so the lifecycle opens a
  further visit rather than handing back the finalized one.
- `createClinicalEncounter` in `src/lib/clinical/service.ts` and
  `createClinicalEncounterInputSchema` are now unreferenced by any UI path and
  remain for Task 17's superseded-path sweep.

### Next bounded task

Task 3 of the plan. Do not start it until Task 2 is independently reviewed and
accepted.
