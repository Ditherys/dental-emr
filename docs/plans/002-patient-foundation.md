# Dental EMR Phase 2 — Patient Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Do not begin implementation until this
> plan has received independent review and explicit human approval.

**Status:** Accepted for ordered implementation — independently reviewed and
explicitly approved 2026-08-19
**Plan ID:** `002-patient-foundation`
**Execution IDs:** `P2-00` through `P2-12`
**Goal:** Deliver a secure, organization-level patient identity and demographics
foundation without entering scheduling or clinical-record scope.
**Architecture:** Patients are owned by the organization and may be used at any
authorized branch. Next.js server code performs application authorization;
Supabase RLS and narrow transactional RPCs independently enforce tenant,
permission, audit, and concurrency boundaries. Browser-reachable roles receive
no direct patient-table privileges.
**Tech stack:** Next.js 16.3 App Router, React 19, strict TypeScript, Supabase
PostgreSQL/RLS/Auth, Zod, React Hook Form, TanStack Query, TanStack Table,
Vitest/Testing Library, pgTAP, and Playwright.
**Specification sources:** `docs/plans/001-foundation.md` §48;
`docs/MASTER_PRODUCT_PLAN.md` §§9, 32–41, and 44;
`docs/TECHNICAL_ARCHITECTURE.md` §§5–7, 22, and 26–28;
`docs/SECURITY_ARCHITECTURE.md` §§9, 11, 20, 35, and 36.1;
`docs/DATABASE_DESIGN.md` §§3, 7, 9, 29–32, and 36;
`docs/FRONTEND_ARCHITECTURE.md` §§11–14 and 30.

---

# 0. P2-00 — Plan authority and approval gate

## Purpose

Reconcile the accepted Phase 1 state with the product roadmap and establish the
only authorized Phase 2 implementation scope.

## Current-state evidence

- Phase 1 is formally accepted in `docs/PHASE1_ACCEPTANCE_REVIEW.md`.
- At plan authoring, `HEAD`, `main`, and `origin/main` are all commit `96b908f`.
- The accepted schema consists of nine committed migrations: the eight-file
  secure baseline plus branch update/archive.
- The repository contains no patient, provider, appointment, clinical, billing,
  inventory, communication, analytics, or AI product tables.
- Phase 1 provides Supabase SSR Auth, invitation-only workforce onboarding,
  organization/branch tenancy, permission-based authorization, RLS helpers,
  AAL2 gates for high-impact administration, append-oriented audit events,
  guarded Cloud TEST migrations, pgTAP, generated types, Vitest, Playwright, and
  responsive private-shell primitives.
- The high-level roadmap's original Phase 2 (authentication, clinic, roles, RLS,
  audit, invitation, and basic admin UI) was incorporated into and completed by
  the detailed Phase 1 foundation plan. `docs/plans/001-foundation.md` §48 is
  therefore the controlling next-scope instruction and explicitly names
  `docs/plans/002-patient-foundation.md`.

## Scope

- Produce and independently review this plan.
- Reconcile stale current-phase text in agent/handoff documentation.
- Begin `P2-01` only after explicit plan approval.

## Non-scope

- Any migration, application route, UI component, dependency installation,
  remote database write, or Phase 2 fixture.

## Database, authorization, backend, and frontend impact

None. `P2-00` is documentation-only.

## Tests and acceptance criteria

- [x] An independent reviewer confirms the plan matches the authoritative docs
  and actual repository state.
- [x] The reviewer reports no unresolved Critical or High scope, tenancy,
  authorization, migration, or privacy finding.
- [x] ADR-019 is accepted as part of the same explicit approval decision; its
  status is not left `Proposed` when `P2-01` begins.
- [x] The human owner explicitly approves the plan before `P2-01` begins.
- [x] `docs/AI_HANDOFF.md` records the approval and authorized next task.

## Security considerations

Plan approval does not waive any production gate and does not authorize real
patient data. All examples, fixtures, screenshots, and test identities remain
synthetic.

## Dependencies and reviewer checkpoint

Depends on accepted Phase 1. This is the first mandatory independent review
checkpoint; stop after approval rather than automatically starting `P2-01`.

---

# 1. Phase 2 objective

Phase 2 creates the first patient domain slice while preserving the accepted
foundation's tenant and privilege boundaries. At completion, authorized staff
can create, find, view, and maintain a single organization-level patient
identity, demographic profile, contact methods, and guardian/relationship data.
The same patient remains available for authorized work at either current or
future branch without duplication by branch.

This phase is an engineering foundation for later clinical and scheduling work;
it is not a production-patient launch approval.

# 2. Architectural invariants

1. **Organization is the tenant.** Every patient row and patient child row has an
   `organization_id`; cross-organization references are rejected by composite
   foreign keys or an equally strong database constraint.
2. **Patient identity is organization-level.** `preferred_branch_id` and an
   action's acting branch are attribution/context, never patient ownership.
3. **Branch membership alone grants no patient access.** A caller must also hold
   the relevant patient permission through an organization-wide role or an
   active branch-scoped role attached to an active branch membership.
4. **A branch-scoped patient permission deliberately opens the organization's
   shared patient directory.** This is necessary for a receptionist at Branch A
   to find an existing organization patient first registered at Branch B. It
   does not open Branch B schedules, resources, encounters, billing, or other
   branch-owned records. This special semantic must live in named patient
   authorization helpers, not in the generic permission helper.
5. **OWNER is the highest-authority principal.** Per ADR-025, `OWNER` receives
   organization-wide clinical and administrative access, including patient
   demographics and clinical records, across every branch of its organization.
   OWNER authority does not bypass tenant isolation, authentication assurance,
   auditability, record-integrity protections, or other security invariants.
   `ADMIN` does not receive the same expansion.
6. **Visiting specialists fail closed.** `VISITING_SPECIALIST` receives no
   patient directory permission in Phase 2 because provider/case assignment does
   not exist yet. Assigned-case access belongs to a later provider/scheduling
   plan.
7. **Defense in depth remains mandatory.** Server authorization derives identity
   and membership; RLS protects every patient base table; supported read and
   mutation RPCs invoke the same live authorization predicates, derive tenant
   scope from trusted target rows/authorized branches, and reauthorize.
8. **No browser patient table access.** `authenticated`, `anon`, and `PUBLIC`
   receive no patient base-table privileges. Supported reads and writes use
   narrow RPCs with live database authorization; service-role is not used by
   ordinary patient application code.
9. **Grant-last remains mandatory.** Each Phase 2 migration set creates objects
   fail-closed, immediately revokes inherited privileges, enables RLS with the
   table, and places approved grants only in its registered terminal migration.
10. **Duplicate detection warns; it does not define identity.** Normalized name
    plus date of birth is not unique and never triggers an automatic merge.
11. **Concurrent writes are database-controlled.** Duplicate creation checks,
    patient-number allocation, primary-contact selection, and status/version
    changes use locks/constraints/transactions. Frontend prechecks are UX only.
12. **Supported patient record opens and every patient mutation are audited.**
    Audit rows contain opaque IDs and action codes, never names, contact values,
    birth dates, notes, query strings, or clinical content.
13. **No hard delete or merge.** Patients and mutable child rows are archived;
    merge/export/clinical amendment rules remain later high-impact workflows.
14. **No real data.** DEV/TEST, Git, logs, screenshots, prompts, and tickets use
    synthetic data only. Production remains blocked by the security architecture.
15. **Patient-role delegation is narrow administration, not patient access.** An
    AAL2-authenticated actor with the existing administrative authority may
    provision only the fixed `DENTIST` and `RECEPTIONIST` system roles despite
    not holding their two patient-demographics permissions. The exception grants
    no patient permission to the actor, never applies to custom roles or later
    clinical permissions, and otherwise preserves the Phase 1 superset rule.

# 3. Phase scope

## In scope

- Patient permission catalog and conservative system-role grants.
- A reviewed, additive amendment for AAL2-gated delegation of the fixed patient-
  capable system roles without granting patient access to owners.
- Organization-level `patients` records and organization-wide patient numbers.
- Normalized search keys and exact duplicate-warning signals.
- Patient contact methods.
- Guardian/family/emergency relationships without a shared family clinical row.
- RLS, composite tenant FKs, constraints, indexes, and fail-closed grants.
- Transactional patient creation, demographics updates, contact/relationship
  mutations, archive/reactivate, and audit events.
- Optimistic concurrency for stale form submissions.
- Server-side paginated patient list/search and a bounded patient workspace.
- Responsive create/edit/list/detail UI with error/loading/empty/stale states.
- Synthetic two-organization fixtures and negative authorization tests.
- Local migration/schema/security verification, with hosted type, Auth, and E2E
  verification deferred to the pre-production Cloud TEST gate.

## Explicit non-scope

- Providers, provider branches, specialties, procedures, availability, resources,
  chairs, appointments, holds, or scheduling UI.
- Medical conditions, allergies, medications, medical-history forms, diagnoses,
  encounters, clinical notes, odontogram, clinical alerts, or prescriptions.
- Patient merge, full-record export/print/PDF, files/R2, imaging, signatures, or
  consent documents.
- Acquisition sources, referrals, booking channels, website booking, public
  patient matching, reminders, SMS, email, Messenger, or Google Calendar.
- Treatment plans, billing, inventory, analytics, AI/MCP, or migration of paper
  records.
