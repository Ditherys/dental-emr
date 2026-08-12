# ADR-002 — Organization/Branch Tenancy Model

**Status:** Accepted
**Date:** 2026-08-12
**Scope:** Multi-tenancy boundary and operational-location model
**Related:** `DATABASE_DESIGN.md`, `TECHNICAL_ARCHITECTURE.md`, `plans/001-foundation.md`, ADR-003

## Context

The first real deployment is one dental organization with two branches, but the architecture must support future SaaS customers and an arbitrary, dynamically addable number of branches per organization without schema changes. This ADR records the tenancy model already implemented in migrations `20260812050100_organizations_and_branches.sql`, `20260812050200_profiles_and_organization_members.sql`, and `20260812050400_branch_memberships_and_member_roles.sql` (commit `d2b8edb`).

## Decision

1. **Organization is the SaaS tenant boundary.** `organizations` has no hard-coded row ID anywhere in application code; a `slug` identifies but does not authorize.
2. **Branch is an organization-owned operational location**, not a separate tenant, deployment, or database. `branches.organization_id` is a foreign key; `unique (organization_id, slug)` and `unique (organization_id, code)` constraints scope uniqueness per tenant.
3. **Adding a branch is a row insert through an authorized workflow**, not a schema change, a new Supabase project, or a deployment. The `create_branch` RPC (introduced in `20260812051000_harden_foundation_admin_mutations.sql`) derives `organization_id` from the authenticated caller's authorized context — never from client-supplied input.
4. **Branch count is uncapped.** No constraint, UI, or application logic assumes exactly one or two branches.
5. **`profiles`** are linked 1:1 to `auth.users.id` and are distinct from organization membership; a profile existing does not imply any organization access.
6. **`organization_members`** represents active/suspended membership in a specific organization (`unique (organization_id, user_id)`); authorization always considers current `membership_status`, not merely that a membership row exists.
7. **`branch_memberships`** lets one person belong to multiple branches within one organization (`unique (branch_id, organization_member_id)`), with a database-enforced tenant-consistency rule: a branch membership cannot reference a branch and an organization member from different organizations.
8. **Organization-wide roles/permissions are independent of branch scope.** An organization-wide grant is valid at every branch in that organization; a branch-scoped grant is not promoted to organization-wide scope by client state (see ADR-003).

## Consequences

- Later product domains (patients, scheduling, billing, etc.) attach to `organization_id` (and `branch_id` where relevant) using this same model rather than inventing a parallel tenancy concept.
- Synthetic fixtures deliberately include a second organization (`Org B`) specifically to prove isolation, not because a second real customer exists yet.
- A "Branch 3 next year" or "Branch 12 later" requires only an authorized `create_branch` call, never a migration.

## Revisit triggers

Revisit only if a future requirement (for example, data-residency-driven per-tenant databases) cannot be satisfied by row-level tenancy. Any such change requires a new ADR and is expected to be a major, deliberately reviewed migration, not an incremental patch.
