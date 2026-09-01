# AI Handoff - Unified Clinical Chart workspace, Task 8 (review fixes, round 1)

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

This checkpoint is the second commit of Task 8. It applies the round-1 review
findings on top of `c1b9713`; the sections below describe the task as it now
stands, with the review-fix sections at the end.

## Task 8 - Fold treatment planning into the chart mode (2026-09-01)

### Bounded slice implemented

- `public.add_treatment_plan_discussion_v2` - the provider-free plan discussion
  boundary. It derives the treating provider from the signed-in actor with
  `private.require_active_actor_provider` and accepts no provider argument at
  all. The superseded five-argument signature, which accepted a client-supplied
  `p_treating_provider_id`, is revoked from every browser role.
- **The inherited requirement**: `public.complete_treatment_case` now obtains the
  managed clinical visit from `public.start_or_resume_clinical_visit` and binds
  `encounter_id` on the clinical entry, the bridge and the implant components it
  materializes. Before this commit a plan-linked completion produced a clinical
  entry with `encounter_id` null, and `public.tooth_clinical_entries` refuses
  every UPDATE, so it could never be bound afterwards.
- `TreatmentPlanMode` - the Treatment plan chart mode. The chart keeps the whole
  workspace row; the plan context is a dense native list below it, with a phone
  sheet for the focused tooth. It projects each plan item's clinician-authored
  tooth and surfaces into a per-tooth proposal marker on the chart itself,
  deliberately dashed so it can never be read as recorded status, and writes no
  clinical row.
- `PlannedTreatmentForm` - the composer's Planned treatment form. It appends one
  DRAFT plan line per selected tooth through the reviewed plan boundary and
  changes no canonical clinical record.
- The composer opens on Planned treatment in the Treatment plan mode
  (`chartMode` -> `defaultKind`), and `PLANNED_TREATMENT` is no longer a signpost.
- The separate treatment-plan page/table presentation is unmounted:
  `TreatmentPlanSection` is no longer rendered by any chart mode. Task 17 owns
  deleting the file, so it is only stripped of its provider presentation here.

### Why

Treatment planning lived on a separate page with its own table, its own provider
list and its own completion panel, and the chart could not propose anything at
all. Two authorization defects came with that: the plan discussion boundary let
the browser choose whose clinical authorship a discussion carried, and the
plan-linked completion path created clinical entries with no encounter, so a
treatment performed against a plan had no visit or provider attribution in the
chronology Task 13 will project.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-8-brief.md`
  and `global-constraints.md`.
- `CLAUDE.md` / `AGENTS.md`: no client-supplied organization, provider, actor or
  encounter; provider derived with `private.require_active_actor_provider`;
  receptionists may not create clinical records or plans; owners may treat only
  with an active provider link at the acting branch;
  `security definer set search_path = ''`; narrow grants; negative authorization
  tests in the same checkpoint; guarded forward-only migrations; no inline
  styles; no JS hover/focus handlers; 44px touch targets.
- ADR-025 (owner full access), ADR-026 (billing ledger), ADR-030.

### Migration numbering

The brief named `20260901010108`/`010109`; both sort before the applied
`20260901010136`, so `db:migrate:local` would have refused them. The controller
overrode the allocation to `20260901010140`/`010141`, and the current maximum was
re-verified as `20260901010136` immediately before writing them. Round 1 added
`20260901010142`, `010143` and `010144`, allocated from the then-current maximum
`20260901010141` verified in the local `schema_migrations` table.

### Files added

- `supabase/migrations/20260901010140_treatment_plan_actor_provider.sql`
- `supabase/migrations/20260901010141_treatment_plan_actor_provider_grants.sql`
- `supabase/tests/treatment_plan_actor_provider.test.sql` (51 assertions after
  round 1; 34 in the first commit)
- `src/components/odontogram/treatment-plan-mode.tsx` (+test)
- `src/components/odontogram/planned-treatment-form.tsx` (+test)

### Files changed

- `src/lib/treatment-plan/schema.ts` - `treatingProviderId` removed from the
  strict discussion input, so a supplied provider is a parse failure.
- `src/lib/treatment-plan/service.ts` (+test) - calls
  `add_treatment_plan_discussion_v2` with no provider argument.
- `src/app/(emr)/patients/[patientId]/treatment-plan-actions.test.ts` - the
  provider/organization/author refusal case.
- `src/components/odontogram/clinical-record-composer.tsx` (+test) - mounts the
  planned-treatment form behind `planContext`, and opens on `defaultKind`.
- `src/components/odontogram/tooth-record-drawer.tsx` - threads `chartMode` and
  `planContext` into the composer.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` - same two props.
