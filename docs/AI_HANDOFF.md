# AI Handoff - Unified Clinical Chart workspace, Task 11

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 (canonical periodontal data model) is complete across `5dce284`,
`372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d` and `83de815`. Task 10 (pure
periodontal calculations, graphics and classification) is complete across
`4053739` and `4836ae9`. This commit is Task 11.

## Task 11 - Versioned periodontal draft, autosave, finalize, amend and compare RPCs (2026-09-02)

### Bounded slice implemented

Four versioned write boundaries, two read projections, the trusted server-side
recomputation they rest on, and in-place repairs to the three shipped
periodontal RPCs. **No React component. No renderer change. Task 12's workspace
UI is deliberately absent.**

```
create_periodontal_draft_v2(branch, patient, kind, examined_at, key)
save_periodontal_measurements_v2(exam, expected_version, batch, key)
finalize_periodontal_examination_v2(exam, expected_version, confirmation, key)
amend_periodontal_examination_v2(predecessor, reason, key)
get_periodontal_workspace_v2(patient, branch, exam default null)
compare_periodontal_examinations_v2(patient, branch, left, right)
```

`save/finalize/amend` take no acting branch by design: they derive it from the
examination's own encounter, which is stronger than trusting a caller-supplied
branch. The action layer still accepts a route-context `actingBranchId` for its
own pre-flight permission check; it is not forwarded to the RPC and can widen
nothing.

### Why

