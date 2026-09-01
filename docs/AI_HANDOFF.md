# AI Handoff - Unified Clinical Chart workspace, Task 6

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 6 - Treatment events, exact finding resolution, immutable charge confirmation (2026-09-01)

### Bounded slice implemented

- `public.record_treatment_event_v2` - one `security definer` transaction that
  obtains its encounter from `public.start_or_resume_clinical_visit`, creates or
  locks the procedure case, records the dated performed / follow-up / completion
  entry for every treated tooth, links the exact active findings being resolved,
  confirms at most one immutable charge, optionally records and allocates an
  immediate payment and an installment schedule, and appends an audit event;
- `TreatmentEventForm` - the composer's `TREATMENT_EVENT` kind, replacing the
  Task 5 signpost;
- `ProcedureChargeConfirmation` - the explicit final confirmation before a charge
  exists;
- `ProcedureFollowupDialog` - now forwards the selected case's expected version
  and states that the original charge is preserved.

### Controller rulings this checkpoint implements

Two questions were escalated before implementation and both were ruled on.

1. **`p_plan_item_id` - Option A was ruled.** A plan-linked completion arrives on
   the **existing-case** path carrying the amount and **delegates to
   `public.complete_treatment_case`**. "Rejects a replacement charge" means
   refuse when `procedure_cases.charge_id is not null`; `charge_id` is nullable
   with a `(organization_id, charge_id)` unique constraint, so the schema already
   models "at most one charge, set once", and a charge-less plan-opened case is a
   first-class state rather than an invented exception. Delegating inherits the
   immutable materialization-contract validation added by `20260830010427` /
   `20260830010428` instead of restating it, which would have created a second
   contract-bypassable plan path.
2. **`post_charge` service date - accepted and bounded.** `post_charge` derives
   `service_date` server-side and takes no date parameter. It was **not**
   modified, and no forward migration changes its signature in this task. See
   "Known residual risks" for the precise limitation.

### Why

