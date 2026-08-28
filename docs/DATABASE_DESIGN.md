# Dental EMR / Practice Management Platform
## DATABASE_DESIGN.md — Version 1.3

**Status:** Architecture-to-schema design baseline  
**Audience:** Claude Code, Codex CLI, human developer/reviewer  
**Primary database:** PostgreSQL via Supabase Cloud  
**Development data location:** disposable local Supabase for P2-01 through P2-11 verification plus hosted non-production Supabase projects; synthetic data only; Git migrations authoritative
**Authentication:** Supabase Auth  
**Primary application framework:** Next.js + TypeScript  
**Initial tenant:** One dental organization with two branches  
**Future direction:** Multi-tenant SaaS supporting many dental organizations and dynamically addable branches  

---

# 0. Purpose of This Document

This document translates the approved product plan and technical architecture into a concrete PostgreSQL data model.

It defines:

- what the main database entities are;
- which data belongs to the organization versus a branch;
- how users, dentists, staff, patients, appointments, treatment plans, odontograms, documents, billing, inventory, referrals, communications, and integrations relate;
- which records are mutable versus append-only/versioned;
- how tenant and branch isolation should work;
- what database constraints should prevent invalid data;
- how appointment and resource double-booking should be prevented;
- how Row Level Security (RLS) should be structured;
- which indexes will likely be needed;
- how clinical history should be preserved;
- how the schema remains useful when the prototype becomes SaaS.

This is a **design specification**, not a finished SQL migration. Claude or Codex must not blindly generate every table in one migration from this document. Implementation should be split by domain and reviewed incrementally.

---

# 1. Relationship to Other Project Documents

The project documentation should ultimately contain:

```text
docs/
├── MASTER_PRODUCT_PLAN.md
├── TECHNICAL_ARCHITECTURE.md
├── DATABASE_DESIGN.md              ← this document
├── SECURITY_ARCHITECTURE.md        ← approved security-specific baseline
├── API_DESIGN.md                   ← later, when routes/RPCs stabilize
├── AUTOMATION_DESIGN.md            ← later, for reminders/jobs/events
├── decisions/
│   └── ADR-*.md
└── plans/
    └── phase-specific implementation plans
```

Document responsibilities:

- **MASTER_PRODUCT_PLAN.md** = what the product must do.
- **TECHNICAL_ARCHITECTURE.md** = how the major technical pieces fit together.
- **DATABASE_DESIGN.md** = how persistent data is modeled and protected.
- **SECURITY_ARCHITECTURE.md** = threat model, authorization model, secrets, encryption, audit and incident controls.
- **Phase plans** = exactly what to implement next.

When this document conflicts with an older design note, stop and reconcile the conflict rather than silently choosing one.

---

# 2. Confirmed Business Decisions That Affect the Schema

The following are treated as current product decisions.

## 2.1 Organization and branches

- Both current branches belong to one owner and one dental business.
- They share one patient population and one EMR.
- A patient can visit either branch.
- A patient must not be duplicated merely because they visited another branch.
- The owner may open additional branches later.
- An authorized owner/admin must be able to create another branch from the software without a database redesign.
- Future SaaS customers may have one, two, or many branches.

## 2.2 Providers and staff

- Dentists may work at multiple branches.
- Staff may work at one or multiple branches.
- On-call/visiting specialists are supported.
- Regular dentists may require organization-wide clinical visibility.
- Visiting/on-call specialists should default to assigned-case access rather than unrestricted clinic-wide access.

## 2.3 Scheduling

- The same provider must never be booked at two branches at the same time.
- Branches have branch-specific chairs, rooms, devices, and equipment.
- Some procedures may require equipment available at only one branch.
- Online booking defaults to review-first but can be configured to auto-confirm by organization, branch, or service.
- Public booking slots are held for approximately 5 minutes before expiring.
- Google Calendar is an integration, not the source of truth.
- EMR-created appointments go to the dentist's selected Work Calendar.

## 2.4 Patients

- Duplicate detection primarily uses normalized name + birthday as a warning signal.
- Name + birthday is **not** a unique constraint because distinct people can share both.
- Family/guardian relationships are supported.
- Patient clinical history is organization-level.

## 2.5 Pricing and billing

- Treatment prices are not fixed.
- Price can vary by case, branch, provider, materials, complexity, or clinical judgment.
- MVP billing includes treatment estimates, charges, payments, balance, and statements of account.
- A patient's balance is organization-wide, while each financial event retains branch attribution.
- BIR-compliant invoicing/accounting is a separate future compliance module.

## 2.6 Files and documents

- Avoid storing extremely heavy CBCT datasets in the first version.
- Primary private clinical object storage is S3-compatible object storage (Cloudflare R2 in production, MinIO locally under ADR-022).
- PostgreSQL stores metadata, access relationships, hashes, sizes, versions, and object keys—not the binary image itself.
- Signed or formally issued clinical documents must be versioned/immutable snapshots.

## 2.7 Odontogram and drawings

- Odontogram is required in the first usable clinical product.
- The schema must be independent of whichever React odontogram UI library is selected.
- Drawing/treatment-discussion data should remain editable by storing structured/vector/canvas data plus a rendered output.
- iPad/touch/stylus and laptop/mouse workflows are both expected.

## 2.8 Inventory

- Inventory matters early because the second branch is new and stock/equipment may differ by branch.
- Consumable inventory and schedulable equipment are related operationally but are **not the same domain object**.
- Inventory should support branch stock, transfers, adjustments, reorder levels, and history.

## 2.9 SaaS direction

- The first deployment is a prototype for one clinic organization.
- The database must nevertheless be tenant-aware from day one.
- Future clinics must never be able to see one another's data.

---

# 3. Database Design Principles

## 3.1 PostgreSQL is the system of record

PostgreSQL owns authoritative structured data for:

- organizations;
- branches;
- memberships and permissions;
- patients;
- providers;
- appointments;
- treatment plans;
- odontogram data;
- clinical notes;
- financial transactions;
- inventory ledgers;
- document metadata;
- communication history;
- audit events;
- external integration mappings.

External services such as Google Calendar, SMS providers, Messenger, email providers, S3-compatible object storage (Cloudflare R2 / MinIO), and analytics tools do not become the system of record for these domains.

## 3.2 UUID primary keys

Use UUID primary keys for domain entities unless there is a strong reason to use another type.

Recommended convention:

```sql
id uuid primary key default gen_random_uuid()
```

Benefits:

- IDs can be generated safely across services;
- avoids simple sequential public identifiers;
- easier future multi-tenant data movement;
- easy compatibility with Supabase Auth UUIDs.

Human-facing record numbers should be **separate fields**, e.g.:

```text
Patient internal PK: 550e8400-e29b-41d4-a716-446655440000
Patient display number: PT-000123
```

Never use a patient-facing sequence number as the database authorization boundary.

## 3.3 Tenant-aware data

Most business tables should either:

1. contain `organization_id` directly; or
2. inherit it through a strongly constrained parent.

For high-risk/high-volume tables, direct `organization_id` is preferred even if technically derivable because it simplifies:

- RLS;
- indexes;
- auditing;
- tenant-scoped queries;
- forensic review.

## 3.4 Branch attribution is separate from tenant ownership

A record can belong to the organization but be operationally attributed to a branch.

Example:

```text
Patient → organization-level
Appointment → organization + branch
Charge → organization + origin branch
Payment → organization + receiving branch
Inventory movement → organization + branch
```

Do not make `branch_id` the tenant key.

## 3.5 Timestamps

Use `timestamptz` for actual instants.

Store timestamps in PostgreSQL as timezone-aware values and display them in the branch/provider timezone.

Recommended standard fields where relevant:

```text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
created_by uuid null
updated_by uuid null
```

Clinical records may need separate concepts such as:

```text
recorded_at
performed_at
effective_at
signed_at
voided_at
```

Do not infer clinical time solely from `created_at`.

## 3.6 Money

Never use floating-point types for money.

Recommended MVP representation:

```text
amount_centavos integer
currency_code char(3) default 'PHP'
```

Example:

```text
₱1,250.50 → 125050 centavos
```

If future financial requirements exceed practical integer limits or require complex tax precision, migrate deliberately to a well-defined fixed-decimal model.

## 3.7 Soft archive versus deletion

For ordinary configurable/admin data:

```text
archived_at timestamptz null
```

For clinical/legal records:

- prefer correction/versioning/supersession;
- do not silently hard-delete;
- preserve audit history.

## 3.8 JSONB is not a replacement for relational modeling

Use normal relational columns for data that must be:

- queried;
- constrained;
- joined;
- authorized;
- reported.

Use `jsonb` for genuinely flexible or versioned payloads such as:

- drawing vector data;
- external provider response payload snapshots;
- document template configuration;
- non-authoritative integration metadata.

Do not create a giant `patient_data jsonb` column containing the whole EMR.

## 3.9 Enums

Be conservative with PostgreSQL enum types for workflows that may evolve.

For stable small values, enum/check constraints are acceptable.

For frequently evolving workflow states, prefer:

- `text` + CHECK constraint; or
- status lookup table when admins/configuration need control.

This reduces painful migrations when business states evolve.

---

# 4. PostgreSQL / Supabase Schema Strategy

## 4.1 Initial schema recommendation

For v1:

- application tables may remain in `public` for straightforward Supabase integration;
- **RLS must be enabled on every exposed application table**;
- sensitive internal helper tables that never need Data API access can live in a non-exposed schema such as `private` or `internal`;
- extensions should live in their recommended extension schema rather than polluting `public`.

