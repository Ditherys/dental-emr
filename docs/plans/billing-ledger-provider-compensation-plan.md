# Billing Ledger and Provider Compensation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` when explicitly authorized and
> available, or `superpowers:executing-plans`, and follow test-driven development
> task by task.

**Status:** Accepted by the project owner on 2026-08-28. Execute B0-B11 in
order under the bounded local-only authority in ADR-027; see
`docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`.

**Goal:** Build the internal PHP-centavo charge/payment ledger and provider-
compensation prerequisite required by completed odontogram procedures.

**Architecture:** Extend the existing Supabase ledger conventions through
tenant-safe tables and narrow SECURITY DEFINER RPCs. Next.js server actions call
strict `src/lib/billing/` adapters; the browser receives bounded DTOs and never
owns balances, authorization, tenant identity, audit identity, or earnings
calculations.

**Tech stack:** PostgreSQL/Supabase, pgTAP, Next.js 16 App Router, React 19,
TypeScript strict, Zod 4, shadcn/ui, Vitest/Testing Library, Playwright.

## Global Constraints

- Work in the existing main checkout only; do not create a branch or worktree.
- The independent-review and explicit-acceptance gate is mandatory before B1.
- Use forward-only migration files; do not reset or wipe the local database.
- Migration files in Git are authoritative; never leave direct/MCP SQL changes.
- Use deterministic synthetic data only.
- All new tenant tables use RLS, zero base grants, and composite tenant-safe FKs.
- Every SECURITY DEFINER function uses `set search_path = ''`, derives actor and
  tenant server-side, and receives exact terminal grants in a later migration.
- Financial corrections append ledger rows; no hard deletes or mutable balance.
- Money is bounded integer centavos (`bigint` in server/database, decimal string
  over JSON/forms), currency is PHP, and rates are integer basis points.
- BIR invoices/receipts remain out of scope under Phase 21 discovery.
- Every production behavior follows RED -> GREEN -> REFACTOR.

## Planned File Map

Database migrations:

- `supabase/migrations/20260828010000_billing_permission_contract.sql`
- `supabase/migrations/20260828010100_billing_catalog_and_charge_ledger.sql`
- `supabase/migrations/20260828010200_payment_allocation_ledger.sql`
- `supabase/migrations/20260828010300_provider_compensation.sql`
- `supabase/migrations/20260828010400_postdated_cheques.sql`
- `supabase/migrations/20260828010500_billing_rpcs.sql`
- `supabase/migrations/20260828010501_billing_rpcs_grants.sql`
- `supabase/migrations/20260828010600_financial_analytics.sql`
- `supabase/migrations/20260828010601_financial_analytics_grants.sql`
- `supabase/migrations/20260828010700_treatment_estimated_fee_contract.sql`

Database tests:

- `supabase/tests/billing_permission_contract.test.sql`
- `supabase/tests/billing_charge_ledger.test.sql`
- `supabase/tests/billing_payment_allocations.test.sql`
- `supabase/tests/billing_corrections.test.sql`
- `supabase/tests/billing_attribution.test.sql`
- `supabase/tests/provider_compensation.test.sql`
- `supabase/tests/postdated_cheques.test.sql`
- `supabase/tests/billing_authorization.test.sql`
- `supabase/tests/financial_analytics.test.sql`
- `supabase/tests/treatment_plan_estimated_fee_contract.test.sql`
- `supabase/tests/billing_allocation_concurrency.local.mjs`
- `supabase/tests/postdated_cheque_clearance_concurrency.local.mjs`

Server domain:

- `src/lib/billing/schema.ts`
- `src/lib/billing/types.ts`
- `src/lib/billing/errors.ts`
- `src/lib/billing/money.ts`
- `src/lib/billing/compensation.ts`
- `src/lib/billing/service.ts`
- Matching `*.test.ts` files

Application surfaces:

- `src/app/(emr)/patients/[patientId]/billing-section.tsx`
- `src/app/(emr)/patients/[patientId]/billing-actions.ts`
- Matching action/component tests
- `src/app/(emr)/settings/billing/page.tsx`
- `src/app/(emr)/settings/billing/billing-settings.tsx`
- `src/app/(emr)/settings/billing/actions.ts`
- `src/app/(emr)/earnings/page.tsx`
- `src/app/(emr)/earnings/earnings-view.tsx`
- `src/app/(emr)/reports/finance/page.tsx`
- `src/app/(emr)/reports/finance/financial-report.tsx`
- Matching tests
- `e2e/billing.spec.ts`
- `e2e/odontogram-integration.spec.ts` (created in O14; consumes billing)
- `e2e/responsive-accessibility.spec.ts`

Existing files to modify:

- `src/lib/authorization/policy.ts`
- `src/lib/authorization/policy.test.ts`
- `docs/SECURITY_ARCHITECTURE.md`
- `src/types/database.generated.ts`
- `src/app/(emr)/patients/[patientId]/patient-sections.ts`
- `src/app/(emr)/patients/[patientId]/page.tsx`
- `src/app/(emr)/patients/[patientId]/patient-workspace.tsx`
- `src/app/(emr)/patients/[patientId]/clinical-section.tsx`
- `src/app/(emr)/settings/procedures/*`
- `src/app/(emr)/providers/*`
- `src/components/layout/navigation-items.ts`
- `scripts/remote-database-test-guard.mjs`
- `scripts/run-local-database-tests.mjs`
- `scripts/run-local-supabase-command.mjs`
- `package.json`
- `docs/AI_HANDOFF.md`

## Task Gate Matrix

This matrix is normative. It supplies the exact dependency, file, test,
verification, and done contract for every task; the task sections below supply
the detailed actions and domain rules.

| Task | Depends on | Exact primary files | Exact tests | Verification | Done condition |
| --- | --- | --- | --- | --- | --- |
| B0 | Current accepted repository state | ADR-026, ADR-027, billing spec/plan, `docs/AI_HANDOFF.md`; after acceptance `AGENTS.md` and a new acceptance record | `scripts/local-supabase-command.test.mjs` | Focused Vitest; documentation review | Independent findings resolved and owner acceptance recorded |
| B1 | B0 | Permission migration, `src/lib/authorization/policy.ts`, `docs/SECURITY_ARCHITECTURE.md`, `src/lib/billing/{money,compensation,schema,types}.ts` | Permission pgTAP, `policy.test.ts`, `money.test.ts`, `compensation.test.ts` | Focused Vitest, pgTAP, `security:migrations` | Database/server role matrix agrees and bigint/rounding contracts pass |
| B2 | B1 | Catalog/charge migration, `src/lib/procedures/*`, `src/lib/treatment-plan/*`, procedure settings files | `billing_charge_ledger.test.sql`, `billing_attribution.test.sql`, existing procedure/treatment-plan tests | Focused unit/pgTAP, lint, typecheck | Estimates, defaults, charges, attribution, costs, adjustments are distinct and tenant-safe |
| B3 | B2 | Payment-allocation migration, billing schemas/types/services | `billing_payment_allocations.test.sql`, `billing_corrections.test.sql`, `billing_allocation_concurrency.local.mjs`, billing unit tests | Focused unit/pgTAP/concurrency | Multi-charge refund/void/reversal/reallocation reconciles exactly |
| B4 | B3 | Compensation migration, `src/lib/billing/compensation.ts`, service/schema/types | `provider_compensation.test.sql`, `compensation.test.ts`, allocation/cost concurrency | Focused unit/pgTAP/concurrency | Rate snapshots, late costs, and cumulative earning deltas reconcile to centavo |
| B5 | B3-B4 | PDC migration and billing service/schema/types | `postdated_cheques.test.sql`, `postdated_cheque_clearance_concurrency.local.mjs` | Focused unit/pgTAP/concurrency | Only one clearance creates collections/earnings |
| B6 | B2-B5 | RPC/grant migrations, `src/lib/billing/{service,errors,schema,types}.ts`, generated DB types | `billing_authorization.test.sql`, billing service tests | Unit/pgTAP, grant lint, types check | Only narrow authorized RPCs are reachable and audit is atomic |
| B7 | B6 | Patient billing section/actions, billing settings, procedure settings, provider compensation UI | Matching `*.test.ts(x)` beside each action/component | Focused Vitest, lint, typecheck, build | Authorized workflows persist/reload and denied payloads never render |
| B8 | B6-B7 | Clinical/treatment-plan sections plus new `procedure-payment-summary.tsx` | Existing clinical/treatment-plan tests plus summary test | Focused Vitest and reload integration | Paid/remaining projection is live and narrative is unchanged |
| B9 | B6-B8 | Analytics migration/grant, finance report, earnings route, navigation | `financial_analytics.test.sql`, report/earnings/navigation tests | Unit/pgTAP/build | Event-period/as-of metrics reconcile and visibility matches every system role |
| B10 | B1-B9 | Test registries, local command/guard, generated types, E2E, handoff/evidence | All new suites, `e2e/billing.spec.ts`, responsive E2E, existing full suite | Full command set in B10 | Expand/backfill and compatibility application pass without reset |
| B11 | Accepted/deployed B10 compatibility checkpoint | Estimated-fee contract migration, treatment-plan adapters/types/tests, evidence/handoff | Treatment-plan migration compatibility and full existing/new suites | Forward local/Cloud TEST migration, full gates | Old decimal fee and compatibility trigger are removed only after new centavo reads/writes are proven |

