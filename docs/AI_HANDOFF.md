# AI Handoff - Unified Clinical Chart workspace, Task 13

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is this commit.

## Task 13 - the canonical chronological progress-record projection (2026-09-02)

### Bounded slice implemented

One authorized server projection that unions the append-only clinical and
financial sources a patient's record is actually made of, and the screen that
reads it. The browser no longer assembles a chronology or computes any money.

```
20260901010300_clinical_progress_record_projection.sql        object migration
20260901010301_clinical_progress_record_projection_grants.sql grant terminal
supabase/tests/clinical_progress_record.test.sql              43 assertions
src/lib/odontogram/progress-record.ts                         parse + format
src/components/odontogram/progress-record-table.tsx           table + phone list
```

### Why

The record below the chart was assembled in the browser from two client DTOs:
the odontogram DTO and a `PatientAccountRowDTO[]` ledger list. It merged only
findings, treatments, finalized periodontal examinations, and CHARGE/PAYMENT
rows; it invented `actorDisplay: "Recorded clinician"` because the DTO carried
no provider; it set `procedureCaseId` and `caseBalanceCentavos` to `null`
unconditionally, so the balance column was permanently blank; and encounters,
notes, prescriptions, plans, follow-ups, photographs, adjustments, refunds,
reversals and every void were simply absent from the patient's history.

### The projection

`public.get_clinical_progress_record_v1(p_patient_id, p_branch_id, p_limit,
p_offset)` - stable SECURITY DEFINER, `search_path = ''`, every reference
schema-qualified, `authenticated` execute only, revoked from public/anon/
service_role. It accepts no organization identifier, no provider, no actor and
no display name. It writes nothing: no row, no state change, no audit event.

Seventeen of the eighteen contract event types are produced, from nineteen
union branches over: `clinical_encounters`, `clinical_notes`, `prescriptions`,
`tooth_clinical_entries` (twice - the entry and its void), `treatment_plans`,
`procedure_case_events`, `periodontal_examinations`, `clinical_photographs`
(twice - capture and archive), `charges`, `payments`, `payment_allocations`,
`payment_refunds`, `payment_allocation_reversals`, `charge_adjustments`,
`charge_adjustment_reversals`, `charge_voids`, `payment_voids`.

**PHOTO_RENAME is deliberately never produced.** Renaming a photograph updates
`display_filename` in place and bumps a version; no append-only source records
that it happened, and `private.audit_metadata_is_safe` deliberately carries no
filename, so an audit-sourced row could only say "renamed" with no before or
after. Fabricating it would put a clinical chronology on top of a security
artifact and still say nothing. Asserted absent, with the reason, in the suite.

### How every money value is derived

`private.clinical_progress_case_money(charge_id, organization_id)` returns three
values for ONE procedure case's charge, computed at read time:

```
charge_minor  = 0 when the charge is voided,
                else private.charge_adjusted_amount(charge, org)
paid_minor    = private.charge_net_allocated(charge, org)
balance_minor = charge_minor - paid_minor
```

Both underlying helpers are the reviewed B3 ledger functions. Nothing is stored,
cached or accumulated; `private.patient_account_balance` is never called; no row
carries a running total; and `balanceMinor` is arithmetically forced to equal
that same row's `chargeMinor - paidMinor`, asserted for every row that has any
money at all. Two procedure cases share no term in the arithmetic, which is why
settling one cannot move another.

A voided charge is reported as owing nothing rather than disappearing. `charge`
and `charge_void` are both rows in the chronology. Because `public.void_charge`
reverses every allocation in the same transaction, `charge_net_allocated`
already returns 0 for a voided charge, so the position is 0/0/0.

**The isolation proof** (assertions 34-36): the orthodontic case position
`8000000/1000000/7000000` is captured from the projection, an unrelated filling
is then paid in full, and the orthodontic position is re-asserted byte-identical
while the filling moves to `150000/150000/0` and the unrelated root-canal case
stays at `400000/0/400000`.

That proof was **mutation-tested**, not merely observed to pass. Replacing the
helper with a patient-wide sum (the exact defect the constraint forbids) turns
assertions 27, 28, 29, 30, 34, 35 and 36 red. Captured output is in the task-13
report.

### Ordering and its tie-breaker

Chronological ascending on the canonical `occurred_at` of each source, tie-broken
on `(source_kind, source_id)`. That pair is total across the whole union because
`source_id` is a primary key within its own source table. Two findings recorded
at the identical instant are asserted to come back in `source_id` order, and a
second identical request is asserted to return a **byte-identical payload**, so
the ordering is repeatable rather than incidental.

### Service dates versus posting dates

