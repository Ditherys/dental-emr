# AI Handoff - Unified Clinical Chart workspace, Task 13 (round 3, final)

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is `1f9c97b`, `5ca0d04` and this commit.

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

**The isolation proof** (assertions 55-57 after the round-2 additions; 34-36
as first written): the orthodontic case position
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

1. **The receptionist ruling contradicts the task brief.** CONFIRMED CORRECT in
   review round 1; the reviewer traced that there is no second path in and both
   refusals stand. Retained here as the standing decision. The brief says "a receptionist may read the record but may not
   create clinical events." `20260827012800` says, in terms, "Reception gets
   neither clinical permission": a RECEPTIONIST holds `billing.read` and
   `payment.record` and no clinical permission at all. Granting clinical read to
   reception would widen an applied permission contract, which is a stop
   condition, so the projection **refuses a receptionist** and the suite asserts
   it. If the intent really is that reception may read the chronology, that is a
   permission-contract change and belongs in its own reviewed migration, not
   here.
2. **The three money columns are a per-case position, not a per-line movement.**
   RESOLVED in round 2, which was a review Important. Every ledger row now also
   carries `lineAmountMinor` - the signed amount that ONE event moved - and the
   three case columns are renamed `Case charge` / `Case paid` / `Case balance`
   so the two facts cannot be confused. See the round-2 section below.
3. **`procedure_case_events` has five event types and the row contract has
   eighteen.** COMPLETION and CANCELLATION are mapped to `FOLLOW_UP`;
   `CORRECTION` is mapped to `VOID`, because within this projection VOID means
   "an earlier recorded fact was withdrawn or corrected" and it is the only
   member of the closed union carrying that meaning. The distinction survives in
   `sourceKind` and in the event's own reason text, but not in `eventType`.
4. **PHOTO_RENAME can never be produced** from any append-only source.
   ENDORSED in review round 1: a rename changes a display label, not a clinical
   fact. If renames must ever appear, the photograph tables need a rename-event
   row, which is a schema change.
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
   projection is O(patient history) even for a small page. LEDGERED by the
   reviewer as deferred: bounded per patient and fine at current scale.
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

## Task 13 round 2 - review fixes: 0 Critical, 3 Important, 4 Minor (2026-09-02)

The load-bearing constraint was accepted without qualification and the per-case
money arithmetic is UNCHANGED. All three Important findings were about what the
record **says**, not what it computes. One migration,
`20260901010310_clinical_progress_record_repair.sql`, allocated from the
verified ceiling `20260901010301`. It grants and revokes nothing.

### How the applied boundary was replaced

Through `execute` inside a DO block, exactly as `20260901010220` replaces
`public.post_charge`. My first attempt used a top-level `CREATE OR REPLACE` and
`npm run security:migrations` **correctly refused it**:

```
20260901010310_...:133 [security-definer-not-fail-closed]
  SECURITY DEFINER function public.get_clinical_progress_record_v1(...) is created
  without an adjacent REVOKE ALL from public, anon, authenticated.
```

ADR-017 requires that revoke, and the revoke would destroy the `authenticated`
grant `20260901010301` owns, which this migration has no authority to re-issue.
`CREATE OR REPLACE` through `EXECUTE` preserves the ACL, so no privilege moves.
`20260901010220` rewrites one expression with `pg_catalog.replace`; this repair
changes fifteen sites across nineteen branches and adds two CTE columns, so the
replacement text is the whole restated body. The guards are correspondingly
stricter and every one fails closed on `55000`: **before**, the target must exist
with the exact signature, be SECURITY DEFINER, stable and empty-search-path, and
already be executable by `authenticated`; **before**, three text targets are
counted in the applied body (the repaired marker absent, two branch anchors
exactly once each) so a different or already-repaired body is refused;
**after**, the posture is re-asserted and the browser boundary is re-asserted in
both directions - `authenticated` may execute, public/anon/service_role may not.

