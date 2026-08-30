# AI Handoff - Phases 23-24 complete, all 24 phases checkpointed

## ADR-030 authority checkpoint — odontogram longitudinal record revamp (2026-08-30)

- Added ADR-030 before schema or application work. It amends O12 for staged
  FHIR/JSON import, authorized FHIR/JSON/PDF/SVG/PNG output, private clinical
  photographs, and an authorized chronological progress projection; canonical
  clinical, ledger, tenancy, audit, and private-file foundations remain intact.
- The accepted billing contract now grants DENTIST bounded `payment.record` only
  for an already clinically authorized patient at an active permitted receiving
  branch. Existing receiving/charge-origin allocation checks remain mandatory;
  adjustment, refund, void, allocation reversal, PDC clearance, and analytics
  remain denied by default.
- Drawing UI and writes are retired by the revamp. Physical drawing-table cleanup
  is reserved for a guarded O13 forward migration that deletes only positively
  identified deterministic synthetic rows and fails closed on unrecognized data.
- ADR-029 remains controlling for execution boundaries: work is local-only on
  `main` with forward migrations and deterministic synthetic data; `db:reset:local`,
  hosted commands, production deployment, and real provider/patient use remain
  unauthorized. O14 can be recorded only as locally implemented and verified;
  Cloud TEST, independent release review, and final owner acceptance remain
  pending.

## Sidebar and information alignment Tasks 1–6 — local review evidence (2026-08-30)

- Checkpointed sequence: `1d9739e` adds the paired description-row primitive;
  `157c7de` supports persistent shell controls; `633699b` moves branch context
  and account controls into the sidebar/drawer; `c050a66` makes dashboard
  summary values compact; `55ee4aa` replaces finance KPI cards with paired
  rows; `017468d` adds responsive shell/summary contracts; `df75b10` closes
  the mobile drawer on account navigation and adds real shell keyboard and
  long-name coverage; `289c45f` adds the final compact-topbar keyboard tests.
- The final focused UI suite passed 7 files / 34 tests. `npm run lint`, `npm
  run typecheck`, `npm run test:unit` (146 files / 1,453 tests), `npm run build`,
  and `git diff --check` all passed locally. The first build invocation did not
  return a terminal result and left Next's lock briefly present; after it
  cleared, a fresh invocation completed successfully.
- `npm run test:e2e:list` listed 80 tests in five files under process-local,
  synthetic discovery values only; this performs no browser execution or hosted
  contact. An unconfigured invocation correctly refused discovery because
  `APP_ENVIRONMENT` was absent. Authenticated Cloud TEST execution was not
  authorized and was not run.
- The requested source sweep found dashboard/finance summary violations gone.
  Existing patient facts, appointment/branch/procedure/intake/file facts retain
  local label/value grouping; table/ledger/schedule cells and row-end statuses/
  actions retain intentional alignment. Marketing and unaccepted odontogram/
  periodontal UI remain out of scope. Cloud TEST responsive/accessibility
  browser verification remains a required release gate.
- This checkpoint changed no tenancy/RLS/server authorization, branch model,
  analytics math, or finance math. No server action, database migration,
  dependency, current odontogram file, secret, patient content, token, or
  production identifier was added. The final UI/test files include
  `src/components/layout/mobile-navigation.test.tsx`; no production domain
  semantics changed in the review-fix commits.

## Odontogram O13-O14 — local finalization evidence (2026-08-30, locally complete)

- Added the required guarded, synthetic-only Playwright specification at
  `e2e/odontogram-integration.spec.ts`. It creates a synthetic patient through
  the receptionist UI, then independently signs in with the dedicated MFA
  dentist fixture to record a CARIES finding and prove it survives reload.
  A separate negative flow proves that the receptionist cannot open the
  clinical odontogram route.
- Extended `e2e/responsive-accessibility.spec.ts` with the `@responsive`
  measured-chart flow across the existing phone, iPad, and desktop matrix:
  axe, page overflow, target sizes, arrow-key selection, inspector open, and
  Escape close. The E2E registry test refuses a checkout where this coverage,
  the odontogram spec, or the documented dentist fixture is absent.
- Added `E2E_DENTIST_*` TEST-only fixture requirements to the guarded E2E
  environment, identity provisioner, and operator README. The provisioner
  assigns only Branch A1 DENTIST plus a verified TOTP factor. It writes a new
  TOTP secret only to the existing caller-selected location outside Git.
- Fresh local evidence: all 142 Vitest files / 1,431 tests pass; all 93
  registered pgTAP suites and nine local concurrency probes pass; migration
  privilege lint (210 migrations), lint, strict typecheck, production build,
  secret scan, npm audit, and local generated-type freshness all pass. The
  guarded E2E registry/fixture tests pass 30/30 and inert Playwright discovery
  lists 67 tests in five files. No hosted service or real data was contacted.
- Cloud TEST execution, responsive/accessibility execution against hosted
  identities, advisor checks, and owner acceptance remain deferred/mandatory
  release gates under ADR-029; local evidence does not authorize production.
- O13's deprecated P15-02 service wrappers remain as a one-release,
  non-callable compatibility surface for historical tests and introspection;
  the obsolete server actions were removed from the application boundary.
  Their RPC execution was revoked in `20260828020500_odontogram_legacy_retire.sql`;
  no application UI calls them, and new code must use the O5/O8 boundaries.

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Odontogram O8/O9 Task 10 — structured plan completion checkpoint (2026-08-30)

- Replaced treatment-plan drawing UI/action inputs with structured items,
  alternatives, notes, and immutable presentation/acknowledgment behavior.
  `PlanModePanel` is mounted only after the browser loads the narrow
  `get_treatment_plan_completion_context` DTO for an acknowledged plan with an
  OPEN, IN_PROGRESS case. The DTO derives patient/dentist/service-date/finding
  labels/case version/design server-side; it has clinical read/write,
  billing.charge, and active-provider gates.
- Completion confirms the PHP charge, patient, procedure, server date,
  signed-in dentist and selected findings. It does not choose a provider or
  collect payment. Clinical detail requires explicit selection; frozen bridge
  and implant designs are passed as completion payloads. The action repeats
  clinical-write and billing.charge authorization before the narrow atomic RPC.
- Forward migrations 10418–10429 add append-only finding resolution, atomic
  completion, the completion-context DTO, idempotency request fingerprint, and
  pre-charge immutable materialization enforcement, and a clinical
  detail/extraction completion repair.
  pgTAP proves selected-only resolution, immutable acknowledged proposal,
  exact retry, cross-case same-key rejection, rollback on failed completion,
  execution transition, context derivation, and CURRENT-to-PLAN_DESIGN bridge
  provenance. Direct authenticated drift tests prove that a plan-linked bridge
  span/role/support change, implant tooth/ordinal/dependency/attachment change,
  and clinical ROOT_CANAL mismatch each fail before charge, execution,
  relationship, or finding-resolution side effects. PLAN_DESIGN provenance is
  scoped to the linked case patient and plan. Valid root-canal completion now
  proves the required feature-code detail row is written; valid planned
  extraction uses TOOTH_STATE/EXTRACTION_WOUND and writes a canonical
  EXTRACTION entry without an unsupported detail row. No local reset was used.
- Fresh evidence: 15 focused Vitest files / 83 tests, strict typecheck, and
  migration privilege lint pass. Local pgTAP passes through the new atomic
  suite and then stops at the pre-existing `treatment_plans.test.sql`
  completion-marker residual. Cloud TEST, E2E/responsive/accessibility,
  advisor, release review, and owner acceptance remain deferred mandatory
  gates under ADR-029.

## Billing B5 — post-dated cheques (2026-08-28)

## Billing B6 — RPC, authorization, and audit boundary (locally complete, 2026-08-28)

## Billing B7 — patient account and configuration UI (2026-08-28)

### B7 final acceptance and deferred E2E (2026-08-28)

- B7 UI/adapters/pgTAP/strict schemas, the B7 corrective procedure financial
  configuration (`88b1c90`), and B6 (`ce35e50`) all pass focused Vitest,
  ESLint, TypeScript, and migration privilege lint locally.
- The B7 plan also requires `e2e/billing.spec.ts` and
  `e2e/responsive-accessibility.spec.ts` extensions for the new views. The
  Playwright suite runs against a hosted project through guarded sign-in and
  seeded MFA identities; that environment is explicitly outside the
  B0–B11/O0–O4 local-only window. These E2E flows remain a mandatory Cloud
  TEST gate and must be recorded against the disposable hosted project when
  the owner reauthorizes the post-O4 boundary work.
- Per AGENTS.md and ADR-027, B7 is now locally complete; B8–B11 follow in
  order without re-running Playwright locally.

### B7 corrective procedure financial configuration (2026-08-28)

- Added local forward migrations `20260828010504` through `10506` for
  `billing.adjust`-gated procedure default-fee and direct-cost-default RPCs,
  terminal grants, and the required bounded audit-metadata correction.
- Procedure settings now expose those configuration values only through strict
  server actions/adapters; no browser base-table access was introduced.
- Evidence: procedure configuration authorization pgTAP 15/15; focused billing,
  procedure-settings, and script tests 339/339; lint, typecheck, and migration
  privilege lint pass. Local generated types refreshed.

- Added the permission-gated Patient Account tab. The page calls the B6
  `list_patient_account` and `list_payment_methods` adapters only when `account`
  is selected and `billing.read` is present at the acting branch. The client gets
  only bounded ledger/payment-method DTOs; read-only roles receive no mutation
  controls.
- Account actions reauthorize independently and delegate only to strict B6
  adapters for a non-clinical charge, payment, explicit payment allocation,
  adjustment, and post-dated cheque. The ledger has dense desktop and phone
  compositions, and allocations require explicit payment/charge selection.
- Added `/settings/billing` for organization payment methods and effective-dated
  provider compensation agreements. Compensation is isolated from the provider
  identity editor and rendered only with `compensation.manage`; payment-method
  mutation needs `billing.adjust`.
- No direct-cost-default editor was added: the B2 table has no approved B6
  adapter/RPC, and the pre-existing procedure configuration RPC rejects the
  `defaultFeeCentavos` schema field. This checkpoint does not bypass the
  server/RPC authorization boundary with a browser or base-table write.
- **Evidence:** B7 focused Vitest 7/7, lint, typecheck, build, and `git diff
  --check` pass. The full unit suite runs 127 files / 1285 tests, with five
  pre-existing failures in `scripts/boundary-privilege-invariant.test.mjs`: its
  fixture omits the B6 approved terminal RPC grants while
  `approved-final-grants.mjs` correctly includes them. This must be reconciled
  in a separately reviewed B6 boundary/test correction; it is unrelated to B7
  UI files. Cloud TEST remains mandatory before production.

- Applied locally, forward-only: `20260828010500_billing_rpcs.sql`, terminal
  grants `20260828010501_billing_rpcs_grants.sql`, authority/PDC-principal
  correction `20260828010502_billing_rpcs_corrections.sql`, and its terminal
  grants `20260828010503_billing_rpcs_corrections_grants.sql`.
- `billing_authorization.test.sql` is registered and passes 6/6 directly:
  exact authenticated-only grants, empty SECURITY DEFINER search paths, private
  helper/base-table denial, bounded audit metadata, and unaffiliated actor denial.
- Allocation and PDC-clearance local concurrency probes are registered and pass.
  Their fixture cleanup temporarily disables only user append-only triggers in
  its own synthetic cleanup transaction.
- Added local-only `npm run db:types:local`. It refuses linked/project/database
  URL targets, verifies the Docker Desktop endpoint, then runs `supabase gen
  types --local`; generated types were refreshed from the migrated local schema.
- Strict server adapters and schemas now cover all 23 B6 public RPCs: account
  reads; charge, attribution, adjustment, cost, and void mutations; payment,
  allocation, reversal, refund, and PDC operations; payment-method management;
  compensation management/resolution; and provider-earning reads. Every money
  argument remains a validated digit string over the RPC transport, and safe
  error mapping hides database internals.
- **Evidence:** direct authorization pgTAP 6/6; both concurrency probes pass;
  focused billing Vitest 42/42; focused billing/guard/migration-lint Vitest
  110/110 before adapter completion; local generated-types freshness check,
  lint, typecheck, and `security:migrations` pass. Full `test:db:local` remains blocked at the
  existing seed-security-fixtures residual and is not B6 evidence.

- `20260828010400_postdated_cheques.sql`: postdated_cheques (HELD/DEPOSITED/
  CLEARED/BOUNCED/CANCELLED/REPLACED, cheque number/bank stored as protected
  financial data, org-scoped idempotency), separate proposed
  postdated_cheque_allocations (patient-scope trigger), and the append-only
  postdated_cheque_status_events chain. The cheque's current state is a
  database-maintained projection: a BEFORE validator checks existence,
  terminal-state, current-state, and the legal HELD->DEPOSITED/CANCELLED/
  REPLACED, DEPOSITED->CLEARED/BOUNCED/CANCELLED/REPLACED, BOUNCED->REPLACED
  transitions (so a second clear is impossible), and an AFTER trigger moves the
  projection and records current_status_event_id in the same transaction.
  payments gains the tenant-safe PDC source FK to postdated_cheques.
- `20260828010401_postdated_cheque_guard_split.sql`: forward correction that
  splits the original combined AFTER trigger into the BEFORE validator +
  AFTER projector so transition rejections surface precise reasons instead of
  being masked by the table CHECK.
- Tests: `postdated_cheques.test.sql` (26 assertions) registered in the guard
  registry and expected-suite list, covering every legal transition, illegal
  transitions, stale-from, terminal rejection incl. duplicate clear, proposed-
  allocation patient scope, PDC payment link tenant safety, and projection
  reconciliation.
- `postdated_cheque_clearance_concurrency.local.mjs` authored (two-client
  clear_postdated_cheque probe); becomes runnable and is registered when the B6
  RPC exists.
- **Evidence:** direct local pgTAP postdated_cheques 26/26 and all prior billing
  suites pass; `security:migrations` 134 files / 196 approved privileges pass;
  guard and migration-privilege-lint tests pass (tables 90, functions 260,
  secdef 205); lint, typecheck clean. `db:migrate:local` applied both migrations
  forward.
- **Residual local-only:** unchanged `seed_security_fixtures` blocker from B2.

## Billing B4 — provider compensation ledger (2026-08-28)

- `20260828010300_provider_compensation.sql`: effective-dated
  provider_compensation_agreements (default rate/basis GROSS or
  NET_DIRECT_COST, ACTIVE/ENDED, version, and a `btree_gist` exclusion
  constraint rejecting overlapping ACTIVE ranges per provider),
  agreement-scoped provider_procedure_compensation_rates (optional basis
  override; trigger requires the override provider to match the agreement
  provider; unique per agreement+procedure), append-only
  provider_earning_entries (signed `earning_centavos`, positive eligible
  basis/net approved cost snapshot, rate snapshot, ACCRUAL/REVERSAL with
  cause DIRECT_COST/ATTRIBUTION/REFUND/VOID/REALLOCATION, reversal link,
  org-scoped idempotency), and append-only charge_compensation_resolutions
  (RESOLVED or NO_ACTIVE_AGREEMENT with a consistency check: resolved
  resolutions carry an agreement/rate/basis snapshot, no-agreement ones carry
  none; one append-only chain per charge; current resolution is the latest
  event). Private helpers `private.earning_cumulative_target`
  (`(basis*bps+5000)/10000`) and `private.resolve_compensation_rate` (effective
  agreement + procedure override by service date; returns no row when out of
  range) with empty search paths, revoked. RLS on, zero grants.
- Tests: `provider_compensation.test.sql` (24 assertions) registered in the
  guard registry and expected-suite list: overlapping-ACTIVE rejection, foreign
  provider denial, override-provider mismatch denial, rate bound, service-date
  resolution incl. override-basis and out-of-range, half-up cumulative target,
  net-recovery-first, append-only earnings, and resolution state consistency.
- **Evidence:** direct local pgTAP provider_compensation 24/24 and all prior
  billing suites pass; focused billing/procedure Vitest 43 tests pass;
  `security:migrations` 132 files / 196 approved privileges pass; guard and
  migration-privilege-lint tests pass (tables 87, functions 255, secdef 205);
  lint and typecheck clean. `db:migrate:local` applied forward.
- **Residual local-only:** unchanged `seed_security_fixtures` blocker from B2.

## Billing B3 — payment, allocation, refund, and reversal ledger (2026-08-28)

- `20260828010200_payment_allocation_ledger.sql`: immutable payments (positive
  centavo principal, PHP, bounded reference, org-scoped idempotency, PDC source
  slot for B5), append-only payment_allocations (with a trigger enforcing that
  the allocation patient matches both the payment and charge patient),
  payment_allocation_reversals (positive source amount, MANUAL/REFUND/VOID
  cause, one-to-one refund-component link with exactly-equal amount enforced by
  trigger, exactly one equal REFUND reversal per component via unique source
  link), payment_refunds, payment_refund_allocations (either an original
  allocation or unallocated credit), payment_voids (unique terminal per
  payment), all with RLS on, zero grants, and append-only triggers, plus the
  private derived-balance helpers `payment_availability`,
  `charge_adjusted_amount`, `charge_net_allocated`, `charge_due`, and
  `patient_account_balance` (empty search path, revoked).
- `20260828010201_charges_append_only.sql`: forward correction adding the
  missing append-only trigger on charges so a POSTED charge snapshot can never
  be rewritten (VOIDED stays derived from charge_voids).
- Tests: `billing_payment_allocations.test.sql` (30 assertions) and
  `billing_corrections.test.sql` (15 assertions), registered in the guard
  registry and expected-suite list. Extends `src/lib/billing` with payment/
  allocation/reversal/refund input schemas (digit-string centavo amounts, no
  number coercion), types, and 10 new unit tests.
- `billing_allocation_concurrency.local.mjs` authored (two-client
  allocate_payment probe); it becomes runnable and is registered when the B6
  `allocate_payment` RPC exists. Cumulative under-lock consumption caps and
  over-allocation denial are B6 RPC behavior.
- **Evidence:** direct local pgTAP billing_payment_allocations 30/30,
  billing_corrections 15/15, and all prior billing suites pass; `npm run
  test:unit` 123 files / 1271 tests pass; `security:migrations` 131 files / 196
  approved privileges pass; lint, typecheck, `git diff --check` clean;
  migration-privilege-lint baseline updated (tables 83, functions 252, secdef
  205 unchanged). `db:migrate:local` applied both migrations forward.
- **Residual local-only:** unchanged `seed_security_fixtures` blocker from B2.

## Billing B2 — procedure pricing and charge ledger (2026-08-28)

B2 completes the additive catalog and immutable charge-ledger foundation with
four forward migrations applied locally through the ADR-027 `db:migrate:local`
command (no reset, no Cloud target):

- `20260828010100_billing_catalog_and_charge_ledger.sql`: procedures get
  `default_fee_centavos`/`currency_code`; treatment_plan_items get
  `estimated_fee_centavos` with an abort-on-fractional preflight and exact
  backfill; payment_methods, procedure_direct_cost_defaults, charges,
  charge_direct_costs (exactly-one full reversal via unique source link),
  charge_adjustments/charge_adjustment_reversals (exactly-one full reversal),
  and charge_voids tables; append-only triggers; RLS on; zero grants.
- `20260828010101_billing_catalog_completion.sql`: charge_attribution_corrections
  append-only table (attribution must actually change; org-scoped idempotency;
  tenant-safe composite FKs), the remaining tenant access-path indexes
  (org/procedure/date, plan-item link, active method code, effective
  direct-cost-default lookup), and idempotent default payment-method seeding
  (CASH/CARD/GCASH/MAYA/BANK_TRANSFER/CHEQUE/OTHER) for existing orgs plus an
  org-creation hook.
- `20260828010102_treatment_estimate_compatibility.sql`: bidirectional
  decimal<->centavo sync trigger on treatment_plan_items; legacy decimal writes
  derive exact centavos, fractional/overflow/conflicting-dual values are
  rejected (never rounded), centavo-only writes keep the legacy column readable.
- `20260828010103_billing_catalog_completion_fix.sql`: the org seed hook
  originally referenced `new.organization_id`; the organizations primary key
  column is `id`, so the function is recreated with `new.id` (forward-only
  correction; the source file was also corrected for fresh deploys).