- `src/app/(emr)/patients/[patientId]/clinical-section.tsx` - the
  `TREATMENT_PLAN` chart node is now `TreatmentPlanMode` wrapping the chart.
- `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx` (+test) -
  `initialProviders` and the provider-name presentation removed; the discussion
  list now says the authorship is the signed-in dentist's.
- `src/types/database.generated.ts` - regenerated (`npm run db:types:local`).
- `scripts/approved-final-grants.mjs`, `scripts/remote-database-test-guard.mjs`
  and the three script test files - registry, suite registration, inventory.
- `supabase/tests/treatment_plan_rpcs.test.sql`,
  `supabase/tests/document_treatment_plan.test.sql`,
  `supabase/tests/clinical_record_composer.test.sql` - see "Existing test
  assertions changed".
- Round 1 additionally changed `src/components/odontogram/measured-tooth.tsx`,
  `measured-chart.tsx` (+test), `fork-odontogram.tsx`,
  `planned-treatment-form.tsx` (+test), `treatment-plan-mode.tsx` (+test),
  `tooth-record-drawer.test.tsx`, `src/lib/treatment-plan/schema.ts`,
  `service.ts` (+test), `scripts/run-local-database-tests.mjs` and
  `supabase/tests/treatment_plans.test.sql` - see "Review fixes applied in this
  commit (round 1)".

### Files deleted

None. `treatment-plan-section.tsx` and `plan-mode-panel.tsx` remain; Task 17 owns
their removal.

### Security and tenancy decisions

- **No provider input anywhere on the plan path.**
  `addTreatmentPlanDiscussionInputSchema` is `.strict()` and has no
  `treatingProviderId`; the RPC has no provider parameter; pgTAP asserts that no
  argument name of `add_treatment_plan_discussion_v2` contains "provider".
- **OWNER-with-provider and Provider A are distinct identities.** pgTAP records
  one discussion as the dentist and one as an owner who holds their own active
  provider link, and asserts the two rows carry different `treating_provider_id`
  values. An owner with no provider link is refused `42501`.
- **The superseded signature is unreachable.** `20260901010140` revokes execute
  on `public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)` from
  `public`, `anon`, `authenticated` and `service_role`. The registry entry
  records `supersededFrom: "20260901010140_treatment_plan_actor_provider.sql"` -
  the object migration that **revokes**, never the grants file.
- **A receptionist may not plan or execute.** pgTAP proves `42501` for the plan
  discussion, `create_treatment_plan` and `complete_treatment_case`.
- **Immutability.** pgTAP proves an ACKNOWLEDGED plan refuses retitling, another
  item and re-presentation with `P0001 invalid state`, and that a direct UPDATE
  is refused by the immutable trigger with `23514`. Discussions stay append-only
  on any status. `PlannedTreatmentForm` refuses to author into a non-DRAFT plan
  in the browser as well, and `TreatmentPlanMode` offers no lifecycle action once
  the plan is acknowledged.
- **No canonical change before execution.** pgTAP proves that authoring a plan
  item creates no `tooth_clinical_entries` row and opens no clinical encounter.
  The planned-treatment form writes only through
  `add_treatment_plan_item_centavos`.
- **Execution binds the visit.** pgTAP proves a plan-linked completion opens
  exactly one managed OPEN visit for the acting provider on the Philippine
  clinical date, that the resulting clinical entry's `encounter_id` is that
  visit, that it carries the derived treating provider, and that no plan-linked
  entry is left with a null encounter.
- **Lock ordering.** `record_treatment_event_v2` takes seed 3, then the visit's
  seed 1 and seed 0, and only then delegates. `complete_treatment_case`
  therefore obtains its visit **before** its own completion request lock, so
  every caller takes the visit identity lock before the completion request lock
  and no cycle is constructible. No new advisory-lock seed was introduced. The
  first revision also took `for key share` on the case row ahead of those locks
  and later upgraded it to `for update`, which deadlocked; round 1 removed that
  row lock, leaving exactly one `procedure_cases` lock in the function, proved by
  a migration guard and by
  `supabase/tests/treatment_case_completion_concurrency.local.mjs`.

### Negative authorization cases covered (pgTAP, all `throws_ok`)