## B0 — Approval and Verification Boundary

**Objective:** Make the later-phase authority and safe local verification
boundary explicit before schema work.

**Create/modify:**

- Create `docs/decisions/ADR-026-billing-ledger-provider-compensation.md`.
- Create `docs/decisions/ADR-027-billing-local-verification.md`.
- Create a billing acceptance-review record only after independent review.
- Update `AGENTS.md` current-phase text only after that acceptance is recorded.

**Steps:**

1. Independently review this specification, this plan, Phase 21 discovery,
   tenancy, RLS, audit, compensation privacy, and migration safety.
2. Record findings and revise the plan before accepting it.
3. Obtain explicit project-owner acceptance.
4. ADR-027 must authorize a forward-only local migration command; it must not
   authorize `db:reset:local` for this phase.
5. Add the guarded command and its script tests only after ADR-027 is accepted.

**Tests:** Script tests prove ambiguous, linked, Cloud, DEV, TEST, and production
targets are rejected by the local-only command.

**Verification:** `npm run test:unit -- scripts` and documentation review.

**Acceptance:** The acceptance record names the reviewed plan revision and the
local verification boundary. Without it, stop.

## B1 — Permission and Money Contracts

**Objective:** Establish permissions and pure centavo/rate calculations before
ledger tables.

**Inspect:**

- `src/lib/authorization/policy.ts`
- `supabase/migrations/20260826010000_provider_permission_contract.sql`
- `supabase/migrations/20260827014400_analytics_contract_and_indexes.sql`
- `supabase/tests/provider_permission_contract.test.sql`

**Create/modify:**

- Create the permission-contract migration/test.
- Create `src/lib/billing/money.ts`, `compensation.ts`, their schemas/types, and
  tests.
- Modify the application permission union and role projections.

**Interfaces:**

- `parseMoneyCentavos(value: string): bigint`
- `formatPhpCentavos(value: bigint): string`
- `calculateChargeBalance(input): bigint`
- `calculateCumulativeEarningTarget(input): bigint`
- `calculateEarningDelta(target, postedEntries): bigint`

**Steps:**

1. Write failing unit tests for digit-string/integer-centavo validation, the
   99,999,999,999-centavo maximum, unsafe-number rejection, PHP formatting,
   half-up basis-point rounding, gross/net basis, installments, and deltas.
2. Run focused tests and confirm expected missing-contract failures.
3. Implement minimal pure functions without floating-point money arithmetic.
4. Add database permission codes: `billing.read`, `billing.charge`,
   `payment.record`, `billing.adjust`, `billing.attribution.override`,
   `compensation.manage`, `compensation.own.read`, and
   `financial.analytics.read`. Do not reuse operational `analytics.view`.
5. Update `docs/SECURITY_ARCHITECTURE.md` so its example `billing.write` code is
   replaced by the accepted narrower charge/adjust permissions and role matrix.
6. Encode the exact defaults: OWNER and ADMIN all listed financial permissions;
   BILLING read/charge/payment only; DENTIST patient-bounded read, clinical-only
   charge, and own compensation; RECEPTIONIST read/payment only; assistant and
   specialist none. Suspended/foreign actors get none.
7. Preserve the existing organization-wide versus branch-scoped assignment
   semantics for every financial operation. Document that custom roles may
   narrow delegation but cannot weaken tenant, branch, patient, provider-own, or
   elevated-adjustment invariants.
8. Add role-by-operation pgTAP and application policy tests.
9. Encode the specification's operation/scope matrix. Test one patient with
   charges at Branch A/B and a payment at A across Branch-A-only, Branch-B-only,
   both-branch, organization-wide, suspended, and foreign actors. Branch-scoped
   account reads return organization balance/credit totals but itemize only
   permitted branches; cross-branch allocation requires payment permission at
   receiving and every charge-origin branch; own earnings are provider-own plus
   permitted origin branches; organization analytics require organization scope.

**Data/security impact:** Permission rows only; no ledger data. Existing roles
must not gain unrelated clinical visibility.

**Verification:** Focused Vitest, `security:migrations`, and the registered pgTAP
permission suite.

**Acceptance:** Server and database permission contracts agree; calculations
are deterministic at centavo boundaries.

## B2 — Procedure Pricing and Charge Ledger

**Objective:** Separate estimates, price defaults, actual charges, adjustments,
and direct costs.

**Inspect:**

- `supabase/migrations/20260826010400_procedure_foundation.sql`
- `supabase/migrations/20260827013300_treatment_plans.sql`
- `src/lib/procedures/*`
- `src/lib/treatment-plan/*`

**Create/modify:**