- A generic timeline table. Later domain objects will supply their own events;
  the patient workspace will not invent placeholder timeline data.
- Production projects, production credentials, real clinic/workforce identities,
  real patient data, or satisfaction of the remaining production security gates.
- The deferred MFA-removal projection, paid-tier leaked-password protection,
  GitHub Advanced Security, audit retention/archive, and CSP nonce conversion.
- The accepted H-5 residual (no dedicated branch edit/archive Playwright flow);
  Phase 2 patient work must not absorb it without separate test-only approval.

# 4. Locked data and authorization design

## 4.1 `patients`

Planned columns:

```text
id uuid primary key
organization_id uuid not null
patient_number text not null
first_name text not null
middle_name text null
last_name text not null
suffix text null
preferred_name text null
birth_date date not null
sex_at_registration text null            -- female | male | intersex | unknown | not_recorded
address_line1 text null
address_line2 text null
city text null
province text null
postal_code text null
preferred_branch_id uuid null
status text not null                    -- active | inactive | archived
version integer not null default 1
created_by_user_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
archived_at timestamptz null
normalized_first_name text generated/stored
normalized_middle_name text generated/stored
normalized_last_name text generated/stored
normalized_full_name text generated/stored
```

Required constraints/indexes:

- primary key on `id`;
- unique `(organization_id, id)` for tenant-safe child FKs;
- unique `(organization_id, patient_number)`;
- composite FK `(organization_id, preferred_branch_id)` to
  `branches(organization_id, id)`;
- non-empty/bounded values: names/preferred name 120 characters, suffix 40,
  address lines 160, city/province 100, and postal code 20;
- `birth_date >= date '1900-01-01'`; a fail-closed database trigger and every
  write RPC reject a date later than the transaction's current date;
- `sex_at_registration` is null or one of the five values documented above;
- status/archive timestamp equivalence and `version > 0`;
- `(organization_id, normalized_last_name, normalized_first_name, birth_date)`;
- `(organization_id, patient_number)` and `(organization_id, birth_date)` query
  paths; add trigram search only after measured need and separate extension
  review.

Name + birth date is deliberately not unique. Canonical stored normalization is
owned by one immutable database helper and is used by duplicate/write RPCs, so
the browser never supplies stored normalized values. The bounded search RPC uses
a small TypeScript mirror of the same contract for input UX; shared test vectors
are executed against both implementations and Cloud TEST to prevent drift. The Phase 2
contract trims and collapses whitespace, normalizes Unicode to a single form,
uses Unicode NFKC, lowercases without locale-specific transliteration, replaces
each Unicode punctuation/whitespace run with one ASCII space, and preserves only
letters/numbers separated by those spaces. It does not remove diacritics or
claim culturally perfect identity matching.

The duplicate contract has exactly three independent signals:

1. `NAME_DOB`: exact equality on organization, normalized first name,
   normalized last name, and birth date. Middle name, suffix, and preferred name
   do not participate.
2. `MOBILE`: exact equality with an active `MOBILE` contact's canonical
   normalized value in the organization.
3. `EMAIL`: exact equality with an active `EMAIL` contact's trimmed,
   Unicode-normalized, ASCII-lowercased value in the organization.

Name/DOB matching includes active, inactive, and archived patients so staff can
reactivate rather than accidentally recreate a record. Mobile/email signals
ignore archived contact rows. A candidate matches when any applicable signal
matches; signals are combined with `OR`, not required together. Invalid or empty
optional mobile/email input is rejected or omitted rather than treated as a
match key.

Every duplicate operation returns at most 10 candidates ordered by patient
status (`active`, `inactive`, `archived`), patient number, then patient ID. The
result contains `patientId`, `patientNumber`, `displayName`, `birthDate`,
`status`, and `matchedSignals`, plus one response-level `truncated` boolean.
Stored mobile/email values, addresses, audit data, and clinical data are never
returned by duplicate review; the caller already knows the submitted contact
value. Candidate selection remains tenant-scoped and permission-checked.

Patient numbers use an organization-scoped locked counter in the non-exposed
`private` schema and the format `P-000001`, `P-000002`, and so on. The counter is
transactional, is never granted to a browser role, and is not an authorization
identifier.

## 4.2 `patient_contacts`

This table is the canonical source for patient mobile/email/landline values;
`patients` does not duplicate those writable fields.

```text
id uuid primary key
organization_id uuid not null
patient_id uuid not null
contact_type text not null               -- MOBILE | EMAIL | LANDLINE | OTHER
label text null
value text not null
normalized_value text null/generated
is_primary boolean not null default false
status text not null                     -- active | archived
version integer not null default 1
created_at timestamptz not null
updated_at timestamptz not null
archived_at timestamptz null
```

Use a composite patient FK, contact value limit 320, label limit 80,
status/archive equivalence, an index
on `(organization_id, patient_id, status)`, normalized mobile/email indexes, and
a partial unique index allowing at most one active primary contact per patient
and contact type. Primary-contact mutations lock the patient's relevant contact
set before demoting/promoting rows.

`normalized_value` is non-null only for `MOBILE` and `EMAIL`; a database check
enforces that equivalence. `LANDLINE` and `OTHER` retain only the bounded trimmed
display value and do not participate in duplicate lookup.
For `MOBILE`, normalize input with Unicode NFKC, trim it, remove spaces,
hyphens, parentheses, and periods, then require one of these forms: Philippine
`09` plus nine digits, `63` plus a ten-digit number beginning with `9`, a ten-
digit number beginning with `9`, or `+` followed by 7–15 digits. Store all valid
forms as `+` plus country code and subscriber digits; the three Philippine local/
country-code forms canonicalize to `+63` plus the ten-digit number beginning with
`9`. Any other value is invalid for `MOBILE` rather than silently guessed.
For `EMAIL`, apply Unicode NFKC, trim, then require one ASCII email value within
320 characters. Map only ASCII `A`–`Z` to `a`–`z` across the complete value and
reject any code point that remains non-ASCII after NFKC. This is a locale/
collation-independent ASCII mapping, not Unicode case folding or locale-sensitive
lowercasing. The database helper is authoritative and the TypeScript UX mirror
implements the same mapping.
Duplicate predicates compare these canonical values by exact equality;
`LANDLINE` and `OTHER` never create a mobile/email duplicate signal.

## 4.3 `patient_relationships`

Relationships are directional and never create a shared family clinical record.

```text
id uuid primary key
organization_id uuid not null
patient_id uuid not null
related_patient_id uuid null
external_contact_name text null
external_mobile text null
external_email text null
relationship_type text not null          -- PARENT | GUARDIAN | CHILD | SPOUSE |
                                         -- DEPENDENT | EMERGENCY_CONTACT |
                                         -- HOUSEHOLD_CONTACT | OTHER
is_legal_guardian boolean not null default false
can_receive_communications boolean not null default false
can_consent boolean not null default false
status text not null                     -- active | archived
version integer not null default 1
created_at timestamptz not null
updated_at timestamptz not null
archived_at timestamptz null
```

Exactly one of `related_patient_id` or `external_contact_name` is present.
External names are limited to 160 characters, mobile to 50, and email to 320.
Both
patient references use `(organization_id, id)` composite FKs; self-reference is
rejected. `external_mobile`/`external_email` are allowed only for an external
contact and use the same normalization contracts as patient contacts. Notes and
free-form consent assertions are excluded from Phase 2.

Index `patient_relationships` on `(organization_id, patient_id, status)` for the
tenant-scoped active-child path used by patient detail. This index is required at
schema creation rather than deferred until the table grows.

## 4.4 Audit extension

Add nullable `patient_id` to `audit_events`, backed by composite
`(organization_id, patient_id)` referential integrity and an
`(organization_id, patient_id, occurred_at desc)` index. Do not widen the audit
metadata allowlist for names, contacts, birth dates, or change snapshots.

Required actions include:

```text
patient.created
patient.created_duplicate_override
patient.viewed
patient.demographics.updated
patient.demographics.updated_duplicate_override
patient.contact.created
patient.contact.created_duplicate_override
patient.contact.updated
patient.contact.updated_duplicate_override
patient.contact.archived
patient.relationship.created
patient.relationship.updated
patient.relationship.archived
patient.archived
patient.reactivated
```

## 4.5 Permission matrix

Add the stable permission codes:

```text
patient.demographics.read
patient.demographics.write
```

Default grants:

| System role | Demographics read | Demographics write | Phase 2 rationale |
|---|---:|---:|---|
| DENTIST | yes | yes | continuity across the shared organization patient population |
| RECEPTIONIST | yes | yes | registration, identity, contacts, guardians, duplicate prevention |
| OWNER | yes | yes | highest-authority principal: organization-wide clinical and administrative access (ADR-025) |
| ADMIN | no | no | minimum necessary; explicit additional role/custom grant is required |
| DENTAL_ASSISTANT | no | no | clinic policy is unresolved; fail closed |
| VISITING_SPECIALIST | no | no | assigned-case model does not exist yet |
| BILLING | no | no | billing identity projection belongs to a later reviewed plan |

Do not seed or grant clinical permissions merely to make the receptionist and
dentist matrices look different. Clinical permissions and provider linkage are
introduced together in their later phase; until then there is no clinical table
for either role to access.

## 4.6 Bounded patient-role delegation