Owner with no active provider link (`42501`), receptionist discussion
(`42501`), receptionist plan creation (`42501`), receptionist plan execution
(`42501`), foreign-tenant dentist at another organization's branch (`42501`),
a plan belonging to another organization (`42501`), blank context (`22023`),
over-long context (`22023`), over-long notes (`22023`), acknowledged-plan
retitle / item append / re-present (`P0001 invalid state`), a stale plan version
(`P0001 stale version`), a direct UPDATE of an acknowledged plan (`23514`), and
the superseded provider-accepting signature being unreachable from the browser
(`42501 permission denied for function add_treatment_plan_discussion`, in
`treatment_plan_rpcs.test.sql`).

### Existing test assertions changed, and why

- `clinical_record_composer.test.sql`: the named set of browser-reachable
  functions that record a tooth entry **bound to the managed visit** was
  `record_treatment_event_v2,record_visit_tooth_findings`. It is now
  `complete_treatment_case,record_treatment_event_v2,record_visit_tooth_findings`.
  The old comment excluded `complete_treatment_case` on the stated ground that it
  opens no visit; it now does, which is exactly the guarantee the assertion
  states, so it joins the set rather than sitting beside it. Nothing was
  weakened - a fourth such writer still fails by name.
- `treatment_plan_rpcs.test.sql`: provider A1 gains a `linked_user_id` and a
  `provider_branches` row, because plan authorship now requires an active
  provider link. The grant assertion swaps the v1 clause for v2 and additionally
  asserts v1 is denied to `authenticated`, and `anon`/`service_role` denied on
  v2. The empty-search-path definer count goes 14 -> 15 (v2 added; v1 kept). The
  two discussion calls use v2. The "foreign-org treating provider is rejected"
  case targeted a parameter that no longer exists; it became the stronger
  statement that the browser cannot reach the old signature at all.
- `document_treatment_plan.test.sql`: same provider-link fixture, and its one
  discussion call uses v2.
- `clinical-record-composer.test.tsx`: the signpost loop was
  `["Planned treatment", "Photo"]` and is now `["Photo"]`, because Planned
  treatment now mounts a real form. A new test asserts the form mounts and that
  it says what is missing when there is no plan.
- `treatment-plan-section.test.tsx`: `initialProviders` removed; the discussion
  assertion now proves the provider display name is **absent** and the derived
  authorship line present. Two discussion payload assertions dropped
  `treatingProviderId: null`, which the strict schema now refuses.
- `service.test.ts`: the discussion contract targets
  `add_treatment_plan_discussion_v2`; two cases were **added** proving a
  well-formed provider id and a `createdBy` are both refused.
- `migration-privilege-lint.test.mjs`: 314 -> 316 files, 481 -> 482 functions,
  359 -> 360 security-definer.
- `boundary-privilege-invariant.test.mjs`: the v1 discussion signature left the
  effective-final fixture and v2 replaced it; approved-key count unchanged at
  265.
- `remote-database-test-guard.test.mjs`: the new suite added to the expected list.

### Commands run and observed results (local only)

- **RED gate, before implementation.**
  `psql < supabase/tests/treatment_plan_actor_provider.test.sql` -
  **`ERROR: function "public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)" does not exist`.**
  `npx vitest run` over the four brief-named unit files - **4 files failed, 3
  failed / 29 passed**: the two new component suites failed to resolve
  (`Failed to resolve import "./planned-treatment-form"` and
  `"./treatment-plan-mode"`), `service.test.ts` failed on the extra
  `p_treating_provider_id` argument, and the action test returned `{ ok: true }`
  where `INVALID_INPUT` was expected.
- `npm run db:migrate:local` - applied `20260901010140` and `20260901010141`.
  The first attempt **failed closed** on the migration's own final guard
  (`complete_treatment_case visit binding did not reach every materialization
  path`, SQLSTATE 55000) because the expected occurrence count was wrong; the
  count was corrected and nothing had been applied.
- `npm run db:types:local` - **`Updated src/types/database.generated.ts.`**
- `npm run security:migrations` - **passed**; 316 files, 3024 statements, 1313
  privilege statements, 89 grant-terminals, 397 approved final privileges.
- `npm run test:unit -- <the four brief files>` - **4 files, 48/48 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings
  (`treatment-plan-section.tsx`, `lib/treatment-plan/schema.ts` x2).
- `npm run test:db:local` - **halts at `treatment_plans.test.sql`**, the first of
  the three verified pre-existing failures. Everything before it passes,
  including `clinical_record_composer`, `clinical_treatment_events_v2`,
  `odontogram_relationship_workflows_v2`, `document_treatment_plan`,
  `treatment_item_execution`, `treatment_plan_rpcs` and the new
  `treatment_plan_actor_provider`.