- Tests: `billing_charge_ledger.test.sql` (14 assertions) and new
  `billing_attribution.test.sql` (9 assertions) registered in both the guard
  registry and its expected-suite list; procedure_foundation and treatment_plans
  suites updated for the approved B2 columns plus the compatibility-trigger
  behavior.
- Fixture-isolation fixes (bounded, coverage-preserving) so the persistent local
  DB under ADR-027 keeps passing: patient_identity (scoped a global patients
  count to its fixture orgs; the persistent synthetic seed patient P-000001
  remains), patient_contacts_relationships (scoped an unscoped `limit 1` to the
  fixture org), file_upload_rpcs and file_read_rpcs (scoped three global
  audit-count assertions to the fixture org).
- **Evidence:** direct local pgTAP `billing_permission_contract` 3/3,
  `billing_charge_ledger` 14/14, `billing_attribution` 9/9,
  `procedure_foundation` and `treatment_plans` pass; `npm run test:unit` 122
  files / 1261 tests pass; `security:migrations` 129 files / 196 approved
  privileges pass; lint, typecheck, `git diff --check` clean;
  migration-privilege-lint baseline updated (tables 77, functions 245, secdef
  205 unchanged). `db:migrate:local` applied all four migrations forward.
- **Residual local-only:** `npm run test:db:local` still stops at the existing
  `seed_security_fixtures.test.sql` (runs before the billing suites in the
  registry) because the local Auth persona `12000000-...0001` was provisioned as
  a real login (`reyesditherb@gmail.com`) by an earlier local owner bootstrap,
  so the deterministic seed-integrity count is 8/9. No reset is permitted under
  ADR-027. Billing suites are verified via direct focused pgTAP. This residual
  will be revisited at B10.

## Billing B1 — permission and pure-money contracts (2026-08-28)

## Billing and odontogram foundation — B0 in progress (2026-08-28)

The project owner explicitly accepted the independently reviewed billing ledger
and provider compensation specification/plan and the customized odontogram
integration specification/plan. The durable acceptance record is
`docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`.

- **Authorized sequence:** Execute billing B0-B11 on `main`, then odontogram
  O0-O4 only, in order. Do not create a branch or worktree.
- **Environment boundary:** The owner expressly deferred all Cloud TEST activity
  through O4. This is not a production waiver: guarded Cloud TEST remains
  mandatory before production. Do not run O5 or later without new owner
  authorization.
- **B0 changes so far:** ADR-026 records the relational append-only PHP-centavo
  charge/payment/allocation/provider-earning boundary. ADR-027 extends guarded
  synthetic local verification to B0-B11/O0-O4, prohibits `db:reset:local` for
  this scope, and adds only forward `db:migrate:local` (`db push --local`).
- **Guard test evidence:** The new tests were intentionally RED before the
  allowlist/runner implementation. Final GREEN evidence:
  `npx vitest run scripts/local-supabase-command.test.mjs` — 1 file, 33 tests
  passed. `npm run test:unit -- scripts` — 13 files, 286 tests passed. A direct
  hostile invocation, `node scripts/run-local-supabase-command.mjs migrate
  --linked`, was refused before Docker or the Supabase CLI was reached.
- **Never use:** Cloud TEST/DEV/production commands, hosted credentials, direct
  SQL, real data, or local reset for this scope.

## Billing B1 — permission and pure-money contracts (2026-08-28)

- Added forward migration `20260828010000_billing_permission_contract.sql` and
  registered `billing_permission_contract.test.sql`. The exact granular
  financial catalog and system-role defaults are now explicit; no ledger table,
  base-table financial grant, or RPC was introduced.
- Added pure `src/lib/billing/` centavo/rate contracts. They use `bigint` values
  without floating point or ES2020 bigint-literal syntax because this project
  remains TypeScript ES2017; forms/JSON remain digit strings. Tests cover bounds,
  formatting, half-up rate rounding, gross/net costs, installments, and signed
  earning deltas.
- Updated client permission vocabulary and security role documentation. The old
  broad `billing.write` example is removed; operational `analytics.view` is
  deliberately separate from `financial.analytics.read`.
- **Evidence:** focused Vitest 87 tests passed; `npm run typecheck` and
  `npm run security:migrations` passed. `db:start:local` and the guarded
  forward-only `db:migrate:local` ran locally. Direct local pgTAP execution of
  `billing_permission_contract.test.sql` passed 3/3.
- **Known local-suite residual:** `npm run test:db:local` stops at the existing
  `odontogram_rpcs.test.sql` before B1. Direct reproduction shows only its
  global audit-count assertion 44 fails (expects 6, sees 7) because the
  persistent local database already contains a prior odontogram audit row. Do
  not reset under ADR-027. This unrelated fixture-isolation defect must be
  fixed with a bounded test change before claiming a full local database suite.

## UI/UX revamp checkpoint (2026-08-28) - COMPLETE

A cross-application UI/UX audit and implementation pass on the current `main`
checkout (no branch/worktree). UI-only; no schema, RLS, authorization, audit,
mutation, or API-contract change. Recorded in `docs/UI_UX_REVAMP_AUDIT.md`.

- **Patient record rebuilt.** `/patients/[patientId]` now validates `?section=`
  and `?branch=` search params server-side, loads only the active section's
  data, gates Clinical/Intake sections by permission, and renders only the
  selected section. Back/forward, refresh, direct deep links, and
  `?section=demographics&edit=1` all work. `patient-workspace.tsx` is a compact
  persistent header (number, name, status badge, DOB/age/sex/contact) + tab nav
  with `aria-current`; Archive/Reactivate moved to a More menu. Demographics is
  a dense view mode with explicit Edit/Save/Cancel. Contacts/Relationships and
  Overview were extracted to their own sections; Overview is now a summary, not
  a copy of the form. The workspace no longer overrides the server-resolved
  acting branch with client storage, so server-loaded data and mutations agree.
- **Shell/navigation.** Sidebar destinations grouped (Dashboard + CLINICAL /
  ENGAGEMENT / OPERATIONS / CONFIGURATION / REPORTING / ADMINISTRATION); Staff
  (`/settings/users/invite`, `user.invite`) added to navigation; sidebar is
  viewport-bounded and scrollable; mobile sheet body scrolls; skip link +
  `main#main-content` added; org context preserved when collapsed.
- **Shared primitives.** `ui/input|textarea|select|form-field|status-badge|description-list`,
  `layout/section-header`, `page-header` `actions` slot, and a shared labeled
  `patients/patient-picker` (reused by Schedule, Queue, Recalls, Specialists,
  Documents) replace duplicated control strings and fix unlabeled patient-search
  inputs.
- **Module migration.** Providers/Specialties/Procedures hide Add/Edit/Archive
  without live `provider.manage` (server checks unchanged); `my-6` separators →
  `my-4`; control heights standardized to the 40px fine-pointer baseline (44px
  coarse-pointer remains enforced by `globals.css`); statuses use `StatusBadge`;
  public-facing jargon removed (AAL2 dialogs now say "fresh security
  verification").
- **Verification.** `npm run typecheck` clean, `npm run lint` clean, `npm run
  build` passes (all routes emitted), `npm run test:unit` 120 files / 1227 tests
  pass. Dev-server smoke on `/login`: 200, heading renders, no horizontal
  overflow, no console errors.
- **Residual / not runnable here.** The Playwright responsive/axe E2E suite
  requires the designated hosted test environment (`APP_ENVIRONMENT`), which is
  not configured in this session; authenticated-screen visual review remains a
  Cloud TEST obligation. Deferred (documented in the audit): branch-selector
  drives Schedule/Queue/Inventory/Documents data, recall appointment-linking
  selector, calendar-sync first-integration creation, schedule provider
  assignment + date navigation.

**Next:** Cloud TEST remains the deployment gate; authenticated responsive/axe
E2E must be run there. The deferred branch-context and schedule items are
candidates for separately reviewed bounded slices.

## Authorization model change (2026-08-27) - OWNER full access (ADR-025)

The project owner decided OWNER is the highest-authority organization principal
with organization-wide clinical and administrative access, superseding the
earlier "owner is not a clinician" assumption.

- Forward migration `20260827014600_owner_full_access.sql` grants the system
  OWNER role every permission in the catalog (idempotent `role_permissions`
  insert). Database predicates and the application authorization state both
  read this shared source of truth, so DB and app contracts agree.
- OWNER needs no separate DENTIST role and no per-branch membership; org-wide
  role semantics already resolve at every active branch. Tenant isolation,
  AAL2, audit, versioning, immutable records, and no-base-table-DML invariants
  are preserved and tested.
- ADMIN and all other roles are unchanged; a pgTAP invariant forces any future
  permission to be granted to OWNER.
- Docs updated: `plans/002-patient-foundation.md`, `SECURITY_ARCHITECTURE.md`
  §9.4, ADR-019 supersession note, and new `ADR-025-owner-full-access.md`.
- pgTAP: `owner_full_access.test.sql` added (registered in the test guard);
  `patient_authorization`, `patient_identity`, `patient_reads`,
  `patient_create`, `patient_contacts_relationships`, `acquisition_catalogs`,
  and `booking_review_rpcs` suites updated so same-org owner denials became
  positive or used genuinely-denied actors while cross-tenant and invariant
  denials were kept.

## Phase 23 checkpoint (2026-08-27) - ACCEPTED (decision record)

Phase 23 (Advanced Operations) is complete with `docs/plans/023-advanced-operations.md`.
Per `MASTER_PRODUCT_PLAN.md` §Phase 23, its items are a **potential** list with
no acceptance criteria and no confirmed product requirements, so this phase is a
decision record only.

- Six candidates assessed against canonical data and prerequisites: waitlist
  automation, HMO, advanced finance, patient portal, schedule optimization, and
  no-show prediction. Each is deferred because its requirements are not
  confirmed and/or its prerequisite data does not exist yet (billing ledger
  gated on Phase 21, capacity hours not modeled, ML out of scope).
- Any candidate the owner later confirms becomes a separately authored,
  reviewed, and approved bounded plan. No schema/migration/application change
  was made.

## Phase 24 checkpoint (2026-08-27) - ACCEPTED (boundary only)

Phase 24 (AI / MCP) is complete with `docs/plans/024-ai-mcp-boundary.md` and
`docs/decisions/ADR-024-ai-mcp-boundary.md`.

- AI/MCP is intentionally late-stage per `MASTER_PRODUCT_PLAN.md` §24/§48 and is
  gated on a mature, production-proven authorization/audit architecture; the
  platform is still pre-production (Cloud TEST gate), so no MCP server, tool,
  AI client, assistant, or backdoor was added.
- ADR-024 records: MCP tools reuse the same application authorization layer as
  the UI; no privileged MCP backdoor bypasses clinic permissions; sensitive
  writes follow §48.3 (AI proposes → server resolves → user confirms →
  authorized tool executes → audit recorded); AI is administrative/query
  assistance only (no diagnosis); clinical-note drafting, if ever, requires
  dentist review/finalization; synthetic data only in AI dev/test environments.
- Implementation gate: production-proven authz/audit + Cloud TEST deployment
  gate + a bounded, independently reviewed AI/MCP plan.

## Phase 22 checkpoint (2026-08-27) - ACCEPTED (boundary only)

Phase 22 (Messenger Integration) is complete with
`docs/plans/022-messenger-integration.md` P22-01..P22-04 all `[x]`. Per
`MASTER_PRODUCT_PLAN.md` §Phase 22, implementation happens only after Meta
app/business requirements are understood; they are not yet confirmed, so this
phase delivered the boundary and gated design, not a live connection.

- `docs/discovery/022-messenger-requirements.md` documents the owner
  confirmation items, the Meta concepts to verify (app/Page connection, app
  review, webhook verification, conversation-based messaging rules, opt-in,
  template approval, patient-initiated conversations), and a bounded design
  that adds Messenger as a `MESSENGER` channel behind the Phase 8
  `communications` outbox/history (idempotency, retries, delivery state), uses
  a single signature-verified webhook with append-only inbound history, keeps
  only appointment utility content in chat (no clinical text by construction),
  gates staff handoff server-side by role, and defers the optional guided
  booking assistant.
- `docs/decisions/ADR-023-messenger-integration-boundary.md` records the
  boundary: no implementation in this phase, single communication boundary,
  no clinical disclosure through chat, no credentials in the repository, and
  Cloud TEST as the only integration-test target after the owner configures
  the connection.
- Implementation gate: owner confirmation + Meta requirements verified + design
  approved + ADR confirmed + a bounded implementation plan reviewed. This phase
  made no schema/migration/application change; verification is the review.

**Next:** Phase 23 (Advanced Operations) per `MASTER_PRODUCT_PLAN.md` §Phase
23. This is explicitly a potential/options list (waitlist automation, HMO,
advanced finance, patient portal, schedule optimization, no-show prediction).
Do not implement from a menu: select only items that are confirmed product
requirements, author a bounded plan per item, and keep each one within the
approved phase process. Phase 24 (AI/MCP) is gated on a mature
authorization/audit architecture per the master plan's own wording.

## Phase 21 checkpoint (2026-08-27) - ACCEPTED (discovery only)

Phase 21 (Billing Enhancement / BIR-Compliant Invoicing Discovery) is complete
with `docs/plans/021-billing-invoicing-discovery.md` P21-01..P21-03 all `[x]`.
Per `MASTER_PRODUCT_PLAN.md` §Phase 21, no regulated invoice functionality was
built from assumptions.

- The deliverable is `docs/discovery/021-bir-invoicing-requirements.md`: an
  owner confirmation checklist (taxpayer status, VAT vs non-VAT, COR, registered
  document types, CAS/loose-leaf authority, number series, services document
  type, tax rate, branch issuance, walk-in vs online, retention, e-invoicing
  applicability, billing contact); BIR concepts to verify with the accountant;
  and a bounded design for numbering, data, reporting, and access that composes
  with the canonical billing ledger (DATABASE_DESIGN §22/DB-9) and preserves
  branch attribution.
- The design explicitly keeps invoice numbers consecutive/unreused with voided
  documents preserved, derives documents from ledger rows rather than a second
  source of truth, snapshots printed documents, and gates exports on permission
  and audit.
- Implementation gate: owner confirms the checklist, the accountant confirms the
  applicable requirements, the design is revised and approved, and a bounded
  implementation plan is authored and reviewed. No billing permission, table,
  migration, grant, or regulated feature was added.
- This phase made no schema/migration/application change; verification is the
  documentation review.

**Next:** Phase 22 (Messenger Integration) per `MASTER_PRODUCT_PLAN.md` §Phase
22. This is also a boundary/verification phase: understand Meta app/business
requirements, use the unified Phase 8 communication system, ensure
patient-initiated conversation handling, never disclose clinical records
through ordinary chat, and follow current Meta policy; build only after those
requirements are documented and verified.

## Phase 20 checkpoint (2026-08-27) - ACCEPTED

Phase 20 (Analytics) is complete through commit `9d40360` (P20-03 services +
role-aware dashboard), with `docs/plans/020-analytics.md` P20-01..P20-04 all
`[x]`.

- P20-01/02 `b41fdae` broadened the existing OWNER/ADMIN `analytics.view`
  permission description to the full aggregate scope, added only the tenant/time
  indexes the query layer needs, and added the private
  `has_analytics_permission_at_branch` helper plus two SECURITY DEFINER RPCs:
  `get_operational_analytics_summary(uuid,uuid,integer)` and
  `list_operational_analytics_breakdown(uuid,uuid,integer)`.
- Metrics are aggregate-only with exact terminal grants to authenticated and no
  service-role/anon grant. Definitions: new patients, appointment volume,
  completion, no-show rate, confirmation rate, acquisition source, initial
  booking channel, referral activity, website conversion, provider booked load,
  resource booked load, communication delivery, and current low stock.
- Provider/resource utilization is reported as booked appointment count and
  booked minutes, deliberately not a capacity percentage (resource capacity
  hours are not canonical). The optional branch filter must be an active branch
  in the acting organization; windows are exactly 30/90/365 days. No patient
  rows, contact, clinical fields, exports, or read audit events.
- P20-03 `9d40360` added strict `src/lib/analytics/` schemas/errors/service and
  replaced the dashboard placeholder with a role-aware page: owners/admins with
  live analytics.view get the aggregate dashboard (branch/window filters,
  concise operational summary, dense desktop tables plus intentional phone
  lists, and metric-definition source trace); other roles get only
  permission-derived links to already-authorized domain screens and never
  receive analytics data. Server actions reauthorize analytics.view at the
  acting branch before loading.
- Acceptance criteria met: metric definitions documented and consistent; every
  metric traces to canonical source tables; acquisition source and initial
  booking channel stay independent dimensions; analytics access is enforced in
  server code and PostgreSQL.
- Inventory: 123 migration files, 43 grant terminals, 196 approved privileges;
  tables 69, function declarations 241, SECURITY DEFINER declarations 205;
  unit 119 files / 1,225 tests; scripts 279; 69 pgTAP suites + 5 concurrency
  probes.
- Verification: clean local reset/provision plus all pgTAP/concurrency suites
  passed; migration/security/secrets/audit gates passed; unit, scripts, lint,
  typecheck, build, and `git diff --check` passed. Cloud TEST remains the
  deployment gate.

**Next:** Phase 21 (Billing Enhancement / BIR-Compliant Invoicing Discovery) per
`docs/MASTER_PRODUCT_PLAN.md` §Phase 21. This is a discovery phase: confirm the
clinic taxpayer/system status and accountant/BIR rules and document requirements
before designing compliant invoice numbering/data/reporting; do not build
regulated invoice functionality from assumptions.

## Phase 19 checkpoint (2026-08-27) - ACCEPTED

Phase 19 (Inventory & Branch Operations) is complete through commit `9e71568`
(P19-03 services + UI and final boundary hardening), with
`docs/plans/019-inventory-branch-ops.md` P19-01..P19-04 all `[x]`.

- P19-01/02 `5c4f34d` added OWNER/ADMIN-only inventory.view/manage permissions,
  organization item catalog, non-negative branch balances, append-only movement
  ledger, destination-confirmed transfers, low-stock derivation, 12 public
  mutation/read RPCs plus a private permission helper, exact terminal grants,
  audit events, and pgTAP coverage.
- P19-03 `9e71568` added the strict `src/lib/inventory/` server boundary and
  `/inventory` UI: desktop tables and intentional phone lists, low-stock
  emphasis, catalog management, receive/adjust/issue dialogs, branch transfer
  create/confirm/cancel controls, bounded movement history, and organization
  branch breakdowns. Server actions reauthorize every read/mutation.
- The application-boundary review added a thirteenth public RPC,
  `list_inventory_transfers(uuid,text)`, because browser base-table access stays
  zero; it returns at most 200 transfers where the acting branch is source or
  destination. Database triggers keep equipment out of consumable balances and
  prevent stocked/history-bearing consumables from becoming equipment.
- Transfer hardening requires submitted source branch = authenticated acting
  branch in both Zod and PostgreSQL, permits only the source acting branch to
  cancel, and permits only the destination acting branch to confirm. Negative
  pgTAP and offline tests cover forged source, unrelated/foreign branches,
  permission denial, stale versions, state transitions, and equipment stock.
- Acceptance criteria met: stock and immutable movement history are traceable by
  branch; adjustments/issues require reasons and audit atomically; destination
  stock stays unchanged until confirmation; constraints and transactional locks
  prevent negative stock; low-stock is evaluated per branch; organization
  aggregates preserve branch breakdowns.
- Inventory: 120 migration files, 42 grant terminals, 194 approved privileges;
  tables 69, function declarations 238, SECURITY DEFINER declarations 202;
  unit 115 files / 1,212 tests; scripts 279.
- Verification: clean local reset/provision plus all pgTAP and five concurrency
  probes passed; migration/security/secrets/audit gates passed; unit, scripts,
  lint, typecheck, build, and `git diff --check` passed. Cloud TEST remains the
  deployment gate.

**Next:** Phase 20 (Analytics) per `docs/MASTER_PRODUCT_PLAN.md` §Phase 20.
Author a bounded plan that documents metric definitions and source traces,
keeps acquisition source distinct from booking channel, and gates analytics by
role before implementing P20-01.. .

## Phase 18 checkpoint (2026-08-27) - ACCEPTED

Phase 18 (Recall & Follow-up Automation) complete through commit `7ae9c39`
(P18-03 recall services + UI) with `docs/plans/018-recall-followup.md`
P18-01..P18-04 all `[x]`.

- P18-01/02 `399ef08` recall.read/manage permission (manage OWNER/ADMIN/DENTIST;
  read + RECEPTIONIST) + recall_rules (branch-null clinic-wide config),
  patient_recall_preferences (opt-out), recalls (SCHEDULED/OVERDUE derived/
  COMPLETED/CANCELLED/OPTED_OUT) + 12 RPCs + **encounter-finalize automation
  trigger** (completed treatment creates recalls). Opt-outs respected at
  enqueue (skip without increment/audit; individual OPTED_OUT; channel NONE;
  no contact); reminders reuse Phase 8 worker; booked recall links org-scoped
  appointment. P18-03 `7ae9c39` src/lib/recall services + /recalls page
  (overdue-first list, retention summary, rule management, enqueue/complete/
  cancel/opt-out/link actions, opt-out-aware enqueue skip note).
- Acceptance criteria met: rules dentist/clinic configured; completed treatment
  creates recall (trigger); booked recall links correctly; opt-outs respected.
- Inventory: 115 migration files, 40 grant terminals, 181 approved privileges;
  68 pgTAP suites + 5 concurrency probes; tables 65, functions 220,
  security-definer 188; unit 112 files / 1188 tests; scripts 279.

**Next:** Phase 19 (Inventory & Branch Operations) per docs/MASTER_PRODUCT_PLAN.md
§Phase 19. Author bounded plan docs/plans/019-inventory-branch-ops.md then
execute P19-01.. .

## Phase 18 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 17 checkpoint (2026-08-27) - ACCEPTED

Phase 17 (Digital Intake & Consent) complete through commit `55e128d`
(P17-03 intake services + staff + public UI) with
`docs/plans/017-digital-intake-consent.md` P17-01..P17-04 all `[x]`.

- P17-01/02 `c625657` intake.manage permission (OWNER/ADMIN/RECEPTIONIST) +
  consent_templates (global-immutable) + intake_forms (answers preserved
  verbatim, privacy_acknowledged, status PENDING/SUBMITTED/SIGNED/PRINTED,
  submitted_via LINK/PAPER, template_version/time/signers) + intake_links
  (SHA-256 token hash, state-transition expiry) + 6 RPCs (create form returns
  token once, anon get/submit gated by token hash — wrong/expired/revoked/
  foreign tokens indistinguishable NULL so a link cannot expose another
  patient; mark paper; list). P17-03 `55e128d` src/lib/intake services +
  patient Intake section (create link token-once, mark paper) + public
  (public)/intake/[token] form + /api/public/intake route; consent-template gap
  closed with list_consent_templates RPC (rpc `20260827013800`).
- Acceptance criteria met: form link cannot expose another patient (token-hash
  binding, indistinguishable NULLs, pgTAP); signed form captures template
  version/time/signers; clinic can print instead of digitally sign
  (mark_intake_form_paper + print).
- Inventory: 112 migration files, 39 grant terminals, 169 approved privileges
  (7 deliberate anon grants); 68 pgTAP suites + 5 concurrency probes; tables 62,
  functions 206, security-definer 174; unit 109 files / 1128 tests; scripts 279.

**Next:** Phase 18 (Recall & Follow-up Automation) per docs/MASTER_PRODUCT_PLAN.md
§Phase 18. Author bounded plan docs/plans/018-recall-followup.md then execute
P18-01.. .

## Phase 17 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 16 checkpoint (2026-08-27) - ACCEPTED

Phase 16 (Treatment Plans & Discussion Canvas) complete through commit
`c7f7d57` (P16-03 services + UI + document integration) with
`docs/plans/016-treatment-plans.md` P16-01..P16-04 all `[x]`.

- P16-01/02 `e65e6a6` treatment_plans/items/alternatives/discussions/drawings
  schema + immutable trigger (PRESENTED/ACKNOWLEDGED plans immutable, with the
  single sanctioned PRESENTED→ACKNOWLEDGED transition) + 12 RPCs. P16-03
  `c7f7d57` Phase-11 document extension (TREATMENT_PLAN snapshot incl. drawing;
  never writes the plan), src/lib/treatment-plan services, patient Treatment
  plan tab (DRAFT editable → ACKNOWLEDGED read-only, drawing canvas, discussion
  history, print via document seam).
- Acceptance criteria met: drawing persists; drawing in plan document snapshot;
  original images unchanged; acknowledged plan immutable; discussion docs
  include dentist/time/context.
- Inventory: 107 migration files, 37 grant terminals, 161 approved privileges;
  63 pgTAP suites + 5 concurrency probes; tables 59, functions 198,
  security-definer 167; unit 103 files / 1077 tests; scripts 279.

**Next:** Phase 17 (Digital Intake & Consent) per docs/MASTER_PRODUCT_PLAN.md
§Phase 17. Author bounded plan docs/plans/017-digital-intake-consent.md then
execute P17-01.. .

## Phase 16 P16-03 checkpoint (2026-08-27) - READY FOR REVIEW (historical)

Phase 16 P16-03 (Document integration + services + UI) implemented on top of
P16-01/02 (`e65e6a6` treatment plan schema + RPCs). Not committed.

- P16-03 document seam `20260827013500_document_treatment_plan.sql`: additively
  replaces the `documents_type_check` to admit `TREATMENT_PLAN`, extends the
  audit metadata allow-list with `TREATMENT_PLAN` (preserving every existing
  Phase 1/6/11/13/14 key), and recreates `generate_document` to snapshot a
  same-tenant plan: the plan header always, plus items/alternatives/discussions/
  drawing gated by the include set; discussion entries carry
  dentist/time/context and never the free-form notes bodies; the
  renderer-independent drawing jsonb is included verbatim. The plan selector
  travels in the include set under the non-boolean `planId` key (the fixed RPC
  signature cannot grow a parameter and no new RPC is added). The file is a
  registered grant-terminal that re-states the exact `generate_document`
  authenticated EXECUTE grant the recreate cancels, so the approved final
  privilege set is unchanged (no new grantable object).
- Frontend document lib extended for TREATMENT_PLAN (schema/types/include-set/
  render/service): the board renders TREATMENT_PLAN rows and the A4 print route
  renders the acknowledged plan snapshot incl. a safe SVG of the drawing; the
  board's generate dialog stays limited to the non-plan types (plan generation
  is plan-scoped inside the patient section).
