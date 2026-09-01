# AI Handoff - Unified Clinical Chart workspace, Task 7

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 7 - Contextual bridge and implant records, and the projection that makes the composer usable (2026-09-01)

### Bounded slice implemented

- `public.record_visit_bridge_v2` and `public.record_visit_implant_component_v2` -
  provider-free relationship boundaries that accept an explicit service date,
  obtain their encounter from `public.start_or_resume_clinical_visit`, store the
  encounter linkage, the service date and a bounded note on the relationship row
  itself, derive the treating provider from the signed-in user, and preserve the
  existing request-fingerprint idempotency key space;
- `public.get_clinical_composer_context` - the one authorized read that decides
  which procedures, unresolved active findings, plan items, open procedure cases,
  payment methods, charges and implant abutments the composer may offer;
- `BridgeWorkflow` and `ImplantWorkflow` - rewritten from self-contained cards
  with their own `New bridge` / `New implant` buttons into controlled forms the
  shared composer mounts under `Add clinical record`;
- `BridgeOverlay` - now a real projection of the canonical ordered units, with a
  `data-bridge-unit` / `data-bridge-role` / `data-bridge-connector` contract
  instead of one green bar;
- the drawer's `Bridge and implant` summary for the focused tooth;
- **the inherited requirement**: Task 6's `TreatmentEventForm` is now reachable.
  The projection is read on the server in `page.tsx` and passed down
  `PatientWorkspace` -> `ClinicalSection` -> `OdontogramSection` ->
  `ToothRecordDrawer` -> `ClinicalRecordComposer`.

### Why