This can be revisited if the application later moves to a fully server-only database access model.

## 4.2 Supabase Auth boundary

`auth.users` is identity infrastructure, not the employee/provider table.

Application schema should reference only the stable Auth user primary key.

Example:

```text
auth.users.id
    ↓
profiles.user_id
    ↓
organization_members.user_id
```

Do not put branch permissions, clinical role, or organization authorization solely in user-editable metadata.

## 4.3 Required/likely extensions

Likely extensions:

```text
btree_gist     scheduling exclusion constraints
pg_trgm        optional fuzzy patient search
pgtap          database/RLS tests
```

Potential infrastructure extensions evaluated separately:

```text
pgmq           durable queue support
pg_cron        scheduled database jobs / Edge Function invocations
```

Enable only what is actually used.

---

# 5. High-Level Domain Map

```text
PLATFORM
│
└── ORGANIZATION
    │
    ├── BRANCHES
    │   ├── STAFF ACCESS
    │   ├── PROVIDER SCHEDULES
    │   ├── RESOURCES / EQUIPMENT
    │   ├── INVENTORY
    │   └── APPOINTMENTS
    │
    ├── USERS / MEMBERS
    │   ├── ROLES
    │   └── PERMISSIONS
    │
    ├── PROVIDERS
    │   ├── SPECIALTIES
    │   └── BRANCH ASSIGNMENTS
    │
    ├── PATIENTS
    │   ├── CONTACTS / GUARDIANS
    │   ├── ACQUISITION / REFERRALS
    │   ├── APPOINTMENTS / ENCOUNTERS
    │   ├── CLINICAL NOTES
    │   ├── ODONTOGRAM
    │   ├── TREATMENT PLANS
    │   ├── DRAWINGS
    │   ├── DOCUMENTS / FILES
    │   └── ACCOUNT LEDGER
    │
    ├── COMMUNICATIONS
    │
    ├── GOOGLE CALENDAR INTEGRATIONS
    │
    └── AUDIT EVENTS
```

---

# 6. Organization and Branch Tables

## 6.1 `organizations`

One row represents one SaaS customer/business.

Suggested columns:

```text
id uuid PK
legal_name text
business_name text
slug text unique
status text
country_code char(2) default 'PH'
default_timezone text default 'Asia/Manila'
default_currency char(3) default 'PHP'
created_at timestamptz
updated_at timestamptz
archived_at timestamptz null
```

Notes:

- Do not assume one organization forever.
- `slug` is public/business-facing and must not be used for security.
- Organization deactivation should not delete clinical data.

## 6.2 `branches`

Suggested columns:

```text
id uuid PK
organization_id uuid FK organizations
name text
slug text
code text
status text
phone text null
email text null
address_line1 text
address_line2 text null
city text
province text
postal_code text null
country_code char(2) default 'PH'
timezone text default 'Asia/Manila'
latitude numeric null
longitude numeric null
website_visible boolean default true
created_at timestamptz
updated_at timestamptz
archived_at timestamptz null
```

Constraints:

```text
unique(organization_id, slug)
unique(organization_id, code)
```

Do not cap the number of branches in the schema.

An owner adding Branch 3 is simply an INSERT into `branches` followed by branch configuration.

## 6.3 `branch_business_hours`

Suggested columns:

```text
id uuid PK
organization_id uuid
branch_id uuid
weekday smallint check 0..6
opens_at time
closes_at time
is_closed boolean
valid_from date null
valid_to date null
```

A branch can have split hours later by allowing multiple rows per weekday.

## 6.4 `branch_closures`

For holidays/special closure periods.

```text
id uuid PK
organization_id uuid
branch_id uuid
starts_at timestamptz
ends_at timestamptz
reason text null
created_by uuid
```

---

# 7. Identity, Membership, Roles, and Permissions

## 7.1 `profiles`

Application profile linked one-to-one with Supabase Auth.

```text
user_id uuid PK FK auth.users(id)
display_name text
first_name text
last_name text
mobile text null
avatar_object_key text null
created_at timestamptz
updated_at timestamptz
```

Do not duplicate passwords or session credentials.

## 7.2 `organization_members`

Represents a user belonging to an organization.

```text
id uuid PK
organization_id uuid
user_id uuid
membership_status text
joined_at timestamptz
suspended_at timestamptz null
created_at timestamptz
```

Constraint:

```text
unique(organization_id, user_id)
```

## 7.3 `roles`

Use system roles initially but design so future SaaS can add controlled custom roles.

```text
id uuid PK
organization_id uuid null
code text
name text
is_system boolean
```

System role examples:

```text
OWNER
ADMIN
DENTIST
RECEPTIONIST
DENTAL_ASSISTANT
VISITING_SPECIALIST
BILLING
```

## 7.4 `permissions`

Permission catalog.

Examples:

```text
patient.demographics.read
patient.demographics.write
patient.clinical.read
patient.clinical.write
appointment.read
appointment.write
billing.read
  billing.charge
  billing.adjust
  billing.attribution.override
  compensation.manage
  compensation.own.read
  financial.analytics.read
inventory.read
inventory.write
user.manage
branch.manage
integration.manage
audit.read
```

## 7.5 `role_permissions`

```text
role_id uuid
permission_id uuid
primary key(role_id, permission_id)
```

## 7.6 `member_roles`

```text
id uuid PK
organization_member_id uuid
role_id uuid
branch_id uuid null
```

Semantics:

- `branch_id null` can mean organization-wide role where role permits it;
- branch-scoped roles restrict operational access.

Avoid encoding every permission as a column on `organization_members`.

## 7.7 `branch_memberships`

Explicit branch access assignment.

```text
id uuid PK
organization_id uuid
branch_id uuid
organization_member_id uuid
access_status text
```

Constraint:

```text
unique(branch_id, organization_member_id)
```

This supports staff working at one or several branches.

---

# 8. Providers and Specialties

A provider is a clinical professional; not every application user is a provider, and not every external/on-call provider necessarily needs a user account immediately.

## 8.1 `providers`

```text
id uuid PK
organization_id uuid
linked_user_id uuid null
provider_type text
first_name text
last_name text
middle_name text null
professional_title text null
license_number text null
mobile text null
email text null
is_on_call boolean default false
is_external boolean default false
status text
website_visible boolean default false
bio text null
created_at timestamptz
updated_at timestamptz
archived_at timestamptz null
```

Provider types may include:

```text
REGULAR
PART_TIME
VISITING
ON_CALL
EXTERNAL_REFERRAL
```

## 8.2 `specialties`

```text
id uuid PK
organization_id uuid null
code text
name text
active boolean
```

Global/system specialties may use `organization_id null`; clinic-specific custom specialties may use tenant ownership.

## 8.3 `provider_specialties`

```text
provider_id uuid
specialty_id uuid
is_primary boolean
verified_at timestamptz null
primary key(provider_id, specialty_id)
```

## 8.4 `provider_branches`

```text
id uuid PK
organization_id uuid
provider_id uuid
branch_id uuid
status text
can_be_booked_online boolean
created_at timestamptz
```

Constraint:

```text
unique(provider_id, branch_id)
```

## 8.5 `provider_availability_rules`

Recurring weekly branch-aware availability.

```text
id uuid PK
organization_id uuid
provider_id uuid
branch_id uuid
weekday smallint
starts_at_local time
ends_at_local time
valid_from date
valid_to date null
active boolean
```

Allow multiple intervals per day.

## 8.6 `provider_schedule_exceptions`

For leave, added availability, meetings, etc.

```text
id uuid PK
organization_id uuid
provider_id uuid
branch_id uuid null
exception_type text
starts_at timestamptz
ends_at timestamptz
reason text null
created_by uuid
```

Types:

```text
UNAVAILABLE
ADDITIONAL_AVAILABILITY
LEAVE
```

---

# 9. Patients and Identity

## 9.1 `patients`

Patients belong to the organization.

Suggested columns:

```text
id uuid PK
organization_id uuid
patient_number text
first_name text
middle_name text null
last_name text
suffix text null
preferred_name text null
birth_date date
sex_at_registration text null
mobile text null
email text null
address_line1 text null
address_line2 text null
city text null
province text null
postal_code text null
preferred_branch_id uuid null
preferred_communication_channel text null
status text
created_at timestamptz
updated_at timestamptz
archived_at timestamptz null
```

Constraints:

```text
unique(organization_id, patient_number)
```

Do **not** unique-constrain name + birthday.

## 9.2 Patient normalized search fields

Create search-friendly normalized values either as generated columns or maintained columns.

Possible fields:

```text
normalized_first_name
normalized_last_name
normalized_full_name
```

Duplicate detection query uses:

```text
organization_id
+ normalized name
+ birth_date
```

Mobile/email can increase confidence.

## 9.3 `patient_contacts`

Multiple contact methods.

```text
id uuid PK
organization_id uuid
patient_id uuid
contact_type text
value text
is_primary boolean
verified_at timestamptz null
```

Types:

```text
MOBILE
EMAIL
LANDLINE
MESSENGER_HANDLE   // only if product can legitimately store identifier
OTHER
```

Do not assume every minor has their own contact details.

## 9.4 `patient_relationships`

Supports family/guardian relationships.

```text
id uuid PK
organization_id uuid
patient_id uuid
related_patient_id uuid null
external_contact_name text null
relationship_type text
is_legal_guardian boolean
can_receive_communications boolean
can_consent boolean
notes text null
```