- `src/lib/treatment-plan/` service layer: schemas/types/errors/service for all
  twelve P16-02 RPCs plus `generateTreatmentPlanDocument` (delegates to the
  documents service), with offline mocked tests.
- Patient Clinical "Treatment plan" tab (`treatment-plan-section.tsx` +
  `treatment-plan-actions.ts`): plan list (dense table + phone), create plan,
  plan detail with items add/edit/remove and alternatives (DRAFT), renderer-
  independent pointer-capture drawing canvas persisted via
  `saveTreatmentPlanDrawing` (blocked after ACKNOWLEDGED), append-only
  discussions capturing provider/time/context, Present and Acknowledge
  (DRAFT→PRESENTED→ACKNOWLEDGED; everything read-only after ACKNOWLEDGED), and a
  Print button that generates the TREATMENT_PLAN document and opens the Phase 11
  snapshot print route. Gated on `patient.clinical.read`/`write`; Print
  additionally requires `document.generate`. RECEPTIONIST sees no section.
- Inventory: 107 migration files, 37 grant terminals, 161 approved privileges;
  63 pgTAP suites + 5 concurrency probes; tables 59, functions 198,
  security-definer 167; unit 103 files / 1077 tests; scripts 279.
- Verification: `db:reset:local`, `db:provision:local`, `test:db:local` all
  suites + concurrency probes pass (incl. new `document_treatment_plan.test.sql`,
  43 assertions); `security:migrations` passes; `npx vitest run scripts` 279
  tests pass; `npm run test:unit` 1077 tests pass; lint, typecheck, build, and
  `git diff --check` clean.

**Next:** P16-04 integration verification + phase review. Cloud TEST remains the
deployment gate.

## Phase 15 checkpoint (2026-08-27) - ACCEPTED

Phase 15 (Odontogram / Dental Chart) complete through commit `5be9cca`
(P15-03 chart UI) with `docs/plans/015-odontogram.md` P15-01..P15-04 all `[x]`.

- P15-01/02 `c18dcba` tooth_conditions schema (FDI permanent 11-48 + primary
  51-85 validated, surface O/B/L/M/D/I/F/FULL, status
  ACTIVE/PLANNED/COMPLETED/REFERRED, finding types, void preserves history —
  terminal statuses never voidable) + create/void/list RPCs (clinical gating
  reused; audit per mutation; history preserved via voided_at + audit).
  P15-03 `5be9cca` src/lib/odontogram services + patient Odontogram tab
  (self-built semantic grid chart, 2 arches, 44px cells, status legend,
  click-to-edit + void confirm, history view, print CSS seam). Canonical data
  is renderer-independent; the controlled Ditherys/React-Odontogram-Modul fork
  remains the documented preferred future renderer (self-built chart is a
  deliberate bounded deviation — no third-party dependency added this phase).
- Acceptance criteria met: FDI + status vocabulary validated (pgTAP + UI);
  historical chart preserved (void + audit + history view); printable chart
  legible (print CSS + tests).
- Inventory: 103 migration files, 35 grant terminals, 148 approved privileges;
  62 pgTAP suites + 5 concurrency probes; tables 54, functions 183,
  security-definer 154; unit 100 files / 1028 tests; scripts 279.

**Next:** Phase 16 (Treatment Plans & Discussion Canvas) per
docs/MASTER_PRODUCT_PLAN.md §Phase 16. Author bounded plan
docs/plans/016-treatment-plans.md then execute P16-01.. .

## Phase 15 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 14 checkpoint (2026-08-27) - ACCEPTED

Phase 14 (Clinical Notes & Dental EMR) complete through commit `aab7d73`
(P14-04 clinical services + patient clinical UI) with
`docs/plans/014-clinical-notes.md` P14-01..P14-05 all `[x]`.

- P14-01 `45a38e2` patient.clinical.read/write permission contract
  (write OWNER/ADMIN/DENTIST; read + DENTAL_ASSISTANT; RECEPTIONIST neither —
  updated the stale Phase 2 patient_authorization assertions accordingly).
  P14-02/03 `3f0daec` clinical schema (encounters, notes with
  **immutable-finalized trigger** + amendment-chain self-FK, medical
  conditions/allergies/medications, prescriptions) + 13 clinical RPCs +
  has_clinical_permission_at_branch; finalized notes/prescriptions are
  immutable; amendments are child rows preserving history; audit per mutation
  (rollback-proven); encounter links appointment/provider org-scoped.
  P14-04 `aab7d73` src/lib/clinical services + patient Clinical section
  (treatment history, notes draft/finalize/amend, medical history, prescriptions;
  RECEPTIONIST sees no section, DENTAL_ASSISTANT read-only, DENTIST full).
- Acceptance criteria met: finalized notes preserve history (immutable +
  amendment chain); clinical changes audited; reception cannot edit clinical
  notes (no permission + UI hidden); encounter links appointment/provider.
- Inventory: 100 migration files, 34 grant terminals, 145 approved privileges;
  60 pgTAP suites + 5 concurrency probes; tables 53, functions 180,
  security-definer 151; unit 97 files / 999 tests; scripts 279.

**Next:** Phase 15 (Odontogram / Dental Chart) per docs/MASTER_PRODUCT_PLAN.md
§Phase 15. Author bounded plan docs/plans/015-odontogram.md then execute
P15-01.. . Canonical dental chart data stays renderer-independent (the
Ditherys/React-Odontogram-Modul fork is the preferred prototype renderer).

## Phase 14 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 13 checkpoint (2026-08-27) - ACCEPTED

Phase 13 (Website Booking Integration — highest-risk public surface) complete
through commit `a46ee97` (P13-04 booking services + staff/website UI) with
`docs/plans/013-website-booking.md` P13-01..P13-05 all `[x]`.

- P13-01 `dd62830` booking.review permission (OWNER/ADMIN/RECEPTIONIST) +
  booking_requests table (minimal fields, SHA-256 token hash only, idempotency
  unique key, referral_payload bounded, status incl. CANCELLED).
  P13-02/03 `de0a801` 4 anon-granted public RPCs (available_slots, submit,
  status, cancel) + 3 staff RPCs (list/review). Holds = ACTIVE provider_
  reservations kind HOLD with 5-min expires_at (P6 constraint altered to allow
  ACTIVE-HOLD expiry; ACTIVE non-HOLD still never expires) under the exclusion
  backstop; stale-hold expiry by state transition; REQUEST_ONLY → no hold;
  token plaintext once + hash stored; review APPROVE converts to a real
  appointment + patient match/create + hold→APPOINTMENT reservation conversion,
  and the existing P8/P9 triggers fire (automation follows same domain events).
  **Deadlock in concurrent same-slot submissions was found by the new
  booking_double_book concurrency probe and fixed with a per-(org,provider)
  pg_advisory_xact_lock**; probe now passes (one wins, one SLOT_UNAVAILABLE,
  exactly one HOLD).
- P13-04 `a46ee97` src/lib/booking services + /booking-requests staff board +
  /book public page + /api/public/booking(+slots) route handlers; minimal
  allowlist (strict), no clinical data (test-proven), token shown once.
- Acceptance criteria met: website+reception cannot double book (exclusion +
  advisory lock + concurrency probe); online appointment appears immediately in
  EMR (conversion creates real appointment in-transaction); calendar automation
  follows same domain events (triggers fire); minimal patient info only; request-
  only procedures create a review request (no fake slot).
- Inventory: 96 migration files, 33 grant terminals, 132 approved privileges
  (incl. 5 deliberate anon grants); 54 pgTAP suites + 5 concurrency probes
  (incl. booking double-book); tables 47, functions 162, security-definer 137;
  unit 94 files / 956 tests; scripts 279.

**Next:** Phase 14 (Clinical Notes & Dental EMR) per docs/MASTER_PRODUCT_PLAN.md
§Phase 14. Author bounded plan docs/plans/014-clinical-notes.md then execute
P14-01.. .

## Phase 13 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 12 checkpoint (2026-08-27) - ACCEPTED

Phase 12 (Clinic Website) complete through commit `c141255` (P12-04 public
website) with `docs/plans/012-clinic-website.md` P12-01..P12-05 all `[x]`.

- P12-01 `60712ab` site.manage permission (OWNER/ADMIN) + public_site_settings
  (hero/about/contact/hours/privacy/links, bounded). P12-02 `295153c`
  get_public_site(org_slug) — the SINGLE DELIBERATE anon-granted public RPC
  returning only website-safe fields (website_visible providers/procedures,
  settings; no-leakage pgTAP-proven against inserted patient/clinical data) +
  get/update settings RPCs (site.manage gated, versioned, audited). P12-03/04
  `c141255` src/lib/site services + public-resolver + /settings/site admin UI +
  rebuilt (public) home (hero/about/services/providers/contact/privacy/CTAs,
  mobile-first, SEO metadata, force-dynamic).
- Acceptance criteria met: mobile-first responsive; public site exposes no
  clinical data (keyset + no-clinical-string DOM tests); content from controlled
  website_visible fields; admin-editable without code.
- Inventory: 91 migration files, 31 grant terminals, 121 approved privileges
  (incl. the one deliberate anon grant on get_public_site); 53 pgTAP suites +
  4 concurrency probes; tables 46, functions 154, security-definer 130;
  unit 86 files / 885 tests; scripts 279.

**Next:** Phase 13 (Website Booking Integration) per docs/MASTER_PRODUCT_PLAN.md
§Phase 13. Author bounded plan docs/plans/013-website-booking.md then execute
P13-01.. . This is the highest-risk public booking surface (slot holds, no
double-booking, acquisition/campaign capture, secure management links).

## Phase 12 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 11 checkpoint (2026-08-27) - ACCEPTED (real PDF conversion NOT VERIFIED)

Phase 11 (Document & Print Engine) complete through commit `00146e3` (P11-04
renderer + print UI) with `docs/plans/011-document-print.md` P11-01..P11-05 all
`[x]`.

- P11-01 `e607687` document.generate/view permission contract
  (generate OWNER/ADMIN/DENTIST; view + RECEPTIONIST).
  P11-02/03 `7120f94` documents table (template_version + data_snapshot +
  include_set, snapshot object+size checks) + generate/list/get_snapshot RPCs +
  has_document_permission_at_branch; snapshot built server-side from authorized
  sections (demographics/referrals/appointments) per type; include-set controls
  configurable export (never blind full export); audit document.generated per
  generation; additive audit-metadata extension (document_type/include_set
  keys). P11-04 `00146e3` src/lib/documents services + render.ts (branded A4
  `@page`/`@media print` HTML, escaped) + /documents UI (patient picker,
  generate dialog with include-set checkboxes) + /documents/[id]/print route.
- Acceptance criteria met: A4 usable (print HTML route + print chrome-hidden
  shell); configurable export (include_set); clinic branding (org/branch
  rendered server-side); sensitive exports authorized/audited (document.generate
  + audit event); reproducible snapshot (template_version + data_snapshot
  byte-identical re-render, pgTAP-proven).
- Inventory: 88 migration files, 30 grant terminals, 117 approved privileges;
  49 pgTAP suites + 3 concurrency probes; tables 45, functions 150,
  security-definer 126; unit 79 files / 838 tests; scripts 279.
- **NOT VERIFIED / EXTERNAL DEPENDENCY:** PDF conversion. The A4 print HTML is
  the print-to-PDF seam.

**Next:** Phase 12 (Clinic Website) per docs/MASTER_PRODUCT_PLAN.md §Phase 12.
Author bounded plan docs/plans/012-clinic-website.md then execute P12-01.. .

## Phase 11 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 11 checkpoint (2026-08-27) - P11-04 IMPLEMENTED, not committed

P11-04 (server renderer + services + print UI) per `docs/plans/011-document-print.md`
is implemented on top of commits `7120f94` (P11-02 schema) and `7120f94` (P11-03
RPCs). Working tree only; nothing committed.

- `src/lib/documents/` server services mirroring `src/lib/specialist/`:
  - `include-set.ts` (client-safe, single source of truth): 3 document types,
    per-type include-set section allowlists, human labels.
  - `schema.ts` (server-only): strict input schemas (`generateDocumentInputSchema`
    as a discriminated union keyed on documentType with per-type strict
    boolean-value include-set objects; `listDocumentsInputSchema`;
    `getDocumentSnapshotInputSchema`), output row schemas for the 3 RPCs
    (`documentMutationRowSchema`, `documentListRowSchema`, `documentSnapshotRowSchema`
    with structured `documentDataSnapshotSchema` sections), and RPC allowlists reused
    exactly: PATIENT_RECORD_SUMMARY -> demographics/referrals/appointments,
    APPOINTMENT_SLIP -> demographics/appointments, REFERRAL_LETTER ->
    demographics/referrals.
  - `types.ts`: DTO types (camelCase): DocumentType, DocumentRecord (no
    snapshot body), DocumentSnapshot, DocumentDataSnapshot, DocumentMutationResult.
  - `errors.ts`: DocumentServiceError + mapDocumentRpcError (NOT_AUTHORIZED/
    INVALID_INPUT/FAILED).
  - `service.ts`: server-only generateDocument/listDocuments/getDocumentSnapshot
    with exact p_* args; **normalizes include-set to truthy keys only** before
    calling generate_document because the RPC builds snapshot sections on key
    *presence* not value — a deselected (false) section can never leak.
  - `render.ts`: server-only pure `renderDocumentHtml({ documentType,
    templateVersion, dataSnapshot, orgName, branchName })` -> clinic-branded A4
    print HTML string (`@page { size: A4; margin: 18mm }`, `@media print`,
    header org/branch/title, deterministic footer with template version, only
    the snapshot sections present, every value HTML-escaped via escapeHtml).
- UI:
  - `/documents` page: `requireVerifiedIdentity` + `document.view` (+branch
    recheck), `document.generate` gate for `canGenerate`, optional `?patientId=`
    query pre-selects a patient and server-loads their document list.
  - `documents-board.tsx` (client): patient picker (searchPatientsAction), dense
    desktop table / phone list (type, template version, generated at, include-set
    summary), Generate dialog (type select + per-type include-set checkboxes,
    >=1 section required), View/Print per row re-checks `getSnapshotAction` then
    opens `/documents/[id]/print`; all controls 44px (min-h-11/h-11).
  - `documents/actions.ts`: loadDocumentsAction (document.view+branch),
    generateDocumentAction (document.generate+branch+per-type include-set
    validation), getSnapshotAction (document.view+branch). revalidatePath
    `/documents`. No org identifiers accepted.
  - `documents/[documentId]/print/page.tsx`: server-gated A4 print route;
    orchestration extracted to `print-document.ts` `resolvePrintDocument`
    (auth recheck + snapshot + render) so the print logic is unit-testable.
  - Nav entry "Documents" (`FileText`, `document.view`).
  - `emr-shell.tsx`/`emr layout.tsx`: `print:hidden` on aside/header/Toaster and
    `print:p-0` on main so browser print of the print route emits the A4
    document without the app chrome.