Before this checkpoint the composer named `TREATMENT_EVENT` and then refused to
write it, so there was no visit-bound, provider-attributed way to record a
treatment and confirm what it cost. The pre-existing paths were
`record_direct_treatment_with_charge` (no encounter, no finding resolution, no
payment) and `complete_treatment_case` (plan items only). Neither could record an
unplanned treatment, resolve the exact finding it addressed, or take payment in
the same transaction.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-6-brief.md`,
  `global-constraints.md`, and the controller's two rulings above.
- `CLAUDE.md` / `AGENTS.md`: no client-supplied organization, provider, actor or
  encounter; provider derived with `private.require_active_actor_provider`;
  receptionists may not create clinical records or charges; owners may treat only
  with an active provider link at the acting branch; charges confirmed once and
  immutable; never a mutable patient-balance field as the accounting authority;
  `security definer set search_path = ''`; narrow grants; negative authorization
  tests in the same checkpoint; guarded forward-only migrations; no inline
  styles; no JS hover/focus handlers; 44px touch targets.
- ADR-025 (owner full access), ADR-026 (billing ledger), ADR-028, ADR-029,
  ADR-030.

### Files added

- `supabase/migrations/20260901010120_clinical_treatment_events_v2.sql`
- `supabase/migrations/20260901010121_clinical_treatment_events_v2_grants.sql`
  (the plan's `010104`/`010105` would have sorted before the already-applied
  `010110`-`010113`; the controller authorized `010120`/`010121`)
- `supabase/tests/clinical_treatment_events_v2.test.sql` (74 assertions)
- `src/components/odontogram/treatment-event-form.tsx` (+ test)
- `src/components/odontogram/procedure-charge-confirmation.tsx` (+ test)

### Files changed

- `src/lib/odontogram/clinical-codes.ts` - the treatment vocabulary, the
  database-accepted restoration / canal / appliance vocabularies (named
  `TREATMENT_*` because the pre-existing renderer vocabularies of the same shape
  differ), and the finding-compatibility map.
- `src/lib/odontogram/schema.ts` - `treatmentEventInputSchema`,
  `treatmentClinicalDetailSchema`, `immediatePaymentSchema`,
  `installmentScheduleSchema`, `treatmentEventRowSchema`.
- `src/lib/odontogram/service.ts` (+ test) - `recordTreatmentEvent`, one RPC.
- `src/app/(emr)/patients/[patientId]/odontogram-actions.ts` (+ test) -
  `recordTreatmentEventAction`.
- `src/components/odontogram/clinical-record-composer.tsx` (+ test) - mounts the
  treatment form behind an optional `treatmentContext`; Planned treatment,
  Bridge, Implant and Photo stay signposts.
- `src/components/odontogram/procedure-followup-dialog.tsx` (+ test).
- `src/types/database.generated.ts` - regenerated (`npm run db:types:local`).
- `scripts/approved-final-grants.mjs`, `scripts/remote-database-test-guard.mjs`
  and the three script test files - registry, suite registration, inventory.
- `supabase/tests/billing_authorization.test.sql`,
  `billing_charge_ledger.test.sql`,
  `odontogram_atomic_completion_revamp.test.sql`,
  `clinical_record_composer.test.sql` - see "Existing test assertions changed".

### Files deleted

None.

### Security, tenancy and financial-integrity decisions

- **Public action boundary.** `treatmentEventInputSchema` is `.strict()` and
  accepts only route context, the clinical facts, the confirmed amount, optional
  money and a request key. `organizationId`, `treatingProviderId`, `createdBy`,
  `providerDisplay`, `encounterId` and `actingBranchId` are parse failures,
  proved at the schema, the service and the action.
- **Visit binding.** The RPC calls `public.start_or_resume_clinical_visit` and
  binds its entries to the returned encounter. It inserts nothing into
  `public.clinical_encounters`, so Task 1 remains the only encounter-creating
  path.
- **Provider derivation.** `private.require_active_actor_provider` supplies the
  treating provider; `post_charge` independently derives the charge's provider.
  No provider parameter exists anywhere on the boundary.
- **Charge immutability.** The function body contains no `update public.charges`
  (asserted from `pg_proc.prosrc` in two suites). A case may receive a charge
  only when `charge_id is null`; otherwise `22023 'charge already confirmed'`.
  `public.charges` additionally carries the `charges_append_only` trigger, proved
  by a `throws_ok` on a privileged `UPDATE` (`23514`).
- **No mutable balance.** Charge, paid and balance are computed from
  `private.charge_net_allocated` / `private.charge_due` at return time. Payment
  allocates to this case's own charge id only; pgTAP proves an unrelated filling
  paid in full leaves an orthodontic case's balance byte-identical.
- **Delegation, not duplication.** `post_charge`, `record_payment`,
  `allocate_payment`, `create_procedure_installment_schedule` and
  `complete_treatment_case` remain the only writers of their domains. No
  authorization rule of theirs is restated.
- **Permission split.** `patient.clinical.write` always; `billing.charge` only
  when an amount is confirmed; `payment.record` only when money is submitted.
- **Lock ordering.** Seed 3 for this RPC's request key, taken before the visit's
  seed-1 request lock and seed-0 identity lock and before the billing helpers'
  own seed-0 locks. Identical for every caller, so no cycle is constructible.
- **Idempotency.** `private.clinical_treatment_event_idempotency` is keyed by
  (organization, actor, key), stores an md5 fingerprint of every input, returns
  the stored result on replay, and raises `P0001 'idempotency conflict'` when the
  same key carries a different payload. The browser derives the key from a
  SHA-256 of the submitted facts, so an edited retry rotates it and a reverted
  edit returns to the original.

### Negative authorization cases covered (pgTAP, all `throws_ok`)

Receptionist treatment/charge (`42501`), owner without an active provider link,
cross-tenant patient, foreign-tenant dentist at another organization's branch,
replacement charge on an already-charged case (`22023 'charge already
confirmed'`), stale case version (`P0001 'stale version'`), and refused input:
missing service date, future service date, unknown event kind, follow-up without
a case, new case claiming a version, new case with no amount, zero, negative and
over-bound amounts, unlisted restoration material, restoration with no surface,
incisal on a posterior tooth, surface on a whole-tooth treatment, unlisted
root-canal state, a finding code submitted as a treatment, and a finding on a
tooth the event does not treat (`22023 'invalid finding resolution'`). A
receptionist is separately proved able to `record_payment` and `allocate_payment`
against the dentist-confirmed charge while opening no clinical encounter and
recording no case event. Closing assertions prove every refused attempt left no
charge, no case, no treatment and nothing in the foreign tenant.