The local database was rolled back to the pre-repair state before re-applying
(the `20260901010300` body restored through `CREATE OR REPLACE`, the helper
dropped, the `schema_migrations` row deleted). `npm run db:reset:local` was NOT
used. The grant was verified intact across that restore.

### I1 - money movements were invisible and a case position read as a payment

`ALLOCATION` carried an empty description and no amount of its own, so a row
reading "Payment applied" showed the case's `paidMinor` **as of read time** under
a header saying `Paid`. A first installment of 5,000 rendered as 10,000 once a
second had been applied. `PAYMENT`, `REFUND`, `ADJUSTMENT` and `REVERSAL` showed
no amount at all.

Every ledger row now carries `lineAmountMinor`: the signed amount THAT ONE event
moved, read from its own `amount_centavos`, never derived from another row and
never a total. `charge_void`, `payment_void` and `charge_adjustment_reversal`
have no amount column of their own, so they carry the amount of the row they
withdraw, negated. Round 3 corrected `charge_void` to negate the ADJUSTED amount
rather than the raw one. Signs: a charge, payment or allocation is positive; a refund,
reversal or void is negative; an adjustment is signed by its direction.

Desktop headers are now `Amount` / `Case charge` / `Case paid` / `Case balance`,
with `Amount` emphasised and the three case columns muted. The phone summary
line carries the line amount; the disclosure lists all four.

Tests: pgTAP *"an allocation states the amount IT applied, distinct from the case
total paid to date"* pins `500000 of 1000000` in one string, plus five more
pinning payment, refund, adjustment, reversal and charge, plus one asserting a
clinical event carries no line amount at all. Component: *"shows what this event
moved separately from what the case now stands at"* asserts header 4 is `Amount`,
header 6 is `Case paid`, cell 4 is `PHP 5,000.00` and cell 6 is `PHP 10,000.00`.

### I2 - draft clinical content entered the record unmarked

Five branches selected every row regardless of status and put the draft's text in
`description`. It was also a silent broadening: the browser merge this projection
replaced filtered periodontal examinations to `status === "FINAL"`.

Every row from a source with a draft lifecycle now carries `finalized`
(`clinical_encounters`, `clinical_notes`, `prescriptions`, `treatment_plans`,
`periodontal_examinations`); every other source carries `null` rather than
guessing. Drafts are **shown, not hidden** - an unfinished note is part of the
record-in-progress - and the table marks them so they cannot read as signed
history. Round 3 refined that marker: it is per-source (`In progress` for an open
visit, `Draft` for an unsigned document) and carries full foreground emphasis.

Tests: a DRAFT note and a DRAFT periodontal examination were added to the
fixture; six pgTAP assertions cover finalized note true / draft note false /
FINAL exam true / DRAFT exam false / open visit false / draft plan false, plus
one asserting sources with no draft lifecycle report `null`. Component: *"marks
unfinished clinical content and leaves signed history unmarked"*.

### I3 - undisclosed provider inference attributed clinical acts to the wrong clinician

`public.procedure_case_events` has `recorded_by` and **no** provider column. The
projection named the CHARGE's treating provider for every treatment, follow-up
and correction on that case, whoever performed it. New helper
`private.clinical_progress_actor_provider(organization_id, user_id)` resolves the
real actor through `providers.linked_user_id` inside the derived tenant,
deterministically, and returns NULL when that actor is not a provider here -
never a borrowed identity. The `charges` join that existed only to supply that
provider is gone. Clinical photographs get the same treatment from `created_by`,
and the archive row from `archived_by`; both previously passed `null`.

Tests: the fixture gained a second clinician (provider `Cara Santos`, user 6) who
records the orthodontic follow-up on a case whose charge names `Alba Reyes`, and
the correction is recorded by the dental assistant, who is not a provider at all.
Five assertions: the follow-up names Cara; the follow-up and its case charge
report **different** clinicians; the treatment names its own recorder; the
non-provider actor yields NULL; the photograph names its creator.

### Minors fixed

- **Cross-`source_kind` tie.** The DRAFT note sits at the same instant as the two
  findings, so the tie-breaker is now proved across kinds and within one:
  `clinical_note:...003, tooth_clinical_entry:...001, tooth_clinical_entry:...002`.