They stay two rows at two instants and are never collapsed. The fixture performs
an orthodontic treatment on 2026-08-16 and posts its charge on 2026-08-23; both
rows are asserted at their own date and asserted to be two distinct dates.

**No date is derived in this migration at all** - each row carries the
`timestamptz` its own source recorded - so this adds no ninth
`statement_timestamp()::date` site to the eight pre-existing ones.

### How each unioned source's voids are detected

The sources do not agree, and each was checked rather than assumed:

| source | withdrawal recorded as |
|---|---|
| `tooth_clinical_entries` | `lifecycle = 'VOIDED'`, `voided_at` kept in step by `tooth_clinical_entries_voided_state_check` |
| `charges` | a row in `charge_voids` |
| `payments` | a row in `payment_voids` |
| `charge_adjustments` | a row in `charge_adjustment_reversals` |
| `payment_allocations` | rows in `payment_allocation_reversals` |
| `clinical_photographs` | `archived_at` on the row; archiving is terminal |

A bare `voided_at is null` predicate would be wrong for four of those six. The
one place `voided_at` is read is `tooth_clinical_entries`, where the CHECK
constraint guarantees it agrees with `lifecycle`, and the predicate is written
as `lifecycle = 'VOIDED' and voided_at is not null`.

### Security and tenancy decisions, and the negatives that cover them

- `patient.clinical.read` at an active acting branch is required to call at all.
- The ledger branches and all three money fields additionally require
  `billing.read` at that same branch. A DENTAL_ASSISTANT (clinical read, no
  billing read) gets the complete clinical chronology, zero ledger rows, null
  money on every row, and `financialVisible: false` so the screen can say the
  money is withheld rather than render a blank column that reads as "nothing
  owed".
- **A RECEPTIONIST is refused outright.** See the open question below.
- A patient outside the derived tenant raises `42501 not authorized` rather than
  being reported absent.
- Bounds are enforced in SQL (`22023 invalid input` for limit < 1, limit > 200,
  offset < 0, offset > 10000) and mirrored in `clinicalProgressRecordInputSchema`
  so a bad page is refused before a round trip. SQL is where the rule lives.
- Negative cases, all `throws_ok` with exact SQLSTATE and message: receptionist;
  foreign-organization dentist; branch-scoped dentist acting at a branch his role
  does not cover; foreign patient; three bounds violations.
- Two assertions prove the read is inert: `audit_events` for the tenant is 0
  after the whole suite, and the function body contains no write statement.

### The one existing assertion that changed, and why

`clinical-section.test.tsx` - *"presents one Clinical chart workspace instead of
the legacy inner tabs"* asserts `progress-record-table` is visible. The record
region now renders the server projection, so `renderSection` was given an empty
canonical record. **The assertion itself is unchanged**; only the fixture gained
the prop the component now needs. Nothing was weakened or deleted.

`odontogram-section.test.tsx` lost one line: the `renderProgressRecord={false}`
prop, because that prop no longer exists. No assertion changed.

### Files added

- `supabase/migrations/20260901010300_clinical_progress_record_projection.sql`
- `supabase/migrations/20260901010301_clinical_progress_record_projection_grants.sql`
- `supabase/tests/clinical_progress_record.test.sql`

Migration numbers were allocated after verifying the applied maximum was
`20260901010246` both on disk and in `supabase_migrations.schema_migrations`.
`03956f5` and `2ec2a4d` landed on `main` while this task was in progress and add
no migration, so the allocation still holds and still sorts last.

### Files changed

- `src/lib/odontogram/progress-record.ts` - the canonical row/record types, the
  Zod parser (fails closed on an unknown event type), and the label, amount,
  Manila date/time, tooth and procedure formatters. `progressEventsFromAccount`
  and `PatientAccountRowDTO` are **deleted**: money assembled in a browser is
  not the ledger's answer. `ProgressEventDTO`, `progressEventsFromOdontogram`
  and `sortProgressEvents` remain, marked deprecated, because the odontogram
  print sheet still consumes them; converting that is task 16's slice.
- `src/components/odontogram/progress-record-table.tsx` - rewritten against the
  projection. Desktop table with Date/time, Procedure/event, Tooth, Provider,
  Charge, Paid, Balance, Notes; the three money columns are removed entirely
  when the caller may not read them. Phone list is the same chronology in the
  same order behind a native `<details>` disclosure per entry - no JavaScript,
  no width branching, `min-h-11` summary. No `Card`, no inline `style`, no JS
  hover/focus handler, no grouping of any kind.
- `src/lib/odontogram/schema.ts` - `clinicalProgressRecordInputSchema`, and
  `projectionPayloadRowSchema` naming the shared single-row jsonb envelope.
