# ADR-027 — Guarded forward-only local verification for billing and odontogram foundations

**Status:** Accepted — explicitly approved by the project owner 2026-08-28

**Date:** 2026-08-28

**Decision owner:** Project owner

**Amends:** [ADR-020](ADR-020-local-supabase-hybrid-development.md) and
[ADR-021](ADR-021-phase3-local-supabase-verification.md)

**Related:** `docs/plans/billing-ledger-provider-compensation-plan.md`,
`docs/plans/odontogram-integration-plan.md`, `SECURITY_ARCHITECTURE.md`, and
`DATABASE_DESIGN.md`

## Context

The accepted billing and odontogram plans introduce additive schema, RLS, RPC,
audit, and clinical-history work after the locally verified Phase 2 and Phase 3
checkpoints. Their plans prohibit resetting local data because forward-only
migration compatibility must be exercised. The project owner has expressly
authorized implementation on `main`, with no Cloud TEST activity through the
O4 periodontal-foundation boundary.

## Decision

1. The existing guarded, disposable, synthetic-only local Supabase workflow is
   authorized as implementation and acceptance evidence for the accepted billing
   tasks B0-B11 and odontogram tasks O0-O4 only.
2. `db:migrate:local` is the only new local database command. It invokes the
   reviewed pinned CLI as `supabase db push --local`, through the existing
   Docker Desktop and selector guards. It is forward-only and must reject
   linked, Cloud, DEV, TEST, production, URL, and project-reference targets.
3. `db:reset:local` remains available only under its prior ADR authority and is
   explicitly prohibited for B0-B11 and O0-O4. No implementation verification
   may wipe or reseed the local database to make a migration pass.
4. Cloud TEST commands, target guards, and pre-production obligations remain
   unchanged. They are deferred by the owner only until after O4; this ADR does
   not authorize a Cloud TEST bypass, production deployment, hosted direct SQL,
   production patient use, or production credentials.
5. Git migrations remain authoritative. Local verification must use committed
   migration files, deterministic synthetic data, RLS, pgTAP/authorization
   tests, migration lint, and independent review appropriate to each task.

## Consequences

- Billing can establish the ledger prerequisite and odontogram can complete its
  O0-O4 domain/schema foundations without a Cloud TEST action in this window.
- O5 and later remain outside the current owner authorization.
- Before production or a later hosted checkpoint, the existing guarded Cloud
  TEST migration, type, security, and synthetic E2E gates remain mandatory.

## Required verification

1. The local command test proves `migrate` is exactly `db push --local` and
   refuses non-allowlisted or remote-target arguments.
2. The package command delegates only to the guarded local runner.
3. Every task records exact local evidence and residual Cloud TEST gate in
   `docs/AI_HANDOFF.md`.

## Revisit triggers

Revisit if a command cannot prove a Docker Desktop local target, a task needs a
destructive reset, a hosted environment is required, or implementation moves
beyond O4. Any revision must preserve the Cloud TEST pre-production gate.