- Create `20260828010100_billing_catalog_and_charge_ledger.sql`.
- Create `billing_charge_ledger.test.sql`.
- Modify procedure and treatment-plan schemas/services/UI/tests.

**Schema:**

- Add `procedures.default_fee_centavos bigint` and `currency_code char(3)`.
- Add `procedure_direct_cost_defaults` with organization, procedure, cost type
  LAB/MATERIAL/OTHER, description, amount, active/version, and attribution.
- Add `treatment_plan_items.estimated_fee_centavos bigint`; copy validated
  existing `estimated_fee` values only after a preflight proves
  `estimated_fee * 100` is an integer within 99,999,999,999 centavos. Abort and
  report synthetic-safe row IDs on fractional-centavo/overflow values; never
  round. Keep the old decimal column during B2/B10. A compatibility trigger
  converts legacy writes exactly into centavos and rejects conflicting dual
  values; revised RPCs write both while application reads switch to centavos.
  Remove the old column/trigger only in B11 after the compatibility release is
  deployed and count/value reconciliation passes.
- Add `payment_methods` with organization-scoped unique code and active/version.
- Add `charges` with tenant-safe patient/branch/provider/procedure/plan-item FKs,
  nonnegative amount, PHP currency, immutable POSTED snapshot fields,
  idempotency key, attribution, version, and timestamps. VOIDED is derived from
  an append-only `charge_voids` event rather than a mutable charge status. Zero
  requires a bounded reason plus `billing.adjust` authorization.
- Add append-only `charge_direct_costs`: APPROVAL and REVERSAL entries both store
  positive source amounts; REVERSAL references an earlier APPROVAL and derives
  the opposite signed ledger effect. A source permits exactly one full reversal,
  enforced by a unique source reference, with LAB/MATERIAL/OTHER,
  event time, actor, reason, and idempotency. Procedure defaults are UI suggestions
  and are never silently copied as approved costs.
- Add append-only `charge_adjustments` and `charge_adjustment_reversals`; every
  adjustment is charge-linked, has CREDIT/DEBIT, bounded reason, actor/event time,
  and owner/admin authority. Each reversal is an exact one-time full reversal
  enforced by a unique source reference.
- Add `charge_voids` and `charge_attribution_corrections` as append-only events;
  the latter is OWNER/ADMIN-only and never mutates the original snapshot. Define
  current attribution as the latest valid event. If allocations exist, one
  locked transaction appends the correction, reverses the prior provider's
  cumulative earning target, and either appends the replacement provider's target
  using the eligible agreement or records `NO_ACTIVE_AGREEMENT`, based on the
  corrected authoritative service date stored in the event. Event-period
  reporting also appends equal old/new attribution
  reclassification entries without changing organization production totals.

**Steps:**

1. Write pgTAP failures for foreign tenant relationships, invalid money,
   invalid rates, overlapping identifiers, RLS, and zero grants.
2. Run the focused suite to confirm objects are absent.
3. Add tables, composite keys, constraints, indexes, RLS, comments, and revokes.
4. Seed default payment methods idempotently for existing organizations and add
   an organization-creation hook consistent with existing catalog seeding.
5. Update procedure settings to edit default fee and direct-cost defaults.
6. Resolve ordinary dentist provider from active `providers.linked_user_id`; for
   an appointment require an active matching `appointment_providers` assignment,
   otherwise require an active provider-branch relation. Derive service date from
   the appointment or server time.
7. Add an elevated attribution path requiring `billing.attribution.override`,
   active same-tenant/branch provider, non-future date, bounded reason, and audit;
   resolve rate server-side for the approved provider/date.
8. Verify estimates remain advisory and no charge/provider/date is inferred from
   recorder input or a client-supplied rate.
9. For BILLING-role posting, inherit clinical attribution from an authorized
   completed clinical/appointment record. Permit provider-less standalone
   administrative charges only with explicit non-clinical classification and
   exclude them from provider earnings.
10. Prove the current pre-billing application remains operational immediately
    after the expand/backfill migration, then prove the revised application reads
    centavos and dual-writes matching values before B11 contract is allowed.

**Indexes:** At minimum organization/patient/date, organization/branch/date,
organization/provider/date, organization/procedure/date, plan-item link, active
method code, and effective unresolved direct-cost lookups.

**Verification:** Focused pgTAP, procedure/treatment-plan unit tests,
`security:migrations`, `lint`, and `typecheck`.

**Acceptance:** Actual charges and price defaults are relational, tenant-safe,
and distinct from estimates.

## B3 — Payment, Allocation, Refund, and Reversal Ledger

**Objective:** Record cleared money and explicit allocation history without a
mutable balance.

**Create/modify:**

