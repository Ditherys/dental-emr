# AI Handoff - Unified Clinical Chart workspace, Task 1

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 1 — Freeze the canonical gap inventory and add a race-safe clinical visit lifecycle (2026-09-01)

### Bounded slice implemented

Task 1 of the accepted plan
`docs/superpowers/plans/2026-09-01-unified-clinical-chart-workspace.md`.
It freezes the verified gap inventory and adds
`public.start_or_resume_clinical_visit`, the single server-side entry point
through which every later clinical write obtains its encounter and its provider
attribution. No workspace UI, renderer, periodontal, or interchange work is in
this checkpoint.

### Why

Before this change the browser could open an unbounded number of `OPEN`
encounters for the same patient, branch, provider and day: `clinical_encounters`
had no clinical date, no visit identity and no uniqueness, and
`create_clinical_encounter_v2` created a new encounter on every call.
`periodontal_examinations.encounter_id` is NOT NULL, so the later periodontal and
charting tasks cannot proceed without a managed, idempotent visit.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-1-brief.md`
  and `global-constraints.md`.
- ADR-025 (owner full access), ADR-028/029/030 (odontogram boundary, local
  completion window, longitudinal revamp).
- `docs/DATABASE_DESIGN.md` tenancy/RLS rules and `docs/SECURITY_ARCHITECTURE.md`
  grant-narrowing rules as applied by `scripts/approved-final-grants.mjs`.

### Files added

- `docs/ODONTOGRAM_CANONICAL_GAP_INVENTORY.md` — verified-only inventory with the
  no-drift baseline, gap-to-task mapping, legacy data that must remain readable,
  revoked mutation boundaries, and the canonical source for every workspace
  projection.
- `supabase/migrations/20260901010100_unified_clinical_visit_lifecycle.sql`
- `supabase/migrations/20260901010101_unified_clinical_visit_lifecycle_grants.sql`
- `supabase/tests/unified_clinical_visit.test.sql` (40 pgTAP assertions)
- `supabase/tests/clinical_visit_resume_concurrency.local.mjs`

### Files changed

- `scripts/approved-final-grants.mjs` — new grant-terminal entry for the
  lifecycle RPC; `create_clinical_encounter_v2` marked `supersededFrom` /
  `supersededBy`.
- `scripts/remote-database-test-guard.mjs`, `scripts/remote-database-test-guard.test.mjs`,
  `scripts/run-local-database-tests.mjs` — register both new test files.
- `scripts/migration-privilege-lint.test.mjs`,
  `scripts/boundary-privilege-invariant.test.mjs` — counters and the final
  effective-boundary fixture follow the new migration and the revoked grant.
- `src/lib/clinical/{schema,types,service,service.test}.ts` —
  `startOrResumeClinicalVisit`, `ClinicalVisitState`, `ClinicalVisitStartResult`,
  Zod input/return contracts.
- `src/app/(emr)/patients/[patientId]/clinical-actions.ts` (+ its test) — the
  existing "open encounter" action now routes through the managed lifecycle so
  the revoked grant does not leave a dead button.
- `supabase/tests/{clinical_rpcs,clinical_permission_contract,clinical_schema}.test.sql`
  — grant boundary, column set, and reception/billing separation updated.
- `src/types/database.generated.ts` — regenerated, never hand-edited.

### Database, security, and tenancy decisions

- `clinical_encounters` gains nullable `clinical_date date` and
  `managed_visit boolean not null default false`. Pre-workspace rows keep
  `managed_visit = false` and `clinical_date = null`; no historical row is
  reconciled, finalized, deleted or rewritten.
- `clinical_encounters_managed_visit_date_check` forbids a managed visit without
  a clinical date.
- `clinical_encounters_managed_open_visit_key` is a partial unique index over
  `(organization_id, branch_id, patient_id, treating_provider_id, clinical_date)`
  `where managed_visit and status = 'OPEN'`, so it can never collide with legacy
  rows. `clinical_encounters_managed_visit_lookup_idx` is the read path.
- The RPC is `security definer set search_path = ''` with fully qualified
  references. It derives the organization from the active acting branch, the
  actor from `auth.uid()`, the provider from `private.require_active_actor_provider`
  (unchanged contract), and the clinical date from `Asia/Manila` on the server.
  It accepts no organization, provider, actor or date from the browser.
- Concurrency: a transaction-scoped advisory lock keyed by
  tenant/branch/patient/provider/date, `for no key update` on the resumed row,
  and a `unique_violation` re-select fallback. An optional idempotency key takes
  a second advisory lock, always before the identity lock, so the two cannot
  deadlock; it is never part of visit identity.
- Only the create path writes one `clinical.encounter.opened` audit event with
  empty allow-listed metadata. A resume writes none. A finalized visit is never
  reopened — the next call opens a new managed visit.
- `create_clinical_encounter_v2` execute is revoked from `authenticated`, so
  `start_or_resume_clinical_visit` is the only browser-callable function whose
  body inserts into `clinical_encounters` (asserted in two suites). Historical
  read, finalize and amend grants are untouched. RLS on `clinical_encounters` is
  unchanged: still enabled with zero policies and zero base-table grants.

### Negative authorization cases covered

Owner without an active provider link, receptionist, dental assistant (in the
existing suite), provider active only at another branch, inactive linked
provider, foreign-tenant dentist, cross-tenant patient, missing patient,
foreign-tenant appointment, appointment belonging to another patient. Each is
asserted to leave the managed encounter set unchanged. Reception-recorded and
dentist-allocated payments are proved to create no encounter and no
encounter-opened audit event, plus a static proof that no payment function body
references the lifecycle RPC or the encounter table.

### Commands run and observed results

All local only, on Docker Desktop `supabase_db_local`.

- `npm run db:start:local` — already running; services reported.
- `npm run db:migrate:local` — applied both new migrations forward; no reset.
- `npm run db:types:local` — `Updated src/types/database.generated.ts.`
- `npm run security:migrations` — passed; 298 files, 82 grant-terminal
  migrations, 388 approved privileges.
- `npm run test:unit -- src/lib/clinical/service.test.ts` — 22/22 passed
  (5 failed before the implementation, as required by TDD).
- `npm run test:unit -- scripts` — 13 files, 287/287 passed.
- `npm run test:unit -- src/lib/clinical "src/app/(emr)/patients/[patientId]/clinical-section.test.tsx"` — 6 files, 50/50 passed.
- `npm run test:unit -- "src/app/(emr)/patients/[patientId]/clinical-actions.test.ts"` — 15/15 passed.
- `npm run typecheck` — passed, no output.
- `npm run lint` — 0 errors, 3 pre-existing warnings.
- `npm run test:db:local` — `PASS supabase/tests/unified_clinical_visit.test.sql`,
  `clinical_rpcs`, `clinical_permission_contract`, `clinical_schema` and every
  earlier suite, then the runner stopped at the **pre-existing** failure in
  `supabase/tests/treatment_plans.test.sql` (assertion 7, `treatment_plan_items`
  approved-field set). That failure reproduces on the unmodified baseline commit
  and is unrelated to this checkpoint.
- Because that stop prevents the registered `.local.mjs` tests from running,
  `runClinicalVisitResumeConcurrencyTest` was executed directly against the same
  container: `PASS supabase/tests/clinical_visit_resume_concurrency.local.mjs`.
  Two simultaneous sessions released from one patient row lock returned one
  encounter id and produced exactly one managed encounter and one audit event;
  the fixture cleaned up completely.
- Every suite registered after `treatment_plans.test.sql` was also run directly
  and passed, except two further **pre-existing** issues:
  `seed_security_fixtures.test.sql` assertion 27 fails on three stale
  `implant-*@synthetic.test` auth rows left in the local database on 2026-08-30,
  and `procedure_installment_schedules.test.sql` ends with
  `select * from extensions.finish()` and emits no `p1_test_result` marker.

### Not run, and why

- `npm run build`, Playwright E2E, Cloud TEST, database advisors, hosted auth
  verification: out of scope for this checkpoint and unauthorized locally.
- No hosted or production command was run. This work may be described only as
  locally implemented and locally verified.

### Known residual risks and open questions

- Three pre-existing local database-gate failures block a clean
  `npm run test:db:local`; none is caused by this checkpoint, and none is owned
  by Task 1.
- `createClinicalEncounter` in `src/lib/clinical/service.ts` is retained but now
  fails closed; it is marked superseded in code and should be removed with the
  other superseded paths.
- `public.add_treatment_plan_discussion` still accepts a client-supplied
  `p_treating_provider_id`. It creates no encounter, so it was deliberately left
  alone here and is flagged in the gap inventory for a controller ruling.
- The clinical date is derived from `Asia/Manila` at statement time. A visit
  opened either side of local midnight is intentionally a different visit.

### Next bounded task

Task 2 — build the unified full-width Clinical workspace shell. Do not start it
until Task 1 is independently reviewed and accepted.