- `src/lib/odontogram/service.ts` - `getClinicalProgressRecord`.
- `src/app/(emr)/patients/[patientId]/page.tsx` - the one authorized read, kept
  separate from the chart read so a failed chronology leaves the odontogram
  intact.
- `.../patient-workspace.tsx`, `.../clinical-section.tsx` - thread the record;
  a null record is treated as a failed region with a bounded retry rather than
  as an empty history.
- `.../odontogram-section.tsx` - stops rendering a second progress record. The
  workspace owns that region.
- `scripts/approved-final-grants.mjs` - the new grant terminal and its reason.
  The object migration revokes no registered grant, so no `supersededFrom`
  pivot is recorded; had it revoked one, the pivot would name that object
  migration, never the grants file.
- `scripts/remote-database-test-guard.mjs` - the suite is registered **before**
  `treatment_plans.test.sql`, because the local gate halts there.
- `scripts/remote-database-test-guard.test.mjs`, `scripts/migration-privilege-lint.test.mjs`
  (files 334 -> 336, function declarations 504 -> 507, SECURITY DEFINER 368 ->
  369), `scripts/boundary-privilege-invariant.test.mjs` (browser-reachable
  approved keys 268 -> 269), `supabase/tests/approved_grant_registry_integrity.test.sql`
  (the new signature and 257 -> 258) - the registry-integrity property required
  every one of these to move together, which is the point of it.
- `src/types/database.generated.ts` - regenerated; one function added.

### Files deleted

None.

### Tests run and observed results

Red-green was followed in both halves.

RED, database - fixtures all applied, the boundary did not exist:

```
docker exec -i supabase_db_local psql ... < supabase/tests/clinical_progress_record.test.sql
-> ERROR: function "public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)" does not exist
```

RED, TypeScript - the new contract had no implementation:

```
npx vitest run src/lib/odontogram/progress-record.test.ts \
               src/components/odontogram/progress-record-table.test.tsx
-> Test Files 2 failed (2) / Tests 17 failed | 2 passed (19)
   TypeError: parseClinicalProgressRecord is not a function
   TypeError: clinicalProgressEventLabel is not a function
```

Task gate, run exactly as the brief lists it:

```
npm run db:migrate:local    -> applied 20260901010300 and 20260901010301
npm run db:types:local      -> Updated src/types/database.generated.ts
npm run security:migrations -> passed (336 files, 93 terminals, 405 approved)
npm run test:unit -- progress-record.test.ts progress-record-table.test.tsx
                            -> Test Files 2 passed (2) / Tests 19 passed (19)
npm run test:db:local       -> halts at supabase/tests/treatment_plans.test.sql
                               (pre-existing; assertion 9, unchanged)
                               PASS supabase/tests/clinical_progress_record.test.sql
                               PASS supabase/tests/approved_grant_registry_integrity.test.sql
npm run typecheck           -> clean, no output
npm run lint                -> 0 errors, 3 warnings (pre-existing, untouched files)
```

Run **directly**, because the local gate halts before the end:

```
psql < supabase/tests/clinical_progress_record.test.sql          -> P1_TEST_PASS (43 assertions)
psql < supabase/tests/approved_grant_registry_integrity.test.sql -> P1_TEST_PASS
psql < supabase/tests/treatment_plans.test.sql                   -> not ok 9 (pre-existing)
```

Mutation proof of the isolation assertion, run directly against a copy of the
suite with the money helper replaced by a patient-wide sum:

```
not ok 27, 28, 29, 30, 34, 35, 36
```

Regression sweep:

```
npx vitest run scripts/                 -> 13 files, 288 tests passed
npx vitest run src/components/odontogram/ src/lib/odontogram/ \
               "src/app/(emr)/patients/[patientId]/"
                                        -> 985 passed, 2 failed
```

Both failures were `Test timed out in 5000ms` under a 74-file parallel run, in
`fork-print-chart.test.tsx` and `perio-workspace.test.tsx`. This is the same
pre-existing parallel-run timeout the task 12 handoff recorded. Re-run in
smaller batches they pass:

```
npx vitest run fork-print-chart.test.tsx perio-chart.test.tsx      -> 5 passed
npx vitest run fork-package.test.ts perio-workspace.test.tsx
               periodontal-measurement-grid periodontal-risk-classification
                                                                   -> 44 passed
npx vitest run progress-record, progress-record-table, clinical-section,
               odontogram-section, clinical-chart-workspace, service
                                                                   -> 119 passed
npx vitest run patient-workspace.test.tsx                          -> 11 passed
```

### Tests not run, and why

- **Playwright - not run.** Hosted E2E is a release gate and was not authorized
  for this task. No E2E spec was added.