- Create `20260828010200_payment_allocation_ledger.sql`.
- Create `billing_payment_allocations.test.sql` and concurrency probe.
- Extend `src/lib/billing/` schemas/types/tests.

**Schema:**

- `payments`: immutable organization, patient, receiving branch, method,
  amount/currency, bounded reference, received time/actor, PDC source,
  idempotency, and version. POSTED/PARTIALLY_REFUNDED/REFUNDED/VOIDED is a bounded
  read projection derived from refund and void events, not a mutable source field.
- `payment_allocations`: tenant-safe payment/charge/patient links, positive
  amount, allocation actor/time, idempotency.
- `payment_allocation_reversals`: allocation, amount, reason, actor/time,
  idempotency.
- `payment_refunds`: payment, patient, amount, reason, actor/time, idempotency.
- `payment_refund_allocations`: refund component referencing either an original
  payment allocation or unallocated credit; components sum exactly to refund.
  Every allocation-linked component has exactly one equal
  `payment_allocation_reversal` with cause REFUND and a unique component FK; the
  component is not an additional consumption amount.
- `payment_voids`: append-only void event; valid only through the atomic reversal
  operation, distinct from actual-money-return refunds.

**Steps:**

1. Write failing tests for partial/multi-charge/deposit payments, two providers,
   allocated and unallocated partial refunds, paid-charge void, payment void,
   charge credit/debit adjustment and reversal, released credit, partial
   allocation reversal/reallocation, over-allocation, and concurrency. Include
   unallocated/partial/full allocation payment void, refund-then-void rejection,
   void-then-refund/allocation rejection, and concurrent void/allocation.
2. Add append-only tables and constraints.
3. Define SQL balance views/private helpers used only behind bounded RPCs.
4. Lock payment and charge rows in a stable order during allocations.
5. Reject nonpositive money, foreign/missing rows with safe denials, currency
   mismatch, duplicate idempotency keys, and allocation above adjusted due.
6. Lock payment then charges in stable UUID order. A refund distribution must
   equal the refund; a void/reversal must append all allocation and earning
   reversals in the same transaction. Charge void releases money to account
   credit; it never silently refunds it.
7. Enforce cumulative consumption under those locks: the sum of all source-
   linked `payment_allocation_reversals`, including the one-to-one equal rows
   generated for allocated refund components, cannot exceed the allocation.
   Never add the component amount again. Unallocated refund components cannot
   exceed current payment credit. Payment void is one unique full-principal event,
   requires no prior refund, consumes all residual availability, and terminally
   rejects later refund/allocation. Direct-cost and adjustment reversals are
   exact one-time full reversals of their sources. Prove a full allocated refund,
   a 40/60 refund-plus-manual-reversal in either order, one-centavo excess denial,
   exact component/reversal equality, duplicate-full, simultaneous refund/
   reversal, and last-amount races.
8. Derive payment availability exactly as `(posted principal - full void) - net
   refunds - net allocations`; assert every valid void leaves zero availability.
9. Encode branch scope in service and RPC tests: mutations against allocations
   require `payment.record` at the receiving branch and every charge-origin
   branch. A Branch-A-only actor may record Branch-A money but must leave a
   Branch-B allocation as account credit for an actor with both scopes. Payment
   void has the same receiving/origin requirements; charge void/credit requires
   `billing.adjust` at origin plus `payment.record` at every affected receiving
   branch.

**Verification:** Focused pgTAP and two-client concurrency probe.

**Acceptance:** Reloaded balances derive identically from history and concurrent
requests cannot over-allocate.

## B4 — Provider Compensation Ledger

**Objective:** Snapshot rate/basis at service time and recognize/reconcile
earnings from cleared allocations and approved direct-cost events.

**Create/modify:**

- Create `20260828010300_provider_compensation.sql`.
- Create `provider_compensation.test.sql`.
- Complete pure compensation/service tests.

**Schema:**

- `provider_compensation_agreements`: provider, effective range, default rate,
  GROSS/NET_DIRECT_COST basis, status, approval attribution, version.
- `provider_procedure_compensation_rates`: agreement/provider/procedure override,
  rate, optional basis override, attribution.
- `provider_earning_entries`: provider, charge, allocation, ACCRUAL/REVERSAL,
  optional direct-cost/correction cause, eligible basis, net approved cost,
  snapshotted rate, signed earning amount, reversal link, event time, creator,
  idempotency.
- `charge_compensation_resolutions`: one append-only resolution chain per charge,
  state RESOLVED/NO_ACTIVE_AGREEMENT, nullable agreement/rate/basis until
  resolved, authoritative service date, resolver/time/reason, and idempotency.

**Steps:**