- **Voided charge with a prior allocation.** The consultation charge is now paid
  100,000, allocated, then reversed with cause `VOID` and voided - mirroring what
  `public.void_charge` does in one transaction. `0/0/0` is no longer a trivial
  pass, and a new assertion proves the allocation and its reversal both survive
  in the record.
- **Positive branch access.** The branch-scoped dentist refused at PROG A Main is
  asserted to read the same patient successfully AT PROG A Second.
- **`clinical-chart-workspace.tsx` is in the brief's Modify list and is
  UNCHANGED.** Disclosed here: it already accepted `record` and
  `recordLoadFailed` and already rendered the bounded-retry region, so mounting
  the new record needed nothing from it. Round 1 failed to say so.

### Ledgered, not fixed

`row_number()` runs over the whole union per call. Correctly self-reported in
round 1 and deferred by the reviewer; fine at current scale.

### Round 2 files

Added: `supabase/migrations/20260901010310_clinical_progress_record_repair.sql`.

Changed: `supabase/tests/clinical_progress_record.test.sql` (43 -> 65
assertions), `src/lib/odontogram/progress-record.ts` (+ suite),
`src/components/odontogram/progress-record-table.tsx` (+ suite),
`scripts/migration-privilege-lint.test.mjs` (files 336 -> 337, function
declarations 507 -> 508; the SECURITY DEFINER count does NOT move, because the
boundary is replaced inside a string literal and a statement in a literal is not
a declaration).

No grant was added, so `scripts/approved-final-grants.mjs`,
`scripts/boundary-privilege-invariant.test.mjs` and
`supabase/tests/approved_grant_registry_integrity.test.sql` are unchanged and
their counters stand at 405 / 269 / 258.

### Round 2 tests run and observed results

Red-green held in both halves. RED, database, before the migration:

```
not ok 27 - a follow-up names the clinician who recorded it, not the clinician on the case charge
not ok 28 - the follow-up and its case charge report different clinicians
not ok 30 - an event recorded by someone who is not a provider here reports no clinician
not ok 31 - a photograph names the clinician who took it
not ok 33..38 - the six finalization assertions
not ok 48..53 - the six line-amount assertions
```

RED, TypeScript: `Test Files 2 failed (2) / Tests 7 failed | 16 passed (23)`.

```
npm run db:migrate:local    -> applied 20260901010310
npm run db:types:local      -> Updated; NO diff (the boundary signature is unchanged)
npm run security:migrations -> passed (337 files, 93 terminals, 405 approved)
npm run test:unit -- progress-record.test.ts progress-record-table.test.tsx
                            -> Test Files 2 passed (2) / Tests 23 passed (23)
npm run test:db:local       -> halts at treatment_plans.test.sql (pre-existing);
                               PASS clinical_progress_record.test.sql
                               PASS approved_grant_registry_integrity.test.sql
npm run typecheck           -> clean
npm run lint                -> 0 errors, 3 warnings (pre-existing, untouched files)
npx vitest run scripts/     -> 13 files, 288 tests passed
```

Run directly, because the gate halts before the end:

```
psql < supabase/tests/clinical_progress_record.test.sql          -> P1_TEST_PASS (65 assertions)
psql < supabase/tests/approved_grant_registry_integrity.test.sql -> P1_TEST_PASS
```

Regression: `clinical-section`, `odontogram-section`, `patient-workspace`,
`clinical-chart-workspace`, `service` -> 5 files, 111 tests passed.

Playwright was not run; hosted E2E remains unauthorized.

### Round 2 residual risks

1. `lineAmountMinor` mixes two sign conventions in one column - "effect on what
   is owed" on the charge side and "money received" on the payment side - unified
   as "positive adds to what this event is about, negative withdraws". Each row
   is labelled by its event type, but a reader scanning only the Amount column
   sees a signed list that does not sum to anything meaningful. It is a per-line
   fact, never a total, and the caption says so.