ADR-019 amends only the Phase 1 permission-superset delegation rule. The same
private predicate must be used by invitation option listing, invitation
validation/finalization, and direct member-role assignment:

```text
ALLOW delegated role permissions when:
  actor holds every permission in the target role organization-wide
  OR (
    actor holds security.manage organization-wide
    AND target role is a global immutable system role
    AND target role code is exactly DENTIST or RECEPTIONIST
    AND every target permission missing from the actor is exactly one of:
      patient.demographics.read
      patient.demographics.write
  )
```

The exception does not replace the surrounding controls. Invitation still
requires `user.invite`; direct assignment still requires `role.manage`; custom
and `OWNER`/`ADMIN` roles retain their existing rules. Both paths retain AAL2,
the organization authorization advisory lock, active membership, role/tenant and
branch validation, sensitive-target checks, anti-self-assignment, live role-
permission revalidation, safe errors, and atomic success audit. The service-role
invitation path remains callable only after its Server Action verifies AAL2 and
records the authenticated actor; finalization rechecks that same actor and the
live role permission set under the organization lock.

The allowlist is fail-closed against future scope. If either fixed role gains any
permission the actor lacks other than the two demographics permissions,
delegation is denied until a separately reviewed ADR/migration changes the
allowlist. The exception never grants the actor either demographics permission,
never permits invitation to the actor's own verified email, and never permits
direct self-assignment.

## 4.7 Patient permission semantics

Create paired database/application helpers with one explicit rule:

```text
ALLOW shared patient demographics when:
  active organization membership
  AND active organization
  AND (
    organization-wide role grants patient permission
    OR active branch-scoped role grants patient permission
       AND matching active branch membership/branch exists
  )
```

This helper does not accept a browser-supplied organization as proof. A patient
target derives organization from the row. New-patient operations derive it from
an authorized acting branch. A selected branch from local storage or a query
parameter is always revalidated server-side and in the RPC.

Preferred-branch writes use PATCH semantics. Omission preserves the stored
`preferred_branch_id`, including an existing preference for a same-organization
branch the current actor cannot access. Explicit `null` clears it. Supplying a
UUID sets a new preference and therefore requires an active same-organization
branch the caller can access. An update must not require the browser to echo an
inaccessible existing UUID, and an arbitrary same-tenant or foreign UUID is not
accepted merely because preferred branch is non-authoritative.

List/search returns the entire authorized organization patient population even
when an acting branch is selected; branch selection labels the current workflow
and audit context, not a patient partition. Mutations require a concrete active
acting branch; an `All Branches` UI selection must prompt for one before save.

## 4.8 Read and mutation boundaries

- `authenticated` and `service_role` receive no `SELECT`, `INSERT`, `UPDATE`, or
  `DELETE` privilege on `patients`, `patient_contacts`, or
  `patient_relationships`; revoke Supabase defaults explicitly. Direct Data API
  base-table reads therefore fail at the privilege layer even for a user who may
  use the supported patient interfaces. Phase 2 has no elevated service-role
  patient workflow; RLS remains enabled and independently tested as a second
  database boundary.
- Server pages/actions first call the application patient authorization helper.
- List/search uses one bounded `search_patients` RPC returning only the approved
  list projection. Detail uses one `get_patient_detail` RPC. Both derive the
  actor from `auth.uid()`, call the same live patient-authorization predicate used
  by RLS, derive tenant from authorized database rows, and are
  `SECURITY DEFINER` functions with `set search_path = ''`, fully qualified
  references, immediate execution revocation, and only exact `authenticated`
  `EXECUTE` grants from a reviewed terminal migration. `service_role` receives no
  patient RPC execution grant. The functions do not trust definer rights as
  authorization; their explicit predicate must succeed before any projection or
  audit insert.
- `get_patient_detail` selects the authorized bounded detail projection and
  inserts exactly one `patient.viewed` audit event in the same transaction before
  returning. A missing/denied patient, failed authorization check, or failed
  audit insert returns no detail payload; application code must not perform a
  separate unaudited table read.
- Search terms and returned demographics are never placed in audit/application
  logs. Phase 2 audits record opens, not one audit row per search result.
- All writes use `SECURITY DEFINER` RPCs with `set search_path = ''`, immediate
  privilege revocation from `PUBLIC`, `anon`, `authenticated`, and `service_role`,
  fully qualified names, actor from `auth.uid()`, live permission checks, tenant
  derivation, safe errors, atomic audit insertion, and only exact
  `authenticated` execution grants in registered terminal migrations.
- Ordinary create/edit/contact operations do not add a new AAL2 gate; production
  workforce MFA is a separate launch requirement. Archive/reactivate requires
  AAL2 because it changes record availability. Merge/export remain deferred and
  will require their own AAL2 gates.

## 4.9 Concurrency contracts

- Every mutation that can add, remove, or change a duplicate signal uses the same
  organization-scoped patient-duplicate advisory transaction lock. This includes
  `create_patient`, a name/DOB-changing demographics update, and create/update/
  archive of a mobile or email contact. The authoritative duplicate query runs
  only after that lock is acquired; a preflight duplicate RPC is UX only.
- Lock order is fixed: validate actor and acting-branch scope; acquire the
  organization patient-duplicate advisory lock; lock the target patient row when
  one exists; lock affected contact rows in ascending UUID order; then lock/
  update the patient-number counter if creation requires it. No duplicate-key
  mutation may take these locks in another order.
- Under the lock, create and applicable update RPCs re-evaluate all three exact
  signals against committed state while excluding the target patient itself.
  This intentionally serializes the clinic's short identity/contact transaction;
  revisit granularity only after measured contention.
- Without explicit duplicate confirmation, concurrent equivalent submissions
  yield at most one unreviewed mutation; the other returns a safe duplicate-
  warning result. Confirmed creation or update permits a legitimate match and
  emits the corresponding duplicate-override audit action instead of the normal
  mutation action.
- Organization patient-number allocation locks/updates its private counter in
  the same transaction as patient and initial-contact insertion.
- Every mutable row carries `version`. Update RPCs take `expected_version` and
  update only that version, incrementing on success. Zero-row stale updates map
  to a stable safe `STALE_VERSION` application error.
- Primary-contact changes serialize on the patient/contact set and are backed by
  the partial unique index.
- Archive/reactivate locks the patient row and rejects no-op or stale transitions.

## 4.10 Stable application/RPC contracts

The implementation may split files for readability, but it must preserve these
domain-facing contracts so later tasks do not redesign neighboring work:

```ts
type PatientAccessContext = {
  actingBranchId: string | null; // null only for an organization-wide grant
};

type PatientListQuery = PatientAccessContext & {
  query?: string;
  birthDate?: string;
  status?: "active" | "inactive" | "archived";
  sort: "name_asc" | "name_desc" | "patient_number_asc" | "updated_desc";
  page: number;     // one-based, integer >= 1
  pageSize: number; // integer 1..100
};

type PatientListItem = {
  patientId: string;
  patientNumber: string;
  displayName: string;
  birthDate: string;
  primaryMobile: string | null;
  primaryEmail: string | null;
  status: "active" | "inactive" | "archived";
};

type PatientDetail = {
  patientId: string;
  patientNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  birthDate: string;
  sexAtRegistration: "female" | "male" | "intersex" | "unknown" | "not_recorded" | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  preferredBranch: { branchId: string; name: string } | null;
  status: "active" | "inactive" | "archived";
  version: number;
  contacts: PatientContactDetail[];
  relationships: PatientRelationshipDetail[];
};

type PatientContactDetail = {
  contactId: string;
  contactType: "MOBILE" | "EMAIL" | "LANDLINE" | "OTHER";
  label: string | null;
  value: string;
  isPrimary: boolean;
  version: number;
};

type PatientRelationshipDetail = {
  relationshipId: string;
  relatedPatientId: string | null;
  relatedPatientDisplayName: string | null;
  externalContactName: string | null;
  externalMobile: string | null;
  externalEmail: string | null;
  relationshipType:
    | "PARENT"
    | "GUARDIAN"
    | "CHILD"
    | "SPOUSE"
    | "DEPENDENT"
    | "EMERGENCY_CONTACT"
    | "HOUSEHOLD_CONTACT"
    | "OTHER";
  isLegalGuardian: boolean;
  canReceiveCommunications: boolean;
  canConsent: boolean;
  version: number;
};

// Read DTOs omit organization IDs, normalized values, audit fields, and
// creator/system metadata. Detail returns active child rows only.

type PatientDemographicsInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  preferredName?: string;
  birthDate: string;
  sexAtRegistration?: "female" | "male" | "intersex" | "unknown" | "not_recorded";
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  preferredBranchId?: string;
};

type PatientDemographicsPatch = {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  preferredName?: string | null;
  birthDate?: string;
  sexAtRegistration?: "female" | "male" | "intersex" | "unknown" | "not_recorded" | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  preferredBranchId?: string | null; // omitted = preserve; null = clear
};

type CreatePatientInput = PatientDemographicsInput & {
  actingBranchId: string;
  initialMobile?: string;
  initialEmail?: string;
  duplicateConfirmed: boolean;
};

type UpdatePatientInput = PatientDemographicsPatch & {
  patientId: string;
  actingBranchId: string;
  expectedVersion: number;
  duplicateConfirmed: boolean;
};

type PatientContactInput = {
  patientId: string;
  actingBranchId: string;
  contactType: "MOBILE" | "EMAIL" | "LANDLINE" | "OTHER";
  label?: string;
  value: string;
  isPrimary: boolean;
  duplicateConfirmed: boolean;
};

type DuplicateSignal = "NAME_DOB" | "MOBILE" | "EMAIL";

type DuplicateCandidate = {
  patientId: string;
  patientNumber: string;
  displayName: string;
  birthDate: string;
  status: "active" | "inactive" | "archived";
  matchedSignals: DuplicateSignal[];
};

type DuplicateReview = {
  candidates: DuplicateCandidate[]; // deterministic, maximum 10
  truncated: boolean;
};

type PatientRelationshipInput = {
  patientId: string;
  actingBranchId: string;
  relatedPatientId?: string;
  externalContactName?: string;
  externalMobile?: string;
  externalEmail?: string;
  relationshipType:
    | "PARENT"
    | "GUARDIAN"
    | "CHILD"
    | "SPOUSE"
    | "DEPENDENT"
    | "EMERGENCY_CONTACT"
    | "HOUSEHOLD_CONTACT"
    | "OTHER";
  isLegalGuardian: boolean;
  canReceiveCommunications: boolean;
  canConsent: boolean;
};
```

