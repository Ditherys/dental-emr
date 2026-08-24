# P2-02 Patient Identity Schema Design

## Goal

Introduce an empty, organization-owned patient identity root that is safe by
default and ready for later patient workflows, without exposing patient data to
the browser yet.

## Chosen approach

P2-02 uses one additive fail-closed object migration, one exact grant-terminal
migration, pgTAP coverage, and generated database types. It creates the
`public.patients` table and links
`public.audit_events.patient_id` to it. It does not create a route, RPC,
contact/relationship table, patient write workflow, search workflow, merge
workflow, or any browser table grants.

The migration enables RLS during table creation, immediately revokes every
patient-table and new helper privilege from `PUBLIC`, `anon`, `authenticated`,
and `service_role`, and then adds RLS policies using the patient-specific
shared-directory predicate. The terminal migration grants only `EXECUTE` on
that private helper to `authenticated`, which PostgreSQL requires to evaluate
the stored policy expression. `private` schema usage remains revoked, so the
helper is not a Data API RPC. The policies are defence in depth only: no browser
role receives a patient-table privilege at this checkpoint. The project owner
explicitly approved this narrow correction on 2026-08-24.

## Data model

`patients` is organization-owned. It has a UUID primary key and tenant-safe
unique `(organization_id, id)` key for future composite foreign keys. Required
identity fields are `patient_number`, `first_name`, `last_name`, and
`birth_date`; optional fields are middle name, suffix, preferred name, address
components, registration sex, and preferred branch. It includes status,
archive timestamp, timestamps, and a positive optimistic-lock version.

The database owns immutable, stored normalization for first name, last name,
and full name. Browser clients never supply the normalized columns. Names and
address fields are bounded exactly as the approved Phase 2 plan specifies;
birth dates cannot predate 1900-01-01 or occur after the transaction's current
date; registration sex is either null or one of `female`, `male`, `intersex`,
`unknown`, and `not_recorded`; and active/inactive/archived status must agree
with the archive timestamp. Same-name, same-birth-date people remain valid—no
duplicate-detection uniqueness constraint is introduced.

`preferred_branch_id` is nullable and uses composite tenant referential
integrity to `branches(organization_id, id)`, so a patient cannot name another
organization's branch. `audit_events.patient_id` is nullable and receives the
same `(organization_id, patient_id)` tenant-safe foreign key. The audit metadata
allowlist is unchanged: no patient name, birth date, contact data, or change
snapshot is stored there.

Required query paths are unique `(organization_id, patient_number)`, tenant
birth-date lookup, and `(organization_id, normalized_last_name,
normalized_first_name, birth_date)`. Audit gets `(organization_id, patient_id,
occurred_at desc)`. Trigram search is explicitly deferred until measured need.

## Authorization and safety

RLS evaluates the P2-01 patient-specific shared-directory helper. A valid
patient demographic grant can satisfy policy only for the caller's active
organization, with the existing branch-scope semantics; it never promotes a
forged organization or branch value. The test suite may create a temporary
test-only `SELECT` grant within its transaction to exercise policy behavior,
then rolls it back. Committed database privileges remain empty for browser and
service roles, and direct DML is denied at the privilege layer.

No sensitive identity value is placed in comments, exception messages, logs, or
audit metadata. The migration is additive and non-destructive because the new
table is empty at creation.

## Verification

pgTAP will prove schema shape, bounds, generated normalization, non-unique
namesakes, tenant-safe preferred-branch and audit links, indexes, RLS enabled,
and privilege denial. The matrix covers two organizations, a receptionist,
dentist, owner, visiting specialist, suspended user, anon, forged tenant/branch
attempts, and direct DML. Database migration privilege lint, schema lint,
advisors, type generation, and the guarded Cloud TEST suite must pass before
P2-02 is accepted.

## Explicit exclusions

P2-02 does not add contacts, guardian/family relationships, patient creation or
updates, duplicate-review behavior, list/search/detail RPCs or UI, clinical
data, patient merge, hard delete, browser grants, or elevated service-role
patient access.