1. Write failing pgTAP tests for overlapping agreements, foreign/inactive/
   impersonated providers, procedure overrides, service-date snapshots,
   installments, cost approval before payment, late cost approval, cost reversal,
   refunds/voids/rate changes, half-up rounding, overflow, and concurrency. Cover
   no/expired/future agreement, orphan procedure override, allocations while
   unresolved, later resolution, and duplicate/concurrent resolution.
2. Add exclusion/constraint logic preventing overlapping active agreements.
3. Add private rate resolution and cumulative target functions.
4. On each allocation/reversal/refund/direct-cost approval/reversal, lock the
   charge/payment rows, calculate the positive cumulative target using
   `(basis * bps + 5000) / 10000`, and append the signed delta.
5. Enforce one primary provider per charge and the attribution rules from B2;
   never infer provider from recorder or accept rate/basis from the browser.
6. If no agreement is active on the authoritative service date, post the charge
   as `NO_ACTIVE_AGREEMENT` with null rate/basis rather than 0%. Permit allocations
   but create no earnings. `compensation.manage` resolution must select an
   eligible agreement server-side, append the resolution and cumulative earning
   target at resolution time, preserve the original charge, and audit. Surface
   unresolved allocated compensation separately in reports.

**Verification:** Pure unit tests, pgTAP, allocation concurrency probe.

**Acceptance:** Allocated collections reconcile exactly to append-only provider
earnings and historical snapshots remain stable.

## B5 — Post-dated Cheques

**Objective:** Track promised cheque coverage without premature collections.

**Create/modify:**

- Create `20260828010400_postdated_cheques.sql`.
- Create `postdated_cheques.test.sql` and clearance concurrency probe.

**Schema:** `postdated_cheques`, `postdated_cheque_allocations`, and
`postdated_cheque_status_events` as specified in the product specification.
The authoritative current cheque state is the latest valid status event; any
cached projection is database-maintained inside the transition transaction and
must reconcile to that event chain.

**Steps:**

1. Write failing tests for HELD -> DEPOSITED/CANCELLED/REPLACED,
   DEPOSITED -> CLEARED/BOUNCED/CANCELLED/REPLACED, BOUNCED -> REPLACED,
   every illegal transition, terminal states, and duplicate clear.
2. Add protected cheque tables, constraints, indexes, RLS, and zero grants.
3. Keep proposed allocations separate from payment allocations.
4. Make CLEARED atomically create one CHEQUE payment, confirmed allocations,
   earning entries, and a status event.
5. Lock/revalidate cheque, patient, receiving branch, charges, due, ordinary
   allocations, and proposed allocations. Stale proposed coverage fails in full
   and must be explicitly revised; no partial clearance artifacts remain.
6. Redact cheque fields from errors, logs, audit metadata, and aggregate reports.

**Verification:** pgTAP plus simultaneous-clear concurrency probe.

**Acceptance:** Only one clearance succeeds and only clearance affects balance,
collections, or earnings.

## B6 — RPC, Authorization, and Audit Boundary

**Objective:** Expose narrow transactional operations without base-table access.

**Create/modify:**

- Create the RPC and terminal-grant migrations.
- Create `billing_authorization.test.sql`.
- Implement `src/lib/billing/service.ts`, errors, schemas, types, and tests.
- Update `src/types/database.generated.ts` through the guarded generator.

**Public RPCs:**

- `list_patient_account`
- `post_charge`
- `post_charge_with_attribution_override`
- `correct_charge_attribution`
- `void_charge`
- `approve_charge_direct_cost`
- `reverse_charge_direct_cost`
- `post_charge_adjustment`
- `reverse_charge_adjustment`
- `record_payment`
- `void_payment`
- `allocate_payment`
- `reverse_payment_allocation`
- `refund_payment` (requires explicit refund-component distribution)
- `record_postdated_cheque`
- `transition_postdated_cheque`
- `clear_postdated_cheque`
- `list_payment_methods`
- `upsert_payment_method`
- `set_provider_compensation_agreement`
- `list_unresolved_charge_compensation`
- `resolve_charge_compensation`
- `list_provider_earnings`

**Private integration operation:** `private.complete_treatment_and_post_charge`,
called by a narrow public clinical RPC once the odontogram treatment lifecycle
is implemented.

**Steps:**

1. Write service/RPC tests before each adapter/function.
2. Reauthorize every operation server-side and inside PostgreSQL.
3. Derive organization/actor and resolve provider-own access through the linked
   provider record.
4. Enforce appointment/provider assignment and server-derived service date on
   ordinary completion; isolate override provider/date behind
   `billing.attribution.override` and required audit reason.
