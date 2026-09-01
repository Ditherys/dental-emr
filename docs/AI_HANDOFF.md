# AI Handoff - Unified Clinical Chart workspace, Task 5

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 5 - Tooth record drawer and canonical finding composer (2026-09-01)

### Bounded slice implemented

Task 5 of the accepted plan, plus one inherited requirement the controller
attached to it:

- one temporary `ToothRecordDrawer` replaces the permanent inspector surface:
  tooth identity, current state, oldest-first history, and one
  `Add clinical record` primary action;
- one `ClinicalRecordComposer` shell presents all seven record kinds and mounts
  only the selected form; the selected teeth and the explicit clinical date
  survive a kind switch, an authored draft never does;
- `FindingForm` and `ClinicalNoteForm` are the two forms this task builds;
- two narrow provider-free RPCs, `record_visit_tooth_findings` and
  `record_visit_clinical_note`, obtain their encounter from
  `start_or_resume_clinical_visit` and bind every write to it;
- browser execute on the superseded `record_tooth_clinical_entry_v3` is
  revoked - it could record a finding with neither an encounter nor a treating
  provider;
- the fork-originated clinical write path is deleted;
- **inherited** the workspace chart view is scoped to `patientId`, so a tooth
  selected on one patient cannot survive into another in any chart mode.

### Why

Before this checkpoint the only clinical write path was the fork-era tooth
inspector: a permanent `Details`/`History` stack with a `Record finding or
treatment` dialog, a `Done` button and a relationship-card column. It wrote
through `record_tooth_clinical_entry_v3`, which sets neither `encounter_id` nor
`treating_provider_id`, so a recorded finding was not attributable to a visit or
to the dentist who made it. `ForkSaveController` was a second, already-dead
write path receiving an always-empty draft list.

The Task 4 review also found that the workspace's chart view had no `patientId`
awareness: the only cross-patient selection clear lived in `OdontogramSection`,
which mounts only in `CURRENT_STATUS`. A clinician in `TREATMENT_PLAN` or
`PERIODONTAL` mode could carry one patient's selected tooth into another
patient's chart.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-5-brief.md`
  and `global-constraints.md`, plus the controller's inherited patient-scoping
  requirement.
- `CLAUDE.md` / `AGENTS.md`: no client-supplied organization, provider, actor or
  encounter; provider derived with `private.require_active_actor_provider`;
  receptionists may not create clinical records; owners may treat only with an
  active provider link at the acting branch; `security definer set search_path =
  ''`; narrow grants; negative authorization tests in the same checkpoint;
  guarded forward-only migrations; no inline styles; no JS hover/focus handlers;
  no `window.innerWidth` branching; 44px touch targets.
- Task 1's `start_or_resume_clinical_visit` contract and its seed-1/seed-0
  advisory lock ordering (`20260901010110`).
- ADR-025 (owner full access), ADR-028, ADR-029, ADR-030.

### Files added

- `supabase/migrations/20260901010102_clinical_record_composer_rpcs.sql`
- `supabase/migrations/20260901010103_clinical_record_composer_rpcs_grants.sql`
- `supabase/tests/clinical_record_composer.test.sql` (42 assertions)
- `src/components/odontogram/tooth-record-drawer.tsx` (+ test)
- `src/components/odontogram/clinical-record-composer.tsx` (+ test)
- `src/components/odontogram/finding-form.tsx` (+ test)
- `src/components/odontogram/clinical-note-form.tsx` (+ test)
- `src/lib/odontogram/schema.test.ts`

### Files changed

- `src/lib/odontogram/clinical-codes.ts` - adds the bounded composer finding
  vocabulary, the whole-tooth codes, and the anterior/posterior surface rules.
- `src/lib/odontogram/schema.ts` - adds `fdiToothCodeSchema`, `isoDateSchema`,
  `boundedClinicalNoteSchema`, `clinicalFindingCodeSchema`, `findingInputSchema`,
  `visitClinicalNoteInputSchema` and the two RPC row schemas.
- `src/lib/odontogram/service.ts` (+ test) - `recordVisitToothFindings`,
  `recordVisitClinicalNote`; `recordToothClinicalEntry` marked fail-closed.