- Every suite after the halt point run directly: **all P1_TEST_PASS except
  `seed_security_fixtures` (assertion 27) and `procedure_installment_schedules`**
  - the other two documented pre-existing failures. `treatment_plans.test.sql`
  fails on the same untouched pre-existing assertion (extra `notes`/`priority`/
  `sequence_no`/`surfaces` columns on `treatment_plan_items`). In the first
  commit it was assertion 7 and the file was not touched at all; round 1 added
  the reviewed amendment columns to the `treatment_plans` column contract and two
  new assertions, so the same pre-existing failure is now numbered 9. Its cause
  is unchanged.
- Suites run directly: `treatment_plan_actor_provider` **34 assertions,
  P1_TEST_PASS**; plus `odontogram_atomic_completion_revamp`,
  `clinical_treatment_events_v2`, `clinical_record_composer`,
  `treatment_item_execution`, `treatment_plan_rpcs`,
  `treatment_plan_estimated_fee_contract`, `document_treatment_plan`,
  `procedure_cases_and_plan_details`, `unified_clinical_visit`,
  `current_managed_visit`, `odontogram_relationship_workflows_v2`,
  `clinical_permission_contract` - **all P1_TEST_PASS**.
- Concurrency tests run directly with the runner's own wiring:
  `treatment_item_execution_concurrency`, `clinical_visit_resume_concurrency`,
  `odontogram_implant_idempotency_concurrency`, `billing_allocation_concurrency`,
  `odontogram_lineage_concurrency` - **all PASS.** No new `.local.mjs` test was
  added, so none was registered.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `npm run test:unit` (whole suite) - **1943/1954 passed, 11 failed** in 5 files:
  `src/lib/booking/service.test.ts` and `src/app/api/public/booking/route.test.ts`
  (the documented pre-existing time bomb), plus `fork-package`,
  `fork-print-chart` and `perio-workspace`, the documented parallel-load flakes,
  which **pass when the three are run together alone (14/14)**.
- `git diff --check` - clean.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. This checkpoint may be described only as locally implemented and locally
  verified.
- `npm run build`: not required by the task gate and not run.

### Known residual risks and open questions

- **`public.complete_treatment_case` keeps its `authenticated` grant, and
  `completeTreatmentAction` still exists.** The chart no longer uses either: plan
  execution goes through Task 6's `record_treatment_event_v2`, which delegates.
  The attribution hole is closed regardless, because the function now binds the
  visit on every path. Revoking the grant and deleting the action would touch
  `odontogram_atomic_completion_revamp.test.sql` and the atomic-completion
  registry entry, both outside this brief's file list, so it is **flagged for the
  controller** rather than done here.
- **`plan-mode-panel.tsx` and `plan-mode-panel.test.tsx` are unmodified.** The
  brief lists them as Modify, but the component is already provider-free and
  performs no write itself; it is now unmounted because `TreatmentPlanSection` is.
  Changing it would have been change for its own sake.
- **A replayed direct `complete_treatment_case` call resumes or opens a managed
  visit before returning the stored result.** That is the price of taking the
  visit before the completion request lock, which is what makes the lock order
  identical for every caller. The caller is an authorized treating dentist at
  that branch, for whom an open managed visit is the normal state.
- **The plan overlay is a real per-tooth chart marker** (corrected in round 1).
  The first revision showed only a row of chips below the chart, on the argument
  that painting a proposal would invent clinical detail. The review checked that
  premise against the schema and it did not hold: a plan item carries the
  clinician's own `tooth_code` and `surfaces`. `MeasuredTooth` now takes an
  optional `proposal` and marks the tooth with a dashed outline, a count badge
  and `data-proposed*` attributes, announced as "proposed treatment ... not yet
  performed". It is still never a `PLANNED` tooth clinical entry and writes
  nothing, and the current-status chart shows no marker for the same projection.
  The checked-in anatomy node tree and its generator were not touched.
- **Multi-tooth authoring is a loop of single-item calls, not one transaction.**
  A failure part-way leaves the earlier lines committed and reports which write
  failed. The plan version is not bumped by an item append, so every line in a
  batch legitimately carries the same expected version. Round 1 removed the
  client-supplied sequence base, so two lines can no longer collide on a
  sequence number even when a second submission lands before a revalidation.
