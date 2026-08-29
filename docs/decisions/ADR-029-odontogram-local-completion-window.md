# ADR-029 — Odontogram local completion window

**Status:** Accepted — explicitly authorized by the project owner 2026-08-29

**Date:** 2026-08-29

**Decision owner:** Project owner

**Amends:** [ADR-027](ADR-027-billing-local-verification.md) and the execution
boundary recorded in `docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`

**Related:** [ADR-028](ADR-028-odontogram-renderer-domain-boundary.md),
`docs/specs/odontogram-integration.md`, and
`docs/plans/odontogram-integration-plan.md`

## Context

O0 evidence was recorded after completion of billing B0-B11. The project owner
reviewed the recovered interrupted-session status on 2026-08-29, explicitly
re-accepted the O0 source pin and renderer/domain boundary, and authorized
completion of the remaining odontogram integration tasks locally. Hosted Cloud
TEST access is intentionally deferred for this implementation window.

Some O1-O13 files and forward migrations were already present in the local
working tree and local migration history when the interrupted session was
recovered. They remain unaccepted implementation drafts until they pass the
plan, security, schema, clinical, and verification reviews required below.

## Decision

1. O0 is re-accepted. O1-O14 implementation may proceed in plan order on
   `main`, without a branch or worktree.
2. ADR-027's guarded, deterministic, synthetic-only local Supabase workflow is
   extended to the O1-O14 local implementation and verification work.
3. Only forward migrations through `db:migrate:local` are authorized. The
   already-applied draft migrations must be corrected with later migrations;
   they must not be rewritten to change local history. `db:reset:local` remains
   prohibited.
4. Cloud TEST database, hosted E2E, responsive/accessibility, advisor, and
   security checks are deferred, not waived. No hosted or production command is
   authorized by this ADR.
5. O14 may be recorded only as **locally implemented and verified; Cloud TEST,
   independent release review, and final owner acceptance pending** while the
   hosted gate is deferred. It must not be described as release-ready,
   production-ready, or approved for provider/patient use.
6. Git migration files remain authoritative. All exposed tenant tables require
   RLS and zero unsafe base grants; all browser-reachable clinical operations
   require application authorization plus narrow audited database RPCs.
7. Deterministic synthetic data only. No production-derived, de-identified, or
   real patient/clinical/financial data may be used.

## Required local completion evidence

- O1-O14 plan-requirement trace with every locally testable acceptance item.
- Forward migration, pgTAP, concurrency, generated-type, unit/component/action,
  build, lint, migration-security, secret, dependency-audit, and diff-hygiene
  evidence.
- Authenticated E2E specifications and responsive/accessibility coverage must be
  authored and guard-discoverable even though execution remains deferred.
- Independent clinical/security/schema/code review findings resolved or
  explicitly recorded as a blocking residual.
- `docs/AI_HANDOFF.md` must distinguish fresh local evidence from deferred
  Cloud TEST evidence.

## Deferred release gate

Before production deployment or any real provider/patient use, a separately
authorized disposable Cloud TEST run must apply the reviewed migrations and run
the guarded database, generated-type, lint/advisor, E2E, responsive,
accessibility, and security suites. Final independent review and explicit owner
acceptance remain mandatory after that evidence exists.

## Revisit triggers

Revisit if implementation needs a destructive migration, a different renderer
or dependency, hosted write access, production data, a change to canonical
clinical semantics, or a bypass of any Cloud TEST pre-production gate.