Required service operations:

```text
findDuplicateCandidates(CreatePatientInput without duplicateConfirmed)
  -> DuplicateReview
createPatient(CreatePatientInput) -> { patientId, version }
listPatients(PatientListQuery) -> { rows: PatientListItem[], total, page, pageSize }
getPatient(patientId, PatientAccessContext)
  -> PatientDetail and exactly one atomic view audit, or neither
updatePatient(UpdatePatientInput) -> { patientId, version }
createPatientContact(PatientContactInput) -> { contactId, version }
updatePatientContact(contactId, expectedVersion, PatientContactInput)
archivePatientContact(contactId, patientId, actingBranchId, expectedVersion)
createPatientRelationship(PatientRelationshipInput) -> { relationshipId, version }
updatePatientRelationship(relationshipId, expectedVersion, PatientRelationshipInput)
archivePatientRelationship(relationshipId, patientId, actingBranchId, expectedVersion)
archivePatient(patientId, actingBranchId, expectedVersion) -> { patientId, version }
reactivatePatient(patientId, actingBranchId, expectedVersion) -> { patientId, version }
```

The public PostgreSQL functions mirror these inputs in snake_case, return only
the exact bounded read DTOs or opaque mutation IDs/versions, and never accept
organization ID, patient number, actor, role, audit action/result, normalized
values, created-at, updated-at, archive timestamp, or next-counter value. A
demographics patch must contain at least one mutable field; omitted fields are
preserved. Duplicate confirmation is accepted only by a mutation that reruns the
authoritative signals under the shared lock. Stable application errors are
`NOT_AUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`,
`DUPLICATE_REVIEW_REQUIRED`, `STALE_VERSION`, `INVALID_STATE`, and `FAILED`;
browser messages must not expose SQLSTATE, table/policy names, or foreign-row
existence.

# 5. Planned file map

Paths are locked by responsibility; implementation may add a narrowly necessary
co-located test/helper but must not reorganize unrelated Phase 1 code.

```text
docs/plans/002-patient-foundation.md                    phase authority
docs/AI_HANDOFF.md                                      rolling checkpoint
docs/decisions/ADR-019-bounded-patient-role-delegation.md delegation decision
supabase/migrations/<ts>_patient_permissions.sql        codes/role rows/delegation RPCs
supabase/migrations/<ts>_patient_permissions_grants.sql registered terminal
supabase/migrations/<ts>_patient_identity.sql           patients/audit link/RLS
supabase/migrations/<ts>_patient_contacts_relations.sql child tables/RLS
supabase/migrations/<ts>_patient_create.sql              counters/create/duplicate
supabase/migrations/<ts>_patient_create_grants.sql       terminal
supabase/migrations/<ts>_patient_reads.sql               search/detail-audit RPCs
supabase/migrations/<ts>_patient_reads_grants.sql        terminal
supabase/migrations/<ts>_patient_demographics_write.sql update RPC
supabase/migrations/<ts>_patient_demographics_write_grants.sql terminal
supabase/migrations/<ts>_patient_children_write.sql      contact/relation RPCs
supabase/migrations/<ts>_patient_children_write_grants.sql terminal
supabase/migrations/<ts>_patient_lifecycle.sql           AAL2 lifecycle RPCs
supabase/migrations/<ts>_patient_lifecycle_grants.sql    terminal
scripts/approved-final-grants.mjs                        exact grant allowlist
scripts/provision-e2e-identities.mjs                     patient-role TEST logins
supabase/seed.sql                                        synthetic patient fixtures
supabase/tests/patient_schema.test.sql                   schema/constraints
supabase/tests/patient_authorization.test.sql            RLS/RPC negative matrix
supabase/tests/patient_workflows.test.sql                audit/stale/duplicate flows
src/lib/authorization/policy.ts                          patient scope semantics
src/lib/authorization/index.ts                           server orchestration
src/lib/patients/schema.ts                               shared Zod form/query schemas
src/lib/patients/types.ts                                domain DTOs/result types
src/lib/patients/data.ts                                 bounded read-RPC adapters
src/lib/patients/service.ts                              RPC adapters/error mapping
src/app/(emr)/patients/page.tsx                          route shell
src/app/(emr)/patients/loading.tsx                       list loading state
src/app/(emr)/patients/patient-list.tsx                  responsive data surface
src/app/(emr)/patients/new/page.tsx                      create route
src/app/(emr)/patients/new/actions.ts                    create action
src/app/(emr)/patients/new/patient-form.tsx              create/duplicate UX
src/app/(emr)/patients/[patientId]/page.tsx              bounded workspace
src/app/(emr)/patients/[patientId]/loading.tsx           workspace loading
src/app/(emr)/patients/[patientId]/actions.ts            edit/lifecycle actions
src/app/(emr)/patients/[patientId]/*                      focused owned components
src/components/layout/navigation-items.ts                permission-aware Patients link
e2e/patients.spec.ts                                     hosted synthetic journeys
e2e/support/environment.ts                               patient-role E2E config
e2e/README.md                                             synthetic identity contract
e2e/responsive-accessibility.spec.ts                     patient responsive checks
.github/workflows/ci.yml                                 patient-role TEST secrets only
```

Do not use placeholder migration timestamps literally. Choose monotonically
increasing UTC timestamps when each approved task begins; never rename an
already-applied migration.

# 6. Ordered implementation tasks

## P2-01 — Patient permission contract

### Purpose

Add the minimum permission vocabulary, bounded patient-role delegation
amendment, and application policy semantics before any patient table becomes
reachable.

### Preconditions

`P2-00` and ADR-019 are independently approved; tree is clean; current
migrations/types pass.

### Scope

- Add `patient.demographics.read/write` and conservative default role grants.
- Implement ADR-019 through one shared database delegation predicate used by
  invitation choices/validation/finalization and direct role assignment.
- Replace affected Phase 1 functions additively; do not edit an accepted/applied
  baseline migration.
- Add typed `PermissionCode` values.
- Add pure and server orchestration helpers for shared-patient permission
  semantics without weakening generic branch authorization.

### Non-scope

Patient tables, UI, clinical permissions, new role-management UI, providers,
assigned-case access, generic custom-role delegation exceptions, or patient
access for owners/admins.

### Database impact

One fail-closed additive object migration plus one registered terminal migration.
The object migration inserts the permission catalog/default grants, adds the
private shared delegation predicate, and uses `CREATE OR REPLACE` for only the
affected invitation-option, validation, preparation/finalization, and
`set_member_role` functions. Preparation rejects the inviter's current verified
email; finalization rejects an invited Auth user equal to the recorded inviter
and rechecks the live verified email. Because `CREATE OR REPLACE FUNCTION`
preserves an existing function's ACL, the migration begins with a contiguous
pre-revoke block covering every affected existing signature for `PUBLIC`, `anon`,
`authenticated`, and `service_role` before any helper or function body changes.
Thus every statement boundary exposes either the complete accepted old behavior
or no affected entry point, never a mixed old/new authorization surface. New
helpers receive statement-adjacent default-privilege revokes. The terminal
migration restores only the approved signatures to their existing caller roles.
Do not modify the nine accepted Phase 1 migration files. Verify existing custom
roles and unrelated final grants are unchanged.

### Authorization impact

Branch membership without an exact role permission remains insufficient.
Organization/branch role scope is evaluated live; suspended/removed membership,
archived branch, revoked branch access, and cross-tenant roles fail closed.
The full permission-superset rule remains the default. Its only exception
requires organization-wide `security.manage`, a global system role whose code is
exactly `DENTIST` or `RECEPTIONIST`, and a missing-permission set that is a subset
of exactly `patient.demographics.read/write`. Invitation still requires
`user.invite`; assignment still requires `role.manage`; both remain AAL2-gated,
locked, non-self, tenant/branch-validated, live-rechecked, and atomically audited.

### Backend/frontend impact

Extend authorization types/helpers and invitation option filtering; no new
administrative screen is required. Do not show a Patients nav item until `P2-09`
provides the route.

### Tests

Vitest permission and AAL2 invitation-action matrix; pgTAP catalog/default-grant,
delegation predicate, invitation finalization, direct assignment, audit, and
negative authorization assertions; migration privilege lint; generated-type
check after applying to Cloud TEST. Starting from an owner-only organization,
exercise both fixed roles and both provisioning paths.