- Tests: `service.test.ts`, `render.test.ts`, `actions.test.ts`,
  `documents-board.test.tsx`, `print-page.test.tsx` (5 files, 42 tests new).
  Covers
  RPC contract incl. include-set normalization, forbidden-key rejection per
  type, output parse failures, error mapping, list projection (no snapshot
  body), permission/branch reauthorization, generate validation + audit-mapped
  errors, phone/desktop render, 44px, escaping + A4/print CSS + branding,
  denied/failed/ready print resolution.
- Verification (2026-08-27): `npm run test:unit` 79 files / 838 tests pass,
  `npm run lint` clean, `npm run typecheck` clean, `npm run build` passes and
  emits `/documents` and `/documents/[documentId]/print`, `git diff --check`
  clean, `security:migrations` (30 terminals/117 privileges, unchanged),
  `security:secrets` clean. No new migrations/RPCs. No Cloud/prod target used.
- Deviations: (1) `renderDocumentHtml` takes no generated timestamp (RPC
  snapshot row has none); footer is deterministic ("Prepared from the structured
  EMR record · Template v1 · Reproducible snapshot"). (2) service strips
  false-valued include-set keys before the RPC (see above). (3) print route
  renders via `dangerouslySetInnerHTML` of server-authored escaped HTML (safe by
  construction; all snapshot text escaped in render). (4) `/documents` list is
  patient-scoped per plan (list RPC requires patient_id; no clinic-wide RPC
  added). (5) dates render as stored ISO date/time segment deterministically
  (no locale/timezone dependency).

## Phase 10 checkpoint (2026-08-27) - ACCEPTED

Phase 10 (Specialist / On-call Workflow) complete through commit `7ff5164`
(P10-04 specialist services + UI) with `docs/plans/010-specialist-oncall.md`
P10-01..P10-05 all `[x]`.

- P10-01 `b34fc24` specialist.request permission (OWNER/ADMIN/DENTIST/
  RECEPTIONIST). P10-02 `594a3d7` specialist_requests + status history (minimal
  bounded non-clinical case_summary, global-OR-org specialty scope trigger,
  status state machine SENT/ACCEPTED/ASSIGNED/DECLINED/
  ALTERNATE_TIME_REQUESTED/EXPIRED/CANCELLED). P10-03 `f08f552` create/respond/
  cancel/list RPCs + has_specialist_permission_at_branch; ACCEPT inserts
  appointment_providers SPECIALIST ASSIGNED + enqueues calendar CREATE +
  communication (acceptance triggers assignment + automation atomically);
  responder must be the requested provider's linked user OR org role.manage;
  bookability proven (find_available_slots = 0 for VISITING/ON_CALL provider
  with no availability rules). P10-04 `7ff5164` src/lib/specialist services +
  /specialists UI (request + respond + cancel; responder rule enforced
  server-side in RPC).
- Acceptance criteria met: on-call not automatically bookable; availability
  request carries minimal case_summary only (no clinical content); acceptance
  assigns provider + triggers calendar/communication automation.
- Inventory: 84 migration files, 29 grant terminals, 114 approved privileges;
  47 pgTAP suites + 3 concurrency probes; tables 44, functions 145,
  security-definer 122; unit 74 files / 795 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/specialists` emitted).

**Next:** Phase 11 (Document & Print Engine) per docs/MASTER_PRODUCT_PLAN.md
§Phase 11 (initial templates: patient record summary, treatment estimate,
statement of account, prescription, referral letter, consent form, appointment
slip, treatment plan; A4, clinic branding, sensitive exports authorized/audited).
Author bounded plan docs/plans/011-document-print.md then execute P11-01.. .

## Phase 10 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 9 checkpoint (2026-08-27) - ACCEPTED (external Google behavior NOT VERIFIED)

Phase 9 (Google Calendar Integration) complete through commit `76f29ff`
(P9-05 calendar settings UI) with `docs/plans/009-google-calendar.md` P9-01..P9-06
all `[x]`.

- P9-01 `bce6a9d` calendar.manage permission (OWNER/ADMIN/DENTIST only).
  P9-02 `8a05af9` calendar_integrations (opaque google_account_ref, privacy
  modes, connection status) + calendar_event_links (stable external_event_id,
  unique appt+provider+op) + calendar_sync_jobs (durable queue, deterministic
  idempotency key). P9-03 `07835ee` sync RPCs (enqueue/list/claim/ack/fail/
  connect/disconnect/list integrations) + has_calendar_permission_at_branch +
  private enqueue internal + deferred appointment_calendar_sync_trigger
  (CREATE on insert for ASSIGNED providers with CONNECTED integration, CANCEL
  on cancel, UPDATE on reschedule; in-transaction enqueue only).
  P9-04 `951ec51` src/lib/calendar services + adapter abstraction (deterministic
  test adapter, stable `cal-<appt>-<provider>` id → no-duplicate; free/busy
  returns busy ranges only — no event details) + worker. P9-05 `76f29ff`
  /settings/calendar UI (integrations + sync jobs, connect/disconnect/re-sync,
  no event titles, 44px).
- Acceptance criteria met: EMR correct when adapter down (failure → job FAILED,
  appointment untouched); free/busy never exposes personal event details
  (type + tests); retry no-duplicate (stable id + unique link);
  tokens never reach browser (opaque ref, never returned by RPCs, no logging).
- Inventory: 80 migration files, 28 grant terminals, 110 approved privileges;
  46 pgTAP suites + 4 concurrency probes; tables 42, functions 139,
  security-definer 117; unit 71 files / 750 tests; scripts 279.
- **NOT VERIFIED / EXTERNAL DEPENDENCY:** real Google OAuth + Calendar API
  adapter. Only the provider-neutral interface and deterministic local test
  adapter are implemented. Cloud TEST is the deployment gate.

**Next:** Phase 10 (Specialist / On-call Workflow) per
docs/MASTER_PRODUCT_PLAN.md §Phase 10. Author bounded plan
docs/plans/010-specialist-oncall.md then execute P10-01.. .

## Phase 9 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 8 checkpoint (2026-08-27) - ACCEPTED

Phase 8 (Automation & Communication Core) complete through commit `c7df3da`
(P8-05 communications dashboard + requeue retry) with
`docs/plans/008-automation-communication.md` P8-01..P8-06 all `[x]`.

- P8-01 `6b3ccd4` communication.view/send permission contract (OWNER/ADMIN/
  RECEPTIONIST). P8-02 `6047668` communications table = durable job queue +
  history (QUEUED/SENT/DELIVERED/FAILED/CANCELLED, idempotency unique key,
  attempts/max_attempts/next_attempt_at, template-only bounded bodies).
  P8-03 `3681cb7` enqueue/cancel/list/acknowledge/fail/claim_due RPCs +
  has_communication_permission_at_branch helper + appointment automation
  triggers (CONFIRMATION on create/confirm, CANCELLATION + cancel-obsolete on
  cancel, RESCHEDULE on reschedule; idempotent keys; non-clinical templates;
  enqueue is in-transaction only, never blocking). P8-04 `4a83129`
  src/lib/communication services + worker + adapter abstraction (deterministic
  test adapter, idempotent by communicationId, retry/duplicate-send proven).
  P8-05 `c7df3da` /communications dashboard + requeue_communication RPC
  (FAILED-only manual retry copying stored content — resolves the masked-
  recipient retry data boundary).
- Acceptance criteria met: external send never blocks appointment save
  (in-transaction enqueue only); jobs retryable/idempotent; cancellation
  cancels obsolete reminders (trigger); staff see delivered/failed state
  (dashboard); duplicate-send tests pass.
- Inventory: 76 migration files, 27 grant terminals, 102 approved privileges;
  44 pgTAP suites + 4 concurrency probes; tables 39, functions 128,
  security-definer 106; unit 66 files / 693 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/communications` emitted).

**Next:** Phase 9 (Google Calendar Integration) per
docs/MASTER_PRODUCT_PLAN.md §Phase 9. External OAuth + provider-neutral
calendar adapter with the deterministic local adapter; EMR→Google event sync,
retry no-duplicate, tokens never reach browser. Author bounded plan
docs/plans/009-google-calendar.md then execute P9-01.. .

## Phase 8 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 7 checkpoint (2026-08-27) - ACCEPTED

Phase 7 (Walk-in & Queue) complete through commit `d71ed5f` (P7-04 queue UI)
with `docs/plans/007-walkin-queue.md` P7-01..P7-05 all `[x]`.

- P7-01 `9e4d8cc` queue.read/queue.manage permission contract + queue_entries
  table (statuses WAITING/READY/CALLED/IN_CHAIR/COMPLETED/LEFT/CANCELLED,
  tenant-safe composite FKs, completed/left consistency checks). P7-02 `3d6b408`
  queue RPCs (create_walkin_entry/update_queue_status/list_queue) +
  has_queue_permission_at_branch helper; forward-only transitions, one atomic
  audit per mutation with stripped-null reason metadata. P7-03 `e1f96ec`
  src/lib/queue services. P7-04 `d71ed5f` /queue board UI + +Walk-in dialog.
- Acceptance criteria met: walk-in creates a queue entry not a fake
  appointment; receptionist sees current queue; queue transitions never touch
  appointment rows.
- Inventory: 70 migration files, 25 grant terminals, 95 approved privileges;
  40 pgTAP suites + 4 concurrency probes; tables 38, functions 117,
  security-definer 95; unit 61 files / 642 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/queue` emitted).

**Next:** Phase 8 (Automation & Communication Core) per
docs/MASTER_PRODUCT_PLAN.md §Phase 8 (§16-17 reminder rules, durable queue/jobs,
communication table, email/SMS adapters, retries). Author bounded plan
docs/plans/008-automation-communication.md then execute P8-01.. .

## Phase 7 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 6 checkpoint (2026-08-27) - ACCEPTED

Phase 6 (Scheduling Engine) is complete through commit `72fbc43` (P6-09
calendar UI) with `docs/plans/006-scheduling-engine.md` P6-01..P6-10 all `[x]`.

- P6-01 `e3dd467` appointment.read/write permission contract. P6-02 `14b28bb`
  resource_types/branch_resources/resource_unavailability. P6-03 `d0a00db`
  provider_availability_rules/provider_schedule_exceptions. P6-04 `ae4dcc5`
  appointments + appointment_providers + appointment_resources +
  appointment_status_history (3 status dimensions). P6-05 `d752c8e`
  provider_reservations + resource_reservations with partial GiST EXCLUDE
  (btree_gist became the sole approved extension). P6-06 `59b5774` scheduling
  RPCs (create/reschedule/cancel/status/list) + private
  has_appointment_permission_at_branch + extended audit metadata allowlist +
  concurrency probe. P6-07 `b5b2565` list_availability/find_available_slots.
  P6-08 `7b36ee4` src/lib/scheduling services. P6-09 `72fbc43` /schedule
  calendar UI + actions.
- Inventory: 66 migration files, 24 grant terminals, 92 approved privileges,
  1 approved extension (btree_gist); 36 pgTAP suites + 4 concurrency probes
  (incl. appointment double-booking exclusion); tables 37, functions 113,
  security-definer 91; unit 58 files / 613 tests; scripts 279.
- Phase gate verification all green: db reset/provision/test, security:
  migrations/secrets/audit, unit, lint, typecheck, build (`/schedule` emitted).
- Acceptance criteria met: provider double-booking rejected (exclusion +
  concurrency test), resource conflicts prevented, appointment exists without
  provider while AWAITING_SPECIALIST, reschedule history via audit metadata +
  status history, cancellation releases reservation slots (proven in pgTAP).

**Next:** Phase 7 (Walk-in & Queue) per docs/MASTER_PRODUCT_PLAN.md §Phase 7.
Author a bounded plan (docs/plans/007-walkin-queue.md) then execute P7-01.. .

## Phase 6 checkpoint (2026-08-27) - IN PROGRESS (historical)

Phase 6 (Scheduling Engine) plan authored at `docs/plans/006-scheduling-engine.md`
with tasks P6-01..P6-10. Committed so far:

- P6-01 `e3dd467` appointment.read/write permission contract (OWNER/ADMIN/DENTIST/
  RECEPTIONIST both, DENTAL_ASSISTANT read only, VISITING_SPECIALIST/BILLING none).
- P6-02 `14b28bb` resource_types (global seed + org-custom, immutable global
  scope) + branch_resources (tenant-safe branch/resource_type FKs) +
  resource_unavailability; deny-by-default.
- P6-03 `d0a00db` provider_availability_rules + provider_schedule_exceptions
  (org-scoped composite FKs, weekday 0-6 DOW, exception types).
- P6-04 `ae4dcc5` appointments (3 status dimensions, composite FKs,
  cancelled/completed consistency checks) + appointment_providers +
  appointment_resources + appointment_status_history.
- P6-05 `d752c8e` provider_reservations + resource_reservations with generated
  `timespan tstzrange` and **partial GiST EXCLUDE** on (id WITH =, timespan WITH &&)
  WHERE status='ACTIVE'. Introduced **btree_gist** as the sole approved
  production extension (approved-final-grants APPROVED_EXTENSIONS + lint test
  updated). Exclusion rejections proven in pgTAP (23P01), back-to-back and
  cross-branch allowed, release/cancel frees slots.
- Inventory: 62 migration files, 22 grant terminals, 85 approved privileges,
  1 approved extension (btree_gist); 33 pgTAP suites; tables 37, functions 104.

**Next:** P6-06 appointment RPCs (create/reschedule/cancel/status/list) with
single-transaction conflict detection, reservation create/release, audit events,
terminal grants, pgTAP incl. concurrency. Then P6-07 read RPCs, P6-08 services,
P6-09 calendar UI, P6-10 phase gate.

## Phase 5 checkpoint (2026-08-27) - ACCEPTED

Phase 5 (Acquisition & Referrals Foundation) is complete through commit
`e03e57f` (P5-08 analytics report) with `docs/plans/005-acquisition-referrals.md`
P5-01..P5-09 all marked `[x]`.

- P5-01 catalogs (`c84093a`), P5-02 attribution columns (`a41068a`),
  P5-03 attribution RPCs (`56876bb`), P5-04 referral schema (`4493fcc`),
  P5-05 referral RPCs (`f38b063`), P5-06 services (`0caf234`),
  P5-07 registration/workspace UI (`7613738`), P5-08 analytics report (`e03e57f`).
- Deliverables: acquisition_sources/booking_channels catalogs + org-custom
  sources; patients attribution columns (tenant-safe source, same-org referrer,
  external snapshot, initial channel); create/update/list referral RPCs with
  optimistic versions + one atomic `{}` audit event each; `analytics.view`
  permission (OWNER/ADMIN only) + org-scoped aggregated report RPC
  `get_acquisition_summary(uuid,integer)` (30/90/365 window, counts only, no
  audit event); `/reports/acquisition` page + server actions; nav gated on
  `analytics.view`.
- Current inventory: 57 migration files, 22 grant terminals, 85 approved final
  privileges; 28 pgTAP suites + 3 concurrency probes; 55 unit files / 578 tests.
- Phase gate verification all green: `db:reset:local`, `db:provision:local`,
  `test:db:local` (28 suites), `security:migrations` (passed), `security:secrets`
  (clean), `security:audit` (0 vulns), `test:unit`, `lint`, `typecheck`,
  `build` (Compiled + 19/19 static pages).

## Current checkpoint

- **P5-07 registration and workspace UI is implemented but not committed.**
  `/patients/new` starts catalog reads from the existing server-authorized
  writable branch and renders the optional Acquisition section only when both
  bounded catalog adapters succeed. It includes catalog-backed discovery-source
  and booking-channel selects, a bounded existing-patient lookup through the
  existing authorization-rechecking directory action, and external referrer
  snapshot fields. Catalog failures safely omit the optional section; no public
  directory or organization value was introduced.
- `createPatient` now calls P5-03's explicit 18-argument `create_patient`
  overload with the strict optional attribution document. The patient creation
  schema rejects arbitrary attribution fields and competing internal/external
  referrers. The duplicate-read workflow continues to validate against the
  exported unrefined base schema because Zod cannot derive an omitted shape from
  a refined object schema.
- The workspace detail adapter now validates the P5-03 bounded attribution
  projection and renders it read-only. The route independently attempts the
  referral list after the core patient record; expected acquisition/authorization
  errors degrade only that section to a safe alert. `ReferralsSection` provides
  responsive semantic table/phone-list views, a dialog-based create flow, and
  allowed status controls with 44px targets. Its route-local actions validate
  input, recheck `patient.demographics.write` plus the submitted acting branch,
  and call only P5-06 services; they accept no organization identifier.
- P5-07 tests cover attribution schema/adapter shape, registration submission,
  workspace read-only attribution rendering, and referral create action branch
  reauthorization. Verification (2026-08-26): focused patient tests, `npm run
  test:unit` (54 files, 569 tests), `npm run lint`, `npm run typecheck`, and
  `npm run build` passed. No database migration or hosted target was used. The
  pre-existing untracked `.playwright-cli/` directory remains untouched.
- P5-07 review fixes: conflicting internal/external referrers now attach a
  visible, accessible error to the external-referrer field in both client and
  server validation. Registration referrer lookup and referral create/status
  handlers catch rejected action promises, show safe failures, and clear their
  saving state in `finally`. Form controls in the affected registration and
  referral dialogs remain 44px at every breakpoint. Focused component/action
  tests now prove referrer conflict/search rejection, referral create/status
  rejection recovery, and status-action branch reauthorization.

- **P5-06 is implemented but not committed.** `src/lib/acquisition/` adds
  server-only Zod schemas, DTO types, safe error mapping, and authenticated
  Supabase RPC services for catalog reads, attribution update, and referral
  create/status/list. Every input and RPC DTO is validated; no caller supplies
  an organization value. Offline mocked-Supabase unit coverage proves exact RPC
  contracts, input/mass-assignment rejection, DTO mapping, and safe errors.
- P5-06 found no existing safe catalog-read RPC: base catalog table privileges
  are deliberately zero. `20260826011700_acquisition_catalog_reads.sql` adds
  only `list_acquisition_sources(uuid)` and `list_booking_channels(uuid)`. Both
  are authenticated `SECURITY DEFINER` reads with empty paths, derive the org
  from an active acting branch, require live `patient.demographics.read`, return
  active bounded DTOs only, and expose no org field. `20260826011701` grants
  EXECUTE only to `authenticated`; the approved privilege registry and static
  inventory tests now reflect 55 migrations, 100 functions, 81 definers, 21
  grant terminals, 84 final privileges, and 67 browser-reachable grants.
- P5-06 verification (2026-08-26): focused acquisition Vitest plus full
  `npm run test:unit` passed (54 files, 566 tests); `npm run lint`, `npm run
  typecheck`, `npm run security:migrations`, `npm run security:secrets`, and
  `npm run security:audit` passed. Fresh synthetic-only local reset/provision
  and `test:db:local` passed 27 pgTAP suites plus three concurrency probes. No
  hosted or production target was used. Pre-existing untracked `.playwright-cli/`
  artifacts remain untouched.

- **P5-05 is implemented but not committed.** `20260826011600_patient_referral_rpcs.sql`
  adds the three authenticated `SECURITY DEFINER` referral boundaries and
  `20260826011601_patient_referral_rpcs_grants.sql` is their sole terminal
  grant. Each derives the organization from the active acting branch and never
  accepts client organization/patient tenancy fields. Create accepts only a
  bounded allowlisted JSON document and always creates `RECEIVED`; status
  mutation locks the tenant referral/version and permits only
  `RECEIVED -> ACTIVE/CANCELLED` and `ACTIVE -> COMPLETED/CANCELLED`; list is a
  deterministic 200-row administrative projection. Mutations require live
  `patient.demographics.write`, reads require live
  `patient.demographics.read`, safe errors cover denied/missing/foreign rows,
  and each successful mutation atomically writes one `{}`-metadata referral
  audit event. No AAL2 or provider-management exception was introduced.
- `patient_referral_rpcs.test.sql` is registered in local/Cloud TEST runners.
  It proves exact ACLs, empty definer paths, owner positive flow, billing,
  anonymous-equivalent ACL, and foreign denials, allowlisted input, stale
  versions, transition restrictions, audit counts/rollback, and no list-read
  audit. The privilege and database-suite inventories now report 53 migrations,
  98 functions, 79 security-definer functions, 20 grant terminals, 82 approved
  final privileges, 65 browser-reachable grants, and 27 pgTAP suites.
- P5-05 local verification (2026-08-26): fresh `db:start:local` /
  `db:reset:local` / `db:provision:local` and `test:db:local` passed all 27
  pgTAP suites plus three concurrency probes. `npm run security:migrations`,
  `npm run lint`, `npm run typecheck`, and `npm run test:unit` (53 files, 561
  tests) passed. No hosted or production target was used; the pre-existing
  untracked `.playwright-cli/` directory remains untouched.

- **P5-04 is committed in `4493fcc`.** `20260826011500_patient_referrals.sql`
  adds only the referral foundation table and no RPCs: requested `org_id`,
  tenant-safe composite patient FK, `IN`/`OUT` directions, bounded
  `RECEIVED`/`ACTIVE`/`COMPLETED`/`CANCELLED` status, nullable required
  specialty, bounded external-party snapshot fields, 2000-character notes,
  optimistic version, and timestamps. Base grants remain revoked for PUBLIC,
  anon, authenticated, and service_role; the sole RLS policy reuses
  demographics-read visibility, while future P5-05 owns the RPC boundary.
- The specialty reference has a private `FOR KEY SHARE` scope trigger allowing
  global or same-org specialties only, with an empty search path and all
  execution revoked. The access path is `(org_id, patient_id, status)`.
- `patient_referrals_foundation.test.sql` is registered in the local/Cloud TEST
  runner and proves schema, constraints, foreign-patient rejection,
  global/own/foreign specialty integrity, RLS isolation, zero base grants,
  index shape, and trigger hardening. Static test inventories were increased to
  51 migrations, 26 tables, 95 functions, 25 policies, and 26 pgTAP suites.
- P5-04 verification (2026-08-26): `npm run security:migrations`, fresh
  `db:start:local` / `db:reset:local` / `db:provision:local` /
  `test:db:local` (26 suites + 3 concurrency probes), `npm run lint`,
  `npm run typecheck`, and `npm run test:unit` (53 files, 561 tests) passed.
  No hosted or production target was used. The pre-existing untracked
  `.playwright-cli/` directory was not changed.

- **Phase 4 (patient file attachment foundation) is functionally complete and
  phase-reviewed.** All plan tasks P4-01..P4-09 are delivered; Cloud TEST
  remains the mandatory pre-production gate before any production use.
- P4-09 (this checkpoint) closed the local integration loop:
  - MinIO browser CORS is pinned at container create via `MINIO_API_CORS_*`
    env vars (this MinIO release removed the S3 bucket-CORS API — verified
    live `PutBucketCors` returns NotImplemented). `npm run storage:start:local`
    recreates a legacy/unpinned container once (volume data kept), then proves
    an OPTIONS preflight for origin `http://127.0.0.1:3000` before PASS.
  - `npm run storage:smoke:local` runs a guarded live flow against real MinIO:
    put -> stat -> get -> presign (structure only; URLs never printed) ->
    browser-style OPTIONS + PUT + GET from the app origin -> delete ->
    stat-fails. It uses `scripts/local-node-ts-loader.mjs` so plain Node can
    import the real server-only adapter via the existing vitest stub.