### Atomicity

Proved, not asserted: an immediate payment larger than the confirmed charge fails
inside `allocate_payment` (`P0001 'allocation exceeds adjusted due'`) after the
charge, the case, the clinical entry and the payment were already written, and
the suite then proves the charge count is unchanged, the tooth-17 entry does not
exist, and no payment carries that call's idempotency key.

### Existing test assertions changed, and why

- `clinical_record_composer.test.sql`: "exactly one browser-reachable path
  records a tooth entry bound to the managed visit" counted visit-bound writers
  and expected 1. Task 6 adds a second legitimate one, so the count became a
  **named set** (`record_treatment_event_v2,record_visit_tooth_findings`) - the
  same guarantee, now failing by name rather than only by count. A comment
  records that `complete_treatment_case` and `amend_tooth_clinical_entry` also
  insert entries and are browser-reachable but open no visit, exactly as before
  this task; they were outside the original assertion and remain outside.
- `billing_charge_ledger.test.sql`: plan 14 -> 16. Two assertions added - the
  `charges_append_only` trigger exists, and no browser-reachable function
  contains `update public.charges`. No assertion changed.
- `billing_authorization.test.sql`: two assertions added for the new boundary's
  grant surface and `security definer` / empty search path. No assertion changed.
- `odontogram_atomic_completion_revamp.test.sql`: one assertion added proving the
  treatment-event boundary references `complete_treatment_case` and does **not**
  contain the contract-drift message, i.e. it delegates rather than duplicates.
  No assertion changed.
- `clinical-record-composer.test.tsx`: "Treatment performed" removed from the
  signpost loop, because it is no longer a signpost; two tests added for the
  mounted form and for the notice shown when no procedure catalogue is supplied.
- `procedure-followup-dialog.test.tsx`: three tests added for the expected
  version and the preserved-charge copy. No assertion changed.
- `migration-privilege-lint.test.mjs`: 304 -> 306 files, 126 -> 127 tables,
  474 -> 475 functions, 355 -> 356 security-definer.
- `boundary-privilege-invariant.test.mjs`: new signature added to the
  effective-final fixture; approved-key count 263 -> 264.
- `remote-database-test-guard.test.mjs`: the new suite added to the expected list.
- `treatment-event-form.test.tsx` (authored this task) was adjusted during
  implementation so the tests that submit a restoration name a treated surface,
  and the follow-up test uses an orthodontic adjustment. Both reflect the real
  rule that a surface-bearing treatment requires a surface.

### Commands run and observed results

All local only.

- **RED gate, before implementation.**
  `psql < supabase/tests/clinical_treatment_events_v2.test.sql` - **`ERROR:
  function "public.record_treatment_event_v2(...)" does not exist`.**
  `npx vitest run` over the five brief unit files - **5 files failed, 15 failed /
  41 passed**; `treatment-event-form` and `procedure-charge-confirmation` failed
  to resolve their modules, and the service, action and follow-up describe blocks
  failed on missing exports and props.
- `npm run db:migrate:local` - both migrations applied; a later run reports
  **`Local database is up to date.`**
- `npm run db:types:local` - **`Updated src/types/database.generated.ts.`**
  (+19 lines.)
- `npm run security:migrations` - **passed**; 306 files, 2972 statements, 1299
  privilege statements, 86 grant-terminals, 393 approved final privileges.