- `src/app/(emr)/patients/[patientId]/odontogram-actions.ts` (+ test) - the two
  new actions; `recordToothClinicalEntryAction` marked fail-closed.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` (+ test) - mounts
  the drawer, opens it on tooth selection, drops `ForkSaveController` and the
  fork draft state, renames the reopen affordance to `Open tooth record`.
- `src/components/odontogram/tooth-inspector.tsx` (+ test) - reduced to the
  bounded correction surface (amend, void, legacy reconciliation), reached from
  inside the drawer.
- `src/components/clinical/clinical-chart-workspace.tsx` (+ test) - takes
  `patientId` and resets the whole chart view when it changes.
- `src/app/(emr)/patients/[patientId]/clinical-section.tsx` - passes `patientId`.
- `src/components/ui/sheet.tsx` - optional `showOverlay` so a non-modal sheet can
  omit its scrim; default behaviour unchanged.
- `src/lib/clinical/types.ts` - adds the plan's `ClinicalRecordKind`.
- `src/types/database.generated.ts` - regenerated (`npm run db:types:local`).
- `scripts/approved-final-grants.mjs`, `scripts/remote-database-test-guard.mjs`
  and the three script test files - registry, suite registration and inventory
  counts.
- `supabase/tests/odontogram_permission_contract.test.sql`,
  `odontogram_revamp_rpcs.test.sql`, `odontogram_rpcs_v2.test.sql` - see
  "Existing test assertions changed" below.

### Files deleted

- `src/components/odontogram/fork-save-controller.tsx` and its test. Nothing
  imported it except `odontogram-section.tsx`, and the projection-only renderer
  never emitted a draft for it, so no compatibility file was retained. There is
  no remaining `fork-save-controller` import for Task 16 to remove.

### Security and tenancy decisions

- **Public action boundary.** `findingInputSchema` and
  `visitClinicalNoteInputSchema` are `.strict()` and accept only `patientId`,
  `branchId`, the clinical facts, and a UUID `idempotencyKey`. An
  `organizationId`, `treatingProviderId`, `createdBy`, `providerDisplay`,
  `encounterId` or `actingBranchId` field is a parse failure, proved for both
  schemas, both services, and both actions.
- **Visit binding.** Both RPCs call `public.start_or_resume_clinical_visit` and
  write under the encounter it returns. No new function inserts into
  `public.clinical_encounters`, so Task 1 remains the only encounter-creating
  path. pgTAP asserts exactly one browser-reachable function both inserts a
  tooth entry and calls the visit lifecycle.
- **Provider derivation.** `private.require_active_actor_provider` supplies
  `treating_provider_id`; there is no provider selector and no provider
  parameter.
- **Lock ordering.** The composer takes a transaction advisory lock in its own
  key space (seed 2) before the visit's request-key lock (seed 1) and identity
  lock (seed 0). The order is the same for every caller, so duplicate
  submissions serialize and no cycle is possible.
- **Idempotency.** `private.clinical_record_composer_idempotency` is keyed by
  (organization, actor, operation, request key) and revoked from every browser
  role. A replay returns the stored result and records nothing further.
- **Validation inside the transaction.** Tenant-scoped patient, tooth-code
  pattern, duplicate teeth, duplicate surfaces, occlusal-on-anterior and
  incisal-on-posterior anatomy, whole-tooth versus surface code compatibility,
  the bounded note, `ACTIVE`-only status, and a clinical date at or before the
  server-derived Philippine date.
- **Revocation.** `record_tooth_clinical_entry_v3` loses browser execute in the
  object migration `20260901010102`. Its registry entry carries
  `supersededFrom: 20260901010102_clinical_record_composer_rpcs.sql` - the file
  that REVOKES, not the grants file beside it.
- **Notes.** `record_visit_clinical_note` authors through the existing
  `public.create_clinical_note`, so DRAFT lifecycle, finalized-note immutability
  and the amendment path are untouched. `AMENDMENT` is refused outright.

### Negative authorization cases covered (pgTAP, all `throws_ok`)

Receptionist finding, receptionist note, owner-without-provider-link finding,
owner-without-provider-link note, cross-tenant patient, dentist whose provider is
not active at the acting branch, foreign-tenant dentist at another organization's
branch, plus refused domain input: occlusal on an anterior tooth, incisal on a
posterior tooth, surface on a whole-tooth code, no surface on a surface code,
future clinical date, relationship-owned code, non-`ACTIVE` status, duplicated
tooth, `AMENDMENT` note type, empty note. Three closing assertions prove no
refused submission left an entry, an encounter, or a foreign-tenant row behind.

### Inherited requirement: patient-scoped chart view

`ClinicalChartWorkspace` now takes `patientId` and, when it changes, resets the
whole `ClinicalChartView` to `DEFAULT_CLINICAL_CHART_VIEW` during render (the
documented React "adjust state when a prop changes" pattern, using state rather
than a ref so `react-hooks/refs` stays satisfied). The reset lives with the view
owner, not with a chart mode, so it fires in `TREATMENT_PLAN` and `PERIODONTAL`
too. `ToothRecordDrawer` separately resets its body and draft when
`patientId:selection` changes. Tests: the workspace reset is asserted in all
three chart modes; `odontogram-section.test.tsx` keeps its `data-patient-key`
guard and now also asserts the drawer is gone after a patient change.

### Composition decisions

- The drawer is a `Sheet`: full width below `sm`, roughly 400px from `sm` up,
  expressed purely as `data-[side=right]:w-full` and
  `data-[side=right]:sm:max-w-[400px]`. No JS measures a width.
- It is **non-modal** with no scrim, so the chart, toolbar and region controls
  stay usable beside it and selecting another tooth updates it in place. Close
  and Escape dismiss it; an outside interaction does not.
- One body at a time: summary, composer, or corrections. No nested overlay and
  no stacked panel.
- No inline `style={{}}`, no JS hover/focus/drag handler, no `overflow-x`
  container, 44px minimums on every control the drawer and forms add.

### Existing test assertions changed, and why

- `odontogram_permission_contract.test.sql`: `record_tooth_clinical_entry_v3`
  removed from "authenticated receives every reviewed O5/O8 signature" and
  replaced by a **stronger** adjacent assertion that it is revoked and that
  `record_visit_tooth_findings` is granted.
- `odontogram_revamp_rpcs.test.sql`: "v3 clinical entry is callable" inverted to
  "v3 clinical entry is no longer browser callable".
- `odontogram_rpcs_v2.test.sql`: two seed calls still exercise v3 entry,
  idempotency and lineage mechanics. Execute is re-granted for the duration of
  that rolled-back test transaction and revoked again immediately after, so the
  rest of the suite still observes the revoked boundary. No assertion removed.
- `odontogram-section.test.tsx`: ten tests retargeted or extended from the
  removed inspector overlay to the drawer. Four cross-patient safety tests keep
  their `tooth-inspector` absence assertion and gain the same assertion for the
  drawer. "Open inspector" became "Open tooth record";
  legacy reconciliation is now reached through the drawer's `Corrections`;
  "Record direct treatment" now asserts the drawer plus the composer instead of
  the deleted `Record finding or treatment` dialog; the relationship-workflow
  test now asserts the composer names Bridge and Implant and names their owning
  workflow rather than offering a write this task does not build.
- `tooth-inspector.test.tsx`: rewritten for the reduced correction surface. Both
  of the file's previous tests exercised the deleted `Record finding or
  treatment` dialog, so both were replaced; five tests now cover the removal of
  the four named affordances, amend, void, read-only state, and touch targets.
  Equivalent coverage of the removed record path lives in `finding-form.test.tsx`
  and `clinical_record_composer.test.sql`.
- `clinical-chart-workspace.test.tsx`: `renderWorkspace` passes the new required
  `patientId`. No existing assertion changed.
- `migration-privilege-lint.test.mjs`: inventory counts 302 -> 304 files,
  125 -> 126 tables, 472 -> 474 functions, 353 -> 355 security-definer.
- `boundary-privilege-invariant.test.mjs`: the effective-final fixture drops the
  superseded v3 signature, adds the two composer signatures, and the
  browser-reachable approved-key count moves 262 -> 263.
- `remote-database-test-guard.test.mjs`: the new suite added to the expected
  registry list.

### Commands run and observed results

All local only.

- RED gate, before any implementation:
  `npx vitest run` over the eight target unit files - **8 files failed, 22
  failed / 43 passed.** Four files failed to resolve (`./tooth-record-drawer`,
  `./clinical-record-composer`, `./finding-form`, `./clinical-note-form`);
  `schema.test.ts` failed 8/8 on the missing contracts; `service.test.ts` and
  `odontogram-actions.test.ts` failed on missing exports; the workspace failed
  on the missing `patientId` scoping.
  pgTAP RED: `psql < supabase/tests/clinical_record_composer.test.sql` -
  **`ERROR: function "public.record_visit_tooth_findings(...)" does not exist`.**
- `npm run db:migrate:local` - first attempt **refused**:
  `LegacyDbPushMissingRemoteError`, because 010102/010103 sort before the already
  applied 010110-010113. Applied with the CLI's own suggested flag,
  `npx supabase db push --local --include-all` - both migrations applied. A
  `pg_catalog.coalesce`/`pg_catalog.nullif` error (both are SQL constructs, not
  schema-resolved functions) was then found by the pgTAP run; the two migrations
  were dropped from the local dev database together with their history rows and
  re-applied from the corrected files. `npm run db:migrate:local` afterwards -
  **`Local database is up to date.`**
- `npm run db:types:local` - **`Updated src/types/database.generated.ts.`**
- `npm run security:migrations` - **passed**; 304 files, 2965 statements, 1296
  privilege statements, 85 grant-terminals, 392 approved final privileges.
- `npm run test:unit -- <the seven brief files> src/components/odontogram/tooth-inspector.test.tsx`
  - **8 files, 86/86 passed.**
- `npm run test:db:local` - **halts at `treatment_plans.test.sql`**, the first of
  three verified pre-existing failures. Everything before it passed, including
  the new `clinical_record_composer.test.sql`.
- New and modified suites run directly against the local container:
  `clinical_record_composer.test.sql` **42/42, P1_TEST_PASS**;
  `odontogram_permission_contract` **P1_TEST_PASS**; `odontogram_revamp_rpcs`
  **P1_TEST_PASS**; `odontogram_rpcs_v2` **P1_TEST_PASS**;
  `odontogram_revamp_permission_contract`, `clinical_permission_contract`,
  `clinical_rpcs`, `unified_clinical_visit`, `current_managed_visit` - all
  **P1_TEST_PASS**.
- Every suite from `treatment_plans.test.sql` to the end of the registry run
  directly - **24 pass, 3 fail**, and the three are exactly the verified
  pre-existing ones: `treatment_plans` assertion 7,
  `seed_security_fixtures` assertion 27, and `procedure_installment_schedules`.
- Concurrency tests run directly (the registry never reaches them):
  `clinical_visit_resume_concurrency`, `odontogram_lineage_concurrency`,
  `odontogram_implant_idempotency_concurrency` - **all PASS.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:unit` (whole suite) - **1845/1849 passed, 4 failed**, all
  `Test timed out`, in `fork-package`, `fork-print-chart` and
  `perio-workspace`. Re-run alone those three files pass **14/14**. This is the
  parallel-load flake Task 4's handoff documented; the count is lower than Task
  4's 15.