### Acceptance criteria

- [ ] Dentist/receptionist receive only the two planned patient permissions.
- [ ] Owner/admin/assistant/visiting-specialist/billing defaults remain denied.
- [ ] At AAL2, an owner-only organization can invite and assign a dentist or
  receptionist to another member, with one existing atomic success audit.
- [ ] The same owner cannot self-assign either role, invite their own verified
  email, delegate a custom role through the exception, delegate across tenants,
  or use a foreign/inactive branch.
- [ ] AAL1 cannot use the invitation Server Action or `set_member_role`; direct
  browser execution of service-only invitation functions remains unavailable.
- [ ] Temporarily adding any other permission the owner lacks to either fixed
  role makes the exception fail closed until that test change rolls back.
- [ ] Before the first helper/body change, every affected externally callable
  signature has been revoked as one opening block. At every later object-
  migration statement boundary no replaced function retains browser/service
  execution from its old ACL; only the registered terminal migration restores
  the exact approved callers.
- [ ] Provisioning another user does not grant either patient permission to the
  owner; composed patient-table/RPC denial is proved in P2-02, P2-05, and P2-12.
- [ ] A branch-scoped patient grant is recognized only with a matching active
  branch membership; it is not promoted by the generic permission helper.
- [ ] Revocation/suspension is reflected on the next request/statement.

### Security considerations

Test forged organization/branch IDs and an organization-scoped role from another
tenant. The exception predicate must inspect the target role's live complete
permission set, not trust its code alone. Do not grant any patient permission to
`OWNER`, `ADMIN`, `anon`, or service-role.

### Dependencies and reviewer checkpoint

Depends on `P2-00`. Independent authorization review is required before `P2-02`.

## P2-02 — Patient identity schema, RLS, and audit linkage

### Purpose

Create the organization-owned patient identity root while it is still empty and
fail-closed.

### Preconditions

`P2-01` approved; migration lint/Cloud TEST target guards green.

### Scope

Create `patients`, normalization helper/generated columns, constraints/indexes,
fail-closed RLS, timestamps/versioning, and `audit_events.patient_id`.

### Non-scope

Contacts, relationships, writes, duplicate workflow, search UI, clinical data,
merge, or hard delete.

### Database impact

One fail-closed object migration plus one registered grant-terminal migration.
The terminal grants only `EXECUTE` on the private shared-patient RLS helper to
`authenticated`, because PostgreSQL evaluates stored policy expressions with
the querying user's privileges. `private` schema usage remains revoked, so the
helper is not a Data API RPC. Enable RLS in the create statement sequence;
immediately revoke table/function defaults; add composite keys/FKs and the
patient/audit indexes. Keep all patient-table privileges revoked from `PUBLIC`,
`anon`, `authenticated`, and `service_role`; supported reads arrive in P2-05
through exact user-context RPC grants. This correction was explicitly approved
by the project owner on 2026-08-24 after independent planning identified the
otherwise unevaluable-policy conflict.

### Authorization impact

RLS uses the patient-specific shared-directory helper. No browser table policy
may compensate for a missing grant, and no browser table grant may compensate
for a policy: direct base-table access remains denied at the privilege layer
while the RLS predicate is tested independently. Cross-tenant preferred-branch
and audit-patient links are impossible.

### Backend/frontend impact

Generated types only; no application route.

### Tests

pgTAP schema/constraint/RLS tests for two orgs, receptionist, dentist, owner,
visiting specialist, suspended user, anon, forged tenant/branch, and direct DML;
migration lint, schema lint, advisors, and type generation. RLS behavior tests
may grant the minimum test-only `SELECT` inside their enclosing transaction and
must roll it back; committed browser grants remain empty.

### Acceptance criteria

- [ ] Namesake patients with the same birth date can coexist.
- [ ] Patient number and composite tenant keys are unique.
- [ ] Direct authenticated/anon Data API `SELECT` is privilege-denied for every
  patient role; controlled policy tests separately prove Org A cannot satisfy
  RLS for Org B and denied roles satisfy it for no rows.
- [ ] Direct authenticated DML is rejected at the grant layer.
- [ ] SQL privilege probes prove `service_role` also has no direct patient-table
  privilege; Phase 2 introduces no service-role patient function grant.
- [ ] Audit rows cannot point at another organization's patient.

### Security considerations

Review normalization for denial-of-service inputs and false identity assumptions;
bound all text. Ensure patient PII is absent from database comments/errors/logs.

### Dependencies and reviewer checkpoint

Depends on `P2-01`. Independent migration/RLS review is mandatory before `P2-03`.

## P2-03 — Patient contacts and guardian relationships schema

### Purpose

Add tenant-safe child data required to register adults and minors without
duplicating contact sources.

### Preconditions

`P2-02` approved with required local verification and dedicated review.

### Scope

Create `patient_contacts` and `patient_relationships`, contact normalization,
constraints, indexes, and fail-closed RLS with no browser table grants.

### Non-scope

Mutation RPCs/UI, consent documents, family billing, communication sending,
clinical history, or automatic inverse relationships.

### Database impact

One object migration; no browser grant-terminal migration is needed for this
table-only checkpoint. Composite FKs enforce patient/related-patient tenant
equality. Partial uniqueness controls primary contacts. Child rows use archive/
version/timestamp conventions and keep all base-table privileges revoked from
`PUBLIC`, `anon`, `authenticated`, and `service_role`. Create the required
`patient_relationships (organization_id, patient_id, status)` detail-query index
in this checkpoint.

### Authorization impact

Same demographics permission as the parent; no broader contact-directory
permission. A caller cannot use a child row to discover an otherwise denied
patient or tenant.

### Backend/frontend impact

Generated types only.

### Tests

pgTAP cross-tenant FK, self-relationship, exactly-one-related-party, required
relationship-index catalog shape, primary contact race constraint, RLS, anon,
suspended, and direct DML denial tests. Any test-only privilege used to isolate
RLS behavior exists only inside the pgTAP transaction and is rolled back.

### Acceptance criteria

- [ ] A minor may have an external guardian or a related patient guardian.
- [ ] A family relationship never combines two patient records.
- [ ] Two active primary mobiles for one patient cannot commit.
- [ ] Org A cannot attach an Org B patient/contact/guardian.
- [ ] The tenant-scoped active-relationship index exists with columns ordered
  `(organization_id, patient_id, status)`.
- [ ] Direct authenticated/anon Data API `SELECT` and DML against both child
  tables are privilege-denied; controlled tests separately exercise their RLS.
- [ ] SQL privilege probes prove `service_role` has no direct child-table access.

### Security considerations

Guardian flags are operational assertions, not signed consent. Do not add free
text notes or expose contact values in errors/audit metadata.

### Dependencies and reviewer checkpoint

Depends on `P2-02`. Independent schema/RLS review is mandatory before `P2-04`.

## P2-04 — Transactional patient creation and duplicate warning

### Purpose

Create a patient and initial contacts safely while preventing accidental
concurrent duplicates without blocking legitimate namesakes.

### Preconditions

`P2-03` approved; permission and schema tests green.

### Scope

Private patient-number counter; duplicate-candidate read RPC; transactional
`create_patient` RPC; initial mobile/email insertion; duplicate-confirmed path;
the exact three-signal/candidate contract from §4.1; shared organization patient-
duplicate lock; atomic audit event; stable service error/result mapping.

### Non-scope

Merge, background deduplication, fuzzy/trigram matching, public matching, UI, or
bulk import.

### Database impact

Private counter table/functions and public RPCs in a fail-closed object migration;
`EXECUTE` only to `authenticated` in a registered terminal migration. No table
read or DML grants and no patient function grant to `service_role`.

### Authorization impact

The RPC accepts an acting branch, derives its organization, requires exact
branch access plus patient write permission, and derives actor from `auth.uid()`.
No client-supplied organization, patient number, actor, audit result, or counter.

### Backend impact

Add shared Zod schema, DTOs, RPC adapter, and safe error codes
`DUPLICATE_REVIEW_REQUIRED`, `NOT_AUTHORIZED`, `INVALID_INPUT`, and `FAILED`.
Server validation repeats database validation.

### Frontend impact

None beyond types; UI arrives in `P2-10`.

### Tests

pgTAP success/denial/audit/number/duplicate-override tests for exact `NAME_DOB`,
`MOBILE`, and `EMAIL` predicates, candidate cap/order/fields, and archived-state
rules; Vitest validation and error mapping; guarded Cloud TEST two-client tests
proving two unconfirmed equivalent requests do not create two patients. Shared
PostgreSQL/TypeScript email vectors include ASCII case, full-width NFKC input,
whitespace, and rejected non-ASCII case-folding edge cases.

### Acceptance criteria

- [ ] Patient, initial contacts, counter update, and audit commit or roll back
  together.
- [ ] Simultaneous equivalent unconfirmed requests yield one create maximum.
- [ ] Confirmation allows a legitimate namesake and emits the override action.
- [ ] Candidate results are tenant-scoped and contain only minimum internal
  comparison fields, at most 10 rows, deterministic ordering, matched-signal
  codes, and an accurate truncation flag.

### Security considerations

Duplicate confirmation is not an authorization bypass; only an already
authorized writer can use it. Candidate search must not become public enumeration
or include clinical data.