Before this checkpoint the bridge and implant workflows were orphaned components
that nothing mounted, wrote through RPCs that open no clinical visit and carry no
service date, and asked the clinician to type raw provider, charge and component
UUIDs into text inputs. Separately, Task 6's treatment-event form mounted only
when a caller supplied a `TreatmentComposerContext` and nothing supplied one, so
no clinician could open it. Both problems have the same cause and the same fix: a
single authorized server projection of what is actually eligible.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-7-brief.md`
  and `global-constraints.md`.
- `CLAUDE.md` / `AGENTS.md`: no client-supplied organization, provider, actor or
  encounter; provider derived with `private.require_active_actor_provider`;
  receptionists may not create clinical records; owners may treat only with an
  active provider link at the acting branch; `security definer set search_path = ''`;
  narrow grants; negative authorization tests in the same checkpoint; guarded
  forward-only migrations; no inline styles; no JS hover/focus handlers; 44px
  touch targets; canonical data independent of any renderer.
- ADR-025 (owner full access), ADR-026 (billing ledger), ADR-028 (renderer domain
  boundary), ADR-029, ADR-030.

### Migration numbering deviates from the brief, deliberately

The brief named `20260901010106`/`010107`, and the controller's override named
`20260901010122`/`010123`. Both sort **before** `20260901010126`, the Task 6
review-fix migration that was already applied, so `db:migrate:local` correctly
refused them as out-of-order. Per the global constraint "check migration
filenames before creating each listed migration", the pair became
`20260901010130`/`010131`, and the additional context pair `010132`/`010133`.
The controller confirmed this choice after the fact and re-allocated Task 8.

### Files added

- `supabase/migrations/20260901010130_relationship_workflows_v2.sql`
- `supabase/migrations/20260901010131_relationship_workflows_v2_grants.sql`
- `supabase/migrations/20260901010132_clinical_composer_context.sql`
- `supabase/migrations/20260901010133_clinical_composer_context_grants.sql`
- `supabase/tests/odontogram_relationship_workflows_v2.test.sql` (54 assertions)
- `src/lib/odontogram/composer-context.ts` - the client-safe shape of the
  projection, declared explicitly so a client component never imports the
  `server-only` service module.
- `src/lib/odontogram/request-key.ts` - `deriveClinicalRequestKey`, extracted so
  the bridge and implant forms submit under Task 6's identical contract.
- `src/components/odontogram/implant-workflow.test.tsx`

### Files changed

- `src/components/odontogram/bridge-workflow.tsx` (+test, rewritten),
  `implant-workflow.tsx`, `bridge-overlay.tsx`.
- `src/components/odontogram/clinical-record-composer.tsx` (+test) - mounts the
  bridge and implant forms behind an optional `relationshipContext`; Planned
  treatment and Photo stay signposts.
- `src/components/odontogram/tooth-record-drawer.tsx` (+test) - accepts
  `composerContext`, splits it into the treatment and relationship contexts, and
  renders the relationship summary.
- `src/components/odontogram/treatment-event-form.tsx` -
  `deriveTreatmentRequestKey` now delegates to the shared helper. Behaviour and
  the export are unchanged.
- `src/lib/odontogram/bridge.ts` (+test) - `orderedBridgeUnits`,
  `bridgeConnectors`, `bridgeSpanSummary`.
- `src/lib/odontogram/implant.ts` (+test) - `currentImplantStage`,
  `nextImplantStage`, `describeImplantStage`.
- `src/lib/odontogram/schema.ts`, `service.ts` - the v2 relationship inputs and
  rows, and the composer-context projection.
- `src/app/(emr)/patients/[patientId]/odontogram-actions.ts` -
  `recordVisitBridgeAction`, `recordVisitImplantComponentAction`.
- `src/app/(emr)/patients/[patientId]/page.tsx`, `patient-workspace.tsx`,
  `clinical-section.tsx`, `odontogram-section.tsx` (+test) - the projection's
  server read and its path to the drawer.
- `src/types/database.generated.ts` - regenerated (`npm run db:types:local`).
- `scripts/approved-final-grants.mjs`, `scripts/remote-database-test-guard.mjs`
  and the three script test files - registry, suite registration, inventory.
- `supabase/tests/odontogram_relationships.test.sql`,
  `supabase/tests/odontogram_implant_idempotency_concurrency.local.mjs`.

### Files deleted

None. `tooth-inspector.tsx` is untouched; Task 17 owns its removal.

### Security and tenancy decisions

- **Public action boundary.** `visitBridgeInputSchema` and
  `visitImplantComponentInputSchema` are `.strict()` and accept route context
  plus clinical facts only. `organizationId`, `treatingProviderId`, `createdBy`,
  a provider display name and `encounterId` are all parse failures. The two
  workflow tests assert the submitted payload carries none of them.
- **Visit binding.** Both RPCs call `public.start_or_resume_clinical_visit` and
  insert nothing into `public.clinical_encounters`, so Task 1 remains the only
  encounter-creating path. pgTAP proves two relationships recorded in the same
  session share one managed OPEN visit.
- **Provider derivation.** `private.require_active_actor_provider` supplies the
  treating provider. No provider parameter exists on either boundary.
- **Permissions.** `patient.clinical.write` **and** `billing.charge`, matching
  the reviewed `public.record_current_bridge` exactly. Nothing was loosened to
  make the composer reachable. `get_clinical_composer_context` requires
  `patient.clinical.read` and gates payment methods behind `payment.record` and
  charges behind `billing.charge`.
- **No charge is posted here.** The browser names a charge that already exists;
  the boundary revalidates it against the derived tenant and the same patient.
- **Sealed history is never rewritten.** Both relationship tables carry
  append-only guards that refuse every update of a sealed CURRENT row. The
  boundaries therefore write the encounter, service date and note **at INSERT
  time** — the bridge row is inserted unsealed, its units written, and only then
  sealed, which is the one update the guard permits. No guard was weakened.
- **No invented history.** The three added columns are nullable and are never
  backfilled. pgTAP asserts a relationship recorded before this task keeps null
  linkage.
- **Lock ordering.** Seed 4 for both relationship request keys, taken before the
  visit's seed-1 request lock and seed-0 identity lock. Identical for every
  caller, so no cycle is constructible. (0 and 1 belong to the visit, 2 to the
  Task 5 composer, 3 to Task 6.)
- **Idempotency.** Both boundaries reuse
  `private.odontogram_revamp_current_idempotency` under the existing
  `CURRENT_BRIDGE` / `CURRENT_IMPLANT` operations, so a v2 and a v3 call cannot
  slip past each other on the same key. The browser derives the key from a
  SHA-256 of the submitted facts, proved by a form test that an unchanged retry
  reuses the key and an edited span rotates it.
- **`supersededFrom`.** Neither object migration revokes any registered grant, so
  no registry entry needed a supersede pivot; the registry records why, and
  records that a pivot would have had to name the revoking object migration.

### Negative authorization cases covered (pgTAP, all `throws_ok`)

Receptionist bridge and implant (`42501`), owner with no active provider link at
the acting branch, foreign-tenant dentist at another organization's branch,
cross-tenant patient, a charge belonging to another patient, a bridge of fewer
than two units, a pontic carrying support (`invalid bridge span`), an
implant-supported abutment naming an unknown component (`invalid implant
support`), a future service date, a service date beyond the one-year backdating
window, a crown depending directly on the fixture, a chain not beginning with a
fixture, a chain spanning two tooth positions, an external placeholder, and the
same request key carrying a different implant (`P0001 idempotency conflict`).
Closing assertions prove every refused attempt left no relationship, no
component and **no clinical visit** behind. The context projection separately
refuses a cross-tenant patient, a foreign-tenant dentist and a receptionist.

### Existing test assertions changed, and why

- `clinical-record-composer.test.tsx`: the signpost loop was
  `["Planned treatment", "Bridge", "Implant", "Photo"]` and is now
  `["Planned treatment", "Photo"]`. Bridge and Implant are no longer signposts;
  four tests were added covering the mounted forms and the notice shown when no
  relationship context is supplied. No assertion was weakened.
- `odontogram-section.test.tsx`: "presents the relationship record kinds ...
  without offering an unbuilt write" asserted `composer-unavailable` naming "the
  bridge relationship workflow". It now asserts `composer-relationship-unavailable`
  and that neither form mounts — the same guarantee (no write is offered that
  cannot be honoured), stated against the new contract. A second test was added
  proving both the relationship forms and Task 6's treatment form mount once the
  projection reaches the drawer.
- `bridge-workflow.test.tsx`: rewritten for the controlled-form contract. The old
  suite tested a five-step dialog and a `New bridge` button that no longer exist.
- `migration-privilege-lint.test.mjs`: 307 -> 311 files, 475 -> 478 functions,
  356 -> 359 security-definer.
- `boundary-privilege-invariant.test.mjs`: three new signatures in the
  effective-final fixture; approved-key count 264 -> 267.
- `remote-database-test-guard.test.mjs`: the new suite added to the expected list.
- `odontogram_relationships.test.sql`: four assertions added (nullable linkage
  columns, tenant-safe encounter FKs, surviving append-only guards, no sealed
  bridge with a service date but no visit). No assertion changed.

### Commands run and observed results

All local only.

- **RED gate, before implementation.**
  `psql < supabase/tests/odontogram_relationship_workflows_v2.test.sql` -
  **`ERROR: function "public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)" does not exist`.**
  `npx vitest run` over the seven touched unit files - **6 files failed, 30
  failed / 68 passed**, with `TypeError: currentImplantStage is not a function`,
  `bridgeConnectors is not a function`, and the workflow, composer and drawer
  suites failing on missing props, missing test ids and missing forms.
- `npm run db:migrate:local` - applied `20260901010130`-`010133`; a later run
  reports **`Local database is up to date.`**
- `npm run db:types:local` - **`Updated src/types/database.generated.ts.`**
- `npm run security:migrations` - **passed**; 311 files, 2995 statements, 1305
  privilege statements, 88 grant-terminals, 396 approved final privileges.
- `npm run test:unit -- <the five brief files>` - **5 files, 62/62 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:db:local` - **`PASS supabase/tests/odontogram_relationships.test.sql`**,
  **`PASS supabase/tests/clinical_treatment_events_v2.test.sql`** and
  **`PASS supabase/tests/odontogram_relationship_workflows_v2.test.sql`**, then
  **halts at `treatment_plans.test.sql`**, the first of the three verified
  pre-existing failures (assertion 7, extra `notes` column - confirmed
  unchanged).