5. Use safe indistinguishable denial for foreign/missing sensitive targets.
6. Enforce the operation/scope matrix inside each RPC, including dual-scope
   cross-branch allocations, branch-filtered account detail, provider-own branch
   earnings, and organization-only full analytics.
7. Append bounded audit events in the same transaction as each mutation.
8. Revoke from public/anon/authenticated/service_role in object migrations;
   terminal grants give authenticated execute only on approved public functions.

**Verification:** Authorization pgTAP, service tests, grant inventory,
`security:migrations`, `security:secrets`.

**Acceptance:** Direct base-table access and unauthorized direct RPC calls fail;
authorized operations commit ledger and audit atomically.

## B7 — Patient Account and Configuration UI

**Objective:** Provide native EMR workflows for prices, payments, account credit,
and compensation configuration.

**Inspect:** Existing patient workspace, procedure settings, provider directory,
shared fields/status components, and local Next.js 16 docs in `node_modules/next/dist/docs/`.

**Create/modify:** Use the application paths in the planned file map.

**Steps:**

1. Write failing component/action tests for permission-gated account loading,
   actual-charge entry versus estimate/default suggestions, payment entry,
   allocation confirmation, account credit, refund/adjustment denials, fee
   defaults, and provider-own compensation visibility.
2. Add `account` to patient sections and server-load data only when selected.
3. Render a dense chronological ledger with equivalent desktop and phone views.
4. Use dialogs for payment/allocation/PDC/adjustment actions; show allocation
   suggestions as editable suggestions, never implicit writes.
5. Extend procedure forms with default fee and direct-cost defaults.
6. Add provider compensation management without exposing it to dentists editing
   ordinary provider identity details.
7. Add organization payment-method configuration.

**Security/UI impact:** Server actions reauthorize independently. Do not render
earnings data into HTML for unauthorized roles. Preserve 40px fine-pointer and
44px coarse-pointer conventions, focus return, labels, and non-color status.

8. Add `e2e/billing.spec.ts` for patient account, payment/allocation, PDC stale
   clearance, direct-URL denial, revoked role, and foreign-patient attempts.
9. Extend `e2e/responsive-accessibility.spec.ts` for account/earnings views at
   phone, tablet, and desktop widths.

**Verification:** Focused Vitest/Testing Library, guarded Playwright, `lint`,
`typecheck`, `build`.

**Acceptance:** Authorized staff can complete common account workflows after
reload; unauthorized data/actions are absent and rejected directly.

## B8 — Clinical Financial Projection

**Objective:** Let authorized users see how much was charged and paid beside a
procedure without corrupting the clinical record.

**Inspect/modify:**

- `src/app/(emr)/patients/[patientId]/clinical-section.tsx`
- `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx`
- Their action/component tests

**Steps:**

1. Write failing tests for hidden, unpaid, partially paid, paid, refunded, and
   pending-PDC projections.
2. Add a small `procedure-payment-summary` component consuming a server-derived
   bounded charge projection.
3. Display charged, adjusted, paid, pending PDC, remaining, and payment status.
4. Ensure finalized clinical narrative remains unchanged when allocations later
   change.

**Verification:** Component/action tests and reload test.

**Acceptance:** Users can easily check paid amount while the ledger remains the
sole financial truth.

## B9 — Earnings and Financial Analytics

**Objective:** Report production, collections, pending PDCs, provider earnings,
and clinic contribution with the approved semantics.

**Create/modify:**

- Create financial analytics and grant migrations/tests.
- Create owner/admin finance report and dentist own-earnings routes.
- Modify navigation and tests.
- Extend `src/lib/analytics/` only for shared filtering conventions; keep
  financial types in `src/lib/billing/`.

**Steps:**

1. Write pgTAP tests proving signed event-period and explicit as-of semantics,
   including Month N activity corrected in Month N+1.
2. Add bounded aggregate RPCs grouped by event period, as-of cutoff, service
   date, charge-origin branch, payment-receiving branch, provider, procedure,
   and method.
3. Add own-provider earnings projection with linked-user enforcement.
4. Write UI tests proving receptionist denial, dentist own-only plus assigned-
   origin-branch scope, branch-filtered analytics, and organization-wide
   analytics only for an organization-scoped permission.
5. Clearly label clinic contribution as contribution, not profit.
6. Calculate event-period clinic contribution exactly once as signed net
   allocation events minus signed approved direct-cost events minus signed
   provider-earning events; do not subtract refunds/adjustments again.
7. Report allocated charges in `NO_ACTIVE_AGREEMENT` separately as unresolved
   compensation; do not present clinic contribution as settled until resolution
   emits the provider-earning event.

**Verification:** Analytics pgTAP, service/UI tests, navigation tests.

**Acceptance:** Reports reconcile to ledger fixtures and cannot cross tenant or
provider visibility boundaries.

