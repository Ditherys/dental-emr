# ADR-021 — Guarded local Supabase verification for Phase 3

**Status:** Accepted — explicitly approved by the project owner 2026-08-26

**Date:** 2026-08-26

**Decision owner:** Project owner

**Amends:** [ADR-020](ADR-020-local-supabase-hybrid-development.md)

**Related:** [ADR-017](ADR-017-phase1-secure-migration-baseline.md),
[ADR-018](ADR-018-nonproduction-database-test-tooling.md),
`TECHNICAL_ARCHITECTURE.md`, `SECURITY_ARCHITECTURE.md`,
`MASTER_PRODUCT_PLAN.md`, and `plans/003-provider-specialty-procedure-foundation.md`

## Context

ADR-020 permits the repository's guarded, disposable local Supabase stack as
Phase 2 verification evidence, with guarded Cloud TEST required before any
production deployment. Phase 3 introduces the same classes of migration, RLS,
RPC, grant, tenant-isolation, and authorization work for provider, specialty,
and procedure configuration. Restricting the existing local safety contract to
Phase 2 would force a policy gap or an unreviewed workaround for Phase 3.

The project owner wants the established local feedback loop to continue, but
without expanding its scope to later phases by implication or weakening any
Cloud TEST, synthetic-data, target-separation, or production protections.

## Options considered

### A. Require Cloud TEST for every Phase 3 checkpoint

This retains a single remote verification path but makes routine migration and
RLS feedback depend on hosted connectivity and increases the chance of test
target contention. It provides no safety improvement over ADR-020's guarded
local target for Phase 3's additive configuration work.

### B. Reuse the local workflow informally

This preserves fast feedback but leaves the authoritative documents in
conflict, risks treating Phase 2-only authorization as a general permission,
and makes Phase 3 acceptance evidence ambiguous.

### C. Extend the guarded local workflow narrowly to Phase 3

This preserves the existing explicit local-only command guards and synthetic
data requirements while making local evidence valid only for the separately
approved Phase 3 checkpoints. Cloud TEST stays a mandatory pre-production
gate. This is the selected option.

## Decision

ADR-020's local workflow contract applies to the approved Phase 3 Provider,
Specialty & Procedure Foundation plan in addition to Phase 2.

For each accepted Phase 3 database/RLS/RPC checkpoint, local verification may
be acceptance evidence only when all relevant local reconstruction, pgTAP,
authorization, application, migration-lint, secret-scan, and independent-review
requirements pass against deterministic synthetic data. The approved commands
remain exactly `db:start:local`, `db:stop:local`, `db:reset:local`,
`db:provision:local`, and `test:db:local`; their existing local-target guards
must not be broadened or bypassed.

This amendment does not authorize local verification for Phase 4 or later. It
does not authorize local production data, hosted credentials, direct database
writes, Supabase MCP access to the local stack, a public deployment, or
production provider/patient use. Phase 4 local object storage is separately
authorized by ADR-022 (MinIO).

Guarded Cloud TEST remains mandatory immediately before production deployment.
That pre-production gate must run the same committed migrations and relevant
database suites, hosted generated-type check, managed Auth/security checks, and
synthetic E2E/manual QA against the designated Cloud TEST project. A local pass
is not a managed-platform proof and never replaces any separate production gate.

## Consequences

- Phase 3 can use the same fast, fail-closed local migration/RLS loop as Phase
  2 after its plan is independently reviewed and explicitly accepted.
- Phase 3 local acceptance remains bounded to the approved plan and must record
  exact verification evidence plus independent review.
- Existing scripts, target guards, Git-authoritative migrations, non-production
  pgTAP provisioning, seed rules, and Cloud TEST controls remain unchanged.
- Any later phase requires its own accepted decision before relying on local
  verification as acceptance evidence.

## Required verification

1. `scripts/local-supabase-command.test.mjs` and the local command guard tests
   continue to reject non-loopback/hosted targets.
2. `scripts/remote-database-test-guard.test.mjs` continues to require the
   verified Cloud TEST target and explicit confirmation for remote commands.
3. Phase 3's registered pgTAP suites run through `test:db:local` following
   local start/reset/provision, using only committed synthetic fixtures.
4. The Phase 3 acceptance review records local verification separately from the
   deferred Cloud TEST pre-production evidence.

## Revisit triggers

Revisit this decision if the local target guard cannot prove loopback-only
execution, local and Cloud TEST behavior materially diverge, Phase 3 needs a
new environment class, or a later phase seeks local acceptance evidence. Any
change must preserve Git-authoritative migrations, RLS, tenant isolation,
synthetic-only fixtures, and the mandatory guarded Cloud TEST pre-production
gate.
