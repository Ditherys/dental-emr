# AI Handoff - Unified Clinical Chart workspace, Task 8

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

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
  sheet for the focused tooth and a per-tooth "proposed" overlay that is stated
  in words rather than drawn as a clinical record.
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
re-verified as `20260901010136` immediately before writing them.

### Files added

- `supabase/migrations/20260901010140_treatment_plan_actor_provider.sql`
- `supabase/migrations/20260901010141_treatment_plan_actor_provider_grants.sql`
- `supabase/tests/treatment_plan_actor_provider.test.sql` (34 assertions)
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
  and no cycle is constructible. No new advisory-lock seed was introduced.

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
  fails identically to before (assertion 7, extra `notes`/`priority`/
  `sequence_no`/`surfaces` columns); this task did not touch that file and the
  failure did not move.
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
- **The plan overlay is a stated list, not a painted chart layer.** Plan items
  are `treatment_plan_items`, not `PLANNED` tooth clinical entries, so painting
  them onto the anatomy would mean inventing a `ClinicalFeatureDetail` the
  clinician never authored. The overlay names the teeth carrying proposals and
  labels them "Proposed, not yet performed"; the anatomy continues to show only
  what was recorded. The renderer (Task 3 output) was deliberately not touched.
- **Multi-tooth authoring is a loop of single-item calls, not one transaction.**
  A failure part-way leaves the earlier lines committed and reports which write
  failed. The plan version is not bumped by an item append, so every line in a
  batch legitimately carries the same expected version.
- **Plan freshness depends on `router.refresh()`.** `TreatmentPlanMode` re-reads
  the plan detail when the server list's `itemCount` changes, so a new line
  appears after the route revalidates rather than immediately.
- Geometry remains unverified until the hosted gate: jsdom applies no Tailwind,
  so the full-width chart, the `md:hidden` phone sheet and the 44px targets are
  proved only as an authored class contract.

### Next bounded task

Task 9 of the plan. Do not start it until this checkpoint is reviewed.
`20260901010142` onward are free.
