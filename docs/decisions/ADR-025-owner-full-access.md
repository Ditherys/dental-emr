# ADR-025 — OWNER is the highest-authority organization principal

**Status:** Accepted — 2026-08-27

**Date:** 2026-08-27

**Decision owner:** Project owner

**Supersedes:** The "owner is not a clinician" assumption in
`docs/plans/002-patient-foundation.md` §"Owner is not clinician" and the role
matrix, and the clinical-access wording in `docs/SECURITY_ARCHITECTURE.md` §9.4.
It also supersedes the rejected alternative "Grant patient permissions to
`OWNER`" recorded in [ADR-019](ADR-019-bounded-patient-role-delegation.md);
ADR-019's delegation mechanics remain in force.

**Amends:** [ADR-019](ADR-019-bounded-patient-role-delegation.md)

**Related:** `MASTER_PRODUCT_PLAN.md`, `SECURITY_ARCHITECTURE.md`,
`DATABASE_DESIGN.md`, `plans/002-patient-foundation.md`

## Context

The original patient-foundation design deliberately kept `OWNER` and `ADMIN`
free of patient demographics and clinical access: ownership was treated as
administrative authority, and a dentist-owner was expected to hold a separate
clinical role. ADR-019 even rejected granting patient permissions to `OWNER`.

The project owner has made an explicit product decision to change that:
`OWNER` is the highest-authority clinic principal and must be able to access
all information and functionality within their organization across all
branches, including clinical records, without holding a separate `DENTIST`
role. Full access must not become a security bypass: tenant isolation,
authentication, AAL2 where required, audit logging, optimistic versioning,
immutable/finalized record protections, amendment history, destructive-action
safeguards, and database constraints all remain enforced. `ADMIN` and the
other roles keep their existing scopes.

## Decision

1. **`OWNER` resolves to the complete organization-level permission set.**
   The system `OWNER` role is granted every permission in the catalog (a
   centralized `role_permissions` grant, not scattered `role === "OWNER"`
   checks in application code). Both the database authorization predicates and
   the application authorization state read this shared source of truth, so the
   database and application contracts agree by construction.

2. **OWNER authority is organization-wide and cross-branch.** An
   organization-wide `OWNER` needs no explicit per-branch membership; the
   existing org-wide-role semantics already resolve at every active branch of
   the owner's organization. Branch isolation for other roles is unchanged.

3. **No bypass of security invariants.** OWNER still requires valid
   authentication, AAL2 where already required (for example role assignment),
   passes the same optimistic-version and immutable/finalized-record checks,
   is audited for high-impact actions, cannot rewrite audit history, and cannot
   perform direct base-table DML that was never granted. No RLS is disabled and
   no service-role shortcut is introduced.

4. **Other roles are unchanged.** `ADMIN` does not receive the expansion.
   `DENTIST`, `RECEPTIONIST`, `DENTAL_ASSISTANT`, `VISITING_SPECIALIST`, and
   `BILLING` retain their existing matrices. Dentist specialties remain
   separate from RBAC roles.

5. **Future permissions automatically resolve for OWNER.** A pgTAP invariant
   asserts every permission in the catalog is granted to the system `OWNER`
   role, so any future organization-scoped permission must be granted to OWNER
   or that invariant fails.

## Consequences

### Benefits

- the owner can operate every clinic function, including patient and clinical
  records, from a single login;
- centralized permission data keeps application and database authorization in
  agreement with no per-module owner special cases;
- tenant isolation and all security invariants remain explicit and tested.

### Tradeoffs and risks

- a compromised owner account has broad clinical reach (mitigated by AAL2 on
  sensitive operations, audit, and least-privilege habits for non-clinical
  admins);
- ADR-019's demographic-only delegation exception is now moot for the owner
  (the owner is a true superset), while remaining in the predicate for other
  `security.manage` holders;
- this reverses the earlier privacy stance that non-clinical owners should not
  read patient records by default.

## Implementation

- Forward migration `20260827014600_owner_full_access.sql` grants the system
  `OWNER` role every catalog permission idempotently.
- pgTAP suites updated to assert OWNER full access, cross-branch scope,
  cross-tenant denial, unchanged other-role scopes, and preserved invariants
  (no base-table DML, append-only audit, AAL2).
- Documentation updated in `plans/002-patient-foundation.md` and
  `SECURITY_ARCHITECTURE.md`.

## Revisit triggers

Revisit if the owner decides to narrow owner clinical access (for example to a
read-only scope), if a future multi-tenant SaaS owner model requires separate
administrative vs. clinical personas, or if audit evidence shows owner accounts
should be further constrained.