Relationship examples:

```text
PARENT
GUARDIAN
CHILD
SPOUSE
DEPENDENT
EMERGENCY_CONTACT
HOUSEHOLD_CONTACT
```

Avoid a shared family clinical record.

## 9.5 Patient merge support

Create a future `patient_merge_history` table:

```text
id uuid PK
organization_id uuid
survivor_patient_id uuid
merged_patient_id uuid
performed_by uuid
performed_at timestamptz
reason text
snapshot jsonb
```

Merged source patient row should be archived/redirected, not physically erased immediately.

---

# 10. Patient Medical and Dental History

Do not put every clinical field directly on `patients`.

## 10.1 `patient_medical_conditions`

```text
id uuid PK
organization_id uuid
patient_id uuid
condition_name text
status text
onset_date date null
resolved_date date null
notes text null
recorded_by uuid
recorded_at timestamptz
voided_at timestamptz null
```

## 10.2 `patient_allergies`

```text
id uuid PK
organization_id uuid
patient_id uuid
allergen text
reaction text null
severity text null
status text
recorded_at timestamptz
voided_at timestamptz null
```

## 10.3 `patient_medications`

```text
id uuid PK
organization_id uuid
patient_id uuid
medication_name text
dose text null
frequency text null
status text
start_date date null
end_date date null
notes text null
```

## 10.4 `patient_medical_history_forms`

Store submitted questionnaire versions separately from the normalized active problem lists.

```text
id uuid PK
organization_id uuid
patient_id uuid
template_version_id uuid
submitted_at timestamptz
submitted_by_user_id uuid null
submitted_by_patient boolean
answers jsonb
reviewed_by_provider_id uuid null
reviewed_at timestamptz null
```

This preserves what the patient actually submitted at a point in time.

---

# 11. Acquisition, Referral, and Booking Attribution

## 11.1 `acquisition_sources`

```text
id uuid PK
organization_id uuid
category text
name text
active boolean
sort_order integer
```

Examples:

```text
ONLINE / Facebook
ONLINE / Google Search
ONLINE / Google Maps
REFERRAL / Existing Patient
REFERRAL / Dentist
OFFLINE / Signage
OTHER / Unknown
```

## 11.2 `booking_channels`

```text
id uuid PK
organization_id uuid
code text
name text
active boolean
```

Examples:

```text
WEBSITE
WALK_IN
PHONE
SMS
MESSENGER
RECEPTIONIST
PATIENT_PORTAL
```

Walk-in is primarily a booking/arrival channel, not automatically an acquisition source.

## 11.3 `patient_acquisitions`

Usually one initial acquisition attribution per patient, but design can support history if attribution methodology evolves.

```text
id uuid PK
organization_id uuid
patient_id uuid
acquisition_source_id uuid
booking_channel_id uuid null
captured_at timestamptz
captured_by uuid null
campaign_id uuid null
notes text null
```

## 11.4 `external_referrers`

For dentists/doctors/organizations not represented as clinic providers.

```text
id uuid PK
organization_id uuid
referrer_type text
name text
organization_name text null
specialty text null
phone text null
email text null
active boolean
```

## 11.5 `incoming_referrals`

```text
id uuid PK
organization_id uuid
patient_id uuid
referrer_type text
referring_patient_id uuid null
referring_provider_id uuid null
external_referrer_id uuid null
reason text null
referred_at timestamptz null
captured_at timestamptz
```

Constraint/business validation must ensure exactly one applicable referrer relationship is chosen when referral is specific.

## 11.6 `outgoing_referrals`

Separate from acquisition.

```text
id uuid PK
organization_id uuid
patient_id uuid
encounter_id uuid null
from_provider_id uuid
to_provider_id uuid null
external_referrer_id uuid null
specialty_id uuid null
reason text
status text
created_at timestamptz
sent_at timestamptz null
```

---

# 12. Procedures and Service Catalog

## 12.1 `procedures`

A procedure definition does not imply one fixed price.

```text
id uuid PK
organization_id uuid
code text
name text
description text null
default_duration_minutes integer null
website_visible boolean
enable_online_booking boolean
booking_mode text
active boolean
```

`booking_mode` examples:

```text
REQUIRES_REVIEW
AUTO_CONFIRM
REQUEST_ONLY
```

Do not store authoritative treatment price here.

## 12.2 `procedure_specialties`

```text
procedure_id uuid
specialty_id uuid
requirement_level text
primary key(procedure_id, specialty_id)
```

## 12.3 `procedure_resource_requirements`

```text
id uuid PK
organization_id uuid
procedure_id uuid
resource_type_id uuid
quantity integer default 1
required boolean
```

This allows a procedure to require, for example, a surgery room or specific equipment type.

## 12.4 Optional quote guidance

If the clinic wants internal estimate guidance later, create a separate non-binding table such as:

```text
procedure_price_guidance
```

with ranges by branch/provider, never treating them as guaranteed patient prices.

---

# 13. Branch Resources and Equipment

Schedulable physical resources are not inventory consumables.

## 13.1 `resource_types`

```text
id uuid PK
organization_id uuid
code text
name text
schedulable boolean
```

Examples:

```text
DENTAL_CHAIR
SURGERY_ROOM
XRAY_ROOM
PANORAMIC_XRAY
INTRAORAL_SCANNER
```

## 13.2 `branch_resources`

```text
id uuid PK
organization_id uuid
branch_id uuid
resource_type_id uuid
name text
status text
serial_number text null
notes text null
online_booking_eligible boolean
created_at timestamptz
archived_at timestamptz null
```

A device at Branch A cannot satisfy a Branch B booking unless the workflow explicitly transfers the appointment/physical device.

## 13.3 `resource_unavailability`

```text
id uuid PK
organization_id uuid
resource_id uuid
starts_at timestamptz
ends_at timestamptz
reason text null
```

For maintenance/repair/blocking.

---

# 14. Appointment Architecture

Appointment scheduling is one of the highest-risk concurrency domains.

## 14.1 Do not use one giant appointment status

Separate state dimensions.

Suggested appointment columns:

```text
scheduling_status
confirmation_status
encounter_status
```

This avoids impossible status explosions such as `CONFIRMED_AND_CHECKED_IN_BUT_WAITING_SPECIALIST`.

## 14.2 `appointments`

```text
id uuid PK
organization_id uuid
branch_id uuid
patient_id uuid
procedure_id uuid null
title text null
starts_at timestamptz
ends_at timestamptz
scheduling_status text
confirmation_status text
encounter_status text
booking_channel_id uuid null
source_booking_request_id uuid null
chief_complaint text null
internal_scheduling_notes text null
patient_visible_notes text null
created_by uuid null
created_at timestamptz
updated_at timestamptz
cancelled_at timestamptz null
completed_at timestamptz null
```

Check:

```text
ends_at > starts_at
```

## 14.3 `appointment_providers`

Business assignment metadata.

```text
id uuid PK
organization_id uuid
appointment_id uuid
provider_id uuid
provider_role text
assignment_status text
created_at timestamptz
```

Constraint:

```text
unique(appointment_id, provider_id, provider_role)
```

## 14.4 `appointment_resources`

```text
id uuid PK
organization_id uuid
appointment_id uuid
resource_id uuid
purpose text null
```

## 14.5 Why dedicated reservation ledgers are recommended

Cross-table exclusion constraints cannot simply look through `appointment_providers` into `appointments.starts_at` reliably.

Therefore use dedicated reservation rows as the database-level collision boundary.

### `provider_reservations`

```text
id uuid PK
organization_id uuid
provider_id uuid
appointment_id uuid null
hold_id uuid null
branch_id uuid
starts_at timestamptz
ends_at timestamptz
timespan tstzrange generated/stored or explicitly maintained
reservation_status text
reservation_kind text
expires_at timestamptz null
created_at timestamptz
```

Kinds:

```text
APPOINTMENT
HOLD
BLOCK
```

Status:

```text
ACTIVE
RELEASED
EXPIRED
CANCELLED
```

Use a GiST exclusion constraint conceptually equivalent to:

```sql
EXCLUDE USING gist (
  provider_id WITH =,
  timespan WITH &&
)
WHERE (reservation_status = 'ACTIVE')
```

This prevents the same provider from having overlapping active reservations anywhere in the organization, including across branches.

Because `provider_id` is part of the key, a provider can still have back-to-back appointments when using `[start,end)` ranges.

### `resource_reservations`

Same pattern:

```text
id
organization_id
resource_id
appointment_id
hold_id
starts_at
ends_at
timespan
reservation_status
reservation_kind
expires_at
```

Exclusion:

```text
resource_id equality + timespan overlap
```

This prevents two simultaneous appointments from reserving the same dental chair/device/room.

## 14.6 5-minute holds

### `booking_holds`

```text
id uuid PK
organization_id uuid
branch_id uuid
public_session_token_hash text
procedure_id uuid
patient_id uuid null
starts_at timestamptz
ends_at timestamptz
expires_at timestamptz
status text
created_at timestamptz
converted_appointment_id uuid null
```

Status:

```text
ACTIVE
CONVERTED
EXPIRED
RELEASED
```

When a hold chooses a provider/resource, create matching ACTIVE reservation rows.

Important implementation detail:

- PostgreSQL exclusion predicates cannot dynamically depend on `now()` in a safe index predicate.
- Therefore expiry is a **state transition**, not merely `expires_at < now()`.
- A scheduled cleanup job marks stale ACTIVE holds/reservations as EXPIRED/RELEASED.
- Booking transactions should also expire stale relevant holds before attempting a new reservation, so correctness is not dependent only on the cron timing.

## 14.7 Transactional booking algorithm

A booking confirmation should occur in one database transaction/function:

1. validate organization/branch/procedure/provider;
2. lock/validate hold if supplied;
3. expire stale conflicting holds relevant to the requested slot;
4. create/update appointment;
5. create provider reservation(s);
6. create resource reservation(s);
7. rely on exclusion constraints as final race-condition protection;
8. convert hold;
9. emit domain/outbox event;
10. commit.

If any reservation conflicts, the whole transaction fails cleanly.

## 14.8 `appointment_status_history`

```text
id uuid PK
organization_id uuid
appointment_id uuid
status_dimension text
old_value text null
new_value text
changed_by uuid null
changed_at timestamptz
reason text null
```

Useful for no-show/confirmation analytics and dispute review.

---

# 15. Public Website Booking

Public website submissions should not write directly into sensitive clinical tables from the browser.

## 15.1 `booking_requests`

```text
id uuid PK
organization_id uuid
branch_id uuid null
requested_procedure_id uuid null
requested_provider_id uuid null
requested_starts_at timestamptz null
first_name text
last_name text
birth_date date null
mobile text
email text null
acquisition_source_id uuid null
booking_channel_id uuid
referral_payload jsonb null
request_status text
created_at timestamptz
reviewed_by uuid null
reviewed_at timestamptz null
appointment_id uuid null
```

Status:

```text
SUBMITTED
UNDER_REVIEW
APPROVED
DECLINED
CONVERTED
SPAM
```

Do not automatically create a full clinical patient record from obvious spam/abandoned public forms.

## 15.2 Existing patient matching

Public workflow must not expose patient search.

Server can attempt a candidate match using supplied data, but ambiguous matches require staff review.

## 15.3 Appointment management tokens

Store only hashes of public appointment management tokens.

Example table:

```text
appointment_access_tokens
- id
- organization_id
- appointment_id
- token_hash
- purpose
- expires_at
- used_at
- revoked_at
```

Never store reusable plaintext management tokens.

---

# 16. Encounters and Clinical Notes

Appointment and clinical encounter are related but not identical.

A walk-in treatment can create an encounter with or without a pre-existing appointment.

## 16.1 `encounters`

```text
id uuid PK
organization_id uuid
branch_id uuid
patient_id uuid
appointment_id uuid null
primary_provider_id uuid
encounter_type text
started_at timestamptz
ended_at timestamptz null
chief_complaint text null
status text
created_at timestamptz
```

## 16.2 `clinical_notes`

A note identity separate from its revisions.

```text
id uuid PK
organization_id uuid
patient_id uuid
encounter_id uuid null
note_type text
current_version_id uuid null
status text
created_by_provider_id uuid
created_at timestamptz
```

## 16.3 `clinical_note_versions`

```text
id uuid PK
organization_id uuid
clinical_note_id uuid
version_number integer
content_text text
structured_data jsonb null
created_by uuid
created_at timestamptz
signed_by_provider_id uuid null
signed_at timestamptz null
supersedes_version_id uuid null
correction_reason text null
```

Constraint:

```text
unique(clinical_note_id, version_number)
```

Once signed/finalized:

- do not update the version in place;
- create a correction/addendum/superseding version.

This preserves clinical history.

---

# 17. Treatment Plans

## 17.1 `treatment_plans`

```text
id uuid PK
organization_id uuid
patient_id uuid
branch_id uuid null
created_by_provider_id uuid
status text
current_version_id uuid null
created_at timestamptz
updated_at timestamptz
```

Status examples:

```text
DRAFT
PRESENTED
PARTIALLY_ACCEPTED
ACCEPTED
DECLINED
SUPERSEDED
COMPLETED
```

## 17.2 `treatment_plan_versions`

Freeze what was presented at a point in time.

```text
id uuid PK
organization_id uuid
treatment_plan_id uuid
version_number integer
summary text null
total_estimate_centavos integer null
created_by uuid
created_at timestamptz
presented_at timestamptz null
patient_acknowledged_at timestamptz null
locked_at timestamptz null
```

## 17.3 `treatment_plan_items`

Items belong to a plan version when historical accuracy matters.

```text
id uuid PK
organization_id uuid
treatment_plan_version_id uuid
procedure_id uuid null
tooth_code text null
surface_codes text[] null
description text
provider_id uuid null
branch_id uuid null
sequence_no integer
estimated_amount_centavos integer null
status text
notes text null
```

Do not recalculate an old signed estimate from today's procedure configuration.

The version stores the actual amount discussed at that time.

## 17.4 Patient decision / acknowledgment

```text
treatment_plan_acknowledgments
- id
- organization_id
- treatment_plan_version_id
- patient_id
- acknowledgment_type
- acknowledged_at
- signature_document_version_id null
- witnessed_by null
```

---

# 18. Odontogram Data Model

The database must not depend on a specific React package's JSON format.

## 18.1 Canonical tooth identity

Use a stable internal tooth code, preferably based on FDI notation for storage, with UI adapters for Universal/Palmer if needed.

Examples:

```text
11, 12, ... 48   permanent
51, 52, ... 85   primary
```

Store tooth code as text/small integer with validation rules because notation may expand to special cases such as supernumerary teeth later.

## 18.2 Separate clinical odontogram state from drawing markup

Structured tooth findings should be queryable.

Freehand drawings are visual documentation.

Do not store all dental clinical state only inside a canvas JSON blob.

## 18.3 `odontogram_entries`

Event/history-oriented records.

```text
id uuid PK
organization_id uuid
patient_id uuid
encounter_id uuid null
provider_id uuid
tooth_code text
entry_type text
condition_code text null
procedure_id uuid null
surface_codes text[] null
status text
notes text null
effective_at timestamptz
recorded_at timestamptz
supersedes_entry_id uuid null
voided_at timestamptz null
```

`entry_type` examples:

```text
FINDING
EXISTING_TREATMENT
PLANNED_TREATMENT
COMPLETED_TREATMENT
MISSING_TOOTH
NOTE
```

Surface code examples:

```text
M D O B L F I
```

Validate combinations at application/domain level because applicable surfaces vary by tooth/procedure.

## 18.4 `odontogram_current_state`

Optional materialized/current projection for fast UI loading.

Possible design:

```text
patient_id
tooth_code
state_jsonb
source_version
updated_at
```

This table is a projection/cache and is **not** the sole clinical history.

The authoritative history remains in entries/treatments.

## 18.5 `odontogram_snapshots`

Useful when a complete visual state must be preserved at a consultation/treatment-plan version.

```text
id uuid PK
organization_id uuid
patient_id uuid
encounter_id uuid null
treatment_plan_version_id uuid null
snapshot_json jsonb
created_by uuid
created_at timestamptz
rendered_file_object_id uuid null
```

This allows treatment plan v1 to retain exactly what was shown even after later dental changes.

## 18.6 UI library adapter rule

React odontogram package data should be transformed through an adapter:

```text
DB canonical odontogram
        ↓
OdontogramAdapter
        ↓
UI library format
```

Never name database columns after library-specific implementation details unless they are clinical concepts.

---

# 19. Treatment Discussion Canvas and Drawings

## 19.1 `treatment_discussions`

```text
id uuid PK
organization_id uuid
patient_id uuid
encounter_id uuid null
treatment_plan_version_id uuid null
provider_id uuid
branch_id uuid
summary text null
alternatives_discussed text null
risks_benefits_discussed text null
patient_questions text null
created_at timestamptz
finalized_at timestamptz null
```

## 19.2 `drawing_versions`

```text
id uuid PK
organization_id uuid
treatment_discussion_id uuid
version_number integer
canvas_format text
canvas_data jsonb
rendered_file_object_id uuid null
created_by uuid
created_at timestamptz
locked_at timestamptz null
```

The editable source and rendered image are both retained.

Possible canvas formats:

```text
FABRIC_JSON
KONVA_JSON
CUSTOM_VECTOR_JSON
```

Do not commit to one library in the database before prototyping.

## 19.3 Drawing base/attachment

A discussion drawing may start from:

- blank canvas;
- odontogram snapshot;
- patient image;
- X-ray;
- document/image attachment.

Use a join table rather than copying the entire source object.

---

# 20. Clinical Files and Object Storage Metadata

## 20.1 Never store permanent public URLs as authorization

Store an object key, not a permanently accessible URL.

Access should be generated via short-lived authorized URLs or server streaming.

## 20.2 `file_objects` — canonical/source objects

`file_objects` represents the authoritative uploaded/generated source object. For clinical images, the original object is preserved and clinical-domain records should reference this source row rather than a lossy preview derivative.

```text
id uuid PK
organization_id uuid
patient_id uuid null
branch_id uuid null
storage_provider text
bucket_name text
object_key text
original_filename text
content_type text
size_bytes bigint
sha256 text null
file_category text
sensitivity text
upload_status text
processing_status text
image_width integer null
image_height integer null
uploaded_by uuid null
created_at timestamptz
archived_at timestamptz null
retention_locked_until timestamptz null
```

Constraint:

```text
unique(storage_provider, bucket_name, object_key)
```

Categories:

```text
PATIENT_PHOTO
XRAY
DOCUMENT
SIGNED_CONSENT
DRAWING_RENDER
PRESCRIPTION
REFERRAL
OTHER
```


## 20.3 `file_derivatives` — non-canonical optimized representations

Keep image derivatives separate from the clinical source object. A derivative may be regenerated or replaced without changing the identity/hash of the original clinical file.

```text
id uuid PK
organization_id uuid
source_file_object_id uuid FK -> file_objects.id
variant_kind text
storage_provider text
bucket_name text
object_key text
content_type text
size_bytes bigint
width integer null
height integer null
sha256 text null
processor text
processor_version text null
processing_status text
created_at timestamptz
archived_at timestamptz null
```

Recommended `variant_kind` values:

```text
THUMBNAIL
PREVIEW
DISPLAY
```

Rules:

- unique active derivative per `(source_file_object_id, variant_kind, processor/settings version)` as appropriate;
- derivative rows must remain tenant-consistent with the source object;
- clinical links/encounters/documents reference the source `file_objects.id`, not a derivative id;
- derivatives may be lossy and may use WebP/AVIF; the original clinical source may not be destructively replaced by them;
- X-ray previews are derivatives only; the source X-ray object remains unchanged;
- processing jobs are idempotent and update `processing_status` rather than creating unlimited duplicate variants;
- deleting/archiving an original must account for its derivatives, but deleting a derivative must never imply deletion of the source.

## 20.4 Processing status

Conceptual states may include:

```text
UPLOADED
PENDING_VALIDATION
PROCESSING
READY
FAILED
QUARANTINED
```

Do not mark a clinical source as fully available merely because a derivative exists if malware/type validation or required integrity checks have not completed.

## 20.5 Large CBCT

Do not assume the MVP accepts full DICOM/CBCT datasets.

Add size limits and file-category allowlists.

The application can initially store:

- selected exported images;
- radiology reports;
- external reference/link metadata where clinically acceptable.

Full DICOM support should be an explicit future design.

## 20.6 `file_access_events`

Actual file access should also feed the global audit system; a dedicated table is optional if audit volume/performance warrants it.

---

# 21. Document and PDF Model

A printable PDF is an output of structured data, but formally issued/signed documents need immutable versions.

## 21.1 `documents`

```text
id uuid PK
organization_id uuid
patient_id uuid null
branch_id uuid null
document_type text
status text
current_version_id uuid null
created_by uuid
created_at timestamptz
```

Types include:

```text
PATIENT_RECORD_SUMMARY
TREATMENT_PLAN
TREATMENT_DISCUSSION
PRESCRIPTION
CONSENT
REFERRAL_LETTER
DENTAL_CERTIFICATE
XRAY_REQUEST
POST_OP_INSTRUCTIONS
STATEMENT_OF_ACCOUNT
TREATMENT_ESTIMATE
```

## 21.2 `document_versions`

```text
id uuid PK
organization_id uuid
document_id uuid
version_number integer
template_version_id uuid null
source_snapshot jsonb
file_object_id uuid
sha256 text null
issued_at timestamptz null
issued_by uuid null
signed_at timestamptz null
supersedes_version_id uuid null
created_at timestamptz
```

Once issued/signed, do not overwrite the generated file or source snapshot.

## 21.3 `document_templates`

```text
id uuid PK
organization_id uuid null
document_type text
name text
version integer
configuration jsonb
active boolean
created_at timestamptz
```

Clinic branding/settings can be organization-specific.

## 21.4 Signatures

Do not store a reusable dentist signature image in a way that lets arbitrary staff stamp it on documents.

Signature workflows need explicit authorization and audit.

Store patient/provider signature artifacts as protected file objects or structured signature strokes plus rendered proof, depending on future legal review.

---

# 22. Billing and Patient Account Ledger

Billing records remain separate from clinical notes even though the application can display them together for authorized roles.

## 22.1 `charges`

```text
id uuid PK
organization_id uuid
patient_id uuid
origin_branch_id uuid
encounter_id uuid null
appointment_id uuid null
provider_id uuid null
treatment_plan_item_id uuid null
description text
amount_centavos integer
currency_code char(3)
status text
charged_at timestamptz
created_by uuid
voided_at timestamptz null
void_reason text null
```

Status examples:

```text
POSTED
VOIDED
ADJUSTED
```

Do not delete a posted charge silently.

## 22.2 `payments`

```text
id uuid PK
organization_id uuid
patient_id uuid
receiving_branch_id uuid
amount_centavos integer
currency_code char(3)
payment_method text
reference_number text null
received_at timestamptz
received_by uuid
status text
voided_at timestamptz null
```

## 22.3 `payment_allocations`

Allows a payment at Branch B to pay charges originating from Branch A.

```text
id uuid PK
organization_id uuid
payment_id uuid
charge_id uuid
amount_centavos integer
created_at timestamptz
```

Business constraints:

- allocation amount > 0;
- total allocations for a payment cannot exceed active payment amount;
- allocation must remain inside the same organization;
- patient must match unless privileged correction workflow exists.

## 22.4 `account_adjustments`

For approved discounts/write-offs/corrections.

```text
id uuid PK
organization_id uuid
patient_id uuid
branch_id uuid
charge_id uuid null
adjustment_type text
amount_centavos integer
reason text
approved_by uuid null
created_by uuid
created_at timestamptz
```

## 22.5 Balance is derived

Do not treat a mutable `patients.balance` column as authoritative.

Balance = posted charges - valid payments/allocations - credits/adjustments according to accounting rules.

A cached balance projection may be introduced later for performance but must be rebuildable from the ledger.

## 22.6 Treatment estimate versus actual charge

Treatment plan estimate:

```text
estimated amount discussed
```

Charge:

```text
actual posted financial event
```

They must not be the same row.

---

# 23. Inventory and Branch Stock

Inventory should use a ledger model.

## 23.1 `inventory_items`

Organization-level catalog.

```text
id uuid PK
organization_id uuid
sku text null
name text
description text null
category text null
unit_of_measure text
is_consumable boolean
track_stock boolean
active boolean
created_at timestamptz
```

Constraint:

```text
unique(organization_id, sku) where sku is not null
```

## 23.2 `branch_inventory_settings`

```text
id uuid PK
organization_id uuid
branch_id uuid
inventory_item_id uuid
reorder_level numeric null
reorder_quantity numeric null
preferred_supplier text null
storage_location text null
active boolean
```

Unique:

```text
(branch_id, inventory_item_id)
```

## 23.3 `inventory_movements`

Append-only operational ledger.

```text
id uuid PK
organization_id uuid
branch_id uuid
inventory_item_id uuid
movement_type text
quantity numeric
related_branch_id uuid null
related_movement_id uuid null
encounter_id uuid null
appointment_id uuid null
reference text null
reason text null
created_by uuid
created_at timestamptz
voided_at timestamptz null
```

Movement types:

```text
OPENING_BALANCE
PURCHASE_RECEIPT
CONSUMPTION
TRANSFER_OUT
TRANSFER_IN
ADJUSTMENT_IN
ADJUSTMENT_OUT
WASTE
RETURN
COUNT_CORRECTION
```

Quantity is positive within each semantic movement type; direction is determined by type, or use signed quantity consistently. Choose one convention and test it thoroughly.

## 23.4 Transfers

Branch transfer should create linked movements transactionally:

```text
Branch A TRANSFER_OUT -5
Branch B TRANSFER_IN  +5
```

Both reference one transfer entity.

### `inventory_transfers`

```text
id uuid PK
organization_id uuid
from_branch_id uuid
to_branch_id uuid
status text
requested_by uuid
approved_by uuid null
shipped_at timestamptz null
received_at timestamptz null
```

### `inventory_transfer_items`

```text
transfer_id
inventory_item_id
quantity
```

## 23.5 Inventory balance

Current stock should be derived from movements.

A materialized/cached branch balance table can be introduced later if performance requires it.

## 23.6 Equipment versus inventory

A panoramic X-ray machine is typically a `branch_resource` for scheduling/availability.

Consumable X-ray film/sensors/covers may be inventory items.

Do not merge these concepts simply because both are “things in the clinic.”

---

# 24. Communications, Reminders, and Messenger

## 24.1 `communications`

Represents one logical message/communication.

```text
id uuid PK
organization_id uuid
patient_id uuid null
appointment_id uuid null
channel text
communication_type text
direction text
status text
recipient_masked text null
content_template_id uuid null
created_by uuid null
created_at timestamptz
```

Channels:

```text
SMS
EMAIL
MESSENGER
MANUAL_MESSENGER
PHONE
OTHER
```

## 24.2 `communication_attempts`

```text
id uuid PK
organization_id uuid
communication_id uuid
provider_name text
provider_message_id text null
attempt_number integer
attempted_at timestamptz
result_status text
error_code text null
error_message_safe text null
provider_response_metadata jsonb null
```

Avoid storing unnecessary sensitive message body/provider payloads in logs.

## 24.3 `reminder_rules`

```text
id uuid PK
organization_id uuid
branch_id uuid null
procedure_id uuid null
event_type text
offset_minutes integer
channel text
active boolean
priority integer
```

Organization rule can be overridden by branch/procedure-specific rule.

## 24.4 `reminder_jobs`

```text
id uuid PK
organization_id uuid
appointment_id uuid
reminder_rule_id uuid
scheduled_for timestamptz
status text
communication_id uuid null
attempt_count integer
last_error text null
created_at timestamptz
```