### Dependencies and reviewer checkpoint

Depends on `P2-03`. Independent security/concurrency review is mandatory before
the create UI.

## P2-05 — Patient list, search, detail reads, and view audit

### Purpose

Provide bounded database-authorized read RPCs, deny direct base-table reads, and
record supported patient-detail opens without logging search terms or PII.

### Preconditions

`P2-04` approved; synthetic patients exist in TEST only.

### Scope

Server-side pagination/filtering/sorting by normalized name, patient number,
birth date, and normalized mobile/email; exact minimal list DTO; atomic detail+
view-audit RPC; safe not-found/denied equivalence.

### Non-scope

Provider, visit, appointment, balance, alert, referral, or timeline projections;
fuzzy search; exports; UI.

### Database impact

Add `search_patients` and `get_patient_detail` in one fail-closed object
migration, plus their exact `authenticated` terminal EXECUTE grants and only
index refinements proven necessary by query plans. Keep patient base-table
privileges revoked from browser and service roles; grant neither patient RPC to
`service_role`. Do not add `pg_trgm` without a separate ADR/extension review.

### Authorization impact

Server helper plus database authorization are both required. Each RPC derives
the actor from `auth.uid()`, invokes the same live predicate used by patient RLS,
and derives organization from authorized branches/target rows. Branch-scoped
authorized users see the shared organization directory, not other branch-owned
domains. Patient IDs from another org return the same safe result as nonexistent
IDs. RLS remains enabled and tested independently even though no browser role
can query the base tables directly.

### Backend impact

Implement `src/lib/patients/data.ts` only as validated RPC adapters, with stable
sorting (`last_name`, `first_name`, `patient_number`, then `id`), maximum page
size 100, and schema-validated results. Never issue a patient base-table query.
The detail RPC inserts exactly one `patient.viewed` event before returning; if
selection, authorization, or audit fails, the transaction returns no payload.

### Frontend impact

No page yet.

### Tests

Vitest pagination/query parsing/data mapping/error behavior and an assertion that
adapters call only the supported RPCs; shared normalization vectors that compare
the TypeScript search mirror with the database helper; pgTAP direct base-table
privilege denial, RPC authorization, detail+audit atomicity/exact-count/no-PII
assertions; Cloud TEST query-plan inspection with representative synthetic
volume, including the tenant-scoped active-relationship detail path.

### Acceptance criteria

- [ ] Search is paginated and deterministic; it never downloads the full patient
  population to filter in the browser.
- [ ] Org A search/detail cannot reveal Org B existence.
- [ ] `OWNER`/`ADMIN` without a separate patient-capable role cannot execute
  search/detail successfully, including after provisioning other staff.
- [ ] A direct authenticated Data API query against any patient base table is
  denied even for dentist/receptionist, while search returns only its list DTO.
- [ ] Detail RPC success returns data and exactly one bounded audit event with
  opaque IDs only; any audit failure returns neither data nor an audit row.
- [ ] Search terms, names, birth dates, mobile, and email never enter audit or
  application logs.

### Security considerations

Bound query length/page size and escape/parameterize filters through Supabase;
test wildcard-heavy and injection-like input as data, not SQL.

### Dependencies and reviewer checkpoint

Depends on `P2-04`. Independent read-path/IDOR/audit review before UI work.

## P2-06 — Optimistic demographics update

### Purpose

Allow safe corrections to mutable identity/demographic fields without silently
overwriting another staff member's changes.

### Preconditions

`P2-05` approved.

### Scope

Transactional update RPC with acting-branch validation, immutable tenant/id/
patient-number fields, PATCH/preserve semantics, `expected_version`, shared-lock
duplicate-warning recheck for a changed name/DOB key, explicit duplicate
confirmation, and atomic audit.

### Non-scope

Patient number edits, merge, hard delete, clinical history, lifecycle status, or
UI.

### Database impact

One RPC migration plus registered terminal grant. No new table privilege.

### Authorization impact

Write permission is rechecked from live role/membership state and the target
patient derives organization. A forged acting branch or target patient fails
without disclosing which input existed.
An omitted `preferred_branch_id` preserves the current value without requiring
access to that stored branch; explicit `null` clears it; a supplied UUID requires
current access to that active same-organization branch.

### Backend/frontend impact

Service adapter and server action contract only. Expose safe states for field
errors, duplicate review, stale version, denied, and generic failure.

### Tests

pgTAP immutable-column, tenant/branch forgery, preferred-branch tri-state, stale
version, concurrent edit, duplicate warning/override, atomic audit, and
suspension tests; Vitest action/error mapping. Guarded two-client tests cover
create-versus-update and two-patient update-versus-update with both callers
attempting the same normalized `NAME_DOB` key.

### Acceptance criteria

- [ ] Two edits from the same version cannot both commit.
- [ ] Concurrent create-versus-update and update-versus-update cannot bypass
  duplicate review: without explicit confirmation one writer receives
  `DUPLICATE_REVIEW_REQUIRED`; a confirmed writer records the override action.
- [ ] Branch A staff can update other demographics while preserving an existing
  Branch B preference they cannot access, but cannot set Branch B or a foreign/
  inactive branch; clearing requires explicit `null`.
- [ ] Audit failure rolls back the demographics update.
- [ ] Tenant, patient number, creator, and audit actor cannot be mass-assigned.

### Security considerations

Do not echo raw database/RLS errors or changed values. Treat XSS-like names and
addresses as inert text and rely on React escaping.

### Dependencies and reviewer checkpoint

Depends on `P2-05`. Independent mutation/concurrency review before `P2-07`.

## P2-07 — Contact and guardian mutation services

### Purpose

Provide atomic, stale-safe create/update/archive operations for patient contact
methods and relationships.

### Preconditions

`P2-06` approved.

### Scope

Contact and relationship RPCs; normalized-value maintenance; primary-contact
serialization; version checks; acting-branch validation; shared duplicate lock
and explicit duplicate confirmation for active mobile/email create or update;
atomic audit; safe server actions/services.

### Non-scope

Sending communications, verifying phone/email ownership, consent signatures,
automatic reciprocal relations, UI, or hard delete.

### Database impact

One object migration plus one grant-terminal migration. Mobile/email create,
update, and archive take the same organization duplicate lock and fixed lock
order as patient creation/demographics updates. Use row/advisory locks and
existing constraints rather than check-then-write application logic.

### Authorization impact

Requires demographics write permission on the parent patient context. All child
organization/patient identifiers are derived/rechecked; a child UUID cannot move
between patients or tenants.

### Backend/frontend impact

Add focused Zod schemas, DTOs, adapters, and safe stale/conflict errors.

### Tests

pgTAP cross-patient/tenant forgery, primary race, stale update, archived-parent,
audit rollback, revoked session, direct-DML, exact mobile/email duplicate
warning/override, and lock-order tests; Vitest schema/error mapping. Guarded two-
client tests cover create-versus-contact-update and two-patient contact-update
races on the same normalized mobile/email.

### Acceptance criteria

- [ ] Primary contact uniqueness holds during concurrent promotion.
- [ ] Concurrent creation/contact mutations cannot introduce the same active
  normalized mobile/email without one explicit duplicate confirmation.
- [ ] Archived children are read-only and omitted by default reads.
- [ ] Related patients are always in the same organization.
- [ ] Every successful mutation has exactly one patient-linked audit event.

### Security considerations

Contact values never appear in audit metadata or errors. `can_consent` is a
workflow flag, not legal proof; UI copy must not overclaim it.

### Dependencies and reviewer checkpoint

Depends on `P2-06`. Independent database/security review before lifecycle/UI.

## P2-08 — Patient archive and reactivate lifecycle

### Purpose

Provide a recoverable alternative to deletion while preventing stale or casual
record removal.

### Preconditions

`P2-07` approved.

### Scope

AAL2-gated archive/reactivate RPCs, patient row lock/version check, audit,
read/search status filtering, and safe service contracts.

### Non-scope

Hard delete, merge, deceased workflow, retention erasure, bulk archive, or
archiving clinical/legal history.

### Database impact

One lifecycle RPC migration plus registered terminal grants. No cascade delete.

### Authorization impact

Requires live demographics write permission, exact acting-branch access, and
AAL2 in both app and database. Archived patients remain visible only through an
explicit authorized status filter and are otherwise excluded.

### Backend/frontend impact

Service/action states and confirmation contract; actual dialogs appear in
`P2-11`.

### Tests

pgTAP AAL1 denial, stale/no-op transition, cross-tenant, audit atomicity, and
reactivation tests; Vitest safe error mapping.

### Acceptance criteria

- [ ] AAL1 cannot archive/reactivate even with write permission.
- [ ] Archive is reversible and never deletes patient/child/audit rows.
- [ ] Default list excludes archived patients; authorized explicit filter finds
  them without leaking across tenants.

### Security considerations

The lifecycle RPC must not accept actor/org/audit fields. Archive errors must not
confirm foreign patient existence.

### Dependencies and reviewer checkpoint

Depends on `P2-07`. Independent AAL2/lifecycle review before UI exposure.

## P2-09 — Permission-aware patient navigation and list/search UI

### Purpose

Expose a fast, dense, responsive patient-finding work surface to authorized roles.

### Preconditions

`P2-05` and `P2-08` read contracts approved; installed Next.js guide under
`node_modules/next/dist/docs/` reviewed for the exact App Router APIs used.

