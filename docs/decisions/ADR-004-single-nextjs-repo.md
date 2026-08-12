# ADR-004 — Single Next.js Repository for Public Website + Private EMR

**Status:** Accepted
**Date:** 2026-08-12
**Scope:** Repository/application topology
**Related:** `TECHNICAL_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `plans/001-foundation.md`

## Context

The public marketing/booking-facing site and the private EMR are intentionally allowed to share one Next.js codebase at this stage rather than starting as separate deployable applications or a monorepo. This ADR records the topology already scaffolded (commit `e110ea9`) and reflected in the current route-group structure under `src/app/`.

## Decision

1. **One Next.js application repository.** No Turborepo, workspaces, or a second deployable app are introduced in Phase 1.
2. **Route groups are the trust/UI boundary, not a database or deployment boundary:**
   - `src/app/(public)/` — anonymous marketing/public content.
   - `src/app/(auth)/` — login, invitation acceptance, MFA enrollment/challenge.
   - `src/app/(emr)/` — the authenticated, tenant-scoped private EMR shell and settings.
   - `src/app/auth/` — non-UI Supabase Auth route handlers (for example `auth/confirm`).
3. **A route group is an organizational convenience, not an authorization mechanism.** Every protected route/action under `(emr)` and `(auth)` still independently enforces the layered authorization model from ADR-003; a route group cannot itself grant or withhold access.
4. **Domain/business logic stays out of page components** (`src/features/`, `src/lib/`, `src/server/`), so the public site and the private EMR can be split into separate applications later without a rewrite, if that becomes necessary.
5. **No public workforce sign-up route exists.** The public route group never exposes staff/workforce account creation; that remains invitation-only under `(auth)`.

## Consequences

- Deployment, build, and CI configuration stay simple (one app, one `next build`), which matches the scale of Phase 1.
- If the public site and EMR later need materially different scaling, caching, deployment cadence, or trust boundaries, that is a deliberate migration, not an incidental refactor — the domain-logic separation in decision 4 is what keeps that migration tractable.
- Reviewers checking route-group placement should still verify server-side authorization on every `(emr)`/`(auth)` route; the folder name is documentation, not proof.

## Revisit triggers

Revisit only when a concrete requirement (for example, materially different scaling needs, a separate team/deployment cadence, or a hard trust-boundary requirement between the public site and the EMR) justifies splitting into multiple applications or a monorepo. Any such change requires an ADR and explicit human approval, consistent with `plans/001-foundation.md` §5.1.