2. Drafts are shown rather than hidden. That is a deliberate, disclosed
   broadening over the old browser merge, made safe by the `Draft` marker, but a
   clinical owner may prefer them excluded from the printed record.
3. `private.clinical_progress_actor_provider` takes `order by provider.id limit 1`
   because `providers.linked_user_id` carries no uniqueness constraint per
   organization. One user linked to two provider rows in one tenant is already a
   data defect; this makes the projection deterministic rather than correct in
   that case. LEDGERED by the reviewer as deferred.

## Task 13 round 3 - review fixes: 1 Important-family, 1 Medium, 2 Low (2026-09-02)

Re-review came back all-addressed with no new Critical or Important breakage.
Four items remained. One migration,
`20260901010311_clinical_progress_charge_attribution_repair.sql`, allocated from
the verified ceiling `20260901010310`. It grants and revokes nothing and
declares nothing at top level.

### 1 - a corrected charge still named the superseded clinician

The CHARGE branch read `public.charges.provider_id` directly. That column is
immutable and records the clinician the charge was **posted** under; attribution
is corrected through the append-only `public.charge_attribution_corrections`
ledger, and `private.charge_current_attribution` (`20260828010500`) is the
canonical resolver for the attribution that currently stands. A charge whose
attribution had been corrected therefore displayed the wrong clinician,
permanently, in the patient's own record.

This is the same family as the `procedure_case_events` misattribution round 2
repaired, and it is fixed the same way: read the canonical resolver, never the
raw column. Fixing four of five instances of one defect is not discipline, it is
an inconsistent record.

Test: the root-canal charge is posted under `Alba Reyes` and corrected to
`Cara Santos` through the correction ledger; the row is asserted to name
`Cara Santos`, and the uncorrected orthodontic charge is asserted to still name
`Alba Reyes` so the resolver is not simply returning the last provider it saw.

### 2 - a void overstated what it withdrew

The `charge_void` branch reported `-charge.amount_centavos`: the RAW billed
amount. A charge carrying a prior credit adjustment stood at less than that when
it was voided, so the line overstated the movement by the whole adjustment - in
the one column round 2 had just been required to make accurate.

It now reports `-private.charge_adjusted_amount(charge.id, v_organization_id)`,
which is exactly the position `private.clinical_progress_case_money` zeroes on a
void, so the line amount and the case position agree by construction rather than
by coincidence.

Test: a sixth procedure case - 300,000 billed, 100,000 credited, then voided.
The void line is asserted to be `-200000`, and the case position `0/0/0`. No
existing fixture reached this combination.

### 3 - an OPEN encounter rendered a `Draft` chip

**Chosen: a distinct label, not suppression.** An open visit is a real and
useful thing for a chronology to show - it is the row a clinician is currently
working inside - so hiding the marker would remove information. But in a
clinical record "draft" and "in progress" are not interchangeable: a visit that
is still happening is not an unfinished document. `clinicalProgressUnfinishedLabel`
returns `In progress` for `ENCOUNTER` and `Draft` for every other source. The
`finalized` field itself is unchanged, so nothing about the data moved; only
what the screen calls it.

### 4 - the unfinished marker now carries deliberate emphasis

It was `text-[0.6875rem]` `font-normal` `text-muted-foreground` - the quietest
element in a row whose title is `font-medium`. It is now full foreground
contrast, `font-medium`, `text-xs`, with a `border-foreground/40` border. It
stays monochrome, because an EMR does not need a colour here, but it is an
emphasis choice rather than the default muted treatment. "This content is not
finalized" is not a de-emphasis-worthy fact in a clinical chronology.

Test: `gives the unfinished marker real emphasis rather than the lowest in the
row` asserts the marker's class does NOT contain `text-muted-foreground` and
DOES contain `font-medium` and `text-foreground`.

### Ledgered, not fixed

`private.clinical_progress_actor_provider` ordering by `provider.id` with no
per-organization uniqueness on `providers.linked_user_id`, and `row_number()`
over the whole union per call. Both explicitly deferred by the reviewer.

