# ADR-003 — Authorization Defense in Depth

**Status:** Accepted
**Date:** 2026-08-12
**Scope:** Server authorization, Row Level Security, privileged-action gating
**Related:** `SECURITY_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `plans/001-foundation.md`, ADR-002

## Context

No request may be authorized merely because it carries a client-supplied `organization_id`, `branch_id`, role, or user ID, and no single layer (browser, application server, or database) may be the sole authorization boundary. This ADR records the layered model already implemented across the application authorization layer (commit `e777889`), the foundation RLS policies (commit `a827f07`), their AAL2 hardening (commit `d77a9e7`), and the authorization UX layer (commit `a82046a`).

## Decision

1. **Two independent, mandatory layers exist for every protected operation:**
   - **Application/server authorization** — reusable helpers (`src/lib/authorization/`, `src/lib/auth/identity.ts`) that verify the authenticated user, load active membership, and validate organization/branch/permission context before any domain operation runs.
   - **PostgreSQL Row Level Security** — enabled on every exposed tenant table, independently enforcing the same tenant/branch/permission boundary as a backstop if application logic has a bug. Neither layer substitutes for the other.
2. **Client-supplied identifiers are never authorization proof.** `organization_id`, `branch_id`, role, and user ID arriving from the browser are, at most, a UI hint; the server/database derive the authorized values independently.
3. **The branch selector is a workflow-context selector, not a permission grant.** Changing the selected branch in the UI (including direct `localStorage`/URL tampering) cannot expand what a user is authorized to do; every server query/action re-validates access.
4. **Privileged mutations use AAL2-gated, transactional RPCs rather than direct authenticated table writes.** `20260812051000_harden_foundation_admin_mutations.sql` revokes direct authenticated `INSERT`/`UPDATE`/`DELETE` grants on `roles`, `role_permissions`, `branch_memberships`, `member_roles`, `organizations`, and `branches`, replacing them with `private.require_aal2()`-gated functions (`create_branch`, `set_role_permission`, `set_member_role`, `set_branch_membership`, `update_organization_member_status`) that also write the corresponding audit event atomically.
5. **`SECURITY DEFINER` helpers set an explicit, safe `search_path`** and expose only the minimum required `EXECUTE` privilege; they are not used to make RLS easier to bypass.
6. **Navigation/UI permission checks are UX only.** The desktop/mobile shell derives visible navigation from server-verified authorization state, but hiding a control is not the enforcement boundary — the underlying route/server action independently denies a crafted request (P1-20, commit `a82046a`).
7. **Suspended/offboarded membership takes precedence over an existing browser session.** A valid Supabase Auth session with no active organization membership loses protected shell/route access on the next server-verified request, ahead of any MFA/UI state.
8. **No RLS bypass as normal architecture.** Ordinary user operations are never routed through a secret/service-role client merely to avoid designing a policy.

## Consequences

- Every new tenant table introduced in a later phase must ship RLS and negative authorization tests in the same change, not as follow-up work.
- A bug in one layer (for example, a missing application-level permission check) does not by itself grant cross-tenant access, because RLS independently denies it, and vice versa.
- High-impact administrative operations are both AAL2-gated and audited in the same transaction, so there is no window where a privileged mutation succeeds without a corresponding `audit_events` row.

## Revisit triggers

Revisit only if a concrete, reviewed requirement demonstrates the two-layer model is insufficient (for example, a class of operation RLS cannot practically express). Any weakening of either layer requires an ADR and explicit human approval; it must not be done to make a test pass or a feature ship faster.