### Scope

Patients navigation item; `/patients` page; server-authorized shell; selected
branch workflow context; paginated/sortable list; search/filter controls;
loading/error/empty/denied states; archived filter for authorized writers.

### Non-scope

Dashboard KPIs, preview drawer, bulk actions, exports, clinical alerts, visit/
appointment columns, or whole-dataset virtualization.

### Database impact

None unless measured query evidence requires an index-only follow-up migration;
such a migration stays in this task and gets its own review.

### Authorization/backend impact

Navigation is UX only. Direct route and server data calls reauthorize. Selected
branch input is validated; no organization ID comes from search params/forms.

### Frontend impact

Add TanStack Table only after dependency necessity/license/security/compatibility
review. Desktop/iPad use a wide task-oriented table; 360/430 px phones use an
intentional compact list with name, patient number, birth date/age, primary
contact, and status—no squeezed desktop grid or tiny inline actions.

### Tests

Component tests for search/debounce/pagination/empty/error/permission behavior;
Playwright authorized/denied/direct-URL/cross-tenant cases; responsive overflow,
keyboard, focus, labels, touch targets, and axe checks.

### Acceptance criteria

- [ ] Authorized staff find synthetic patients by required fields within bounded
  server-side pages.
- [ ] Unauthorized roles see no nav item and cannot use the direct URL/API.
- [ ] Branch context never filters the shared patient identity population.
- [ ] No accidental page overflow or lost primary action at supported widths.

### Security considerations

Do not place PII in URLs beyond opaque patient UUIDs; search query is transient
and not logged. Protected responses remain `private, no-store` under the existing
private-route policy.

### Dependencies and reviewer checkpoint

Depends on `P2-05` and `P2-08`. Independent frontend/authorization review before
the creation flow.

## P2-10 — Create-patient UI and duplicate review

### Purpose

Let authorized staff register a patient with initial contacts while making
potential duplicates visible and deliberate.

### Preconditions

`P2-04` and `P2-09` approved.

### Scope

`/patients/new`; sectioned React Hook Form/Zod flow; required acting branch;
identity/address/initial contacts; duplicate candidate dialog; explicit
confirmation; success redirect; pending/error/stale permission states.

### Non-scope

Clinical intake, medical history, acquisition/referral, appointment creation,
file upload, multi-step patient portal, or merge.

### Database impact

None.

### Authorization/backend impact

Server action validates again, derives organization from authorized branch, and
calls only `create_patient`. Do not accept patient number, organization, actor,
role, or audit fields from FormData.

### Frontend impact

Use clear sections rather than a giant card/grid. Preserve entered values when a
duplicate warning appears. On phone, use single-column fields and keyboard-safe
actions; on iPad/desktop, group only semantically related fields.

### Tests

Component tests for validation, pending state, duplicate candidates, cancel/
confirm, and safe errors; Playwright normal create, duplicate warning/legitimate
override, forged branch, permission withdrawal before submit, responsive and
accessibility cases.

### Acceptance criteria

- [ ] First submission with a potential duplicate does not create a row.
- [ ] Cancel returns to editing with values preserved.
- [ ] Explicit confirmation creates a distinct patient and records override.
- [ ] A branch/user revocation between form load and submit fails closed.

### Security considerations

Candidate dialog shows only the minimum internal comparison context to an
authorized user. Never toast/log full patient details or include them in thrown
errors.

### Dependencies and reviewer checkpoint

Depends on `P2-04` and `P2-09`. Independent workflow/security review before
workspace editing.

## P2-11 — Patient workspace and edit UI

### Purpose

Provide a bounded patient workspace for demographics, contacts, guardians, and
lifecycle actions without placeholder clinical modules.

### Preconditions

`P2-06`, `P2-07`, `P2-08`, and `P2-10` approved.

### Scope

`/patients/[patientId]`; persistent identity header; Overview, Demographics,
Contacts, and Relationships sections; edit forms/dialogs; stale-version recovery;
duplicate-candidate review and explicit confirmation for changed name/DOB or
active mobile/email signals; archive/reactivate confirmation; loading/error/not-
found/denied states.

### Non-scope

Timeline, Clinical, Odontogram, Treatment Plans, Appointments, Files, Billing,
Communications, Documents, balance, alerts, or fabricated empty tabs.

### Database impact

None.

### Authorization/backend impact

Detail route reauthorizes and records view audit. Mutations carry only patient/
child ID, expected version, acting branch, and validated editable fields; RPCs
remain authoritative. A duplicate-review response does not mutate data; the UI
must submit an explicit confirmation through the same authoritative RPC after
staff review. Foreign/not-found targets share safe handling.

### Frontend impact

Use a patient-workspace archetype, not a dashboard/card grid. Keep patient
identity visible; use a readable desktop/iPad two-column composition only where
meaningful and an ordered single-column phone layout. Provide focus return,
unsaved-change warning where needed, and 44px touch-safe primary controls.
Preserve the pending edit while the bounded duplicate candidates are reviewed;
cancel returns to the form without losing values.

### Tests

Component tests for DTO rendering, field errors, stale edits, demographics and
contact duplicate review/cancel/confirm, child archives, guardian semantics, and
AAL2 lifecycle prompts; Playwright view-audit, normal edit, duplicate-blocked
edit and legitimate override, stale/revoked session, cross-tenant UUID, phone/
tablet/desktop, keyboard, and axe.

### Acceptance criteria

- [ ] Authorized roles view/edit only the Phase 2 sections.
- [ ] A stale form never silently overwrites a newer version.
- [ ] A name/DOB or active mobile/email edit that returns duplicate candidates
  makes no mutation until the user explicitly confirms; cancel preserves input,
  and confirmation records the corresponding override audit action.
- [ ] Foreign patient IDs reveal no data and no cross-tenant audit row.
- [ ] Archive/reactivate is AAL2-gated, confirmed, and recoverable.
- [ ] Supported widths have no clipped actions, unsafe targets, or horizontal
  page overflow.

### Security considerations

Patient pages remain no-store and render all user data as text. Do not cache PII
in localStorage/service workers or leak it to analytics/error monitoring.

### Dependencies and reviewer checkpoint

Depends on `P2-06`–`P2-10`. Independent full-stack patient-workspace review is
mandatory before closeout.

## P2-12 — Integrated security, concurrency, manual QA, and closeout

### Purpose

Prove the composed Phase 2 system and record evidence without expanding scope.

### Preconditions

`P2-01` through `P2-11` independently approved and merged in order.

### Scope

Complete local pgTAP and concurrency suites, application verification,
responsive/accessibility QA, documentation, and the acceptance report. Hosted
fixture provisioning, generated types, Auth posture, and Playwright journeys are
required at the pre-production Cloud TEST gate. Keep an owner-only database
fixture so tests continue to prove owner status alone grants no patient access,
while the same owner can provision a separate dentist/receptionist only through
the bounded AAL2 delegation rule.

### Non-scope

Fixing later-domain gaps by implementing those domains; production rollout; real
data; paid-tier/security-gate closure unless separately authorized.

### Database impact

No unrelated schema. A corrective migration is allowed only for a concrete Phase
2 finding and must repeat the normal migration/RLS/grant review cycle.

### Authorization/backend/frontend impact

Review composed behavior: org/branch/role revocation, bounded fixed-role
delegation, all patient RPCs, direct base-table read denial, no secret client
imports, no PII logs, exact grants, protected caching, and responsive UI.

### Tests

Run at minimum:

```powershell
npm run security:migrations
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run security:secrets
npm run security:audit
npm run db:start:local
npm run db:reset:local
npm run db:provision:local
npm run test:db:local
```

The pre-production Cloud TEST commands require the documented verified TEST
environment and approval for writes; never run them against an ambiguous link.

### Acceptance criteria

- [ ] Fresh local Supabase reconstructs from every committed migration plus the
  synthetic seed.
- [ ] Exact grant allowlist, RLS, tenant FKs, and negative authorization suites
  pass, including no patient table/RPC privileges for `service_role`.
- [ ] Concurrent create-versus-create, create-versus-update, update-versus-update,
  mobile/email, stale-edit, and primary-contact tests prove database guarantees.
- [ ] From an owner-only organization, AAL2 can provision a different dentist or
  receptionist, while AAL1, self-assignment, arbitrary custom permission, foreign
  tenant/branch, and owner patient reads remain denied.
- [ ] Hosted Playwright flows and their dedicated synthetic TEST identities are
  verified before production deployment.
- [ ] Manual QA confirms keyboard, touch, focus, overflow, safe errors, and no
  real/sensitive data in artifacts.
- [ ] A Phase 2 acceptance document is authored separately; passing tests alone
  does not self-approve the phase.

### Security considerations

Review browser bundles for service keys; inspect logs/screenshots/test reports for
PII/tokens; prove `anon` and publishable-key-only access return no patient data;
confirm production remains blocked.

### Dependencies and reviewer checkpoint

Depends on all prior tasks. This is the final human acceptance gate. Do not begin
provider, scheduling, or clinical work from the same session.

# 7. Dependency graph