Status:

```text
PENDING
CLAIMED
SENT
FAILED
CANCELLED
SKIPPED
```

If appointment is cancelled/rescheduled, pending reminder jobs must be cancelled/recalculated transactionally.

---

# 25. Specialist / On-Call Requests

## 25.1 `specialist_requests`

```text
id uuid PK
organization_id uuid
patient_id uuid
appointment_id uuid null
branch_id uuid
required_specialty_id uuid
procedure_id uuid null
requested_provider_id uuid null
requested_starts_at timestamptz null
requested_ends_at timestamptz null
status text
created_by uuid
created_at timestamptz
expires_at timestamptz null
```

Statuses:

```text
DRAFT
SENT
VIEWED
ACCEPTED
DECLINED
ALTERNATE_TIME_REQUESTED
EXPIRED
CANCELLED
```

## 25.2 `specialist_request_responses`

Append-only response history.

```text
id uuid PK
organization_id uuid
specialist_request_id uuid
provider_id uuid
response_type text
proposed_starts_at timestamptz null
proposed_ends_at timestamptz null
message text null
responded_at timestamptz
```

On acceptance, create/confirm provider reservation through scheduling transaction rather than merely flipping a UI status.

---

# 26. Google Calendar Integration Tables

Tokens/secrets must not be stored casually in application-readable rows. Encryption/secrets management is defined more fully in SECURITY_ARCHITECTURE.md.

## 26.1 `google_calendar_connections`

```text
id uuid PK
organization_id uuid
provider_id uuid
connection_status text
google_account_identifier text null
destination_calendar_id text
calendar_title_mode text
last_verified_at timestamptz null
created_at timestamptz
updated_at timestamptz
```

Sensitive refresh-token material should be encrypted/secret-managed and not exposed through ordinary RLS queries.

## 26.2 `google_busy_calendars`

```text
id uuid PK
organization_id uuid
connection_id uuid
calendar_id text
include_in_free_busy boolean
```

## 26.3 `google_event_mappings`

```text
id uuid PK
organization_id uuid
appointment_id uuid
provider_id uuid
connection_id uuid
google_calendar_id text
google_event_id text
sync_status text
last_synced_at timestamptz null
last_error_code text null
```

Unique:

```text
(connection_id, google_event_id)
unique(appointment_id, provider_id, connection_id)
```

## 26.4 `integration_sync_attempts`

```text
id uuid PK
organization_id uuid
integration_type text
entity_type text
entity_id uuid
attempted_at timestamptz
result text
safe_error_code text null
retryable boolean
```

---

# 27. Domain Events / Outbox

External side effects must not occur before the database transaction commits.

Use an outbox pattern.

## 27.1 `domain_events`

```text
id uuid PK
organization_id uuid
event_type text
aggregate_type text
aggregate_id uuid
payload jsonb
occurred_at timestamptz
created_by uuid null
processing_status text
processed_at timestamptz null
attempt_count integer default 0
```

Examples:

```text
APPOINTMENT_CREATED
APPOINTMENT_CONFIRMED
APPOINTMENT_RESCHEDULED
APPOINTMENT_CANCELLED
TREATMENT_PLAN_PRESENTED
TREATMENT_COMPLETED
SPECIALIST_REQUESTED
PATIENT_CREATED
PAYMENT_RECEIVED
```

Worker behavior:

```text
DB transaction
  ├── appointment insert
  ├── reservations insert
  └── domain_event insert
COMMIT
       ↓
worker/queue
       ↓
Google Calendar / SMS / Email
```

This prevents the system from sending a confirmation for a database transaction that ultimately rolled back.

---

# 28. Audit Logging

Audit logs are append-only and distinct from application activity analytics.

## 28.1 `audit_events`

```text
id uuid PK
organization_id uuid
branch_id uuid null
actor_user_id uuid null
actor_type text
action text
entity_type text
entity_id uuid null
patient_id uuid null
result text
request_id text null
session_id text null
ip_hash_or_safe_ip_representation text null
user_agent_summary text null
changed_fields text[] null
reason text null
created_at timestamptz
```

Examples:

```text
PATIENT_VIEWED
PATIENT_UPDATED
CLINICAL_NOTE_CREATED
CLINICAL_NOTE_SIGNED
FILE_DOWNLOADED
PATIENT_RECORD_EXPORTED
APPOINTMENT_RESCHEDULED
PAYMENT_VOIDED
CONSENT_SIGNED
ROLE_CHANGED
BRANCH_CREATED
```

## 28.2 Do not dump full PHI snapshots into generic audit JSON

Audit log should identify what happened without duplicating complete sensitive patient records into a second uncontrolled dataset.

Where before/after snapshots are essential, use narrowly scoped protected history/version tables.

## 28.3 Audit immutability

Normal application roles cannot UPDATE/DELETE audit rows.

Only tightly controlled retention/compliance processes may alter archival storage if legally required.

---

# 29. RLS / Tenant Isolation Design

Supabase RLS is defense-in-depth, not the only authorization layer.

Application server must also authorize business operations.

## 29.1 Universal rule

Every exposed tenant-owned table must enable RLS.

No policy should trust a client-provided `organization_id` simply because it matches a form field.

## 29.2 Authorization source

RLS should derive current user's allowed organizations/branches/permissions from trusted application membership tables linked to `auth.uid()`.

Conceptual helper functions:

```text
current_user_is_org_member(org_id)
current_user_has_permission(org_id, permission_code)
current_user_can_access_branch(org_id, branch_id)
current_user_can_read_patient(org_id, patient_id)
current_user_can_write_clinical(org_id, patient_id)
current_user_is_assigned_specialist(patient_id)
```

Implement helper functions carefully with `security definer`, explicit `search_path`, minimal privileges, and tests where appropriate.

## 29.3 Regular dentist patient access

Current business requirement:

- regular organization dentist: organization-wide clinical read/write according to role permissions;
- visiting/on-call specialist: assigned patient/case access by default;
- admin can explicitly broaden if clinically necessary.

## 29.4 Receptionist access

Receptionist policy should permit domains such as:

- patient demographics;
- contact details;
- appointments;
- acquisition/referral entry;
- allowed billing views;
- communication history.

It should not automatically grant full clinical notes/diagnoses unless organization policy explicitly chooses it and security review approves.

This may require separate tables/views/RPCs rather than one massive patient JSON response.

## 29.5 Public website

Do not grant `anon` broad SELECT/INSERT on clinical tables.

Public website should call purpose-built Next.js server endpoints or carefully designed RPCs with rate limiting and validation.

## 29.6 Service role

Supabase service-role credentials bypass RLS and must never be sent to the browser.

Use only in controlled server/background contexts where truly needed.

## 29.7 RLS tests

Use pgTAP and application integration tests to prove cases such as:

```text
Clinic A user cannot read Clinic B patient.
Branch A receptionist cannot access unauthorized Branch B operations.
Regular dentist can see shared organization patient history.
Visiting specialist sees only assigned cases.
Public anon cannot enumerate patients.
Suspended user cannot access tenant records.
```

RLS tests are required before production patient data.

---

# 30. Referential Integrity and Cross-Tenant Safety

A common multi-tenant bug is a valid foreign key pointing to a row in another tenant.

Example bad state:

```text
appointment.organization_id = Clinic A
appointment.patient_id = Patient belonging to Clinic B
```

A normal FK on `patient_id` alone would technically allow that.

## 30.1 Strategy

For high-risk relationships, enforce tenant consistency using one or more of:

- composite unique keys such as `(organization_id, id)`;
- composite foreign keys `(organization_id, patient_id)` → patients `(organization_id, id)`;
- trusted database functions/triggers when composite FK becomes unwieldy;
- transaction-layer validation plus database constraints.

Prefer database-enforced tenant consistency for:

- appointments → patients;
- clinical notes → patients;
- treatment plans → patients;
- charges/payments → patients;
- branch/resource/provider relationships;
- inventory movements;
- documents/files.

## 30.2 Composite tenant unique pattern

A tenant-owned table can declare:

```sql
unique (organization_id, id)
```

Then child can reference both.

This creates additional indexes/storage but materially reduces cross-tenant corruption risk.

Use it deliberately on high-risk domains.

---

# 31. Indexing Plan

Indexes should be based on real query patterns, not “index every column.”

## 31.1 General rules

- PostgreSQL does not automatically add an index for every foreign-key referencing column; add indexes for commonly joined FKs.
- Lead multi-tenant operational indexes with `organization_id` where appropriate.
- Use branch/time compound indexes for calendars.
- Use partial indexes for active/non-archived rows when useful.
- Use GiST for time-range reservation overlap checks.
- Measure with `EXPLAIN ANALYZE` and Supabase query/index tooling as data grows.

## 31.2 Likely indexes

### Patients

```text
(organization_id, patient_number) unique
(organization_id, birth_date)
(organization_id, normalized_last_name, normalized_first_name, birth_date)
(organization_id, mobile) where mobile is not null
```

Optional trigram index for name search after measuring.

### Appointments

```text
(organization_id, branch_id, starts_at)
(organization_id, patient_id, starts_at desc)
(organization_id, scheduling_status, starts_at)
```

### Reservations

```text
GiST(provider_id, timespan) active exclusion
GiST(resource_id, timespan) active exclusion
(organization_id, expires_at) where status='ACTIVE' and kind='HOLD'
```

### Clinical

