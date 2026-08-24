# ADR-018 — Database test tooling is provisioned per environment, not carried by the canonical baseline

**Status:** Accepted (R6-C1)
**Date:** 2026-08-13
**Decision owner:** Project owner
**Resolves:** the pgTAP open decision recorded in [ADR-017](ADR-017-phase1-secure-migration-baseline.md) § "pgTAP: recorded, not silently decided"
**Related:** [ADR-016](ADR-016-supabase-cloud-first-development.md), [ADR-020](ADR-020-local-supabase-hybrid-development.md), `docs/deployment/CLOUD_TEST_PROVISIONING.md`

## Context

ADR-017 retained `create extension if not exists pgtap with schema extensions` in baseline file 1 and recorded three options, explicitly deferring the choice to human approval:

- **(a)** keep pgTAP in the canonical baseline — zero drift, but a testing extension reaches production;
- **(b)** install it only in DEV/TEST — production stays clean, at the cost of an undocumented environment difference;
- **(c)** an environment-gated provisioning mechanism outside the canonical baseline — production-shaped baseline, one extra explicit step when bootstrapping a non-production project.

ADR-017 recommended (c) and deferred it to the production-bootstrap gate. Two things moved that gate forward:

1. **R6-C builds a disposable Cloud TEST project from the baseline alone.** Whatever the baseline contains at that moment is what the equivalence proof (R6-E) certifies and what a future production bootstrap replays. Deciding after R6-C would mean certifying a baseline the project has already decided not to ship.
2. **The canonical application baseline should not require production to install testing infrastructure merely to reconstruct the application schema.** That is a property of the schema contract, not a deployment preference.

## Decision

**Option (c). The canonical baseline creates no extension. Database test tooling is a separate, explicitly guarded, non-production provisioning step.**

### 1. The baseline is production-shaped

`supabase/migrations/20260813020000_baseline_private_helpers.sql` (renamed from `…_baseline_extensions_and_private_helpers.sql`) no longer creates pgTAP. The eight-file baseline builds the complete Phase 1 application schema and nothing else.

### 2. Test tooling lives outside `supabase/migrations/`

`supabase/provisioning/nonproduction/001_database_test_tooling.sql` installs pgTAP. It is deliberately outside the migrations directory, so `supabase db push` cannot apply it and it can never enter a production replay by accident.

ADR-020 does not move pgTAP into the canonical baseline. Local Supabase and
Cloud TEST both install the same file through two exclusive guarded paths:

- local provisioning is supported only through `npm run db:provision:local`;
  its local-only command adapter constructs `db query --local` and does not read
  a linked project reference or hosted credential;
- Cloud TEST provisioning is supported only through
  `npm run db:provision:test`; it retains the remote target guard described
  below.

Neither command may substitute for the other, and there is no supported direct
provisioning path.

### 3. Remote application retains the Cloud TEST guard

For Cloud TEST, the provisioning file is reachable only through `npm run db:provision:test`, which routes to the existing guarded runner and therefore inherits every Cloud TEST target check: `APP_ENVIRONMENT=test`, `SUPABASE_PROJECT_ID` equal to `SUPABASE_TEST_PROJECT_ID`, the linked project equal to that reference, the TEST reference distinct from both `SUPABASE_DEV_PROJECT_ID` and `SUPABASE_PRODUCTION_PROJECT_ID`, and `DATABASE_TEST_CONFIRMATION`.

At R6-C1, this remote command was also classified as
**migration-applying** under the then-active R6 migration freeze and required a
scoped acknowledgement. That requirement is historical and ended through the
approved R6-F procedure; the current remote command contract relies on the
Cloud TEST target guard.

The step asserts a `P1_PROVISION_PASS` sentinel over the live catalog, so a skipped or partially applied run cannot pass merely because the CLI exited zero.

### 4. DEV is not modified

At R6-C1, DEV already carried pgTAP from the superseded chain. Removing it from
DEV would have been a schema change to a non-disposable project for cosmetic
parity, which the then-active migration freeze forbade. DEV therefore kept it.
A newly provisioned TEST project received it through the provisioning step, so
DEV and TEST remained equivalent in the property R6-E compared. This paragraph
records that historical checkpoint; it does not define the current local or
Cloud TEST command paths.

### 5. The rule is enforced, not documented

`scripts/approved-final-grants.mjs` now exports an **empty** `APPROVED_EXTENSIONS` list. Any `CREATE EXTENSION` inside `supabase/migrations/` is therefore a `unapproved-extension` violation that fails `npm run security:migrations`, `npm run verify`, and CI. Tests assert both that the list is empty and that reintroducing pgTAP as a migration is rejected.

Adding an extension to the canonical schema in a future phase is possible, but only by adding a reviewed entry to that list stating why the extension belongs in *every* environment, including production.

### 6. `SUPABASE_DEV_PROJECT_ID` becomes mandatory for guarded TEST operations

Previously the "the TEST project must differ from DEV" check was skipped when the variable was absent, so forgetting one export silently removed the strongest protection the non-disposable DEV project has. The guard now requires it.

## Consequences

### Benefits

- A future production project reconstructs the schema from eight reviewed files and installs no testing extension.
- The extension boundary is mechanically enforced rather than reviewer-dependent.
- The change lands **before** R6-C, so the disposable TEST project is built from the baseline the project intends to keep.
- No non-disposable environment was modified.

### Tradeoffs and risks

- Bootstrapping a non-production project is now two steps (baseline push, then provisioning) instead of one. `docs/deployment/CLOUD_TEST_PROVISIONING.md` and CI both encode the order.
- A deliberate, documented environment difference now exists between production-shaped and non-production projects. R6-E must treat the presence of the `pgtap` extension as an expected non-production difference rather than as drift — and must not treat any *application* object difference the same way.
- Running the pgTAP suites against a TEST project where provisioning was skipped fails at the first `extensions.no_plan()` call. That is a loud failure, not a silent pass.

## Verification

- `npm run security:migrations` — passes with the empty extension list; the baseline parses to 0 extensions, 11 tables, 27 functions, 11 policies.
- At R6-C1, unit tests asserted the empty list, the rejection of a reintroduced pgTAP migration, the provisioning command's exact argument vector, its inclusion in the then-active freeze-refused set, its success sentinel, and the mandatory `SUPABASE_DEV_PROJECT_ID`.
- **Verified against a database.** The provisioning SQL executed successfully as part of R6-C against TEST-01 (2026-08-14, `P1_PROVISION_PASS`; see `docs/evidence/R6C-R6E-test01.md`) and again during the R6-D checkpoints against TEST-02 (see `docs/AI_HANDOFF.md`).

## Independent review

Codex was unavailable at this checkpoint. No independent review has occurred. A reviewer should check specifically:

1. that no path can apply `supabase/provisioning/` content to a production-shaped project;
2. that removing pgTAP from the baseline does not break any suite that assumed the extension was created by a migration;
3. that treating the provisioning step as migration-applying was the correct R6-C1 freeze classification;
4. that the mandatory `SUPABASE_DEV_PROJECT_ID` did not break a legitimate CI path.