- `git diff --check` - clean.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. This checkpoint may be described only as locally implemented and locally
  verified.
- `npm run build`: not required by the task gate and not run.
- No new `.local.mjs` concurrency test was added, so none was registered; the
  three existing ones most affected by the visit lifecycle were run directly.

### Known residual risks and open questions

- **Geometry is unverified until the hosted gate.** jsdom applies no Tailwind, so
  the drawer's 400px rail, the full-width phone panel and the 44px targets are
  proved only as an authored class contract plus rendered structure.
- **Corrections reachability.** Amend, void and legacy reconciliation now live
  one explicit step inside the drawer rather than in a permanent column. The
  controller may prefer them re-homed elsewhere before Task 17 deletes
  `tooth-inspector.tsx`.
- **`recordToothClinicalEntry` / `recordToothClinicalEntryAction` are retained
  but fail closed.** Their RPC no longer grants execute to `authenticated`, so
  they can only return NOT_AUTHORIZED. They are kept because
  `service.test.ts` still covers the binding; a later task should delete them.
- **The composer writes no `tooth_clinical_entry_details` row.** The finding code
  fully determines the renderer detail through
  `chart-projection.defaultDetail`, and inventing a caries depth or a
  restoration material the clinician did not state would be a fabricated
  clinical measurement. A richer detail belongs to a later, explicit form.
- **The brief's contract names `toothSurfaceSchema`**, which in this repository
  includes the legacy `FULL` token that `tooth_clinical_entry_surfaces` rejects.
  `findingInputSchema` binds the existing `toothClinicalSurfaceSchema` instead,
  so an impossible surface fails at the boundary rather than in the database.
- Migration numbers 010102/010103 sort before the already-applied 010110-010113.
  A fresh database applies them in filename order with no issue; an existing
  database needs `--include-all` once.
- The full unit suite remains flaky under parallel load on this machine, before
  and after this change.

### Next bounded task

Task 6 of the plan. Do not start it until Task 5 is independently reviewed and
accepted.