```text
(organization_id, patient_id, created_at desc)
(organization_id, patient_id, effective_at desc)
(organization_id, patient_id, tooth_code, effective_at desc)
```

### Billing

```text
(organization_id, patient_id, charged_at desc)
(organization_id, origin_branch_id, charged_at)
(organization_id, receiving_branch_id, received_at)
```

### Inventory

```text
(organization_id, branch_id, inventory_item_id, created_at desc)
(organization_id, inventory_item_id, created_at desc)
```

### Communications

```text
(organization_id, patient_id, created_at desc)
(organization_id, appointment_id, created_at desc)
(organization_id, status, created_at)
```

### Audit

```text
(organization_id, created_at desc)
(organization_id, patient_id, created_at desc)
(organization_id, actor_user_id, created_at desc)
(entity_type, entity_id, created_at desc)
```

Audit tables can become large; retention/partitioning should be evaluated later rather than prematurely implemented.

---

# 32. Constraints Worth Enforcing in the Database

Examples:

## 32.1 Basic integrity

```text
appointment end > start
provider availability end > start
payment amount > 0
charge amount >= 0
inventory transfer source != destination
hold expires_at > created_at
```

## 32.2 Cross-branch/provider scheduling

Active provider reservations cannot overlap for the same provider.

This is organization-wide by virtue of provider identity, so it prevents simultaneous Branch A and Branch B appointments.

## 32.3 Resource scheduling

Active reservations for one chair/device cannot overlap.

## 32.4 Document versioning

```text
unique(document_id, version_number)
unique(treatment_plan_id, version_number)
unique(clinical_note_id, version_number)
```

## 32.5 Patient number

```text
unique(organization_id, patient_number)
```

## 32.6 Branch codes/slugs

```text
unique(organization_id, branch code)
unique(organization_id, branch slug)
```

## 32.7 Tenant consistency

High-risk child rows cannot point to another organization's patient/provider/branch.

---

# 33. Data That Should Not Be Stored as One Mutable Field

Avoid these anti-patterns:

## Bad: `patient.balance`

Use financial ledger, derive balance.

## Bad: `patient.odontogram_json` as only clinical chart

Use structured odontogram history + optional current projection/snapshot.

## Bad: `appointment.dentist_id`

Use appointment providers + provider reservation ledger.

## Bad: `patient.referral_source = 'walk-in'`

Separate acquisition source, referrer, and booking channel.

## Bad: `inventory.current_qty` as only stock history

Use inventory movements; optional projection/cache later.

## Bad: overwriting signed PDF

Use document versions.

## Bad: editing a signed clinical note row

Use note versions/addenda/corrections.

---

# 34. Backup / Recovery Metadata Implications

Database schema should support recovery, but backup infrastructure is outside ordinary tenant tables.

Recommended layered approach from technical architecture:

1. Supabase managed PostgreSQL backups;
2. PITR when subscription/risk requires it;
3. periodic independent logical database export to controlled off-site storage;
4. Cloudflare R2 versioning/retention strategy or backup replication for objects;
5. restore drills.

Important distinction:

```text
Database backup ≠ R2 clinical-file backup
```

The database can be fully restored while files are still missing, so restore procedures must cover both and reconcile `file_objects.object_key` references.

Optional internal table:

### `backup_restore_drills`

```text
id
performed_at
performed_by
environment
backup_reference
result
notes
```

This records that recovery was actually tested.

---

# 35. Database Testing Strategy

## 35.1 pgTAP

Use pgTAP for:

- table/column existence;
- constraints;
- RLS policies;
- helper functions;
- tenant isolation;
- permission rules.

## 35.2 Integration tests

Test real workflows through the Next.js/Supabase application layer:

```text
Create patient
Duplicate warning
Book appointment
Cross-branch provider conflict
Resource conflict
Hold expiry
Reschedule
Cancel
Payment across branches
Inventory transfer
Treatment plan version lock
Clinical note addendum
Visiting specialist access
File-access authorization
```

## 35.3 Concurrency tests

Explicitly run simultaneous booking tests.

Two concurrent transactions attempting the same provider/time must produce exactly one successful reservation.

Do not consider scheduling complete until this is proven.

---

# 36. Migration Strategy

## 36.1 Migrations are source-controlled

All schema changes must be migrations committed to Git.

Do not make undocumented manual production schema edits through Supabase Dashboard.

## 36.2 Small domain migrations

Do not generate all 60+ tables at once.

Suggested sequence:

```text
001 extensions + common helpers
002 organizations + branches
003 profiles + memberships + roles
004 providers + specialties + branch availability
005 patients + relationships + medical history
006 acquisition/referrals
007 procedures + resources
008 appointments + reservations + holds
009 encounters + clinical notes
010 odontogram
011 treatment plans + discussion drawings
012 files + documents
013 billing ledger
014 inventory ledger
015 communications/reminders
016 Google Calendar mappings
017 domain events/outbox
018 audit infrastructure
019 RLS policies by domain
020 indexes/performance refinements
```

Actual numbering may change, but keep migrations reviewable.

## 36.3 Rollback thinking

Not every production migration can be safely rolled back by dropping data.

For destructive changes:

- expand schema;
- migrate/backfill;
- update application;
- verify;
- contract old schema later.

---

# 37. Suggested First ERD — Foundation

```text
AUTH.USERS
   │
   ▼
PROFILES
   │
   ▼
ORGANIZATION_MEMBERS
   │
   ├──────── MEMBER_ROLES ─────── ROLES ───── ROLE_PERMISSIONS
   │
   └──────── BRANCH_MEMBERSHIPS ──────────────┐
                                              │
ORGANIZATIONS ─────────────── BRANCHES ◄──────┘
      │                          │
      │                          ├── BRANCH_RESOURCES
      │                          └── BRANCH_BUSINESS_HOURS
      │
      ├── PROVIDERS ─── PROVIDER_SPECIALTIES
      │       │
      │       └──────── PROVIDER_BRANCHES
      │                    └── PROVIDER_AVAILABILITY_RULES
      │
      └── PATIENTS
```

---

# 38. Suggested Scheduling ERD

```text
PATIENTS
   │
   ▼
APPOINTMENTS ───── APPOINTMENT_PROVIDERS ─── PROVIDERS
   │
   ├────────────── APPOINTMENT_RESOURCES ─── BRANCH_RESOURCES
   │
   ├────────────── APPOINTMENT_STATUS_HISTORY
   │
   └────────────── ENCOUNTERS

BOOKING_REQUESTS
   │
   └── BOOKING_HOLDS
          │
          ├── PROVIDER_RESERVATIONS
          └── RESOURCE_RESERVATIONS

APPOINTMENTS
   │
   ├── PROVIDER_RESERVATIONS
   └── RESOURCE_RESERVATIONS
```

Reservation tables, not calendar UI state, are the final conflict boundary.

---

# 39. Suggested Clinical ERD

```text
PATIENTS
   │
   ├── PATIENT_MEDICAL_CONDITIONS
   ├── PATIENT_ALLERGIES
   ├── PATIENT_MEDICATIONS
   ├── MEDICAL_HISTORY_FORMS
   │
   ├── ENCOUNTERS
   │    └── CLINICAL_NOTES
   │          └── CLINICAL_NOTE_VERSIONS
   │
   ├── ODONTOGRAM_ENTRIES
   ├── ODONTOGRAM_SNAPSHOTS
   │
   ├── TREATMENT_PLANS
   │    └── TREATMENT_PLAN_VERSIONS
   │          ├── TREATMENT_PLAN_ITEMS
   │          └── TREATMENT_DISCUSSIONS
   │                └── DRAWING_VERSIONS
   │
   ├── FILE_OBJECTS
   └── DOCUMENTS
        └── DOCUMENT_VERSIONS
```

---

# 40. Suggested Financial / Inventory ERD

```text
PATIENTS
   │
   ├── CHARGES ◄──────── PAYMENT_ALLOCATIONS ─────── PAYMENTS
   │
   └── ACCOUNT_ADJUSTMENTS

ORGANIZATION
   │
   └── INVENTORY_ITEMS
          │
          ├── BRANCH_INVENTORY_SETTINGS
          └── INVENTORY_MOVEMENTS
                 │
                 └── INVENTORY_TRANSFERS
```

---

# 41. SaaS Readiness Rules

Even though only one clinic uses the prototype initially:

1. never hard-code the first organization's UUID;
2. never hard-code exactly two branches;
3. never assume Branch A/Branch B column names;
4. every tenant query must derive tenant from authenticated membership/context;
5. all tenant-owned unique values should generally be tenant-scoped;
6. objects in R2 should include non-guessable tenant-aware key structure but authorization must not depend on the key being obscure;
7. background jobs must carry organization context;
8. audit events carry organization context;
9. test with at least two fake organizations before production to prove isolation;
10. branch creation must be data/configuration, not a deployment.

Example object-key concept:

```text
organizations/{org_uuid}/patients/{patient_uuid}/files/{file_uuid}
```

Still use authorized presigned access; path obscurity is not security.

---

# 42. Recommended Table Groups by Implementation Phase

## Phase DB-1 — Tenant + identity foundation

Implement first:

```text
organizations
branches
profiles
organization_members
branch_memberships
roles
permissions
role_permissions
member_roles
```

Acceptance:

- fake Org A cannot access Org B;
- owner can add Branch 3 without schema change;
- staff can be assigned to selected branches.

## Phase DB-2 — Providers

```text
providers
specialties
provider_specialties
provider_branches
provider_availability_rules
provider_schedule_exceptions
```