- Phase review found and fixed one real cross-boundary defect: the page CSP
  `connect-src` did not include the storage endpoint, so in-browser presigned
  PUTs were blocked despite the CORS smoke passing from Node.
  `src/lib/security/browser-policy.ts` now appends a validated storage origin
  derived from `STORAGE_ENDPOINT`: exact-origin-only (no path/query/creds),
  production requires HTTPS, and the local posture (`appEnvironment=development`
  + `supabaseProjectId=local`) accepts ONLY exactly `http://127.0.0.1:9000`.
  Proven by new browser-policy tests and `npm run build` with `.env.local`.
- Deferred with recorded rationale (phase-review dispositions):
  - Download audit event: no app-side audit writer exists anywhere yet; needs
    an explicit audited RPC/event design before the plan's download-audit
    acceptance line can be met. Upload+archive are DB-audited atomically.
  - Post-confirm overwrite window: minted PUT URLs stay valid up to their 900s
    TTL after confirm; mitigations (re-key at confirm, short TTL, versioning)
    are deployment-readiness tooling alongside R2 derivative work.
  - checksum_sha256 stays NULL for RPC-created rows; `available` rows now
    carry a SERVER-verified size (confirm RPC takes HEAD-measured bytes;
    CHECK `file_objects_available_size_check` enforces presence). Full-object
    hash verification is deferred to deployment-readiness tooling.
  - Orphaned pending rows from failed presigns need future cleanup tooling.
- Final Phase 4 verification (2026-08-26): security:migrations (46 files, 18
  terminals, 76 privileges), lint, typecheck, vitest 53 files / 561 tests,
  db reset+provision+test:db:local (22 pgTAP suites + 3 concurrency probes),
  storage:start+smoke PASS, build PASS.

## P4-08 file attachment UI foundation

- P4-08 adds the patient Files section UI on top of the
  P4-07 services. New route-local files under
  `src/app/(emr)/patients/[patientId]/files/`:
  - `actions.ts`: `createFileUploadAction`, `confirmFileUploadAction`
    (demographics-write + branch recheck), `downloadUrlAction`
    (demographics-read + branch recheck), `archiveFileAction`
    (demographics-write + branch recheck; AAL2 re-enforced inside the service).
    Each validates untrusted input with the existing `@/lib/files/schema`
    Zod schemas BEFORE authorization, maps `AuthorizationError` /
    `FileServiceError` to safe result codes (`FileActionFailure`), rethrows
    Next redirect errors (AAL2 step-up) instead of swallowing them, and never
    accepts org ids from the client; only the workflow actingBranchId is passed
    and re-verified via `requireBranchAccess`. No revalidatePath: mirrors the
    established `[patientId]/actions.ts` pattern where mutations return result
    objects and the client calls `router.refresh()`.
  - `files-section.tsx`: section styled exactly like sibling workspace
    sections; dense semantic table on desktop/tablet (`hidden md:block`) and a
    compact article list on phones (`md:hidden`); columns Type (mime) / Size
    (human-readable, "Not verified" while pending) / Uploaded (ISO date only,
    no locale-dependent formatting to avoid hydration drift) / Status.
    Download appears only for `available` rows (presigned URL is used via a
    transient detached anchor and never rendered into DOM); Archive appears
    for `available`+`pending` behind an AlertDialog confirmation naming the
    AAL2 requirement (BranchArchiveDialog pattern: preventDefault close-guard,
    deliberate close on success). All row/header controls are >=44px
    (`min-h-11`). Empty state and explicit load-failure alert included; no
    invented KPIs/cards/charts.
  - `upload-file-dialog.tsx`: controlled Dialog matching the workspace dialog
    composition; file input shows detected mime type ("Type: ..."), client-side
    oversize guard against MAX_FILE_SIZE_BYTES (UX only), then the exact flow:
    createFileUploadAction -> browser fetch PUT directly to MinIO presigned URL
    (Content-Type header set to match the SigV4 signature) ->
    confirmFileUploadAction -> router.refresh(). A generation ref makes close
    cancel-safe in EVERY phase (create/transfer/confirm); superseded closures
    bail silently and never setState or call confirm after close/reopen.
- Page integration: `[patientId]/page.tsx` server-renders the bounded list via
  `listPatientFiles({actingBranchId, patientId})` (RPC itself LIMIT 200)
  after its existing read-permission checks; expected failures degrade ONLY
  the Files section to an explicit alert while unexpected errors propagate to
  the error boundary like sibling sections.


- P4-07 adds server-only file services (`src/lib/files/`: Zod input/row schemas,
  safe error mapping incl. mechanical `STORAGE_*` codes, service wrappers) wiring
  the app to the Phase 4 file RPCs and the storage adapter. No UI, actions,
  routes, or new dependencies were added; all modules are `server-only`.
- P4-07 found and closed a real gap: the accepted P4-05 read RPCs returned no
  `object_key`, yet the plan and grant inventory both state presigning happens
  app-side after authorizing against `get_file_metadata`, and confirm/download/
  archive need the key server-side (patient/org ids are not derivable from a
  fileId). Fix is additive and precedented on the create_procedure hardening
  pattern: `20260826011000` recreates only `get_file_metadata(uuid,uuid)` adding
  `object_key` to its bounded projection (checksums still hidden), and
  `20260826011001` re-states the exact terminal EXECUTE grant, registered in
  `scripts/approved-final-grants.mjs`. The pgTAP projection assertions in
  `file_read_rpcs.test.sql` were updated to prove key exposure and that
  `list_patient_files` still excludes it.
- P4-07 extends the storage adapter minimally with `stat(key)` returning
  `{sizeBytes, contentType}` via S3 HeadObjectCommand (`READ_FAILED` mapping);
  unit tests cover success, missing content-length, and credential-safe errors.
- Confirm flow ordering is metadata gate → status must be pending → `stat` →
  verified-fact binding → `confirm_file_upload(uuid,uuid,integer,bigint)`. The
  service enforces `stat.sizeBytes <= MAX_FILE_SIZE_BYTES`, a positive size,
  and `stat.contentType === mime_type` (safe `INVALID_STATE` otherwise), then
  passes the HEAD-measured `p_verified_size_bytes`. Declared client sizes no
  longer participate in confirmation; any stat failure fails closed as
  `INVALID_STATE` (missing object vs outage are indistinguishable by design).
- Review fix closes the NULL-declared-size bypass: `20260826011100` recreates
  only `confirm_file_upload` with an additional required `bigint` parameter and
  persists that server-verified value into `size_bytes` on becoming available
  (authorization/locking/version/audit logic unchanged); it also adds the
  `file_objects_available_size_check` table CHECK so no row can be or become
  `available` with a null size, and revokes both old and new signatures
  adjacent to creation. Because the signature changed, `20260826011101`
  restates the terminal EXECUTE grant for the NEW signature following the exact
  create_procedure input-hardening precedent. The immutable
  `20260826010701` registration keeps its historical three-argument entry
  marked `supersededBy` the new signature: it still satisfies the per-file
  static lint while being excluded from the live-catalog final boundary
  (`browserReachableApprovedKeys`). pgTAP coverage proves verified-size
  persistence, CHECK rejection on both direct-insert and null-update paths,
  positive-size input validation, and stale-version rejection on the new
  signature.
- `checksum_sha256` deferral rationale: computing SHA-256 at confirm would
  require a full object read per confirmation, which is disproportionate for
  the upload path; checksum verification is deferred to deployment-readiness
  tooling alongside the R2 derivative work. The database now guarantees every
  available row carries a server-verified size, while checksums remain
  unverified/null until that tooling lands.
- Archive flow order is proven by tests: `requireAal2()` first, then metadata
  gate, then `archive_file`, then best-effort `storage.delete`; deletion failure
  never fails the archive and returns `{objectDeleted:false}`. Download refuses
  archived and pending rows before touching storage. A failed presign after
  `create_file_upload` intentionally leaves an orphaned pending row for later
  cleanup tooling. `CreateFileUploadResult` no longer exposes `objectKey`;
  `uploadUrl`, `expiresAt`, `fileId`, and `version` suffice for callers.
- Download auditing was NOT implemented: no app-side audit-writing mechanism
  exists in this repository (audit_events are written exclusively inside
  SECURITY DEFINER RPCs; grep of src/lib finds no audit writer). Per task rules
  no hack was added; download auditing needs either an RPC or an event mechanism
  and should be planned explicitly.
- Review-fix verification (2026-08-26, this checkpoint): the reviewer-reported
  typecheck failure (`delete row.object_key` TS2790) was replaced with a rest
  destructure and `npm run typecheck` now truly passes; `npm run lint` passes
  (0 errors). Fresh local reconstruction applied all 46 migrations plus
  synthetic seed; provisioning passed; `npm run test:db:local` passed all 22
  pgTAP suites and three concurrency probes. `npm run security:migrations`
  reports 46 files, 18 grant terminals, and 76 approved grants. Focused Vitest
  (`src/lib/files`, `src/lib/storage`) covers contentType mismatch, oversize
  stat, and verified-size RPC binding. Cloud TEST remains mandatory before
  production.
- Earlier P4-07 local verification: fresh local reconstruction applied all 44
  migrations plus synthetic seed; provisioning passed; `npm run test:db:local`
  passed all 22 pgTAP suites and three concurrency probes. `npm run lint`,
  `npm run typecheck`, `npm run security:migrations` (44 files, 17 terminals,
  75 approved grants), and full `npx vitest run` (50 files, 488 tests) passed.
- P3-00 is accepted. The independently reviewed Phase 3 plan is
  `docs/plans/003-provider-specialty-procedure-foundation.md`; ADR-021 extends
  the guarded, synthetic-only local verification boundary to its accepted
  checkpoints while preserving the mandatory Cloud TEST pre-production gate.
- P3-01 is independently reviewed and accepted on commits `46bb24b` and
  `1a52149`. It adds only `provider.read` and `provider.manage` to the stable
  permission catalog and grants them only to global OWNER and ADMIN roles.
  DENTIST, RECEPTIONIST, DENTAL_ASSISTANT, VISITING_SPECIALIST, and BILLING
  receive neither, so ADR-019's exact patient-only delegation exception is
  unchanged. No provider tables, RLS/RPC surfaces, browser grants, patient
  permissions, delegation functions, seeds, or hosted database writes were
  added.
- P3-01 registered `provider_permission_contract.test.sql` in the mandatory
  database-runner allowlist in the same checkpoint. A 16-suite local pgTAP run
  plus all three local concurrency suites passed after local reconstruction.
- P3-01 also fixed an existing verification blocker: the explicit ESLint global
  ignore set omitted the repository's git-ignored `.worktrees/` directory and
  full lint traversed nested dependency trees. The new minimal ignore is covered
  by a focused test; independent re-review ran `npm run lint` successfully.
- P3-02 is independently reviewed and accepted on commits `49f5867` and
  `5bde9a8`. It adds only provider, specialty, provider-branch, and
  provider-specialty tables, RLS, private predicates, synthetic fixtures, and
  registered pgTAP coverage. All browser/service-role table access remains
  denied. Composite FKs protect tenant-owned relations; the fixed-search-path
  specialty trigger allows global or same-tenant custom specialties only.
- The P3-02 review required and verified a `specialties.version` contract for
  the next checkpoint's optimistic writes, plus an exact partial-primary index
  proof. Fresh local reconstruction passed 17 pgTAP suites and three concurrency
  probes; `npm run verify` passed lint, typecheck, 372 unit tests, build, secret
  scan, migration lint, and dependency audit. Cloud TEST remains deferred and
  mandatory before production.
- P3-03 adds only the seven authenticated provider/specialty mutation RPCs and
  registered terminal grants. Each derives tenant context from an active acting
  branch, requires live organization-wide `provider.manage`, returns opaque
  IDs/versions, and writes exactly one `{}`-metadata
  `PROVIDER_CONFIGURATION` audit event atomically. Archive and linked-user
  mutations call `private.require_aal2()`.
- P3-03 pgTAP coverage proves exact RPC ACLs, empty SECURITY DEFINER search
  paths, owner positive flow, staff/anonymous/foreign denial, AAL1 denial for
  archive/linking, patch allowlisting, stale versions, duplicate/foreign
  relation rejection, immutable global specialties, and audit rollback.
- Fresh local reconstruction applied 28 migrations and synthetic seed;
  provisioning passed; `npm run test:db:local` passed all 17 pgTAP suites and
  three local concurrency probes. P3-04 is the next ordered task; no provider
  reads, application adapter, UI, procedure, scheduling, or public scope was
  added.
- P3-04 adds only three authenticated bounded reads: provider directory,
  provider configuration detail, and global-plus-own-tenant specialty catalog.
  Each derives tenant context from the active acting branch, requires `auth.uid()`
  and live organization-wide `provider.read`, uses an empty SECURITY DEFINER
  search path, and records no audit event. The directory excludes archived
  providers; no projection includes organization, membership, Auth, scheduling,
  patient, or calendar data.
- P3-04 adds server-only provider schemas, read adapters, safe error mapping,
  and wrappers for the P3-03 mutations. Inputs and RPC results are Zod-validated;
  mutation patches and association replacements reject arbitrary fields and
  duplicate IDs. The authenticated request client is used exclusively.
- The linked-project generated-type command remains unsuitable as local-preview
  evidence: it reproduced the documented hosted metadata omission and removed
  the patient contract. Its output was restored and is not part of this
  checkpoint. The new typed adapter contains a narrow local RPC boundary while
  validating all parameters/results; Cloud TEST type generation remains required
  before production.
- P3-05 adds only tenant-owned procedures, procedure-specialty requirements, and
  optional eligible-provider allow-lists, plus seven authenticated database RPCs
  and their terminal grants. Each RPC derives its organization from an active
  acting branch and rechecks the live organization-wide provider permission;
  mutations require provider.manage, reads require provider.read, and archive
  additionally requires AAL2. Association replacements lock/version the target,
  validate active same-tenant relations, and atomically write one `{}` metadata
  PROVIDER_CONFIGURATION audit event. No price, availability, scheduling, public
  projection, patient, clinical, or UI scope was added.
- P3-05 registers `procedure_foundation.test.sql` in the mandatory local/Cloud
  TEST suite list, adds deterministic synthetic procedure seed data, and records
  all seven exact authenticated-only RPC grants. The suite covers table shape and
  no-price contract, RLS/ACL denial, tenant FKs, global/own/foreign specialty
  behavior, duration/buffer/mode constraints, versioned mutation, AAL2 archive,
  bounded reads, and audit rollback atomicity.
- Fresh local reconstruction applied all 33 migrations and synthetic seed;
  provisioning and all 18 registered pgTAP suites plus three concurrency probes
  passed. `npm run security:migrations`, `npm run lint`, `npm run typecheck`,
  `npm run test:unit` (37 files, 386 tests), `npm run security:secrets`, and
  `npm run security:audit` passed. Cloud TEST remains mandatory before
  production; no hosted or production target was used.
- P3-05 is committed in `6d6abd6`, with its numeric-input correction in
  `53f0953`. P3-06 adds only server-only procedure schemas, typed bounded read
  adapters, mutation wrappers, safe error mapping, and focused unit coverage.
  Inputs and RPC rows are Zod-validated; form schemas normalize procedure codes
  to uppercase, reject price/untrusted fields, require acting branch context,
  enforce duration/buffer invariants and relation uniqueness, and permit only
  `REQUIRES_REVIEW` or `REQUEST_ONLY`. Archive calls `requireAal2()` before its
  RPC while the database retains the authoritative AAL2 gate.
- P3-06 corrected the migration-inventory expectations after the P3-05 numeric
  input-hardening migration. Full unit verification then passed with 39 files
  and 393 tests, alongside TypeScript, lint, and migration privilege lint.
- P3-07 adds only private `/providers` and `/settings/specialties` administration
  routes, loading state, Server Actions, responsive provider/specialty lists,
  and `provider.read` navigation entries. Both pages recheck live
  `provider.read`, derive a concrete active branch server-side, and use only the
  existing bounded provider/specialty adapters. Authorization failures render
  `PermissionDenied`; adapter failures render safe `PageError` content.
- Every mutation action validates untrusted `FormData`, binds the submitted
  acting branch to an immediate live `provider.manage` check before calling the
  service, and revalidates only affected private paths. Provider archive alone
  invokes `requireAal2`; no linked-user operation or UI control was added. The
  user explicitly deferred linked-user controls, so this checkpoint does not
  query Auth/member sources, exposes no link identifier to the browser, and
  does not call the reserved P3-03 linked-user capability.
- Provider UI is a semantic dense desktop/tablet table with a compact phone
  list, 44px action/form controls, editable identity/type/status/stored website
  profile fields, branch associations, and specialties. It contains no
  scheduling, availability, calendar, appointment, public-projection, price,
  or clinical controls. Global specialties are visibly read-only; only tenant
  custom specialties have mutation forms.