- **Plan freshness depends on `router.refresh()`.** `TreatmentPlanMode` re-reads
  the plan detail when the server list's `itemCount` changes, so a new line
  appears after the route revalidates rather than immediately.
- Geometry remains unverified until the hosted gate: jsdom applies no Tailwind,
  so the full-width chart, the `md:hidden` phone sheet and the 44px targets are
  proved only as an authored class contract.

### Next bounded task

Task 9 of the plan. Do not start it until this review round is accepted.
`20260901010145` onward are free.

## Review fixes applied in this commit (round 1)

Round 1 returned no Critical, two Important and five Minor findings, plus one
controller-added Important. All eight are fixed; two items were ledgered as
deferred.

1. **The new `for key share` on `procedure_cases` created a lock-upgrade
   deadlock (Important).** `20260901010140` read the case patient with
   `for key share` ahead of the completion advisory lock, and the same function
   takes `for update` on that row moments later. Two transactions both holding
   KEY SHARE and both requesting FOR UPDATE deadlock, so a double-submitted
   completion returned `40P01` where it used to serialize and replay.
   `20260901010142` drops the lock from that lookup: the patient only identifies
   the visit, and the authoritative case row is re-read under `for update`
   anyway. The migration additionally asserts that **exactly one**
   `procedure_cases` row lock survives in the repaired body. The
   visit-before-request-lock ordering from `20260901010140` is preserved.
2. **The Treatment plan mode did not change the chart overlays (Important).**
   The reviewer checked the data premise against the schema and it did not hold:
   `treatment_plan_items` carries `tooth_code` and `surfaces`, and
   `get_treatment_plan_detail` already projects both, so a per-tooth proposal
   marker projects clinician-authored data rather than inventing a clinical
   detail. `MeasuredTooth` gained an optional `proposal` marker
   (`data-proposed`, `data-proposed-count`, `data-proposed-priority`,
   `data-proposed-surfaces`, a dashed outline that is never the solid
   border/ring recorded status and selection use, and its own aria phrasing
   "proposed treatment ... not yet performed"). `TreatmentPlanMode` projects the
   map and hands it down through the chart render prop. **No
   `tooth_clinical_entries` row is written**, and the current-status chart shows
   no marker for the same projection.
3. **A plan version captured no reason and no predecessor (Important,
   controller-added).** `public.treatment_plans` gains `supersedes_plan_id` and
   `amendment_reason`, a tenant-safe composite FK, a bounded-reason check, a
   reason-required check, and a partial unique index so one plan cannot be
   forked into two successors. `public.create_treatment_plan_v2` is the boundary
   that writes them: the pair is accepted only together, the predecessor is
   revalidated against the derived tenant and the same patient, and the
   predecessor row is never mutated. `get_treatment_plan_detail` returns both so
   a captured reason can be read, and `TreatmentPlanMode` requires a reason
   before replacing a plan on record.
4. **A required Clinical date that was never persisted (Minor).** Removed from
   `PlannedTreatmentForm` entirely, with a comment saying why a proposal has no
   date. The composer no longer passes the shared date to this kind.
5. **Multi-tooth authoring reused a stale sequence base (Minor).** The form no
   longer sends `sequenceNo` at all; the reviewed RPC already assigns the
   sequence from the server-assigned `line_no` when the client supplies none, so
   the race is removed at its source. pgTAP proves two appends with no client
   sequence take `2:2` and `3:3` and never share one.
6. **The `chartMode` -> `defaultKind` wiring was untested (Minor).** Two drawer
   tests now assert the composer opens on Planned treatment with
   `chartMode="TREATMENT_PLAN"` and on Finding otherwise, checking `aria-pressed`
   and the mounted form.
7. **`readFailureMessage` was reused for write failures (Minor).** A separate
   `writeFailureMessage` distinguishes `STALE_VERSION`, `INVALID_STATE`,
   `INVALID_INPUT` and `NOT_AUTHORIZED`, and says nothing was saved rather than
   telling the clinician to refresh a read.
8. **Deferred by the controller, not fixed:** a later-day replay of a direct
   completion opens a managed visit and emits one `clinical.encounter.opened`
   audit; `TreatmentPlanSection` and `PlanModePanel` are now unreferenced dead
   code owned by Task 17.

### Files added this round

- `supabase/migrations/20260901010142_treatment_plan_amendment_and_case_lock_repair.sql`
- `supabase/migrations/20260901010143_treatment_plan_amendment_grants.sql`
- `supabase/migrations/20260901010144_treatment_plan_amendment_audit_metadata_repair.sql`
- `supabase/tests/treatment_case_completion_concurrency.local.mjs`