Acceptance:

- one dentist can work at Branch A and B;
- on-call specialist can exist without a login;
- provider availability is branch-aware.

## Phase DB-3 — Patients

```text
patients
patient_contacts
patient_relationships
patient_medical_conditions
patient_allergies
patient_medications
patient_medical_history_forms
```

Acceptance:

- patient record is shared organization-wide;
- duplicate warning uses name + birthday but allows legitimate duplicates;
- guardian/minor model works.

## Phase DB-4 — Acquisition/referrals

```text
acquisition_sources
booking_channels
patient_acquisitions
external_referrers
incoming_referrals
outgoing_referrals
```

## Phase DB-5 — Scheduling

```text
procedures
procedure_specialties
resource_types
branch_resources
resource_unavailability
appointments
appointment_providers
appointment_resources
provider_reservations
resource_reservations
booking_requests
booking_holds
appointment_status_history
```

This phase requires concurrency tests.

## Phase DB-6 — Clinical core

```text
encounters
clinical_notes
clinical_note_versions
odontogram_entries
odontogram_snapshots
```

## Phase DB-7 — Treatment planning/drawings

```text
treatment_plans
treatment_plan_versions
treatment_plan_items
treatment_plan_acknowledgments
treatment_discussions
drawing_versions
```

## Phase DB-8 — Files/documents

```text
file_objects
documents
document_versions
document_templates
```

## Phase DB-9 — Billing

```text
charges
payments
payment_allocations
account_adjustments
```

## Phase DB-10 — Inventory

```text
inventory_items
branch_inventory_settings
inventory_movements
inventory_transfers
inventory_transfer_items
```

## Phase DB-11 — Communications/integrations

```text
communications
communication_attempts
reminder_rules
reminder_jobs
specialist_requests
specialist_request_responses
google_calendar_connections
google_busy_calendars
google_event_mappings
integration_sync_attempts
```

## Phase DB-12 — Reliability/security infrastructure

```text
domain_events
audit_events
backup_restore_drills (optional internal)
```

RLS is not something added only at DB-12; every domain must receive RLS during its implementation. DB-12 represents final cross-domain hardening.

---

# 43. Important Open Decisions That Do NOT Block the Schema Baseline

These can be decided during implementation/prototyping:

1. exact React odontogram library;
2. exact canvas/drawing library;
3. exact SMS provider;
4. eventual automated Messenger provider/API design;
5. exact queue implementation (`pgmq`, external worker, or controlled outbox polling);
6. exact file-virus scanning pipeline;
7. exact PDF rendering library;
8. whether R2 object retention uses native object lock/replication strategy;
9. whether custom roles are exposed to clinic admins in MVP;
10. exact inventory lot/expiry tracking depth;
11. exact BIR invoicing design;
12. future full DICOM/CBCT support.

The schema should leave room for these without pretending they are already decided.

---

# 44. Decisions That MUST Be Resolved Before Production Patient Data

Before production go-live, we must complete/review:

1. apply and verify all relevant controls from SECURITY_ARCHITECTURE.md;
2. full RLS policies and pgTAP isolation tests;
3. backup + restore drill;
4. file-access authorization and presigned URL lifetime;
5. clinical record correction/versioning UX;
6. patient consent/privacy workflow;
7. staff/provider permissions with the actual clinic owner;
8. incident-response process;
9. production/staging separation;
10. secrets rotation/storage;
11. audit event coverage;
12. scheduling race-condition tests;
13. document/signature legal workflow review;
14. data retention/deletion policy appropriate for Philippine healthcare/privacy obligations.

---

# 45. Claude / Codex Implementation Rules for This Database

When an AI coding agent implements this design:

## Do

- read MASTER_PRODUCT_PLAN.md, TECHNICAL_ARCHITECTURE.md, and the relevant database section;
- propose a small migration plan before writing SQL;
- implement one domain at a time;
- create RLS policies in the same phase as sensitive tables;
- create pgTAP tests for RLS/constraints;
- explain every security-definer function;
- verify tenant consistency;
- run migrations/tests against verified non-production Supabase Cloud development/test environments;
- use transactions for multi-row financial/scheduling operations;
- add comments for unusual constraints;
- keep migrations deterministic and committed.

## Do not

- generate the entire database in one uncontrolled migration;
- use `service_role` from browser code;
- disable RLS just to “make it work”;
- use Auth metadata as the sole permission model;
- use client-provided organization IDs as trusted authorization;
- use a mutable patient balance field as accounting source of truth;
- hard-delete finalized clinical records;
- store clinical files as public URLs;
- store only library-specific odontogram JSON;
- rely only on frontend availability checks for scheduling;
- overwrite signed document versions;
- silently broaden visiting-specialist access;
- mix Clinic A and Clinic B test data and assume isolation works without explicit tests.

---

# 46. Recommended Review Workflow

For each database phase:

```text
Claude Plan Mode
      ↓
proposes schema/migration for one domain
      ↓
Codex reviews for:
- normalization
- constraints
- tenant safety
- RLS
- indexes
- race conditions
- migration safety
      ↓
Claude revises
      ↓
implementation
      ↓
pgTAP + integration tests
      ↓
other agent reviews migration/diff
      ↓
commit
```

Do not ask the same agent to be the only architect, implementer, and reviewer of high-risk RLS/scheduling/financial migrations.

---

# 47. Recommended Next Step After This Document

Do **not** immediately scaffold every table.

Next document:

```text
SECURITY_ARCHITECTURE.md
```

Then create:

```text
docs/plans/001-foundation.md
```

Foundation plan scope should be limited to:

```text
Supabase Cloud DEV setup with Git-managed migrations
extensions
organizations
branches
profiles
organization membership
branch membership
roles/permissions baseline
RLS helpers
RLS tests
basic owner/admin branch management
```

Once Foundation is reviewed by both agents, initialize/scaffold the application and implement Phase 1.

---

# 48. Final Database Philosophy

The database should make the **safe state the easy state**.

Examples:

```text
A third branch?
→ insert another branch row; no redesign.

Patient visits another branch?
→ same patient record; new branch-attributed appointment.

Dentist works at both branches?
→ provider_branch schedules; organization-wide reservation prevents double-booking.

Patient signs treatment plan v1?
→ immutable version; later edits create v2.

Receptionist tries to access unauthorized clinical detail?
→ authorization/RLS blocks it.

Two website users click the same slot?
→ database reservation constraint lets only one win.

Payment received at another branch?
→ organization account remains accurate; payment branch remains attributable.

Inventory transferred to new branch?
→ paired ledger movements preserve history.

Odontogram UI library changes?
→ canonical database model survives; only adapter changes.

Clinical image needs download?
→ server authorizes and generates short-lived access; object is not public.
```

The goal is not merely to create tables that can store data.

The goal is to create a data model that actively prevents the most dangerous classes of mistakes while remaining understandable enough for a small team and AI-assisted development.

---

# Appendix A — Preliminary Entity Inventory

This list is intentionally broad and should be implemented incrementally.

```text
organizations
branches
branch_business_hours
branch_closures
profiles
organization_members
roles
permissions
role_permissions
member_roles
branch_memberships
providers
specialties
provider_specialties
provider_branches
provider_availability_rules
provider_schedule_exceptions
patients
patient_contacts
patient_relationships
patient_merge_history
patient_medical_conditions
patient_allergies
patient_medications
patient_medical_history_forms
acquisition_sources
booking_channels
patient_acquisitions
external_referrers
incoming_referrals
outgoing_referrals
procedures
procedure_specialties
procedure_resource_requirements
resource_types
branch_resources
resource_unavailability
appointments
appointment_providers
appointment_resources
provider_reservations
resource_reservations
booking_requests
booking_holds
appointment_access_tokens
appointment_status_history
encounters
clinical_notes
clinical_note_versions
treatment_plans
treatment_plan_versions
treatment_plan_items
treatment_plan_acknowledgments
odontogram_entries
odontogram_current_state (optional projection)
odontogram_snapshots
treatment_discussions
drawing_versions
file_objects
documents
document_versions
document_templates
charges
payments
payment_allocations
account_adjustments
inventory_items
branch_inventory_settings
inventory_movements
inventory_transfers
inventory_transfer_items
communications
communication_attempts
reminder_rules
reminder_jobs
specialist_requests
specialist_request_responses
google_calendar_connections
google_busy_calendars
google_event_mappings
integration_sync_attempts
domain_events
audit_events
backup_restore_drills (optional/internal)
```

---

# Appendix B — Research/Platform Notes Used in This Design

- Supabase currently requires/enforces the use of PostgreSQL RLS for exposed tables and documents RLS as the core row-level authorization primitive.
- Supabase documents linking application profile tables to `auth.users` by the Auth user primary key rather than treating Auth schema as the whole application data model.
- PostgreSQL range types and GiST exclusion constraints are specifically designed to express non-overlapping reservations.
- PostgreSQL's `btree_gist` extension provides GiST operator classes for scalar values such as UUID, allowing provider/resource equality to be combined with range-overlap constraints.
- Supabase currently exposes `btree_gist` among supported PostgreSQL extensions.
- Supabase supports pgTAP database tests, including testing RLS policies.
- Supabase provides Cron/pg_cron and a Postgres queue option (PGMQ), but exact automation/queue choice remains an implementation decision rather than a permanent database dependency in v1.

---

**End of DATABASE_DESIGN.md v1.0**
