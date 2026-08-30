# Task 4 — Procedure Cases and Structured Plan Details

## RED/GREEN evidence

- RED: added treatment-plan service/execution tests, then observed four expected failures: missing procedure-case execution helpers, unrecognized structured item fields, and the strict detail DTO rejecting the new fields.
- GREEN: `npm run test:unit -- src/lib/treatment-plan` passed 30/30 after the canonical schema/types/execution boundary was extended.
- RED: the initial local migration run exposed legacy writers omitting `sequence_no`; a forward-only `20260830010101` compatibility trigger derives it from immutable `line_no`.
- RED: the existing bounded treatment-plan detail contract exposed that the first projection rewrite flattened its item source. Forward repairs `20260830010103`–`10105` restore the pre-aggregation derived-table source cap, include the organization key required for the case join, and retain the static cap contract.

## Local migration/history note

`20260830010100` was applied locally before its Git checkpoint. Local
`supabase_migrations.schema_migrations` records version/statements but no source
hash. Before committing, its source was corrected to put the required adjacent
top-level revoke after `get_treatment_plan_detail`; `20260830010102` restores
the existing authenticated execute grant through the approved grant-terminal
registry. No reset, hosted command, or production write was used.

## Verification

- Focused Task 4 pgTAP: `P1_TEST_PASS`.
- Existing affected estimate-contract pgTAP: `P1_TEST_PASS` after forward repair.
- `npm run test:unit -- src/lib/treatment-plan`: 2 files, 30 tests passed.
- `npm run typecheck`: passed.
- `npm run security:migrations`: passed (223 migrations; strict grant-last invariant intact).
- `git diff --check`: passed.

## Idempotency retry remediation

- A review identified that a network/response failure could generate a new key
  on retry after the server had already committed the mutation.
- `ForkSaveController` now binds one idempotency key to each draft and reuses
  it for failed/stale/network retries. The key map and confirmed set are
  cleared when the patient/branch identity changes; the patient section also
  keys the controller by that identity.
- Added a synthetic regression test proving an ambiguous network failure and
  retry send the same key while a distinct queued draft still receives a
  fresh key.
- Focused controller/wrapper/patient tests: 22/22 passed; typecheck, targeted
  ESLint, and `git diff --check` passed.

## Self-review / concerns

- Cases/events are renderer-independent, tenant-qualified through composite FKs, RLS-enabled, have no browser base grants, and events are append-only.
- Procedure-case plan-item and charge links are additionally checked to the same patient, not only the same organization.
- Structured plan details freeze under the existing PRESENTED/ACKNOWLEDGED trigger. No drawing, payment, media, UI, or new write RPC was introduced.
- The forward projection repairs are intentionally narrow and guard their expected prior definition before dynamic replacement; Cloud TEST remains a required deferred gate.

## Isolated migration verification

- Created disposable project `dental-emr-isolated` under `C:\Users\Latitude 7430\Desktop\dental-emr-isolated` with ports 55421–55429; the existing `dental-emr` local stack was not stopped, reset, or modified.
- Replayed the committed migration sequence forward successfully after a temporary-only copy patch for the pre-existing duplicate-trigger migration `20260828010401_postdated_cheque_guard_split.sql`; the canonical migration file was unchanged.
- Provisioned synthetic pgTAP tooling with `P1_PROVISION_PASS`; a second `db push --local` reported `upToDate: true`.
- Isolated `odontogram_feature_details.test.sql`, `odontogram_rpcs_v2.test.sql`, and `procedure_cases_and_plan_details.test.sql` all returned `P1_TEST_PASS`; the latter includes public structured add/update round trips, omitted-field preservation, explicit note clearing, frozen-plan denial, and unauthenticated denial.
- The full copied runner stops at the pre-existing `odontogram_domain_expansion.test.sql` seed residual (1 failed assertion); this is outside Task 4 and is retained as a deferred baseline issue rather than masked.

## Review remediation

- `20260830010106` adds same-case correction validation and detail-aware,
  authenticated RPC overloads. They delegate to the existing audited,
  tenant/branch/version/frozen-plan writers, then persist bounded structured
  details in the same transaction. `20260830010107` is the reviewed terminal
  EXECUTE grant registration; no base-table grant was added.
- pgTAP now proves a same-case correction succeeds and a cross-case correction
  fails. Focused local pgTAP is `P1_TEST_PASS`; focused units remain 30/30;
  typecheck and strict migration lint pass.
- Per owner direction, existing local migration history is retained untouched;
  isolated disposable local verification from the committed sequence remains
  pending and is not represented as evidence from the existing container.

## Presence-aware remediation

- `20260830010108`/`10109` add terminally granted, presence-aware writer
  overloads. The service sends explicit presence flags; omitted structured
  fields retain persisted values and explicit `notes: null` clears only notes.
- Focused service unit, strict typecheck, migration privilege lint, and diff
  hygiene passed. Authenticated focused pgTAP now proves add/update detail
  round-trip, omitted-field preservation, and explicit-null note clearing.
- Generated database types now expose the 16-argument presence-aware overloads.
  Focused pgTAP also proves PRESENTED/ACKNOWLEDGED public writes reject and an
  unauthenticated public writer call is denied.

## Controlled fork persistence slice

Implemented `ForkSaveController` and connected it to the patient odontogram.
The controller receives only bounded `ForkClinicalDraft` values and supplies
route-scoped `patientId`/`actingBranchId` to the existing
`recordToothClinicalEntryAction`. The server action remains responsible for
clinical permission, tenant/branch checks, and signed-in provider derivation;
no provider selector or opaque fork JSON is accepted.

Each draft is reviewed in a confirmation dialog with FDI tooth, surfaces,
finding/procedure, occurrence date, and a 2,000-character note. Confirmed
mutations receive a fresh idempotency key, execute one at a time, and invoke a
patient refetch only after success. Equal drafts are deduplicated; failed,
stale, unauthorized, and conflict results retain the local draft and expose a
retry action. Read-only mode renders no save affordance.

The existing fork callback now filters its full-chart state against a stable
canonical draft baseline, so persisted entries are not re-presented as new
changes after an unrelated edit. Charge-bearing workflows remain the existing
audited bridge/implant/treatment-plan procedure flows; the chart-only tooth
entry action does not create a charge because its canonical schema has no
charge field. No migration or billing schema was changed.

## Verification

- RED: `fork-save-controller.test.tsx` initially failed because the controller
  module did not exist.
- GREEN: controller tests passed 5/5, including route scoping, provider
  omission, confirmation, duplicate suppression, serialization, fresh
  idempotency keys, read-only no-op, and stale-draft retention.
- GREEN: fork wrapper + patient section tests passed 21/21 after canonical
  baseline filtering.
- `npm run typecheck`: passed.
- Targeted ESLint for controller, wrapper, and patient section: passed.
- `git diff --check`: passed.