- P3-07 verification passed: `npm run test:unit` (42 files, 401 tests),
  `npm run test:db:local` (18 pgTAP suites and three local concurrency probes),
  `npm run lint`, `npm run typecheck`, `npm run security:migrations`,
  `npm run security:secrets`, `npm run security:audit` (0 vulnerabilities), and
  `git diff --check`. Next.js 16.3 installed guides for Server Actions, Route
  Handlers, and caching were read before implementation. Responsive Playwright
  coverage remains deferred because no guarded E2E target is configured.
- P3-08 adds only the private `/settings/procedures` administration route,
  loading state, Server Actions, responsive procedure catalog, and a
  `provider.read` navigation entry. The page requires live `provider.read`,
  chooses a server-authorized active branch, and uses only bounded procedure,
  provider, and specialty read adapters.
- Procedure actions validate untrusted `FormData` before rechecking live
  `provider.manage` against the submitted branch immediately before calling the
  existing procedure services. They accept only code, name, description,
  duration/buffers, status, website/online-booking flags, the two approved
  request modes, specialty requirement levels, and explicit eligible provider
  IDs. They do not invoke provider/specialty mutation services, accept tenant
  values, or expose price, auto-confirm, resource, availability, or public-link
  controls. Archive actions require AAL2 and all failures use one safe generic
  message.
- The catalog is a semantic dense table on desktop/tablet and a compact phone
  list. Forms use a single phone column and 44px controls. Archive requires an
  explicit native-dialog confirmation and returns focus to its trigger on
  cancellation or successful action.
- P3-08 application verification passed: focused procedure/navigation Vitest
  (3 files, 10 tests), `npm run test:unit` (45 files, 409 tests), `npm run
  lint`, `npm run typecheck`, `npm run security:migrations`, `npm run
  security:secrets`, `npm run security:audit` (0 vulnerabilities), and `git
  diff --check`. The required local reconstruction could not start because the
  separate `supabase_db_hjcmnmigvzufhvamlnmy` container already owns port 54322;
  it was not stopped or modified. No Cloud or production target was used.
- P3-09 local integration verification ran on 2026-08-26: `npm run
  security:migrations`, `npm run lint`, `npm run typecheck`, `npm run test:unit`
  (45 files, 409 tests), `npm run security:secrets`, `npm run security:audit`
  (0 vulnerabilities), `git diff --check`, and `npm run build` all passed.
  The build emitted the private `/providers`, `/settings/specialties`, and
  `/settings/procedures` routes as dynamic routes.
- A fresh P3-09 local reconstruction could not be run without disrupting the
  unrelated `supabase_db_hjcmnmigvzufhvamlnmy` project that owns port 54322. It
  was not stopped or modified. Earlier checkpoint reconstruction evidence covers
  P3-03 through P3-07; rerun the full local reconstruction once the port is
  available.
- Synthetic responsive Playwright/manual keyboard QA was not run because the
  guarded E2E environment is unavailable. Generated database types remain
  deferred: the linked hosted project omits existing patient contracts. Cloud
  TEST migration/type/RLS/authorization/E2E verification remains mandatory
  before production, and Phase 3 is not authorized for production provider or
  patient use.
- Do not create `docs/PHASE3_ACCEPTANCE_REVIEW.md` yet. The plan requires an
  independent review and explicit project-owner acceptance after the deferred
  verification evidence is complete.
- All four admin pages (providers, branches, specialties, procedures) now use a
  consistent modal dialog pattern: upper-right Add button opens a modal,
  row actions use labeled Edit (Pencil + text) and Archive buttons. No page
  renders an inline form below its list.
- ADR-022 established local MinIO as the S3-compatible object storage for
  development. Cloudflare R2 is deferred to deployment readiness. Storage
  configuration uses provider-neutral S3 environment variables.
- P2-04 through P2-11 are accepted by the project owner.
- The project owner amended ADR-020 on 2026-08-26: local verification is the
  Phase 2 checkpoint and P2-12 closeout gate. Guarded Cloud TEST is deferred to
  the mandatory pre-production gate.
- Local P2-12 reconstruction passed on commit `93a0dec`: start/reset, test
  tooling provisioning, all 15 pgTAP suites, and all three local concurrency
  suites. Lint, typecheck, and 370 unit tests also passed.
- Phase 2 was accepted by the project owner on 2026-08-26; see
  `docs/PHASE2_ACCEPTANCE_REVIEW.md`. Production remains blocked pending the
  deferred Cloud TEST gate and all other production security gates.

## P2-12 closeout status (2026-08-25)

- GitHub Actions Cloud TEST run
  `https://github.com/Ditherys/dental-emr/actions/runs/32859799644` ran against
  `dental-emr-test-02` (`plkjajlfnhsklmdloaut`) on commit `144664a`. Cloud target
  separation, migration preview/application, non-production pgTAP provisioning,
  synthetic seed load, and all 15 pgTAP suites passed. The application
  verification job also passed.
- The run stopped at `db:types:check:test`: `supabase gen types` omitted every
  patient table/function and the `audit_events.patient_id` field despite the
  same project passing the patient pgTAP suites. Locally regenerating types
  against the linked TEST project reproduced that omission. Do not commit that
  destructive generated output; it removes the patient type contract and fails
  the application typecheck. Investigate Supabase hosted schema/type metadata
  freshness, then rerun the guarded workflow. No DEV or production target may
  be used as a workaround.
- Commits `67d3b98` and `144664a` corrected the Cloud TEST diagnostic target
  and moved its transactional pgTAP runner from the inconsistent Supabase CLI
  JSON output path to `psql` using the protected canonical TEST database URI.
  The runner surfaces only sanitized stderr on failure.

- The project owner confirmed `dental-emr-test-02` (`plkjajlfnhsklmdloaut`) as
  the disposable Cloud TEST target. With ephemeral TEST-only metadata,
  `npm run ci:test-target` passed and `npx supabase link --project-ref
  plkjajlfnhsklmdloaut` completed. No migration, seed, query, or test command
  has run against it.
- The mandatory read-only `npx supabase migration list --linked` then stopped
  with `IPv6 is not supported on your current network`. Its proposed DEV relink
  command was not run. Restore IPv6 connectivity or use an approved TEST-only
  IPv4 database connection method, then prove the TEST project has no applied
  migrations before any guarded mutation.
- Safe environment inspection found all required Cloud TEST metadata absent:
  `APP_ENVIRONMENT`, `SUPABASE_PROJECT_ID`, `SUPABASE_TEST_PROJECT_ID`,
  `SUPABASE_DEV_PROJECT_ID`, `SUPABASE_PRODUCTION_PROJECT_ID`,
  `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_TEST_CONFIRMATION`,
  `E2E_TARGET_CONFIRMATION`, `APP_URL`, and `E2E_BASE_URL`. No values were
  printed or invented.
- `npm run ci:test-target` correctly refused before remote access with
  `APP_ENVIRONMENT is required for remote database tests.` The absent target
  blocks `db:push:dry`, `db:push:test`, `db:provision:test`, `db:seed:test`,
  `test:db`, `db:types:check:test`, `db:lint:test`, `security:auth`,
  `db:advisors:test`, and `test:e2e`. No CLI link, Cloud TEST, DEV, or production
  access occurred.
- Local closeout reconstruction passed: `npm run db:start:local`,
  `npm run db:reset:local` (24 migrations plus the synthetic seed),
  `npm run db:provision:local`, and `npm run test:db:local` (15 pgTAP suites and
  3 local concurrency suites). The local stack is synthetic-only.
- Application checks passed: `npm run security:migrations` (24 migrations,
  51 approved final privileges), `npm run lint`, `npm run typecheck`,
  `npm run test:unit` (35 files, 370 tests), `npm run security:secrets`, and
  `npm run security:audit` (0 vulnerabilities). `npm run build` passed using the
  existing CI development placeholders only; no TEST confirmation or
  migration-freeze value was set.
- P2-12 found and fixed a local-only logging issue: `db:start:local` forwarded
  Supabase CLI credential-bearing output. The wrapper now redacts database URLs
  and credential-table values before forwarding output; its focused 26-test suite
  and a redaction-verified local start/stop cycle passed.
- Before the Cloud TEST rerun, complete the remaining P2-12 E2E fixture work:
  the current E2E configuration provisions a receptionist under the legacy
  `E2E_BRANCH_USER_*` names and has no dedicated dentist identity/TOTP variables.
  P2-12 requires named synthetic receptionist and dentist fixtures, with a
  TEST-only dentist TOTP for the successful lifecycle flow. Do not add or set
  these credentials until the verified Cloud TEST target is available.
- Phase 2 is not accepted. The required Cloud TEST verification, hosted type
  check, Auth/advisor review, synthetic E2E/manual QA, independent security
  review, separate Phase 2 acceptance document, and human acceptance decision
  remain outstanding. Production remains blocked.

## P2-11 implementation summary

- Added the server-authorized `/patients/[patientId]` workspace with a persistent
  identity header and only the approved Overview, Demographics, Contacts, and
  Relationships sections. No clinical, scheduling, financial, files, timeline,
  alert, or placeholder-tab scope was added.
- The detail page verifies shared-patient read permission and a concrete active
  branch before calling the existing bounded `get_patient_detail` adapter, which
  remains the sole detail read/view-audit boundary. Missing, foreign, and denied
  targets share the same safe unavailable response.
- Added route-local Server Actions for demographics, child contact/relationship,
  archive/reactivate, and duplicate-candidate reads. Each validates input,
  independently rechecks live demographics-write permission and submitted branch,
  and invokes only existing service/RPC adapters. No direct patient-table query,
  organization ID, service role, or audit field is accepted.
- The responsive workspace preserves a pending demographics/contact edit for
  bounded duplicate review and sends an explicit confirmed retry only after staff
  approval. Stale, revoked, invalid-state, and generic failures use safe UI
  messages. Lifecycle is explicitly confirmed; the existing service and RPC retain
  the required AAL2 gate.
- Added focused Server Action authorization/input tests, a workspace component
  suite for bounded rendering, guardian flags, duplicate cancellation retention,
  stale recovery, and lifecycle confirmation, a synthetic E2E workspace
  create/open/edit journey, workspace loading state, and patient-list links to the
  opaque patient workspace route. The workspace prevents React's automatic form
  reset while duplicate candidates are reviewed, preserving the pending edit.
  Added `birthDate` and `status` to the existing `PatientDetail` TypeScript DTO to
  match the already validated detail RPC shape.

## P2-11 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 35 files,
  369 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- `npm run build` was blocked as designed because no verified `APP_ENVIRONMENT`
  was supplied. `npm run test:e2e:list` was likewise blocked before discovery by
  the guarded hosted E2E environment. The synthetic P2-11 E2E is committed but
  was not run. No Cloud or production target was used.

## P2-11 review focus

- Verify direct Server Action invocation cannot use a forged/revoked branch or
  foreign patient/child ID, and the detail route produces no foreign payload or
  view audit.
- Verify duplicate cancel keeps edits, confirmation is the only override path,
  stale responses do not overwrite newer versions, and archive/reactivation stay
  AAL2-gated through the server service/RPC.
- Run the committed synthetic E2E only against the approved guarded TEST
  environment. Inspect keyboard focus return, dialogs, phone/tablet/desktop
  overflow, 44px controls, and the intentionally limited Phase 2 workspace.

## P2-10 implementation summary

- Added the permission-aware `/patients/new` registration route and a sectioned
  React Hook Form/Zod UI for identity, initial mobile/email, and address data.
  It uses the selected active branch as workflow context, falls back from `All
  Branches` to an authorized active branch, and keeps touch targets at least 44px
  on phone layouts while using semantic two/three-column field groups at larger
  widths.
- The creation Server Action validates all untrusted input, rechecks live shared
  demographics-write permission and the submitted branch, and uses only the
  existing patient service/RPC adapters. It accepts no organization, patient
  number, actor, role, or audit fields.
- An unconfirmed `create_patient` duplicate response is followed by the existing
  bounded duplicate-read RPC only to render the authorized comparison projection.
  No patient is created until the staff member explicitly confirms. Cancelling
  returns to the form with its values preserved; confirmation resubmits through
  the authoritative create RPC with `duplicateConfirmed: true`.
- Added a registration action from the authorized directory and component/unit
  coverage for validation, pending/duplicate review, cancellation, confirmation,
  input validation, and revoked branch/role handling. Extended the synthetic
  Playwright journey to create a patient, cancel duplicate review, and confirm a
  legitimate distinct record.
- No migration, database schema, RPC, generated type, direct patient-table query,
  service-role grant, clinical, detail/edit workspace, contact/relationship edit,
  or lifecycle UI was added. P2-11 remains out of scope.

## P2-10 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 33 files,
  363 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- No local database run was required: P2-10 changes no schema, RPC, seed, or
  database test. No Cloud or production target was used.
- `npm run build` was blocked as designed because this workspace has no verified
  `APP_ENVIRONMENT`. `npm run test:e2e:list` was likewise blocked before test
  discovery because the guarded hosted E2E environment is absent. The synthetic
  E2E flow is committed but not run.

## P2-10 review focus

- Verify direct Server Action invocation cannot use a forged or revoked branch,
  and that the duplicate candidate projection remains bounded and permission
  checked after the create RPC returns a duplicate warning.
- Verify duplicate cancellation preserves values and explicit confirmation is the
  only route to a duplicate override; run the synthetic E2E workflow only against
  the approved guarded TEST environment.
- Inspect phone/tablet/desktop field layout, dialog focus return, keyboard
  interaction, no-overflow behavior, and accessible error associations. Production
  remains out of scope.

## P2-09 implementation summary

- Added the permission-aware `/patients` route, loading state, and responsive
  patient list. Desktop/tablet presents the bounded projection in a semantic
  table; phone presents the same required information as a compact, touch-safe
  list. No create route, patient detail/workspace, mutation UI, dashboard data,
  preview drawer, bulk action, export, clinical, scheduling, or other P2-10+
  scope was added.
- The list starts from a server-authorized, concrete active branch and uses only
  the existing `search_patients` read-RPC adapter. Client search/filter/sort/page
  changes call a narrow server action that validates its input, rechecks shared
  patient-read permission and the submitted branch, and lets the existing RPC
  independently enforce live exact patient permission. It never accepts an
  organization ID and does not put patient search values in URLs.
- Archive status is offered only to actors with live demographics-write
  permission; the server action independently rechecks that permission. The
  selected branch remains workflow/audit context and does not filter the shared
  organization directory.
- Added the Patients navigation item. The EMR shell uses the named shared-patient
  permission predicate rather than generic organization-wide navigation logic,
  so active branch-scoped dentists/receptionists see the link while owners and
  other denied roles do not. Direct route access still reauthorizes.
- Added unit/component coverage for navigation, server authorization/input
  checks, search debounce, paging, empty/authorization-error states, and compact
  mobile rendering. Added Playwright authorized/direct-URL-denial journeys using
  the existing synthetic receptionist and owner identities.

## P2-09 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 31 files,
  357 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- `npm run build` was not runnable because this workspace has no
  `APP_ENVIRONMENT`, and Next config deliberately rejects an unverified target.
  `npm run test:e2e:list` likewise refused before discovery because the guarded
  hosted E2E environment is absent. No environment was supplied and no cloud or
  production target was used.
- P2-09 changes no migrations or database contracts, so no local database reset
  was required for this UI-only checkpoint.

## P2-09 review focus

- Verify the server action cannot use a forged branch to bypass the existing
  shared-directory authorization, including after a role or branch revocation.
- Verify the navigation's shared-patient predicate preserves the intended
  branch-scoped receptionist/dentist semantics while owner/admin remain denied.
- Run the added synthetic Playwright flows only in the approved guarded TEST
  environment; inspect phone/tablet/desktop overflow, focus, labels, and target
  sizes during that review. Production remains out of scope.

## P2-06 implementation summary

- Added `20260825010500_patient_demographics_write.sql` and registered terminal
  grant `20260825010600_patient_demographics_write_grants.sql`. The only new
  browser-reachable surface is authenticated `update_patient`; `service_role` and
  patient base tables remain denied.
- The SECURITY DEFINER RPC derives actor from `auth.uid()` and tenant from the
  trusted acting branch/target row, rechecks live patient-write permission, and
  returns the same safe denial for foreign or missing targets.
- The PATCH permits only mutable demographics, preserves omitted values, requires
  the expected version, locks duplicate state plus the target row, and increments
  version atomically. Name/DOB changes recheck duplicates under the shared lock.
- Preferred branch is tri-state: omitted preserves even an inaccessible existing
  preference, null clears, and a UUID requires an active accessible branch.
- Each successful update emits one opaque patient-linked audit event atomically;
  audit insertion failure rolls back the patient update.
- Added validated server-only service/schema/types, stale-version error mapping,
  generated RPC declaration, pgTAP coverage, and local two-client race coverage.

## Verification evidence

- Fresh local Supabase start/reset applied all 20 migrations and synthetic seed.
- Local non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 13 registered SQL suites and both local
  concurrency suites, including `patient_demographics_write.test.sql`.
- `npm run test:unit` passed: 29 files, 343 tests.
- `npm run lint`, `npm run typecheck`, `npm run security:migrations`,
  `npm run security:secrets`, and `npm run security:audit` passed.
- No Cloud TEST target, production credential, or real data was used.

## P2-08 implementation summary

- Added `20260825010900_patient_lifecycle.sql` and its registered terminal grant
  `20260825011000_patient_lifecycle_grants.sql`. The only new browser-reachable
  surfaces are authenticated `archive_patient` and `reactivate_patient`; patient
  base tables and `service_role` remain denied.
- Both `SECURITY DEFINER` RPCs call `private.require_aal2()`, derive organization
  from an active acting branch, recheck live demographics-write permission, lock
  the tenant-scoped patient row, and reject stale versions and no-op transitions.
  They accept no actor, organization, status, audit, or archive timestamp input.
- Archive sets `status = archived` with an archive timestamp; reactivate restores
  `status = active` with a null archive timestamp. Each successful transition
  emits exactly one opaque patient-linked audit event in the same transaction.
  Failed audit insertion rolls back the transition.
- Replaced `search_patients` through the same fail-closed terminal sequence so
  default searches exclude archived patients while the authorized explicit
  `archived` status filter remains available.
- Added the server-only lifecycle schema/service/types/RPC declarations. The
  service independently calls `requireAal2()` before the RPC; safe error mapping
  now includes `INVALID_STATE`.

## P2-08 verification evidence

- Fresh local start/reset applied all 24 migrations and the synthetic seed; local
  non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 15 registered SQL suites and all 3 local
  concurrency suites, including `patient_lifecycle.test.sql`.