- `npm run test:unit -- <the five brief files>` - **5 files, 72/72 passed.**
- `npm run typecheck` - **passed, no output.**
- `npm run lint` - **0 errors**, the same 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:db:local` - **halts at `treatment_plans.test.sql`**, the first of
  the three verified pre-existing failures. Everything before it passed,
  including the new suite.
- Suites run directly against the local container:
  `clinical_treatment_events_v2` **74 assertions, P1_TEST_PASS**;
  `billing_authorization`, `billing_charge_ledger`,
  `odontogram_atomic_completion_revamp`, `clinical_record_composer` - all
  **P1_TEST_PASS**. Every suite from `treatment_plans` to the end of the
  registry, plus `procedure_cases_and_plan_details`,
  `odontogram_permission_contract`, `odontogram_revamp_rpcs`,
  `odontogram_rpcs_v2`, `odontogram_revamp_permission_contract`, run directly -
  **29 pass, 3 fail**, and the three are exactly the verified pre-existing ones:
  `treatment_plans` assertion 7, `seed_security_fixtures` assertion 27, and
  `procedure_installment_schedules` (missing sentinel).
- Concurrency tests run directly with the runner's own wiring:
  `billing_allocation_concurrency`,
  `procedure_installment_schedules_concurrency`,
  `clinical_visit_resume_concurrency`, `treatment_item_execution_concurrency` -
  **all PASS.** No new `.local.mjs` test was added, so none was registered.
- `npm run test:unit` (whole suite) - **1881/1891 passed, 10 failed** in 5 files.
  Three files (`fork-package`, `fork-print-chart`, `perio-workspace`) are the
  documented parallel-load `Test timed out` flake and **pass when run alone**.
  The other two, `src/lib/booking/service.test.ts` and
  `src/app/api/public/booking/route.test.ts`, fail **alone as well** with
  `"The requested time must be in the future."`: they hardcode
  `requestedStartsAt = "2026-09-01T09:00:00+00:00"`, which the machine clock
  passed during this session. This is a pre-existing time-bomb in files this
  checkpoint does not touch. See "Known residual risks".
- `git diff --check` - clean.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. This checkpoint may be described only as locally implemented and locally
  verified.
- `npm run build`: not required by the task gate and not run.

### Known residual risks and open questions

- **Service date and posting date are different dates by design, and that is
  accepted rather than finished.** The clinical record carries `p_service_date`
  (when the treatment happened); the ledger row carries the server-derived
  posting date (when the charge was recorded). Distinguishing them is normal
  double-entry practice, but it becomes a real accounting concern if a clinic
  backdates a treatment across a month or period boundary, because the revenue
  lands in the posting period rather than the service period. The named future
  remedy is a service-date parameter on `post_charge`, in a separately authorized
  billing slice. Nothing written to the clinical or ledger records implies the
  two dates are the same. A **plan-linked** completion additionally refuses a
  backdated service date outright, because `complete_treatment_case` stamps its
  own occurrence time.
- **A plan-linked completion's clinical entry carries no `encounter_id`.**
  `complete_treatment_case` creates it, and `tooth_clinical_entries` is
  append-only (`protect_tooth_clinical_entry_history` refuses every UPDATE), so
  the entry cannot be bound to the visit afterwards without rewriting that
  reviewed function. The visit is still opened and the audit event still names
  the case. Binding it properly belongs with Task 8's plan mode.
- **The treatment form is not yet reachable in the running app.**
  `ClinicalRecordComposer` mounts it only when a caller supplies
  `treatmentContext` (procedure catalogue, resolvable findings, plan items, open
  cases, payment methods). `ToothRecordDrawer` and `odontogram-section.tsx` do
  not supply it, and neither file is in this task's scope; the projection that
  would feed it does not exist yet. Until then the composer shows a notice naming
  exactly what is missing rather than a generic signpost.
- **The charge-less plan-opened procedure case is fixtured, not produced.** Task
  8's plan mode is the production path that opens such a case; it does not exist
  yet, so `clinical_treatment_events_v2.test.sql` creates one directly, exactly
  as `odontogram_atomic_completion_revamp.test.sql` already does.
- **`STARTED` is unreachable from the UI.** The form's three lifecycle options
  map to `PERFORMED`, `FOLLOW_UP` and `COMPLETED`; `STARTED` remains in the RPC
  contract for Task 8.
- **The two booking test files are a pre-existing time bomb**, now firing. They
  are unrelated to this checkpoint and were not modified; a separate slice should
  make their timestamps relative to the clock.
- **`treatment-event-form.tsx` is large** (roughly 700 authored lines) because it
  carries seven treatment variants plus payment and installment configuration.
  Splitting the per-treatment detail fieldsets into their own module is a
  reasonable follow-up.
- Geometry remains unverified until the hosted gate: jsdom applies no Tailwind,
  so the 44px targets are proved only as an authored class contract.

### Next bounded task

Task 7 of the plan. Do not start it until Task 6 is independently reviewed and
accepted.