### Existing test assertions changed this round, and why

- `treatment_plans.test.sql`: assertion 1 listed the approved `treatment_plans`
  columns and was **passing**; the two reviewed amendment columns are added to
  that list, and two assertions were **added** proving the single-successor index
  and the three new constraints exist. The pre-existing failure (the
  `treatment_plan_items` extra-columns assertion) is untouched and moved from
  number 7 to number 9 only because two assertions now precede it.
- `treatment_plan_actor_provider.test.sql`: 34 -> 51 assertions. Nothing was
  changed; the amendment, server-sequencing and boundary-shape cases were added.
- `measured-chart.test.tsx`: two tests added; the shared harness gained an
  optional `proposals` prop. No assertion changed.
- `tooth-record-drawer.test.tsx`: two tests added. No assertion changed.
- `planned-treatment-form.test.tsx`: the Sequence and Clinical date assertions
  were removed **because the controls were removed**, and replaced by two
  stronger ones - no `sequenceNo` is ever submitted, and no clinical date control
  is offered.
- `treatment-plan-mode.test.tsx`: the chart render prop now receives a context
  object, so two assertions read `.plan` from it; five tests were added
  (proposal projection, explained amendment, refused unexplained amendment,
  recorded reason display, write-failure wording).
- `service.test.ts`: the create contract targets `create_treatment_plan_v2`;
  three cases were **added** for the amendment pair.
- `migration-privilege-lint.test.mjs`: 316 -> 319 files, 482 -> 483 functions,
  360 -> 361 security-definer.
- `boundary-privilege-invariant.test.mjs`: the new signature added to the
  effective-final fixture; approved-key count 265 -> 266.

### Round-1 commands and observed results

- **RED probe for finding 1.** With the pre-fix `for key share` restored into the
  live function body inside a throwaway session, the new concurrency test fails
  with **`ERROR: deadlock detected`** (one process waiting for an ExclusiveLock
  on the visit identity advisory lock, the other for a ShareLock on the first
  process's transaction). With `20260901010142` applied it passes. The fixed body
  was restored immediately and verified to hold exactly one `procedure_cases`
  row lock.
- **RED for finding 3.** `public.create_treatment_plan_v2(...)` did not exist;
  the extended pgTAP suite failed with
  **`ERROR: function public.create_treatment_plan_v2(...) does not exist`**.
- **A second guard fired for real.** `20260901010144`'s own occurrence guard
  refused the first attempt (`create_treatment_plan_v2 must keep
  supersedes_plan_id ...`, SQLSTATE 55000) because the expected count was wrong;
  nothing was applied and the guard was corrected.
- `npm run db:migrate:local` - applied `20260901010142`, `010143` and `010144`.
- `npm run db:types:local` - regenerated.
- `npm run security:migrations` - **passed**; 319 files, 3040 statements, 1315
  privilege statements, 90 grant-terminals, 398 approved final privileges.
- `npm run test:unit -- <the four brief files>` - **4 files, 55/55 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings.
- `npm run test:db:local` - **halts at `treatment_plans.test.sql`** as before.
- Run directly: `treatment_plan_actor_provider` **51 assertions, P1_TEST_PASS**;
  plus `treatment_plan_rpcs`, `document_treatment_plan`,
  `treatment_plan_estimated_fee_contract`, `procedure_cases_and_plan_details`,
  `odontogram_atomic_completion_revamp`, `clinical_treatment_events_v2`,
  `clinical_record_composer`, `treatment_item_execution`, `schema`,
  `foundation_rls`, `owner_full_access`, and every suite after the halt point -
  all **P1_TEST_PASS** except the three documented pre-existing failures.
- Concurrency, run directly: the new `treatment_case_completion_concurrency`
  plus `treatment_item_execution_concurrency`,
  `clinical_visit_resume_concurrency`,
  `odontogram_implant_idempotency_concurrency`, `billing_allocation_concurrency`
  and `odontogram_lineage_concurrency` - **all PASS.** The new test is registered
  in `scripts/run-local-database-tests.mjs`.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `npm run test:unit` (whole suite) - **1956/1965 passed, 9 failed**: the same 7
  pre-existing booking failures plus `fork-package` and `fork-print-chart`, the
  documented parallel-load flakes, which **pass when run together alone (7/7)**.
- `git diff --check` - clean.
