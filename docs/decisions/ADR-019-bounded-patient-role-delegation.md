# ADR-019 — Bounded Delegation of Fixed Patient-Capable System Roles

**Status:** Accepted — explicitly approved 2026-08-19
**Date:** 2026-08-19
**Scope:** Workforce invitation and member-role assignment for `DENTIST` and
`RECEPTIONIST`
**Related:** ADR-003, ADR-017, `SECURITY_ARCHITECTURE.md` §11.6,
`plans/002-patient-foundation.md`

## Context

Phase 1 requires an actor to hold every permission in a role before inviting or
assigning that role. This permission-superset rule prevents a role manager from
delegating authority they do not possess.

Phase 2 deliberately grants `patient.demographics.read` and
`patient.demographics.write` to the fixed `DENTIST` and `RECEPTIONIST` system
roles while keeping `OWNER` and `ADMIN` outside patient records. Applying the
Phase 1 rule without amendment deadlocks an owner-only organization: its owner
cannot provision the first patient-capable staff member unless the owner first
receives patient access, which would violate owner/clinician separation.

The exception must solve only that bootstrap/delegation problem. It must not
create a general route for owners, administrators, custom roles, or future
clinical permissions to escape the permission-superset rule.

## Decision

### 1. Preserve the permission-superset rule as the default

Invitation and direct member-role assignment continue to permit delegation when
the actor holds every permission in the target role organization-wide. Custom
roles and every system role outside the exact exception below use this rule with
no change.

### 2. Permit one exact missing-permission exception

An actor may delegate a role despite missing permissions from that role only
when all of these conditions are true in current database state:

1. the actor is an active member of the target active organization;
2. the actor holds `security.manage` organization-wide;
3. the target role is a global system role (`organization_id is null` and
   `is_system = true`);
4. the target role code is exactly `DENTIST` or `RECEPTIONIST`; and
5. every target-role permission the actor lacks is exactly
   `patient.demographics.read` or `patient.demographics.write`.

The check uses the role's complete live permission set. A later grant of any
other permission the actor lacks—including a clinical permission—makes the
exception fail closed until a separately reviewed ADR and migration explicitly
change the allowlist.

This exception authorizes delegation only. It does not grant either patient
permission to the actor and does not make ownership or administration evidence
of patient-record access.

### 3. Retain every surrounding authorization control

The shared predicate changes only the permission-superset decision:

- workforce invitation still requires `user.invite`;
- direct assignment still requires `role.manage`;
- high-impact entry points remain AAL2-gated;
- the organization authorization advisory lock is acquired before the live
  delegation decision and mutation;
- role ownership, organization membership, target membership, branch existence,
  branch access, and role scope remain validated;
- direct self-assignment remains denied;
- an inviter cannot use the exception to invite their own verified email;
- sensitive-role and sensitive-target rules remain in force;
- cross-tenant targets and custom roles fail closed; and
- each successful invitation finalization or role assignment writes its existing
  sanitized audit event atomically with the authorization rows.

The service-role invitation lifecycle remains a narrow trusted workflow. Its
untrusted Server Action verifies a current AAL2 session before any service-role
operation and records the authenticated actor. Finalization rechecks that same
actor, the target role's live permissions, and organization/branch scope under
the organization lock before membership or role rows and the audit event commit.
The service role is not accepted as delegation authority by itself.

### 4. Use one shared database predicate

The additive Phase 2 migration introduces one private predicate for the live
role-permission delegation decision. Invitation option listing, invitation
scope validation, preparation/finalization, and `public.set_member_role` must use
that same predicate so the UI cannot offer a role the mutation rejects and one
path cannot silently become broader than another. Preparation rejects the
inviter's current verified email; finalization rejects an Auth user equal to the
recorded inviter and rechecks the live verified email before authorization rows
commit.

The accepted Phase 1 baseline migrations are not edited. The Phase 2 object
migration replaces only the affected functions. Because PostgreSQL preserves an
existing function's ACL across `CREATE OR REPLACE FUNCTION`, the migration opens
with one contiguous block that revokes every affected existing signature from
`PUBLIC`, `anon`, `authenticated`, and `service_role` before any helper or body
changes. Every later object-migration boundary therefore has all affected entry
points unreachable rather than exposing a mixed old/new authorization surface.
New helpers receive statement-adjacent default-privilege revokes. A registered
grant-terminal migration restores only the approved function signatures to their
existing caller roles.

## Consequences

- An owner-only organization can provision its first dentist or receptionist at
  AAL2 without the owner becoming patient-capable.
- `ADMIN` cannot use the exception by default because it lacks
  `security.manage` and `role.manage`; ordinary invitation behavior remains
  bounded by its live permissions.
- Future permissions added to `DENTIST` or `RECEPTIONIST` may intentionally stop
  owner delegation until their delegation semantics are reviewed.
- The exception is inspectable in one predicate and test matrix rather than
  duplicated role-code branches.

## Rejected alternatives

### Grant patient permissions to `OWNER`

Rejected because ownership is administrative authority, not patient-care
authority. It would expose patient records to non-clinical future SaaS owners.

> **Superseded by ADR-025 (2026-08-27).** The project owner has decided OWNER
> is the highest-authority organization principal with organization-wide
> clinical and administrative access. ADR-025 grants every catalog permission
> to the system OWNER role while preserving tenant isolation, audit, AAL2, and
> record-integrity invariants. This supersession does not change ADR-019's
> delegation mechanics or any other role's scope.

### Add a general patient-role delegation permission

Rejected for this phase because existing `security.manage` already identifies
the default high-impact owner boundary. A new extensible delegation capability
would expand the catalog and policy surface without a current use case.

### Create a second invitation/provisioning lifecycle

Rejected because it would duplicate the existing Auth delivery, failure cleanup,
membership activation, locking, and audit machinery and create divergent paths.

## Required verification

Starting from an owner-only organization, tests must prove:

- AAL2 owner invitation and direct assignment of a different dentist and
  receptionist succeed and produce the existing single atomic success audit;
- the owner still cannot read patient base tables or patient read RPCs;
- AAL1, direct self-assignment, invitation to the actor's verified email,
  cross-tenant targets, unauthorized/inactive branches, and arbitrary custom
  roles fail;
- the exception fails if the fixed role is given any other permission the actor
  lacks;
- the opening object-migration statements revoke every affected externally
  callable signature before the first helper/body change, and every later
  boundary keeps them unreachable until the registered terminal migration
  restores exact callers;
- actors without `security.manage` remain subject to full permission-superset
  delegation; and
- failed authorization produces no membership/role mutation and no success
  audit event.