```text
P2-00 plan approval
  └─ P2-01 permissions/delegation
       └─ P2-02 patient identity/RLS/audit link
            └─ P2-03 contacts/relationships schema
                 └─ P2-04 creation/duplicates
                      └─ P2-05 reads/search/view audit
                           └─ P2-06 demographics update
                                └─ P2-07 child mutations
                                     └─ P2-08 lifecycle
P2-05 + P2-08 ────────────────┐
                               └─ P2-09 list/search UI
P2-04 + P2-09 ─────────────────── P2-10 create UI
P2-06 + P2-07 + P2-08 + P2-10 ── P2-11 workspace/edit UI
P2-01 through P2-11 ───────────── P2-12 integrated closeout
```

# 8. Migration and generated-type strategy

1. Each task owns one logical migration set; unrelated changes never share a
   migration.
2. Object migrations grant nothing. New functions immediately revoke default
   execute; new public tables immediately revoke broad privileges and enable RLS.
3. The final migration of each set contains only reviewed grants and is added to
   `scripts/approved-final-grants.mjs` with exact signatures and reasons.
4. Run static migration privilege lint before any remote write.
5. During Phase 2, apply and verify each migration only in the guarded
   disposable local stack; Git remains authoritative.
6. Regenerate `src/types/database.generated.ts` from the hosted schema before
   production deployment and check the committed result in CI.
7. Local schema lint, pgTAP, and app tests must pass for every checkpoint,
   including P2-12. Cloud TEST advisors and E2E must pass before production
   deployment on the same composed state.
8. Never use Dashboard-first SQL, direct MCP-only schema changes, an unguarded
   local database target, linked reset/reseed, or a production target. Local
   Supabase verification must follow ADR-020; it does not replace the required
   Cloud TEST run before production.

# 9. Test strategy

## Unit/component

- Authorization scope and revocation.
- Zod input/query bounds and normalization-adjacent contracts.
- RPC result/error mapping.
- Duplicate-warning and stale-form UI states.
- Responsive list/workspace rendering, focus, and accessible names.

## pgTAP/database

- Table/column/constraint/index/function/search-path/grant shape.
- Org A vs Org B read/write/relationship isolation.
- Role matrix, active branch membership, suspended sessions, and anon denial.
- Direct DML denial and RPC-only mutation.
- Direct base-table SELECT denial and RPC-only bounded reads.
- Composite FKs and immutable tenant identifiers.
- Fixed-role delegation allowlist/full-superset fallback, anti-self-assignment,
  AAL2, tenant/branch validation, and audit atomicity.
- Exact duplicate warning/override predicates and candidate fields/cap; patient
  number, version, primary-contact, archive, and audit atomicity.

## Hosted integration/concurrency

- Simultaneous equivalent patient creation.
- Create versus demographics/contact update on the same duplicate signal.
- Two-patient demographics/contact updates converging on one duplicate signal.
- Simultaneous updates from one version.
- Simultaneous primary-contact promotion.
- Authorization revoked between read/form load and mutation.

## Playwright/manual QA

- Find/create/view/edit/archive synthetic patient.
- Legitimate duplicate override.
- Cross-tenant/role/direct-URL denial.
- Desktop, iPad portrait/landscape, 360 px and 430 px phones.
- Keyboard/focus/screen-reader names/contrast/touch/virtual-keyboard/overflow.

# 10. Security review gates

Independent review is mandatory after `P2-01`, every database/RLS/RPC task
(`P2-02`–`P2-08`), the composed UI (`P2-11`), and closeout (`P2-12`). Reviewers
must specifically attempt:

- forged organization, branch, patient, contact, and related-patient IDs;
- branch membership mistaken for patient permission;
- branch-scoped role accidentally opening branch-owned domains;
- owner/admin/assistant/visiting-specialist privilege creep;
- fixed-role delegation escaping its exact role/missing-permission allowlists,
  bypassing AAL2, assigning self, or operating cross-tenant;
- cross-tenant composite-FK corruption;
- direct Data API base-table reads/DML or anon reads;
- `SECURITY DEFINER` search-path/default-execute mistakes;
- stale-session mutation after membership/role/branch revocation;
- duplicate create/update/contact, version, primary-contact, and archive races;
- audit failure returning detail or leaving an unaudited mutation;
- service-role/client-bundle exposure;
- PII in errors, logs, audit metadata, URLs, caching, screenshots, or traces.

# 11. Manual QA gates

Use synthetic identities/data only. Confirm:

1. A Branch A receptionist finds the same organization patient initially
   registered through Branch B, but cannot open Org B or unauthorized branch
   settings.
2. An owner without a patient role sees no patient navigation/records.
3. At AAL2 that owner can provision a different dentist/receptionist, but cannot
   do so at AAL1, assign the role to self, or grant a custom patient role through
   the fixed-role exception.
4. A dentist and receptionist can perform only Phase 2 demographics work.
5. A visiting specialist sees no patient directory before assigned-case support.
6. Duplicate confirmation is clear and never silently merges.
7. Branch A can preserve an inaccessible Branch B preference while editing other
   fields, but cannot set that branch as a new preference.
8. A stale editor receives recovery guidance and no data is overwritten.
9. Contact/guardian relationships remain comprehensible on phone and iPad.
10. Archive requires step-up MFA, disappears from default results, and can be
   reactivated.
11. Error/loading/empty/denied states disclose no foreign patient existence.
12. Back/forward navigation and virtual keyboard do not lose or obscure critical
    form actions.

# 12. Rollback and recovery

- Phase 2 is additive. Do not drop Phase 1 objects or weaken existing policies.
- Before UI exposure, an unapplied/failed task can be corrected with a reviewed
  forward migration. Never reset an ambiguous linked project.
- Once data exists, rollback means disabling the affected app path and shipping a
  forward corrective migration; do not drop patient/contact/audit data.
- Keep schema expansion and application use ordered so old application code
  tolerates newly added tables/columns.
- If a normalization contract changes, add a versioned helper/backfill and verify
  duplicate/search results before switching; do not silently reinterpret stored
  generated keys.
- Patient archive/reactivation provides operational recovery from mistaken
  deactivation. Merge/hard-delete recovery is intentionally absent because those
  operations are not implemented.

# 13. Known risks and conservative decisions

- **Roadmap labels:** the old high-level Phase 2 is already complete inside
  accepted Phase 1. This plan follows the detailed plan's explicit next slice;
  it does not repeat auth/tenancy or pull providers/scheduling forward.
- **Shared directory from a branch-scoped permission:** this is intentional and
  narrowly named because patients are organization-level. It requires explicit
  patient permission and must not generalize to branch-owned data.
- **Fixed patient-role delegation:** the exception exists only to prevent an
  owner-only organization from deadlocking while preserving owner/patient-role
  separation. It is limited by existing administrative permissions, AAL2, exact
  global role codes, and an exact missing-permission allowlist. Custom roles and
  future clinical permissions remain under the full superset rule.
- **Duplicate matching:** exact normalized name + birth date can miss spelling or
  diacritic variants and can flag legitimate namesakes. It is a warning, not a
  uniqueness/merge rule. Fuzzy matching waits for measured need.
- **Guardian/consent policy:** stored guardian/contact flags support workflow but
  do not constitute legal proof. Digital consent/signature remains later work and
  requires clinic/privacy/legal validation.
- **Demographic policy validation:** the allowed `sex_at_registration` values,
  relationship labels, and maximum age bound must receive clinic review before
  real-patient production, but the plan uses conservative explicit values for
  synthetic development rather than an unconstrained free-text field.
- **Audit volume and detail boundary:** detail opens are atomic RPC operations and
  are audited; search-result rows are not. Direct base-table reads remain denied.
  Review retention/volume before production without logging queries or PII.
- **Production readiness:** Phase 2 completion still does not satisfy the PIA,
  MFA enforcement, session, backup/restore, incident response, retention, CSP,
  paid-tier, or other production gates.

# 14. Deferred work and roadmap preservation

After Phase 2 acceptance, create a separately reviewed bounded plan. The current
recommended order is provider/specialty/procedure foundation, then resources and
scheduling prerequisites, then the scheduling engine. Acquisition/referrals,
website booking, clinical core/odontogram, treatment plans, files/R2, documents,
billing, inventory, communications, Google Calendar, analytics, and AI remain in
their roadmap phases. Do not assume all are part of the next phase.

# 15. Implementation-session guidance

- Execute exactly one `P2-*` task per bounded coding session/checkpoint.
- Start with `git status`, current handoff, this plan, and only the relevant
  architecture sections.
- For Next.js work, read the relevant installed guide in
  `node_modules/next/dist/docs/` before code.
- Use test-first implementation for every feature/bugfix task.
- Apply database/RLS changes and their negative tests together.
- Verify Cloud TEST identity before any deferred remote write; never use real data.
- Update `docs/AI_HANDOFF.md` after each checkpoint with exact commit, tests,
  remaining risks, and next approved task.
- Stop for conflicts, weakened isolation, destructive migrations, production
  access, secrets/real patient data, or scope outside this plan.
- Do not begin `P2-01` until this entire plan is independently reviewed and
  explicitly approved.

# 16. Phase 2 completion criteria

Phase 2 is complete only when `P2-00` through `P2-12` are accepted, all required
local checks pass on the same published checkpoint, migrations and generated
types match, independent review has no unresolved material finding, manual
responsive/accessibility/security QA is recorded, the handoff is current, and a
separate human acceptance decision is recorded. Cloud TEST checks remain
mandatory before production deployment. Phase 2 must still be described as a
synthetic-data patient foundation—not approval for production patient use.