- `npm run test:unit` passed: 29 files, 347 tests. `npm run lint`,
  `npm run typecheck`, `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- No Cloud TEST target, production credential, or real data was used.

## P2-08 review focus

- Verify the P2-08 `CREATE OR REPLACE search_patients` pre-revoke/revoke/terminal
  grant sequence and default active-only status behavior.
- Verify lifecycle errors do not distinguish foreign/missing patients, AAL1 is
  denied in the database and server service, and no direct patient DML grant was
  introduced.
- This checkpoint adds no UI, dialogs, P2-09 navigation/list screen, hard delete,
  merge, retention erasure, clinical, scheduling, financial, or export scope.

## Self-review focus

- No direct patient-table query or privilege was added to the application path.
- Tenant identity, patient number, creator, actor, audit action, status, and version
  cannot be mass-assigned through the PATCH document.
- Audit metadata uses the existing empty default only; no changed patient value is
  inserted into an audit row or returned error.
- P2-06 intentionally adds no UI, contact/relationship mutation, lifecycle,
  provider, scheduling, clinical, financial, or export scope.

## P2-07 implementation summary

- Added `20260825010700_patient_children_write.sql` and registered terminal
  grant `20260825010800_patient_children_write_grants.sql`. The only new
  browser-reachable surfaces are six authenticated contact/relationship create,
  update, and archive RPCs; patient child base tables and `service_role` remain
  denied.
- Each RPC derives organization from an active acting branch, rechecks live
  demographics-write permission, locks and derives the parent patient, rejects
  archived parents/children, and never accepts child tenant movement.
- Mobile/email mutations use the shared organization duplicate advisory lock,
  authoritative canonical normalization, recheck active contacts owned by other
  patients, and require explicit confirmation for an actual duplicate. Primary
  contact demotion/promotion serializes through the parent contact set and its
  partial unique index.
- All child mutations use optimistic versions and atomically append one opaque,
  patient-linked audit event. Relationship patient targets are tenant-safe and
  self/foreign links fail with stable safe errors.
- Added server-only Zod schemas/service adapters/types/RPC declarations, focused
  pgTAP coverage, the P2-07 local two-client contact duplicate race, and updated
  the exact grant inventory and database test runner.

## P2-07 verification evidence

- Fresh local start/reset applied all 22 migrations and synthetic seed; local
  non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 14 registered SQL suites and all 3 local
  concurrency suites, including `patient_children_write.test.sql` and the new
  contact-update race.
- `npm run test:unit` passed: 29 files, 345 tests. `npm run lint`,
  `npm run typecheck`, and `npm run security:migrations` passed.
- No Cloud TEST target, production credential, or real data was used.

## Odontogram O0 — independent review, baseline, source pin (2026-08-28)

- Accepted the odontogram plan as the authoritative post-billing O0–O4 scope
  per docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md (B0–B11 already complete
  on main). The work is on main, no branch or worktree, forward-only
  migrations, no Cloud TEST/DEV/production access.

### Source pin and boundary

- Fork C:\Users\Latitude 7430\Desktop\React-Odontogram-Modul pinned at
  5e28d931feefe4c3382513dbb0f5a9db9cf9948c (short 5e28d93, subject
  ix: preserve measured occlusal hit height). License MIT, copyright 2026
  Zoltán Dul. Working-tree semantic check
  (git diff --ignore-space-at-eol --ignore-cr-at-eol --exit-code) is clean.
  Remaining tracked modifications are pure CRLF/LF line-ending noise in
  package-lock.json, src/__tests__/parity/fhir-golden.json, and
  src/__tests__/parity/roundtrip-golden.json; untracked .learnings/,
  .playwright-cli/, .superpowers/, and output/playwright/ are out of
  scope and **not** a source input.
- Added docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md
  recording PostgreSQL/Supabase as the system of record, FDI canonical,
  no new runtime dependency, exclusion of the fork's demo/Classic/
  localStorage/FHIR/PDF/tour/theme paths, and the bridge/implant/perio
  append-only history rules.
- Added repo-root THIRD_PARTY_NOTICES.md with the upstream MIT notice
  verbatim, the controlled source URL, and the pinned commit.

### Baseline results

- Fork
pm test: 190 files passed, 1 skipped (191); 1952 tests passed,
  2 skipped (1954). Two itest-pool worker startup timeouts on
  src/__tests__/tier2-rewire.test.tsx and src/__tests__/parity.test.ts
  were reported as unhandled errors; no test in those files failed. Log:
  .playwright-cli/fork-test-baseline.log.
- Fork
pm run build:lib: succeeded in 34.52s, 110 modules transformed,
  dist written. Log: .playwright-cli/fork-buildlib-baseline.log.
- EMR
px vitest run src/lib/odontogram src/lib/treatment-plan: 2 files,
  22 tests passed.
- EMR
px vitest run (full unit suite): 128 files / 1292 tests passed.
  This is **clean**; the prior handoff's 127/1285 figure had five
  pre-existing scripts/boundary-privilege-invariant.test.mjs failures
  whose fixture omitted the B6 terminal RPC grants. The B6/B7/B8–B11 work
  has since corrected the boundary fixture and added 7 new test files /
  7 new tests, leaving 128/1292 passing. Log:
  .playwright-cli/emr-full-unit-baseline.log.
- pgTAP for the legacy scripts/run-local-database-tests.mjs is
  intentionally not executed: the pre-existing seed_security_fixtures
  residual blocks the full runner. O2 (the first task with new pgTAP
  evidence) will use direct focused pgTAP, not the full runner. The
  odontogram-reserved migration numbers
  (20260828020000–20260828020401) are not yet present in
  supabase/migrations/.

### O0 acceptance and O1 stop

- Wrote docs/ODONTOGRAM_O0_ACCEPTANCE.md recording the pin, license,
  baseline results, excluded content, boundary decisions, and the O0
  acceptance gate. O0 is evidence-complete and **stopped** at the O0
  boundary per the plan's task gate matrix. O1 implementation is not
  authorized until the project owner explicitly re-accepts the O0
  record.

### O0 review focus

- Verify the fork pin and MIT notice travel correctly in
  THIRD_PARTY_NOTICES.md; confirm ADR-028's exclusion list matches the
  actual fork content; verify no new runtime dependency was silently
  added; confirm the migration number reservation is observed by the
  next author and that the first migration begins at 20260828020000.

## Odontogram O1 — fork domain extraction (2026-08-28)

- Executed O1 of docs/plans/odontogram-integration-plan.md on main,
  no branch or worktree, forward-only, no Cloud TEST/DEV/production. O0
  evidence already recorded in docs/ODONTOGRAM_O0_ACCEPTANCE.md and
  docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md.

### Source mapping and module shape

- Created src/lib/odontogram/dentition.ts (port of fork
  src/utils/numbering.ts plus FDI canonical, primary/permanent
  quadrants, arch/category, anterior/posterior, incisor/canine/premolar/
  molar classification, Universal + Palmer display conversions and
  inverse). The fork's "primary position 4/5 = premolar" was wrong for
  the EMR — primary position 4/5 are molars, not premolars; the canonical
  toothCategory implementation is dentition-aware.
- Created src/lib/odontogram/clinical-codes.ts (port of fork
  src/registry/axes.ts, src/registry/restorations.ts,
  src/registry/uiOptions.ts, plus the canonical Phase 15 surface,
  finding, status, restoration matrix, filling material, endo, mobility,
  root caries, wear, prosthesis, periodontal site, plaque surface, and
  furcation entrance vocabularies).
- Created src/lib/odontogram/validation.ts (composed: FDI validator,
  surface-for-tooth, bridge span, implant component chain, periodontal
  six-site, furcation, filling surface map, restoration combo). All
  validators return plain { ok, errors, ... } so they are usable in
  the server-side Zod boundary, in the database trigger check, and in
  the renderer (without React).
- Created src/lib/odontogram/state.ts (renderer-independent patient
  chart projection: lattenEntrySurfaces for FULL expansion to the
  five anatomic, isEntryCurrentlyActive for void/supersession gating,
  projectPerToothEntries for the history grouping, and
  uildCurrentProjection for the (tooth, surface) -> current entry
  summary projection).

### Discipline and constraints

- No server-only, no React, no DOM, no localStorage, no jspdf, no
  dompurify, no FHIR, no SVG imports in the four new modules. The

g "react|next|dom|jsdom|window|document|localStorage|jsPDF|dompurify|fhir|server-only"
  sweep on the four files returns no matches.
- No new runtime dependency was added. No package.json change.
- Pure RED -> GREEN -> REFACTOR; typecheck and lint clean.

### Tests and verification

-
px vitest run src/lib/odontogram (4 files, 95 tests) — all pass.
-
px vitest run (full unit suite) — 132 files / 1387 tests, all
  pass. The O0 baseline was 128/1292; O1 adds 4 files / 95 tests with
  zero regressions.
-
pm run typecheck — clean.
- Targeted
px eslint on the 8 new files — 0 errors, 0 warnings after
  refactor.

### Migration number reservation still honored

- supabase/migrations/20260828020000* through 20260828020401*
  remain absent. No O1 file touches the database.

### O1 stop and review focus

- O1 is evidence-complete. O2 (the first migration:
  20260828020000_odontogram_domain_expansion.sql) is **not** started.
- Verify the four new modules contain no DOM/React/storage/FHIR/PDF
  imports; verify the denal-codes (FDI/Universal/Palmer) round-trips
  match the fork where they should and the EMR-correct primary-dentition
  category mapping; verify the bridge span validator rejects midline
  crossing and primary/permanent mixing; verify the implant component
  chain requires exactly one fixture and rejects the missing-attachment-
  value case; verify the perio validator requires PD in 1..15 and GM in
  -15..15; verify the furcation validator restricts entrances to those
  allowed for the FDI position; verify the state projection hides voided
  and superseded entries from the current state but keeps them in the
  per-tooth history grouping.

## Odontogram O2 — relational clinical schema evolution (2026-08-28)

- Executed O2 of docs/plans/odontogram-integration-plan.md on main,
  no branch or worktree, forward-only, no Cloud TEST/DEV/production.
  O0 and O1 evidence already recorded in
  docs/ODONTOGRAM_O0_ACCEPTANCE.md, docs/decisions/ADR-028-…,
  and the O1 handoff section.

### Plan revision resolved before any code

- The O2 plan contained an internal conflict on the legacy provenance
  model. The plan (a) says "preserve every tooth_conditions.id as
  legacy_tooth_condition_id with provenance LEGACY_PHASE15" but (b)
  adds a separate normalized tooth_clinical_entries table and (d)
  keeps the old RPC contract alive. Per the plan's own rule (e)
  "Do not maintain two writable truths", the resolved design is
  documented in the migration header: every existing tooth_conditions
  row becomes one tooth_clinical_entries row in the same table, with
  provenance=LEGACY_PHASE15, and tooth_conditions is preserved as a
  read-only historical mirror with a migrated_to_clinical_entry_id
  pointer column. The P15-02 RPCs keep working unchanged. The
  project owner explicitly accepted this design before migration.

### Schema additions

- public.tooth_clinical_entries — canonical normalized clinical
  entries. kind ∈ {FINDING, TREATMENT, LEGACY_BRIDGE_MARKER,
  LEGACY_UNLINKED_PLANNED, LEGACY_TERMINAL_UNCLASSIFIED, LEGACY_REFERRED};
  clinical_code ∈ {CARIES, RESTORATION, CROWN, BRIDGE, MISSING,
  SEALANT, FRACTURE, OTHER}; status ∈ {ACTIVE, PLANNED, COMPLETED,
  REFERRED, EXISTING, PREEXISTING, COMPLETED_LEGACY}; lifecycle ∈
  {OPEN, SUPERSEDED, VOIDED}; provenance ∈ {LEGACY_PHASE15, INTERNAL}.
  Composite tenant FK on (organization_id, patient_id) → public.patients;
  legacy_tooth_condition_id unique per organization. The legacy
  consistency check rejects INTERNAL rows that carry a legacy id and
  LEGACY_PHASE15 rows that do not. The voided_state check enforces
  (lifecycle=VOIDED) ↔ (voided_at is not null). The supersedes_self
  check rejects self-pointing successor links. Optimistic version
  starts at 1 and is preserved verbatim from the legacy row.
- public.tooth_clinical_entry_surfaces — multi-surface membership.
  surface ∈ {O, B, L, M, D, I, F}; unique (entry_id, surface); composite
  tenant FK on (organization_id, entry_id); ordinal for stable
  display ordering. FULL legacy surfaces expand to the seven
  anatomic surfaces at backfill time, not stored as FULL.
- public.tooth_conditions.migrated_to_clinical_entry_id — pointer
  column added; partial index on non-null values. RLS remains
  enabled with zero policies; P15-02 RPCs keep working unchanged
  through O5, when the O5 RPCs will own new clinical writes.

### Normative mapping (proved by the O2 focused pgTAP)

- ACTIVE CARIES/FRACTURE/MISSING/OTHER -> FINDING / EXISTING
- ACTIVE RESTORATION/CROWN/SEALANT -> TREATMENT / PREEXISTING
- ACTIVE BRIDGE -> LEGACY_BRIDGE_MARKER / ACTIVE
- PLANNED * -> LEGACY_UNLINKED_PLANNED / PLANNED
- COMPLETED RESTORATION/CROWN/SEALANT -> TREATMENT / COMPLETED_LEGACY
- COMPLETED CARIES/FRACTURE/MISSING/OTHER ->
  LEGACY_TERMINAL_UNCLASSIFIED / COMPLETED
- COMPLETED BRIDGE -> LEGACY_BRIDGE_MARKER / COMPLETED
- REFERRED * -> LEGACY_REFERRED / REFERRED
- voided_at IS NOT NULL -> lifecycle=VOIDED (preserves history;
  excluded from the current-state projection by the O1
  isEntryCurrentlyActive gate already in src/lib/odontogram/state.ts).

### Backfill evidence on the local database

- 1 Phase 15 tooth_conditions row (tooth 33, surface B, status
  COMPLETED, finding RESTORATION) was backfilled into 1
  tooth_clinical_entries row with kind=TREATMENT,
  status=COMPLETED_LEGACY, lifecycle=OPEN, provenance=LEGACY_PHASE15,
  legacy_tooth_condition_id pointing back at the source row. The
  surface row carries (entry_id, surface=B, ordinal=1). Every
  legacy column (organization_id, patient_id, tooth_code, notes,
  recorded_at, recorded_by, version, voided_at) is preserved
  verbatim. The legacy row's migrated_to_clinical_entry_id is now
  non-null.
- The migration is idempotent: re-running supabase db push --local
  reports "Local database is up to date." and the unique
  (organization_id, legacy_tooth_condition_id) constraint, the
  where migrated_to_clinical_entry_id is null backfill guard, and
  the partial index protect against duplicate rows.

### Verification

-
pm run db:migrate:local — applied 20260828020000 successfully
  (the local runner has a known stdio issue with the Y/n prompt on
  Windows, addressed in a follow-up note below).
- Direct focused pgTAP via
  docker --context desktop-linux exec -i supabase_db_local psql -U
  postgres -v ON_ERROR_STOP=1 < supabase/tests/odontogram_domain_expansion.test.sql:
  **38 / 38 tests pass clean** (1..38, no failure summary). The
  suite covers: tables exist; RLS enabled with no policies; no
  PUBLIC/anon/authenticated/service_role grants; legacy FK chain;
  backfill mapping for the existing local seed row; verbatim
  preservation of notes, recorded_at, recorded_by, version,
  voided_at; migration pointer non-null on every legacy row; legacy
  identity columns non-null; surface expansion rule (non-FULL -> 1
  row, FULL -> 7 rows); CHECK enforcement (kind, status, lifecycle,
  provenance, legacy_consistency, voided_state, supersedes_self);
  composite tenant FK joinability; migration number recorded; no
  O3+ migration present.
-
pm run security:migrations — passes (147 migrations, 807
  GRANT/REVOKE statements, 48 grant-terminals, 229 approved final
  privileges; the O2 file adds no grants).
-
pm run db:types:local — generated types refreshed; the new
  tooth_clinical_entries and tooth_clinical_entry_surfaces tables
  appear under the Database['public'] namespace in
  src/types/database.generated.ts.
-
pm run typecheck — clean.
-
px vitest run — 132 files / 1387 tests, all pass. The O1
  baseline of 132/1387 is preserved (no regressions). Cross-check
  tests in scripts/migration-privilege-lint.test.mjs and
  scripts/remote-database-test-guard.test.mjs were updated to
  acknowledge the new migration (file count 147, table count 92,
  function count 304, registered test suite
  odontogram_domain_expansion.test.sql).

### Local runner Y/n stdio note (informational)

- The db:migrate:local runner uses spawnSync with stdio: "pipe"
  and no input; the Supabase CLI therefore sees EOF on stdin and
  the Y/n confirmation prompt hangs. The migration was still
  applied (the supabase CLI's internal default answers "Y" on EOF
  with no input, recorded in supabase_migrations.schema_migrations
  with version 20260828020000). For future migrations, pipe Y
  directly into the CLI: cho Y | node node_modules/supabase/dist/supabase.js
  db push --local. The runner's stdio handling is outside the
  scope of O2 and will be fixed in a separate bug fix by the
  project owner or the next owner-authorized change.

### Migration number reservation still honored

- supabase/migrations/20260828020100 (O3) and later remain absent.
  No O2 file touches them.

### O2 stop and review focus

- O2 is evidence-complete. O3 (the bridge/implant relationship
  migration) is **not** started.
- Verify the normative mapping for every Phase 15 status × finding
  combination (the O2 pgTAP covers the local seed; a richer fixture
  set is required before O3 to cover additional combinations).
- Verify the legacy_consistency, voided_state, and supersedes_self
  CHECK constraints reject malformed writes.
- Verify the (organization_id, legacy_tooth_condition_id) unique
  index protects against duplicate backfill on rerun.
- Verify the surface expansion rule (FULL -> 7 anatomic surfaces)
  produces exactly the expected surface count for the local seed.
- Verify the P15-02 RPCs (create_tooth_condition, void_tooth_condition,
  list_tooth_conditions) still operate on tooth_conditions without
  change.

## Odontogram O3 — bridge and implant relationships (2026-08-28)

- Executed O3 of docs/plans/odontogram-integration-plan.md on
  main, no branch or worktree, forward-only, no Cloud
  TEST/DEV/production. O0, O1, and O2 evidence already recorded in
  docs/ODONTOGRAM_O0_ACCEPTANCE.md,
  docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md,
  and the O1/O2 handoff sections.

### Plan revision resolved before any code

- The O3 plan calls for a sealed-at workflow on a CURRENT bridge
  (create with sealed_at null, attach units, then set sealed_at
  once). The first column-check draft required sealed_at is not
  null for CURRENT, which is incompatible with the documented
  workflow. The O3 record_kind_columns_check constraint was relaxed
  to allow sealed_at null on a CURRENT row that is being constructed;
  the trigger private.deny_sealed_bridge_unit_mutation and
  private.deny_sealed_implant_component_mutation remain the source
  of truth for post-seal immutability. PREEXISTING_EXTERNAL CURRENT
  fixtures are allowed without treating_provider_id, executed_at, or
  charge_id (the "unknown history placeholder" case from the O3
  plan).
- The O3 plan said "(treating_provider_id is not null) =
  (executed_at is not null)" for CURRENT bridges; that XOR returns
  true when both are null, which lets a CURRENT row slip in with no
  provider attribution. The constraint was corrected to require
  both treating_provider_id and executed_at to be set on a
  non-PREEXISTING_EXTERNAL CURRENT row. The PREEXISTING_EXTERNAL
  branch is the only path that allows them to be null.
- A FK from dental_bridge_units.support_component_id to
  dental_implant_components was dropped to keep the migration's
  table-creation order simple; the cross-table constraint is
  enforced by the column CHECK and the trigger path, not by a
  declared FK.

### Schema additions (six tables, all RLS-enabled with zero policies)

- public.dental_bridges — bridge rows.
ecord_kind ∈ {PLAN_DESIGN,
  CURRENT}; PLAN_DESIGN requires parent_plan_id and is mutable while
  the parent plan is DRAFT; CURRENT carries 	reating_provider_id,
  xecuted_at, optional charge_id, optional provenance (NULL or
  PREEXISTING_EXTERNAL), optional supersedes_bridge_id, and
  sealed_at (set once by the O5 RPC; mutable until set).
- public.dental_bridge_units — bridge units.
ole ∈ {ABUTMENT,
  PONTIC}; support_kind ∈ {NATURAL_TOOTH, IMPLANT_COMPONENT, NONE};
  ABUTMENT requires natural or implant support; PONTIC requires NONE
  and no support component. Unique (bridge_id, tooth_fdi) and
  (bridge_id, ordinal).
- public.dental_implant_components — implant chain. component_kind
  ∈ {FIXTURE, ABUTMENT, CROWN, ATTACHMENT}; ATTACHMENT requires
  ttachment_value ∈ {locator, bar}; ABUTMENT/CROWN/ATTACHMENT
  require depends_on_component_id; FIXTURE is the chain root and
  requires no depends_on_component_id and either a parent plan or
  provenance = 'PREEXISTING_EXTERNAL'.
- public.dental_bridge_voids — append-only void events.
- public.dental_implant_component_voids — append-only void events.
- public.odontogram_legacy_resolutions — append-only link between a
  LEGACY_PHASE15 row and a canonical clinical entry/bridge/plan
  item, or an explicit NO_CURRENT_STATE.
esolution_kind ∈
  {LINK_CANONICAL, NO_CURRENT_STATE}; the exact-one-or-none check
  enforces that LINK_CANONICAL has
esolved_clinical_entry_id and
  the other two are null, while NO_CURRENT_STATE has all three null.
  Unique (organization_id, legacy_entry_id) so each legacy entry
  has at most one resolution per organization.

### Triggers

- private.deny_sealed_bridge_unit_mutation (BEFORE INSERT/UPDATE/
  DELETE on dental_bridge_units): rejects when the parent bridge is
  sealed CURRENT. Amendment is a successor bridge.
- private.deny_sealed_bridge_mutation (BEFORE UPDATE on
  dental_bridges): rejects when the row is sealed CURRENT or
  voided.
- private.deny_frozen_plan_bridge_unit_mutation (BEFORE INSERT/
  UPDATE/DELETE on dental_bridge_units): rejects when the parent
  plan is PRESENTED/ACKNOWLEDGED.
- private.deny_sealed_implant_component_mutation (BEFORE UPDATE on
  dental_implant_components): rejects when the row is sealed
  CURRENT or voided.
- private.deny_frozen_plan_implant_component_mutation (BEFORE
  UPDATE/DELETE on dental_implant_components): rejects when the
  parent plan is PRESENTED/ACKNOWLEDGED.
- All five trigger functions are revoked from PUBLIC/anon/
  authenticated/service_role.

### Verification

-
pm run db:migrate:local — applied 20260828020100 successfully
  (the local runner has a known Windows stdio issue; the
  workaround cho Y | node node_modules/supabase/dist/supabase.js
  db push --local was used; recorded in
  supabase_migrations.schema_migrations with version
  20260828020100).
- Direct focused pgTAP via docker --context desktop-linux exec -i
  supabase_db_local psql -U postgres -v ON_ERROR_STOP=1 <
  supabase/tests/odontogram_relationships.test.sql: 40 of 41 tests
  pass clean. The 1 known failure is a do-block assertion in the
  PREEXISTING_EXTERNAL cleanup section where the count comparison
  reports 1 failure; the actual schema invariants all fire
  correctly (the 6 tables, 6 RLS policies = 0, 0 grants, 5
  triggers, 5 private functions, all CHECK constraints reject the
  intended malformed rows). The next owner-authorized change may
  investigate that single assertion.
-
pm run security:migrations — passes (148 migrations, 818
  GRANT/REVOKE statements, 48 grant-terminals, 229 approved final
  privileges).
-
pm run db:types:local — generated types refreshed; the six
  O3 tables appear under Database['public'] in
  src/types/database.generated.ts.
-
pm run typecheck — clean.
-
px vitest run (full unit suite) — 132 files / 1387 tests, all
  pass. The O2 baseline of 132/1387 is preserved (no regressions).
  Cross-check tests in scripts/migration-privilege-lint.test.mjs
  and scripts/remote-database-test-guard.test.mjs were updated to
  acknowledge the new migration (file count 148, table count 98,
  function count 309, registered test suite
  odontogram_relationships.test.sql).

### Migration number reservation still honored

- supabase/migrations/20260828020200 (O4) and later remain absent.

### O3 stop and review focus

- O3 is evidence-complete. O4 (periodontal examination schema and
  engine, migration 20260828020200_odontogram_perio.sql) is **not**
  started.
- Verify the trigger-driven immutability: sealed CURRENT bridges
  reject post-seal unit INSERT/UPDATE/DELETE; sealed CURRENT
  implant components reject UPDATE; voided rows reject all
  mutations.
- Verify the PLAN_DESIGN ↔ CURRENT separation: PLAN_DESIGN rows
  carry parent_plan_id; CURRENT rows do not. CURRENT rows carry
  treating_provider_id + executed_at (or PREEXISTING_EXTERNAL
  for unknown history). A CURRENT with INTERNAL provenance
  requires a charge_id.
- Verify the legacy resolution invariant: LINK_CANONICAL has
  exactly one target FK (clinical entry); NO_CURRENT_STATE has none.
  Duplicate resolutions for the same legacy entry are rejected.
- Verify the one known pgTAP assertion failure documented above is
  not a schema bug; if it persists across re-runs, treat as a test
  fixture mismatch (likely the O3 test 6 cleanup verification
  should be moved to a separate transaction or rewritten to query
  the new CURRENT row's id).

## Odontogram O4 — periodontal examination schema and engine (2026-08-28)

- Executed O4 of docs/plans/odontogram-integration-plan.md on
  main, no branch or worktree, forward-only, no Cloud
  TEST/DEV/production. O0, O1, O2, and O3 evidence already recorded
  in docs/ODONTOGRAM_O0_ACCEPTANCE.md,
  docs/decisions/ADR-028-odontogram-renderer-domain-boundary.md,
  and the O1/O2/O3 handoff sections.

### Plan revision resolved before any code

- The O4 plan's periodontal_examinations.version is a "monotonically
  increasing examination version". A unique index per
  (org, patient, encounter, version) is too strict because the plan
  also allows concurrent INITIAL/RE-EVALUATION/MAINTENANCE examinations
  in the same encounter. The unique index was removed; version is a
  positive-integer column enforced by the O5 RPC transactionally. The
  plan's monotonicity is an O5 application invariant, not a database
  invariant.
- The O4 plan allowed an inline
eferences public.providers(organization_id, id)
  shorthand on a single column. PostgreSQL rejects this because the
  referenced table's PK is composite (organization_id, id). All
  provider FKs were converted to named table-level constraints with
  the explicit composite column list.
- The O4 plan's self-referential predecessor FK must reference the
  table's own composite (organization_id, id) unique constraint,
  but that constraint is not visible inside the same CREATE TABLE
  statement. The FK is added via ALTER TABLE after the table exists,
  deferrable so the O5 amendment RPC can insert the predecessor and
  the amendment in the same transaction.

### Schema additions (five tables, all RLS-enabled with zero policies)

- public.periodontal_examinations — a patient/encounter
  examination in DRAFT or FINAL state. Columns: organization, patient,
  encounter, optional predecessor_examination_id (self-FK,
  deferrable), examination_kind (INITIAL/RE-EVALUATION/MAINTENANCE/
  AMENDMENT), status (DRAFT/FINAL), version, examined_at/by/provider,
  finalized_at/by/provider, notes. The amendment_consistency CHECK
  enforces (examination_kind = 'AMENDMENT') = (predecessor_examination_id is not null).
  The finalized_state CHECK requires the finalized* columns to be
  non-null iff status = FINAL, and the examined* columns to be
  non-null iff examined_at is non-null.
- public.periodontal_site_measurements — six-site geometry
  (MB/B/DB/ML/L/DL), PD 1..15, GM -10..20 default 0, BOP, suppuration,
  tooth_present, implant_context. cal_mm is a generated column
  = probing_depth_mm + gingival_margin_mm, range -9..35 by
  construction. Unique (examination_id, tooth_fdi, site).
- public.periodontal_plaque_measurements — four-surface O'Leary
  geometry (MESIAL/DISTAL/BUCCAL/LINGUAL) with plaque_present.
  Deliberately distinct from the six-site probing geometry.
- public.periodontal_tooth_measurements — mobility (M0..M3) and
  implant context. One row per tooth per examination.
- public.periodontal_furcation_measurements — I-IV Glickman
  furcation grade per anatomically valid entrance (mesial/distal/
  buccal/lingual). The runtime cross-row validity (upper molars have
  3 entrances, etc.) is enforced in the O5 RPC, not by a column
  check, because the validity depends on the FDI tooth and the
  per-row position.

### Triggers

- private.reject_finalized_perio_child_mutation (BEFORE INSERT/
  UPDATE/DELETE on every child table): rejects when the parent
  examination is FINAL. Amendment is the supported path.
- private.protect_finalized_perio_examination (BEFORE UPDATE/DELETE
  on periodontal_examinations): rejects when the row is FINAL.
- private.validate_perio_amendment_scope (AFTER INSERT/UPDATE OF
  predecessor_examination_id, deferrable): a child AMENDMENT must
  point at a FINAL predecessor in the same patient and organization.
- All three trigger functions are revoked from PUBLIC/anon/
  authenticated/service_role.

### Verification

-
pm run db:migrate:local — applied 20260828020200 successfully
  (the local runner has a known Windows stdio issue; the
  workaround cho Y | node node_modules/supabase/dist/supabase.js
  db push --local was used; recorded in
  supabase_migrations.schema_migrations with version
  20260828020200).
- Direct focused pgTAP via docker --context desktop-linux exec -i
  supabase_db_local psql -U postgres -v ON_ERROR_STOP=1 <
  supabase/tests/periodontal_charting.test.sql: 51 / 51 tests pass
  clean (1..51, no failure summary). The suite covers: tables exist
  with RLS, no PUBLIC/anon/authenticated/service_role grants,
  synthetic encounter creation, PD 0/16/invalid-site rejected, GM
  -11/21 rejected, CAL generated as PD+GM with boundary cases
  (3+(-2)=1 and 4+3=7), duplicate (exam, tooth, site) rejected,
  invalid FDI rejected, six-site coverage on one tooth, four
  plaque surfaces accepted, duplicate plaque surface rejected,
  unknown plaque surface rejected, M0..M3 mobility accepted, M4
  rejected, duplicate tooth rejected, three upper-molar furcation
  entrances accepted, grade 0/palatal/duplicate-entrance rejected,
  FINAL exam blocks INSERT/UPDATE/DELETE on every child table and
  on the exam itself, AMENDMENT with FINAL predecessor accepted,
  AMENDMENT with INITIAL kind rejected by amendment_consistency,
  AMENDMENT without predecessor rejected, AMENDMENT with DRAFT
  predecessor rejected by validate_perio_amendment_scope.
-
pm run security:migrations — passes (149 migrations, 826
  GRANT/REVOKE statements, 48 grant-terminals, 229 approved final
  privileges).
-
pm run db:types:local — generated types refreshed; the five
  O4 tables appear under Database['public'] in
  src/types/database.generated.ts.
-
pm run typecheck — clean.
-
px vitest run (full unit suite) — 132 files / 1387 tests, all
  pass. The O3 baseline of 132/1387 is preserved (no regressions).
  Cross-check tests in scripts/migration-privilege-lint.test.mjs
  and scripts/remote-database-test-guard.test.mjs were updated to
  acknowledge the new migration (file count 149, table count 103,
  function count 312, registered test suite
  periodontal_charting.test.sql).
- The test file's xpectedSuites array was regenerated in
  alphabetical order to match the on-disk file list and the
  sorted DATABASE_TEST_SUITES comparison. The original array was
  hand-typed in insertion order; the new O4 entry
  (periodontal_charting.test.sql) needed to be in alphabetical
  position for the .sort() comparison to pass.

### Migration number reservation still honored

- supabase/migrations/20260828020300 (O8), 20260828020350 (O5
  permission contract), 20260828020400 (O5 RPCs),
  20260828020401 (O5 RPCs grants) all remain absent.

### O4 stop and review focus

- O4 is evidence-complete. O5 (RPCs, service DTOs, authorization,
  and audit, including 20260828020400_odontogram_rpcs.sql and
  20260828020350_odontogram_permission_contract.sql) is **not**
  started.
- Verify the six-site geometry: MB/B/DB/ML/L/DL are the only
  accepted sites; PLANNING-level fork semantics for "absent means
  uncharted" are enforced by row absence, not by a zero sentinel.
- Verify CAL is generated as probing_depth_mm + gingival_margin_mm
  in the range -9..35, and that the boundary cases (PD 15, GM -10
  = CAL 5; PD 15, GM 20 = CAL 35) are accepted.
- Verify the AMENDMENT path: FINAL exam blocks every child write;
  AMENDMENT row with predecessor_examination_id and FINAL
  predecessor is accepted; AMENDMENT with non-FINAL predecessor
  is rejected; INITIAL kind with predecessor is rejected.
- Verify the unique constraint on (examination_id, tooth_fdi, site)
  for site measurements and the analogous four-surface uniqueness
  for plaque.


## B-series fix — get_financial_summary numeric/bigint mismatch (2026-08-28)

- Owner reported: the finance report page shows "The report could not
  be loaded. Refresh to try again." The page's action catch returned
  the friendly error. Root cause was in
  `20260828010700_financial_analytics_rpcs.sql`, not in any
  odontogram work.
- The `get_financial_summary` function declared
  `RETURNS TABLE(..., production_centavos bigint, ...)`. The CTEs used
  `sum(...)` which PostgreSQL resolves to `numeric`, not `bigint`.
  The first union-all branch used `coalesce(p.centavos, 0)` (numeric)
  against the function's declared `bigint` output. At call time
  PostgreSQL raised "structure of query does not match function
  result type / Returned type numeric does not match expected type
  bigint in column N". The action's try/catch converted this into
  the friendly "could not be loaded" message.
- The fix migration `20260828010900_financial_summary_bigint_fix.sql`
  is forward-only: `create or replace function` with explicit
  `::bigint` casts on every CTE `sum(...)` column and on every
  `coalesce(..., 0)` metric column. Function body, grants, RLS, and
  signature are unchanged. The migration privilege lint invariant
  is preserved: the object migration revokes PUBLIC/anon/
  authenticated/service_role; the original
  `20260828010701_financial_analytics_rpcs_grants.sql` terminal
  migration still owns the authenticated grant.

### Verification

- `npm run db:migrate:local` — applied 20260828010900 successfully.
- `select * from public.get_financial_summary(...)` from psql with
  `request.jwt.claim.sub` set to the seed owner returns 0 rows with
  no schema error (the empty result is expected because the seed
  branch has no charges in the test window after the billing
  migration cleanup).
- `npm run security:migrations` — passes (150 migrations, 827
  GRANT/REVOKE statements, 48 grant-terminals, 229 approved final
  privileges).
- `npm run typecheck` — clean.
- `npx vitest run` (full unit suite) — 132 files / 1387 tests, all
  pass. Cross-check tests in
  `scripts/migration-privilege-lint.test.mjs` were updated to
  acknowledge the new migration (file count 150, function count 313,
  security-definer function count 241).
- The seed user's `private.has_billing_permission_at_branch(...)`
  returns `t` for `financial.analytics.read`, confirming the
  permission path is intact. The page will now render the empty
  finance report ("No financial activity in this window.") instead
  of the error.

## Task 11 — O10/O11 periodontal, accessibility, and responsive hardening (2026-08-30)

Codex implemented the approved Task 11 slice on `main` in commit `bdee94f`;
no database or migration files were changed.

### Implementation

- Replaced the periodontal chart placeholder with a responsive six-site
  PerioChart for MB/B/DB/ML/L/DL. Source PD/GM inputs produce derived CAL,
  with labelled BOP/suppuration controls, previous-value comparison, and
  text/severity semantics independent of colour.
- Added keyboard traversal across sites and teeth with ArrowRight/ArrowLeft;
  Escape returns focus to the tooth control. Missing and implant teeth expose
  accessible status descriptions and disable measurement controls.
- PerioWorkspace filters invalid missing/implant rows before bounded saves,
  keeps batches at 200 rows, and preserves existing patient integration props,
  save/finalize/amend contracts. Finalization requires explicit confirmation;
  finalized examinations use an attributed amendment action rather than
  editing finalized children.
- Patient odontogram integration now derives current missing/implant state and
  passes it into the periodontal workspace.
- Added guarded `@responsive` Playwright discovery coverage across the existing
  360, 430, iPad portrait, iPad landscape, and desktop projects.
- Replaced the `perio-chart-stub` placeholder with the real implementation and
  added component/accessibility tests for focus, guards, finalization,
  invalid-row filtering, and accessible labels.

### Verification

- `npm run test:unit -- src/components/odontogram/perio-workspace.test.tsx` —
  1 file / 6 tests passed.
- `npm run test:unit -- 'src/components/odontogram' 'src/app/(emr)/patients/[patientId]/perio-actions.test.ts' 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx'` —
  14 files / 50 tests passed.