### Round 3 files

Added: `supabase/migrations/20260901010311_clinical_progress_charge_attribution_repair.sql`.

Changed: `supabase/tests/clinical_progress_record.test.sql` (65 -> 69
assertions), `src/lib/odontogram/progress-record.ts` (+ suite),
`src/components/odontogram/progress-record-table.tsx` (+ suite),
`scripts/migration-privilege-lint.test.mjs` (files 337 -> 338 only; the function
declaration count stays 508 and the SECURITY DEFINER count stays 369, because
20260901010311 declares nothing at top level at all - the boundary is replaced
inside a `$definition$` literal that `splitSqlStatements` cannot see).

No grant was added, so `scripts/approved-final-grants.mjs`,
`scripts/boundary-privilege-invariant.test.mjs` and
`supabase/tests/approved_grant_registry_integrity.test.sql` are unchanged at
405 / 269 / 258.

### How the applied boundary was replaced, again

Same guarded DO-block `execute` as round 2, with the anchors counted against the
**applied** body before writing the migration, so the guards pass on a fresh
chain rather than failing closed spuriously:

```
charge.provider_id,          -> 1
-charge.amount_centavos      -> 1
charge_current_attribution   -> 0
```

Two new pre-guards this round: the repaired marker `charge_current_attribution`
must be absent, and `lineAmountMinor` must be **present** - so this migration
refuses to run against a body that predates the round-2 repair and cannot
silently revert it. The post-guard re-asserts posture, both directions of the
browser boundary, and that BOTH repairs survive.

### Round 3 tests run and observed results

RED, database, before the migration:

```
not ok 32 - a charge whose attribution was corrected names the corrected clinician, not the superseded one
not ok 56 - a void of an adjusted charge withdraws the adjusted amount, never the raw one
```

RED, TypeScript: `Tests 3 failed | 23 passed (26)`.

```
npm run db:migrate:local    -> applied 20260901010311
npm run db:types:local      -> Updated; NO diff (the boundary signature is unchanged)
npm run security:migrations -> passed (338 files, 93 terminals, 405 approved)
npm run test:unit -- progress-record.test.ts progress-record-table.test.tsx
                            -> Test Files 2 passed (2) / Tests 26 passed (26)
npm run test:db:local       -> halts at treatment_plans.test.sql (pre-existing);
                               PASS clinical_progress_record.test.sql
                               PASS approved_grant_registry_integrity.test.sql
npm run typecheck           -> clean
npm run lint                -> 0 errors, 3 warnings (pre-existing, untouched files)
npx vitest run scripts/     -> 13 files, 288 tests passed
```

Run directly, because the gate halts before the end:

```
psql < supabase/tests/clinical_progress_record.test.sql          -> P1_TEST_PASS (69 assertions)
psql < supabase/tests/approved_grant_registry_integrity.test.sql -> P1_TEST_PASS
```

`security:migrations` and `approved_grant_registry_integrity` were confirmed
passing together, after the counter move.

Regression: `clinical-section`, `odontogram-section`, `patient-workspace`,
`clinical-chart-workspace`, `service` -> 5 files, 111 tests passed.

Playwright was not run; hosted E2E remains unauthorized.

### Round 3 residual risks

1. `private.charge_current_attribution` is called once per CHARGE row in the
   page, and it scans `charge_attribution_corrections` by `charge_id`, which has
   no index on that column. Bounded at 200 rows per page and correct, but it is
   a per-row lookup; if a patient page ever gets slow this is the first place to
   look.
2. The void line amount uses the adjusted amount **as of the read**, not as of
   the void. An adjustment posted after a void would change what the void row
   claims to have withdrawn. `public.void_charge` makes that path unreachable
   through the reviewed boundary, and the alternative - reconstructing the
   adjustment set as at the void timestamp - would be a genuine point-in-time
   ledger reconstruction rather than a projection.

### Next bounded task

Task 14 - the clinical photograph gallery. This task deliberately contains no
gallery, no interchange and no print view.