Task 9 made the canonical measurements representable and Task 10 made them
computable. Nothing yet let a clinician open a chart, autosave it safely against
a concurrent editor, or finalize it with provenance that survives review. The
shipped periodontal RPCs could not do this: they had no version guard on
autosave, no request keys, no completeness gate, no derived classification, and
two authorization defects described below.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-11-brief.md`
  and `global-constraints.md`, plus the eight inherited requirements the
  controller carried forward from Task 9's review rounds.
- `docs/DATABASE_DESIGN.md` (tenancy, RLS, guarded forward-only migrations),
  `docs/SECURITY_ARCHITECTURE.md` (server-side authorization, no client-supplied
  tenancy), ADR-019, ADR-025, ADR-028, ADR-030.
- `src/lib/odontogram/perio-classification.ts` as the reference the SQL
  derivation mirrors.

### Migrations added

Allocated from the current maximum, which was verified as `20260901010231` in
both `supabase/migrations/` and `supabase_migrations.schema_migrations` before
any file was created. The brief's suggested `010202`-`010205` were stale and
would have sorted before applied files.

- `20260901010240_full_periodontal_rpcs.sql` - the request-key store, five
  private helpers, the three in-place repairs, and the four write boundaries.
  Grants nothing.
- `20260901010241_full_periodontal_rpcs_grants.sql` - four `authenticated`
  execute grants plus a fail-closed boundary assertion.
- `20260901010242_full_periodontal_projection.sql` - the two read projections
  and one private summary helper. Grants nothing.
- `20260901010243_full_periodontal_projection_grants.sql` - two `authenticated`
  execute grants plus a fail-closed boundary assertion.

### The eight inherited requirements, and the test that proves each

All assertions below are in `supabase/tests/periodontal_full_chart_rpcs.test.sql`
unless named otherwise.

1. **Amend must adopt or discard a pre-existing reason-less DRAFT successor.**
   `amend_periodontal_examination_v2` **adopts**. Discarding was rejected: it
   would destroy autosaved clinical measurements with no recovery path, while
   adoption gives the orphan successor the explanation it never had. A FINAL
   successor still means the chain is amended and is refused.
   Test: *"amending a predecessor whose only successor slot already holds a
   reason-less DRAFT adopts that DRAFT rather than failing"*, plus *"the adopted
   successor gains the bounded amendment reason it never had"* and *"adoption did
   not fork the supersession chain"*.
2. **Never write risk inputs and a fingerprint in the same UPDATE.** Autosave
   writes the risk inputs and the version in one statement that touches no
   fingerprint; finalization writes both fingerprints in one statement that
   touches no risk input.
   Test: *"changing a staging or grading input withdraws the stale
   classification, because no fingerprint was written in the same statement"*.
3. **Autosave must avoid no-op child writes.** Every child write is a diff:
   `UPDATE ... WHERE <a provided column actually differs>` followed by
   `INSERT ... WHERE NOT EXISTS`. A statement that matches no row leaves an empty
   transition table, so Task 9's reset triggers withdraw nothing.
   Test: *"an autosave batch that changes nothing reports no written site"* and
   *"a no-op autosave does not withdraw a standing classification"*.
4. **A confirmed-only fingerprint rewrite leaves a stale derived fingerprint.**
   Avoided structurally: finalization writes `derived_*` and `confirmed_*` from
   one digest in one statement, never one without the other.
   Test: *"the finalized examination stores both fingerprints as the true digest
   of its own measurements"*.
5. **`resolve_actor_provider` on create and finalize.** Both shipped functions
   were repaired in place to `private.resolve_actor_provider_at_branch`, a new
   branch-aware and `is_active`-aware helper that still returns NULL rather than
   raising, so their existing contract ("an actor with no link is attributed to
   no provider") is preserved exactly while the branch blind spot closes.
   Finalization additionally lost `coalesce(v_provider_id,
   v_exam.examined_provider_id, v_provider_id)`, which let an actor with no
   provider link finalize another clinician's DRAFT and attribute the immutable
   record to that clinician. The v2 boundaries do not use the tolerant helper at
   all: they call `private.require_active_actor_provider` and refuse.
   Test: *"an actor with no active provider link may not finalize a draft another
   clinician opened"* plus *"the refused cross-actor finalize attributed the
   record to nobody"* - the cross-actor case Task 9's suite never reached - and
   *"an owner with no active provider link at the acting branch may not open a
   periodontal draft"*.
6. **The `0/false` coalescing assertion was INVERTED, not extended.** See the
   dedicated section below.
7. **Serialize per-examination writes with an advisory lock.** Seed **6** is the
   periodontal request-key space and seed **7** the periodontal identity space,
   both distinct from 0/1 (visit), 2 (composer), 3 (treatment events),
   4 (relationships) and 5 (implant fixture trigger). Every periodontal caller
   takes 6, then 7, then the visit's 1 and 0, so the order is structural and no
   cycle is constructible.
   Test: `supabase/tests/periodontal_autosave_concurrency.local.mjs`, both
   scenarios.
8. **Peri-implant surface indices cannot be written before the tooth row
   exists.** Write order inside one batch is tooth rows, then sites, then
   surfaces, then furcation, and it is commented as load-bearing.
   Test: *"a peri-implant surface index and its implant tooth row are accepted in
   one batch because the tooth is written first"* and *"the natural-tooth index
   family is still refused on a peri-implant surface"*.

### The one existing assertion that was inverted, and why

`supabase/tests/periodontal_current_state_guard.test.sql` previously asserted
that `public.save_periodontal_measurements` **keeps** coalescing an omitted
gingival margin to `0` and an omitted bleeding or suppuration answer to `false`.
Task 9 made NULL the single representation of unknown and Task 10 carried it
through every calculation; that coalescing was the one place a browser could
destroy the distinction, inventing a healthy reading for a site nobody assessed.
The RPC was repaired and the assertion inverted to require NULL, with a second
assertion added that the derived attachment level stays unknown too. **This is
the only existing assertion whose meaning changed. Nothing else was weakened,
deleted or retargeted.**

### Trusted finalization

`finalize_periodontal_examination_v2` does not accept a client diagnosis as
truth. It recomputes the classification with
`private.periodontal_derived_classification`, the SQL counterpart of the
reviewed pure port, and then:

- refuses a DRAFT that is not complete (at least one present tooth, and every
  present tooth carrying six charted sites with a known attachment level) with
  `P0001 incomplete examination`;
- compares the clinician's confirmation field by field against the recomputed
  result and refuses with `P0001 override reason required` when they differ and
  no bounded reason was given;
- stores both fingerprints as the true `private.periodontal_measurement_digest`;
- audits the transition with `'{}'` metadata. A diagnosis, a stage and an
  override reason are clinical content and are never copied into an audit event.

### Files added

- `supabase/migrations/20260901010240..010243` (four files, above)
- `supabase/tests/periodontal_full_chart_rpcs.test.sql` - 46 assertions
- `supabase/tests/periodontal_autosave_concurrency.local.mjs`

### Files changed

- `scripts/remote-database-test-guard.mjs` - registers the new pgTAP suite
  directly after `periodontal_full_chart.test.sql`, so the local gate reaches it
  before its known halt.
- `scripts/run-local-database-tests.mjs` - registers the new concurrency test.
- `scripts/approved-final-grants.mjs` - two new grant terminals, six entries.
  Neither object migration revokes a registered grant, so no entry carries a
  `supersededFrom` pivot.
- `scripts/boundary-privilege-invariant.test.mjs`,
  `scripts/migration-privilege-lint.test.mjs`,
  `scripts/remote-database-test-guard.test.mjs` - the counts and fixture lists
  these gates pin, moved with the new objects (files 327 to 331, tables 127 to
  128, functions 491 to 503, SECURITY DEFINER 361 to 368, browser-reachable
  approved grants 262 to 268).
- `supabase/tests/approved_grant_registry_integrity.test.sql` - six signatures
  added, count 251 to 257.
- `supabase/tests/periodontal_current_state_guard.test.sql` - the inverted
  assertion plus one added.
- `src/types/database.generated.ts` - regenerated from the local database.
- `src/lib/odontogram/schema.ts` - v2 input schemas, the bounded measurement
  batch, and five row schemas. Not in the brief's file list; the alternative was
  a second schema module for one domain, which the repository does not do.
- `src/lib/odontogram/service.ts` / `.test.ts` - six v2 service functions,
  eight new tests.
- `src/app/(emr)/patients/[patientId]/perio-actions.ts` / `.test.ts` - four v2
  actions, seven new tests.
- `src/app/(emr)/patients/[patientId]/odontogram-actions.ts` - the four
  duplicate periodontal actions removed, with a comment saying where they went.

### Files deleted

None.

### Security and tenancy decisions

- No boundary accepts `organizationId`, `treatingProviderId`, `createdBy`, an
  encounter, or a provider display name. Organization, patient, acting branch,
  provider and encounter are all derived server-side.
- Every new function is `security definer set search_path = ''`, every reference
  is schema-qualified, execute is granted to `authenticated` only, and every one
  is revoked from `public`, `anon` and `service_role` adjacent to creation. Both
  grants migrations additionally assert this fail-closed at apply time.
- The request-key store `private.periodontal_workflow_idempotency` holds
  identities, counters and classification codes only. It never stores a
  measurement and holds no browser or service privilege.
- Negative cases proved: a receptionist may not open a draft; an owner with no
  active provider link at the acting branch may not open one; a dentist from
  another organization may not open one for a foreign patient; an actor with no
  provider link may not finalize another clinician's draft; a dentist without
  `patient.clinical.correct` may not amend; a DRAFT predecessor may not be
  amended; a foreign-organization dentist may not read the workspace; comparison
  refuses an examination outside the derived tenant and patient.
- Optimistic concurrency: a stale `expected_version` raises before any child
  write, under the per-examination advisory lock, so it provably overwrites
  nothing. A pgTAP assertion re-reads the row afterwards, and the concurrency
  test proves the same under two simultaneous sessions.
- No error path, action result or audit event carries measurement content. A
  unit test asserts the stale-conflict result contains no tooth code or probing
  depth, and another asserts the override result does not echo the reason.

### Tests run and observed results

Red-green was followed. Both new tests were written first and run before any
implementation existed:

```
psql < supabase/tests/periodontal_full_chart_rpcs.test.sql
-> ERROR: function "public.create_periodontal_draft_v2(uuid,uuid,text,timestamptz,uuid)" does not exist