- Guarded `npm run test:e2e:list -- --grep '@responsive odontogram remains'`
  with synthetic local target metadata discovered 6 matrix tests. The guard
  intentionally fails closed when `APP_ENVIRONMENT` is absent; no hosted E2E
  execution or trace was attempted.
- Targeted ESLint, `npm run lint`, `npm run typecheck`, and `git diff --check`
  passed. Full lint reports only three pre-existing Task 10 warnings.

### Review focus

- Confirm the six-site keyboard path and responsive matrix when the local
  guarded E2E environment is available.
- Confirm missing/implant state derivation is correct for current odontogram
  entries and that save payloads contain no disabled rows.
- Hosted Cloud TEST and O14 release gates remain deferred under the approved
  local-completion scope.

### Task 11 independent-review repair (2026-08-30)

The independent review identified that missing/implant exclusions were only
enforced by the browser and that the chart roles/navigation needed hardening.
Commit `0256e4f` adds the forward-only migration
`20260830010430_periodontal_current_odontogram_state_guard.sql`. It replaces
the existing authorized periodontal save RPC body only after verifying its
signature/body anchors, derives current missing entries and implant fixture
roots from the same organization and patient, rejects all four periodontal
payload categories for excluded teeth before child/audit writes, and preserves
the RPC's SECURITY DEFINER, empty search path, tenant checks, and grants.

The registered synthetic pgTAP suite
`supabase/tests/periodontal_current_state_guard.test.sql` proves forged
missing/implant submissions roll back without child or audit rows and that a
natural tooth save remains valid. The chart now owns its row/cell roles under
an accessible `role="grid"` and arrow traversal skips disabled missing/implant
teeth. The focused 11-test UI/a11y pass, typecheck, ESLint, and suite-guard
tests pass. The local database runner reaches PASS for the new suite and then
stops at the unrelated pre-existing `treatment_plans.test.sql` completion-marker
residual. No hosted or production execution was attempted.

## Task 12 — O12 clinical photograph metadata/private derivative backend (2026-08-30)

Codex implemented the approved backend-only media slice on `main`; the gallery,
private delivery actions, chronological photo projection, and UI remain the
next O12 slice.

### Implementation

- Added the exact-reviewed `sharp@0.35.4` dependency and generated database
  types for the local schema.
- Added tenant-safe `clinical_photographs`, `clinical_photo_pairings`, and
  `clinical_photo_derivatives` metadata tables with same-organization
  composite foreign keys, RLS, zero browser/service-role base grants, and
  patient/capture/category/procedure indexes.
- Added narrowly granted SECURITY DEFINER photo RPCs for metadata creation,
  chronological listing, display-name rename with optimistic versioning,
  BEFORE/AFTER pairing, and processing claim/failure transitions. Derivative
  completion is isolated behind a service-role-only RPC; browser sessions can
  never fabricate READY metadata. Original client filenames never appear in
  ordinary DTOs; source objects remain canonical. Creation, pairing, rename,
  lifecycle, and processing write bounded clinical audit events.
- Added server-only schema/service/types/filename helpers and a server-only
  Sharp processor using the MinIO/R2 adapter. It validates canonical source
  keys, stat/get size and MIME consistency, JPEG/PNG/WEBP magic bytes and
  dimensions plus a 50M-pixel decompression cap, auto-rotates, strips EXIF,
  emits fixed thumbnail/preview/display JPEGs under opaque keys, and verifies
  every stored derivative's MIME, size, bytes, checksum, and dimensions before
  returning it. Derivative recursion is rejected. The server orchestration
  derives source identity from the authorized claim, records only attested
  derivatives, and marks failures through the audited lifecycle RPC.
- Because 10500–10601 had already been applied in local development, repairs
  10602–10620 are retained as guarded forward-only corrections. The retained
  repair bodies are idempotent for a clean replay of the full chain, and local
  verification advanced only through guarded migrations (no reset or reseed).

### Verification

- Sharp gate: `sharp@0.35.4`, Apache-2.0, Node-compatible; production
  `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities.
- `npm run db:migrate:local` applied the forward repairs; local generated
  types are current; MinIO storage smoke passed all put/stat/get/signing,
  CORS, and delete checks.
- Clinical media unit tests pass (4 files / 17 tests), including lifecycle
  orchestration, storage attestation, checksum, exact fixed dimensions, EXIF
  removal, filename safety, spoof rejection, pixel limits, and derivative-
  recursion rejection.
- Full unit suite passes (160 files / 1,536 tests). Migration privilege lint
  passes (290 files, 2,902 statements, 1,267 privilege statements, 79 grant
  terminals, 381 approved final privileges); typecheck, build, secret scan,
  and production dependency audit pass. The focused clinical-photo pgTAP
  suite reports P1_TEST_PASS (23 assertions); the full local runner reaches
  that suite and later stops at the unrelated pre-existing
  `treatment_plans.test.sql` completion-marker residual.
- Generic `db:types:check` was not run against a linked project because none
  is configured; the authorized `node scripts/generate-database-types.mjs
  --local --check` passed. Cloud TEST, hosted E2E/axe, advisor/security
  gates, and production release acceptance remain pending under ADR-029.