- `npm run test:db` (Cloud TEST) - not run. No hosted project was contacted.
- `npm run build` - not run; the task gate does not include it.
- No `.local.mjs` concurrency test was added. The projection is read-only and
  takes no lock, so there is no concurrency invariant to serialize.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. Cloud TEST, hosted E2E,
responsive/accessibility device verification, database advisors and final
security acceptance remain release gates. The phone disclosure geometry and the
44px summary target are asserted only by class in jsdom, which applies no
Tailwind.

### Known residual risks and open questions

1. **The receptionist ruling contradicts the task brief and needs the
   controller.** The brief says "a receptionist may read the record but may not
   create clinical events." `20260827012800` says, in terms, "Reception gets
   neither clinical permission": a RECEPTIONIST holds `billing.read` and
   `payment.record` and no clinical permission at all. Granting clinical read to
   reception would widen an applied permission contract, which is a stop
   condition, so the projection **refuses a receptionist** and the suite asserts
   it. If the intent really is that reception may read the chronology, that is a
   permission-contract change and belongs in its own reviewed migration, not
   here.
2. **The three money columns are a per-case position, not a per-line movement.**
   Every row of the same procedure case shows the same charge/paid/balance - the
   case's ledger position as of the read. A PAYMENT row therefore shows no
   amount of its own; the ALLOCATION row that applied it to a case does. The
   caption says exactly this. It is the design the "no running total" constraint
   forces, but it is a real departure from a paper chart's per-line "amount
   paid" column and the controller may want a different presentation.
3. **`procedure_case_events` has five event types and the row contract has
   eighteen.** COMPLETION and CANCELLATION are mapped to `FOLLOW_UP`;
   `CORRECTION` is mapped to `VOID`, because within this projection VOID means
   "an earlier recorded fact was withdrawn or corrected" and it is the only
   member of the closed union carrying that meaning. The distinction survives in
   `sourceKind` and in the event's own reason text, but not in `eventType`.
4. **PHOTO_RENAME can never be produced** from any append-only source. See
   above. If renames must appear in the record, the photograph tables need a
   rename-event row, which is a schema change.
5. **A charge with no procedure case still carries money.** Direct charges exist
   (`charges.procedure_id` without a `procedure_cases` row). Those rows report
   the charge's own ledger position with `procedureCaseId: null`. That is still
   per-charge and still ledger-derived, but it is not literally "per procedure
   case".
6. **The page is bounded at 200 and the route requests 200 with no paging UI.**
   `hasMore` is returned and the caption says the page is bounded, but a patient
   with more than 200 recorded events cannot yet page through them from the
   screen. The RPC supports it; the UI does not.
7. `row_number()` is computed over the whole union on every call, so the
   projection is O(patient history) even for a small page. Bounded per patient
   and acceptable now; it is not a good shape for a very long-lived record.
8. `charge_adjustments` gained
   `charge_adjustments_org_charge_occurred_idx (organization_id, charge_id,
   occurred_at, id)`. That table carried **no** index on the charge path at all,
   and `private.charge_adjusted_amount` scans it on every money read, so this
   also speeds up the existing billing boundaries. No other index was added.

### Areas Codex should scrutinize

- `private.clinical_progress_case_money`: whether any input can make it return a
  value that is not exactly `charge_adjusted_amount - charge_net_allocated`, and
  whether a voided charge with an unreversed allocation could report a negative
  balance.
- The `left join lateral` in the final projection: that passing
  `case when v_financial then page.charge_id else null end` really prevents the
  helper from running for a caller without `billing.read`, and that a null
  charge id yields no row rather than a zeroed one.
- Every financial union branch: that `v_financial` gates it, and that no branch
  can leak a foreign patient's row through its join graph (each is qualified on
  both `organization_id` and the patient of the row it hangs from - the
  `payment_allocations`, `charge_adjustments` and reversal branches take the
  patient from the joined charge or allocation, not from their own table).
- The tie-breaker: whether `(occurred_at, source_kind, source_id)` can ever be
  non-total, and whether the `row_number()` window and the `jsonb_agg` order by
  can disagree.
- `private.clinical_progress_case_teeth`: the `tooth_code` regex on
  `treatment_plan_items`, which is a free-text column there.
- The pagination window arithmetic (`sequence_no > v_offset` and
  `<= v_offset + v_limit + 1`) and the `filter` that separates the page from the
  has-more probe.
- Whether `parseClinicalProgressRecord` failing closed can blank the whole
  record region on a payload the server considers valid.
- The grants file guard, and that the two private helpers are unreachable from
  every browser and service role.

### Next bounded task

Task 14 - the clinical photograph gallery. This task deliberately contains no
gallery, no interchange and no print view.