- Suites run directly against the local container:
  `odontogram_relationship_workflows_v2` **54 assertions, P1_TEST_PASS**;
  `odontogram_relationships` **P1_TEST_PASS**; and `clinical_record_composer`,
  `clinical_schema`, `schema`, `foundation_rls`, `owner_full_access`,
  `session_authorization_boundaries`, `odontogram_permission_contract`,
  `odontogram_revamp_permission_contract`, `odontogram_revamp_rpcs`,
  `odontogram_rpcs_v2`, `odontogram_revamp_relationship_perio`,
  `odontogram_atomic_completion_revamp`, `odontogram_domain_expansion`,
  `odontogram_feature_details`, `odontogram_o2_o4_contract_repair`,
  `billing_authorization`, `billing_charge_ledger`,
  `procedure_cases_and_plan_details`, `periodontal_charting`,
  `periodontal_current_state_guard` - **all P1_TEST_PASS**. The three
  pre-existing failures (`treatment_plans`, `seed_security_fixtures`,
  `procedure_installment_schedules`) still fail identically.
- Concurrency tests run directly with the runner's own wiring:
  `odontogram_implant_idempotency_concurrency` (**modified this task to call the
  v2 boundary and to prove one managed visit**), `clinical_visit_resume_concurrency`,
  `odontogram_lineage_concurrency`, `billing_allocation_concurrency`,
  `treatment_item_execution_concurrency` - **all PASS.** No new `.local.mjs`
  test was added, so none was registered.