## B10 — Expand/Compatibility Release Verification

**Objective:** Prove the additive billing schema and centavo compatibility release
safely before contracting the legacy estimate column.

**Steps:**

1. Register all pgTAP and concurrency suites in
   `scripts/remote-database-test-guard.mjs` and local runner.
2. Start the existing local stack, run the ADR-027-approved forward-only local
   migration command, then provision test tooling. Do not reset.
3. Run all registered database tests.
4. Regenerate/check database types through the established guarded workflow.
5. Run unit, lint, typecheck, build, migration lint, secret scan, and audit.
6. Review the full diff for patient data, secrets, broad grants, unsafe search
   paths, destructive migration behavior, and scope creep.
7. Update `docs/AI_HANDOFF.md` with exact evidence and residual gates.
8. Obtain an independent security/schema review and explicit acceptance.
9. Run Cloud TEST gates before any production deployment.

**Commands:**

```powershell
npm run db:start:local
npm run db:migrate:local
npm run db:provision:local
npm run test:db:local
npm run db:types:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run security:migrations
npm run security:secrets
npm run security:audit
npm run test:e2e
git diff --check
```

**Acceptance:** All tests pass, ledger reconciliation is exact, negative
authorization coverage passes, and old plus revised application compatibility is
recorded. The old estimate column remains until B11; odontogram execution remains
blocked.

## B11 — Treatment Estimate Contract and Billing Completion Gate

**Objective:** Remove the legacy decimal estimate only after the compatibility
application has been deployed and proved, then close the billing prerequisite.

**Create/modify:**

- Create `20260828010700_treatment_estimated_fee_contract.sql`.
- Create `supabase/tests/treatment_plan_estimated_fee_contract.test.sql`.
- Remove the compatibility adapter/trigger and old application type paths.
- Update generated types, evidence, and `docs/AI_HANDOFF.md`.

**Steps:**

1. Require recorded B10 local and Cloud TEST evidence that current application
   operation survived expand/backfill and the revised application reads centavos,
   writes matching dual values, and has no fractional/overflow mismatch.
2. Search application/RPC/test code for legacy `estimated_fee` reads/writes. Stop
   if any runtime dependency remains.
3. Write failing contract pgTAP proving exact source/centavo count and value
   reconciliation, then drop the compatibility trigger and decimal column in the
   forward migration.
4. Start local, apply the pending migration forward, provision, run the full DB/
   type/application/E2E/security suite, and repeat the guarded Cloud TEST gate.
5. Obtain independent schema/security review and explicit owner acceptance of
   the completed billing prerequisite before O0.

**Verification:** Use B10's corrected command order plus
`rg -n "estimated_fee(?!_centavos)" src supabase --pcre2` as an absence check.
Never reset.

**Acceptance:** The legacy column and compatibility path are absent, all ledger/
authorization/compatibility tests pass, independent review is recorded, and the
odontogram plan may consume the accepted completion/charge boundary.

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Estimate treated as revenue | Separate estimate and charge tables/types/UI labels |
| Cross-tenant financial relation | Composite organization FKs plus negative pgTAP |
| Over-allocation race | Stable row locks, derived due, two-client probe |
| Over-reversal/duplicate correction | Source-linked cumulative caps or one-time exact full reversal plus locked concurrency tests |
| Duplicate payment/PDC clearance | Organization-scoped idempotency and unique source link |
| Payment void recreates account credit | Net-principal formula includes full void; terminal void/refund/allocation tests |
| Rate changed retroactively | Snapshot rate/basis on charge |
| Missing compensation agreement silently becomes 0% | Explicit unresolved state, no earnings until audited resolution, visible liability analytics |
| Forged provider/backdate | Linked/assigned provider resolution; elevated audited override only |
| Installment rounding drift | Cumulative target minus prior entries |
| Direct cost manipulated or late | Owner/admin append-only approval/reversal with atomic earning delta |
| Multi-charge refund ambiguity | Explicit refund-component distribution and allocation-linked reversals |
| Prior-period reports rewrite | Signed event-period ledger plus separately labelled as-of view |
| Dentist sees peer earnings | Linked-provider server/RPC predicate and denial tests |
| Receptionist role escalation | No compensation permissions or payload rendering |
| Cross-branch account scope leaks or blocks valid payment | Normative operation matrix, branch-filtered detail, dual-scope mutation tests |
| “Clinic earned” misread as profit | Label/report definition fixed to clinic contribution |
| Regulated document accidentally emitted | Phase 21 boundary tests/review and no invoice tables |
| Clinical completion succeeds without charge | One transactional completion boundary |
| Contract migration breaks old application | Separate expand/backfill compatibility checkpoint and later reviewed B11 contract |