node <runner> supabase/tests/periodontal_autosave_concurrency.local.mjs
-> FAIL relation "private.periodontal_workflow_idempotency" does not exist
```

Task gate, run exactly as the brief lists it:

```
npm run db:migrate:local     -> applied 010240..010243, then "Local database is up to date."
npm run db:types:local       -> Updated src/types/database.generated.ts.
npm run security:migrations  -> Migration privilege lint passed (331 files, 92 terminals, 404 approved)
npm run test:unit -- src/lib/odontogram/service.test.ts \
  "src/app/(emr)/patients/[patientId]/perio-actions.test.ts"
                             -> Test Files 2 passed (2) / Tests 52 passed (52)
npm run test:db:local        -> halts at supabase/tests/treatment_plans.test.sql
npm run typecheck            -> clean, no output
npm run lint                 -> 0 errors, 3 warnings
```

The `test:db:local` halt is **pre-existing and unrelated**: `treatment_plans.test.sql`
fails on assertion 9, *"treatment_plan_items has only the approved fields and the
canonical centavo estimate"*. Every suite registered before it is reached and
passes, including all five periodontal suites and the registry-integrity suite:

```
PASS supabase/tests/approved_grant_registry_integrity.test.sql
PASS supabase/tests/periodontal_charting.test.sql
PASS supabase/tests/periodontal_full_chart.test.sql
PASS supabase/tests/periodontal_full_chart_rpcs.test.sql
PASS supabase/tests/periodontal_current_state_guard.test.sql
```

The three lint warnings are pre-existing and in files this task did not touch
(`treatment-plan-section.tsx`, `src/lib/treatment-plan/schema.ts`).

Run **directly**, because the gate cannot reach them:

```
psql < supabase/tests/periodontal_full_chart_rpcs.test.sql        -> P1_TEST_PASS
psql < supabase/tests/periodontal_current_state_guard.test.sql    -> P1_TEST_PASS
psql < supabase/tests/periodontal_full_chart.test.sql             -> P1_TEST_PASS
psql < supabase/tests/periodontal_charting.test.sql               -> P1_TEST_PASS
psql < supabase/tests/odontogram_permission_contract.test.sql     -> P1_TEST_PASS
psql < supabase/tests/odontogram_revamp_rpcs.test.sql             -> P1_TEST_PASS
psql < supabase/tests/odontogram_revamp_relationship_perio.test.sql -> P1_TEST_PASS
psql < supabase/tests/approved_grant_registry_integrity.test.sql  -> P1_TEST_PASS
runPeriodontalAutosaveConcurrencyTest(...)                        -> PASS
npx vitest run scripts/                                           -> 288 passed (288)
```

**All thirteen registered `.local.mjs` concurrency tests, the new one included,
are currently unreachable through either runner**: the local runner executes the
whole pgTAP loop before any of them and the remote runner never runs them. The
registration added here is correct and Task 17 owns making it reachable; until
then the only evidence for it is the direct run above.

### Tests not run, and why

- `npm run test:db` (Cloud TEST) - not run. No hosted project was contacted.
- Playwright - not run. No route or component changed; the brief excludes it.
- `npm run build` - not run; the task gate does not include it.
- The full `npm run test:unit` sweep - not run; the gate names two files. The
  pre-existing booking-test timestamp failures recorded in the Task 10 handoff
  are unchanged and unowned by this task.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. Cloud TEST, hosted E2E,
responsive/accessibility device verification, database advisors and final
security acceptance remain release gates.

### Known residual risks and open questions

1. **The clinical mapping is still unvalidated.** The SQL derivation mirrors
   `perio-classification.ts`, which remains on the dentist acceptance gate opened
   in Task 10. The SQL and the TypeScript are two hand-maintained
   implementations of one rule set; nothing in the repository yet asserts they
   agree on a shared table of cases. That cross-check is the single largest
   residual risk here.
2. **Completeness is strict.** An examination is complete only when every present
   tooth carries six charted sites with a known attachment level, so a chart with
   one unrecorded gingival margin cannot be finalized. That is Task 10's own
   definition of complete and is deliberate, but it is a clinical workflow
   decision a dentist should confirm.
3. **The shipped v1 boundaries remain granted.** They were repaired rather than
   revoked, because `odontogram_permission_contract.test.sql` and
   `periodontal_full_chart.test.sql` both assert `authenticated` still holds
   them. They still lack a version guard on autosave and request keys, so a
   direct caller can bypass optimistic concurrency. Revoking them is a bounded
   follow-up that must also update those two assertions.
4. `create_periodontal_draft_v2` resumes the one open non-amendment DRAFT on the
   visit. A clinician who genuinely wants two concurrent periodontal drafts on
   one visit cannot have them; that has not been asked for.
5. `get_periodontal_workspace_v2` returns the whole examination in one payload.
   For a 32-tooth six-site chart that is bounded and small, but it is not
   paginated and Task 12 should not assume it ever will be.

### Areas Codex should scrutinize

- Whether any write path still coerces an omitted measurement to `0`/`false`,
  including the INSERT branches where a NOT NULL flag column takes its default.
- The diff-write predicates: whether a provided column that changed can ever be
  skipped, and whether an unprovided column can ever be overwritten.
- The advisory-lock ordering argument (6, then 7, then the visit's 1 and 0) and
  whether any other caller can take them in a different order.
- That a stale `expected_version` cannot overwrite newer data, including under
  the `RETURNING ... INTO` second guard.
- The guarded-replace block: that each target's expected occurrence count is
  right and that every step fails closed on 55000.
- Whether `private.periodontal_derived_classification` can produce a row that
  violates `perio_exam_derived_complete_check` or
  `perio_exam_derived_stageable_check`, and whether it agrees with
  `derivePerioClassification` on the cases Task 10 tabulated.
- The adoption path in `amend_periodontal_examination_v2`: whether adopting a
  DRAFT successor can mutate the predecessor, fork the chain, or lose an earlier
  autosave.
- That no audit event, error message, action result or log line carries
  measurement content.

### Next bounded task

Task 12 - the unified periodontal workspace UI, built on
`get_periodontal_workspace_v2`, `compare_periodontal_examinations_v2` and the
four versioned write actions in `perio-actions.ts`.