- `npx vitest run scripts/` - **13 files, 287/287 passed.**
- `npm run test:unit` (whole suite) - **1923/1931 passed, 8 failed** in 3 files.
  Seven are `src/lib/booking/service.test.ts` and
  `src/app/api/public/booking/route.test.ts`, the documented pre-existing
  time bomb; **verified by stashing this task's entire diff and re-running, where
  the same seven fail.** The eighth is `fork-print-chart`, the documented
  parallel-load `Test timed out` flake, which **passes when run alone**
  (5/5). `perio-workspace` also passes alone (7/7).
- `git diff --check` - clean.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. This checkpoint may be described only as locally implemented and locally
  verified.
- `npm run build`: not required by the task gate and not run.

### Known residual risks and open questions

- **`record_current_bridge_v3` and `record_current_implant_component_v3` remain
  granted to `authenticated`.** The brief said *add* provider-free v2 boundaries,
  not retire the v3 ones, so their grants and their actions
  (`recordCurrentBridgeAction`, `recordCurrentImplantComponentAction`) are
  untouched and now carry a comment naming them superseded. Two browser-callable
  relationship writers therefore exist, and the older pair opens no visit and
  stores no service date. This is a cleanliness gap, not an authorization gap:
  both derive the provider server-side and both enforce the same tenant checks.
  Revoking them needs a `supersededFrom` pivot on two registered grants and would
  touch several existing suites; it belongs with Task 17's cleanup.
- **The implant chain payload shape changed, and the old one was broken.** The
  previous `implant-workflow.tsx` submitted `depends_on_component_id`, which
  `private.normalize_implant_chain` ignores; any chain longer than one component
  would have been refused. The v2 path submits `depends_on_ordinal`, the shape
  the reviewed normalizer actually reads.
- **A `clinical_note` column was added alongside `encounter_id` and
  `service_date`.** The brief named only the encounter and service-date columns,
  but its Step 1 test list requires notes, and neither relationship table had
  anywhere to put one. It is nullable, bounded to 2000 characters, and never
  backfilled.
- **A bridge or implant still requires a charge that already exists**, because
  the `record_kind` CHECK on both tables demands one for an internal CURRENT
  record. The composer now offers a server-projected list instead of a typed
  UUID, but a clinician must record the treatment and its cost first. Posting the
  charge from the relationship form would be a new billing path and is out of
  scope.
- **Pre-existing external provenance is refused by the v2 boundaries.** An
  external placeholder records no work done at a visit, so it keeps the existing
  relationship path. Nothing in the composer offers it today.
- **`get_clinical_composer_context` is read once per server render** of the
  patient page. A relationship or charge created in the same session is not
  reflected in the composer's choices until the route revalidates; the actions do
  call `revalidatePath`, so the next render is correct.
- **A receptionist reads no composer context at all**, because the projection
  requires `patient.clinical.read`. That is correct for this content, but it
  means the composer is entirely unavailable to them rather than partially so.
- Geometry remains unverified until the hosted gate: jsdom applies no Tailwind,
  so the 44px targets are proved only as an authored class contract.

### Next bounded task

Task 8 of the plan. Do not start it until Task 7 is independently reviewed and
accepted. `20260901010134`/`010135` onward are free.
