# Dental EMR & Practice Management Platform — Technical Architecture

**Version:** 1.7  
**Status:** Architecture baseline for prototype and future SaaS evolution  
**Prepared:** 2026-08-12 (Asia/Manila)  
**Companion documents:** `MASTER_PRODUCT_PLAN.md`, `DATABASE_DESIGN.md`, `FRONTEND_ARCHITECTURE.md`, `SECURITY_ARCHITECTURE.md`  
**Primary implementation agents:** Claude Code + OpenAI Codex, with human approval and Git as the source of truth

---

# 0. Purpose of This Document

This document converts the product plan into an engineering architecture. It answers **how the system should be organized**, which technologies should be used, where data should live, which component owns each business rule, how the two clinic branches interact, how the public website connects to the private EMR, how background automations run, and how the design can evolve from a one-clinic prototype into a multi-tenant SaaS.

This is intentionally separate from the master product plan:

- `MASTER_PRODUCT_PLAN.md` = what the product must do and why.
- `TECHNICAL_ARCHITECTURE.md` = how the system is technically structured.
- `DATABASE_DESIGN.md` = exact data domains, proposed tables, relationships, constraints, indexes, RLS strategy, scheduling reservation model, and migration sequence.
- `SECURITY_ARCHITECTURE.md` = approved threat model, access-control baseline, privacy controls, secrets, incident response, secure-development requirements, and production hardening.
- Future phase plans = exact implementation steps for one bounded feature.

Important architecture changes should be recorded through Architecture Decision Records (ADRs). Conversation history must not become the only source of an engineering decision.

---

# 1. Confirmed Product Context

## 1.1 Current clinic structure

The first deployment is for **one dental business under one owner with two branches**.

Conceptually:

```text
Organization / Dental Business
│
├── Branch A
└── Branch B
```

Both branches belong to the same organization and should use a shared EMR. They are **not separate tenants**.

## 1.2 Future commercial direction

The prototype is initially for this one clinic, but the product is intended to become a **multi-tenant SaaS** that can later serve other dental organizations.

Therefore the architecture must support this hierarchy from day one:

```text
Platform
│
├── Organization A
│   ├── Branch A1
│   └── Branch A2
│
├── Organization B
│   └── Branch B1
│
└── Organization C
    ├── Branch C1
    ├── Branch C2
    └── Branch C3
```

The initial application may expose only one organization, but core domain tables must be tenant-aware so later SaaS conversion does not require a destructive redesign.

## 1.3 Patient scope

Patients belong primarily to the **organization**, not permanently to one branch.

A patient registered in Branch A can later be treated in Branch B while retaining one longitudinal record.

```text
Patient
├── organization_id
├── home/preferred branch (optional)
└── appointments/encounters may occur at either branch
```

Clinical history is shared across the organization subject to authorization.

## 1.4 Provider scope

Dentists/providers belong to the organization and may be associated with one or multiple branches.

A provider may be:

- regular;
- part-time;
- visiting;
- on-call;
- external specialist.

Provider availability must be branch-aware because the same dentist may work at different branches on different days.

## 1.5 Staff scope

Staff can be assigned to one or multiple branches. The architecture must support branch-scoped access without assuming every staff member belongs to exactly one branch.

## 1.6 Resources and equipment

Dental chairs, imaging equipment, rooms, and other schedulable physical resources are branch-specific.

A resource available only in Branch A must affect appointment availability for procedures that require it.

## 1.7 Prices

There is **no single fixed treatment price**. Pricing may vary by case, provider, branch, difficulty, materials, and clinical judgment.

Therefore the architecture must not make `procedure.price` the authoritative charge.

Procedures may have optional informational/default price ranges, but actual treatment-plan estimates and charges are explicit patient/case-specific values with change history.

---

# 2. Confirmed Technology Stack

The following technology direction is approved for the prototype.

## 2.1 Application framework

- **Next.js** — current stable App Router release at project initialization
- **React** — version required by chosen Next.js version
- **TypeScript** — strict mode

Next.js is used for both:

- public clinic website surfaces;
- private authenticated EMR surfaces;
- controlled server endpoints / Route Handlers;
- server-rendered pages where useful.

Do not put security decisions solely in React components.

## 2.2 Frontend/UI architecture

The detailed frontend engineering and visual-design specification is now authoritative in:

- **`FRONTEND_ARCHITECTURE.md`**

Approved baseline:

- Tailwind CSS;
- shadcn/ui as the source-owned UI component foundation;
- Lucide React icons;
- Geist Sans through `next/font`;
- React Hook Form + Zod for forms/validation;
- TanStack Query selectively for live/interactive server state;
- TanStack Table for complex tables;
- DayPilot Lite for the prototype scheduling/resource-calendar UI;
- React Konva/Konva for treatment-discussion drawing;
- Signature Pad for signature capture;
- Apache ECharts for analytics;
- `@react-pdf/renderer` for generated document/PDF templates;
- Playwright + Vitest + Testing Library for frontend testing.

Visual direction:

- neutral-first clinical UI;
- deep navy as the main brand/action color;
- warm white surfaces;
- blush and muted gold used sparingly as accents inspired by the clinic poster;
- no rainbow dashboard or heavily colorful clinical screens;
- light mode is the MVP target.

The application must work well on:

- laptop/desktop;
- iPad/tablet in portrait and landscape;
- modern mobile phones;
- touch;
- mouse/trackpad;
- stylus where supported.

The web application is responsive across these device classes. High-density clinical tools such as the full odontogram editor, resource scheduler, and treatment canvas remain larger-screen optimized, but each requires a deliberate phone composition or safe supported alternative; the implementation must not rely on a squeezed desktop layout or a read-only assumption for the entire mobile application.

Frontend libraries are interaction/rendering adapters, not domain models. Scheduling, odontogram, canvas, documents, and analytics must remain replaceable without changing canonical patient/domain data.

## 2.3 Database and backend platform

- **PostgreSQL** managed by **Supabase Cloud**
- developers use a disposable, synthetic-only local Supabase stack for Phase 2 and accepted Phase 3 migration, RLS, and pgTAP verification; guarded Cloud TEST remains mandatory before production under ADR-020/ADR-021
- hosted development, Cloud TEST, any future separately approved staging, and production continue to use separate Supabase project boundaries; local verification plus dedicated review is acceptance evidence only for Phase 2 and separately approved Phase 3 checkpoints
- PostgreSQL constraints and transactions are used for data integrity
- Supabase managed platform is used where appropriate for Auth, database operations, realtime capabilities if justified, and platform tooling
- schema changes remain Git-managed migrations even though runtime databases are hosted

## 2.4 Authentication

- **Supabase Auth**
- server-side session handling compatible with Next.js App Router
- application-specific organization, branch, provider, and role memberships remain in application tables rather than being encoded only in Auth metadata

## 2.5 Authorization

- application-layer authorization is mandatory
- PostgreSQL / Supabase Row Level Security is used as defense in depth
- tenant isolation is enforced at the database layer for exposed tables
- no client-controlled `organization_id`, role, or branch field is trusted without server/database validation

## 2.6 Canonical object storage

**Production: Cloudflare R2** as the canonical object store for private clinical files and project-controlled website media.

**Development: MinIO** (S3-compatible Docker object storage) under ADR-022. MinIO
runs locally, requires no cloud credentials, and provides the same S3-compatible
API surface. The application uses a provider-neutral storage abstraction;
switching from MinIO to R2 requires only configuration changes.

Rationale:

- S3-compatible API;
- private bucket model for sensitive clinical objects;
- temporary presigned URLs for narrowly scoped transfer where appropriate;
- encrypted at rest and in transit;
- no egress-bandwidth fee on R2 Standard storage under current pricing;
- supports bucket locks/retention controls useful for protecting files from accidental deletion;
- keeps storage ownership independent from the image-rendering/optimization layer.

Use object storage for:

- patient photos;
- ordinary dental X-ray images exported as JPEG/PNG where clinically acceptable;
- scanned consent forms;
- signed PDFs;
- generated document snapshots that must be retained;
- treatment-discussion renders;
- attachments;
- referral documents;
- medical clearance files;
- clinic/public website media where practical;
- other moderate-size application files.

Do **not** treat R2 object storage as a substitute for authorization. A private file must still be linked to an authorized domain record and accessed through a permission-checked application flow.

## 2.7 Image optimization and derivative pipeline

Use **Cloudflare Workers + Cloudflare Images** as the default image-processing layer over R2. Cloudflare's Images binding can accept image bytes/streams directly, so a private R2 source does not need to be exposed through a public URL before transformation.

**Local development:** MinIO does not provide image transformation. Derivative
generation is deferred to deployment readiness or implemented through a
provider-neutral Sharp-based service during development.

Rules:

- preserve the original clinical image unchanged as the authoritative source object;
- generated derivatives are non-canonical display artifacts;
- standard variants are bounded (`thumbnail`, `preview`, `display`) rather than arbitrary client-defined dimensions;
- use WebP/AVIF or another optimized output only for derivatives where appropriate;
- never replace the sole clinical/X-ray source with a lossy derivative;
- X-ray originals remain untouched;
- authorize private-file access before fetching/transforming the R2 source;
- do not leak private object keys, presigned URLs, or source bytes through public transformation endpoints;
- cache transformed responses and/or persist reusable derivatives in R2 to avoid repeated decode/re-encode work;
- record processing status and derivative metadata in PostgreSQL;
- derivative creation must be idempotent.

For asynchronous processing, the preferred later pattern is:

```text
R2 original object-create
        ↓
R2 Event Notification
        ↓
Cloudflare Queue
        ↓
Consumer Worker
        ↓
Cloudflare Images binding
        ↓
thumbnail / preview / display
        ↓
R2 derivative objects + PostgreSQL metadata
```

Cloudinary is **not a default project dependency**. It may be reconsidered only through an ADR if a validated future requirement cannot reasonably be met using R2 + Cloudflare Workers/Images.

Keep a small application media adapter between domain/UI code and Cloudflare-specific transformation calls. If Cloudflare Images pricing, limits, or feature constraints later become unsuitable, a reviewed ADR may replace the processor (for example with a controlled Sharp-based worker/service) without changing canonical R2 storage or the semantic `thumbnail`/`preview`/`display` contract. Cloudflare's current official user-upload optimization tutorial requires an Images Paid subscription; re-check current plan/pricing before enabling the production pipeline.

## 2.8 Hosting

- **Vercel** for Next.js deployment
- production, Preview/Cloud TEST, any future separately approved staging, and developer/cloud-development environments must be distinct
- secrets/environment variables must be environment-scoped

## 2.9 External integrations

- Google Calendar API
- transactional email provider — adapter/interface first, provider selected later
- Philippine-capable SMS provider — adapter/interface first, provider selected later
- Meta Messenger Platform — later phase

## 2.10 Background scheduling/automation

Recommended baseline:

- Postgres/Supabase durable job records as the source of scheduled work
- Supabase Cron / `pg_cron` for periodic scheduler ticks or scheduled function invocation
- Supabase Edge Functions or controlled server workers for job execution where appropriate
- queue/outbox semantics for reliable event processing

Vercel Cron is available and can be used for selected maintenance/orchestration jobs, but the core reminder system should not depend on a browser session and should not be built from in-memory `setTimeout()` calls.

The exact queue technology can be finalized after the first automation proof of concept. Domain interfaces should prevent vendor lock-in.

---

# 3. Architecture Principles

## 3.1 One source of truth

The EMR/PostgreSQL database is authoritative for:

- patients;
- appointments;
- treatment plans;
- provider assignments;
- branch/resource reservations;
- billing balances;
- communication history;
- audit history.

Google Calendar, Messenger, SMS, email, and the public website are integrations and interaction channels, not competing primary databases.

## 3.2 Enter once, reuse everywhere

Example:

```text
Website Booking
    ↓
Patient / Prospective Patient Data
    ↓
Appointment Request
    ↓
Provider + Branch + Resource Scheduling
    ↓
Google Calendar
    ↓
Reminder Automation
    ↓
Analytics Attribution
```

Reception should not need to manually retype the same appointment into another calendar.

## 3.3 Organization-aware and branch-aware by design

Every important record must have a clear tenant/organization relationship. Branch-specific operations must also have a branch relationship.

Do not scatter tenant filters manually throughout UI code. Build reusable authorization and query primitives.

## 3.4 Server owns business rules

Examples:

- appointment conflict detection;
- role authorization;
- charge creation;
- finalizing a clinical note;
- signing a treatment plan;
- generating an official document snapshot;
- assigning a specialist;
- creating Google Calendar mappings;
- inventory adjustments.

The browser may request an action, but it does not get to declare the action valid.

## 3.5 Database constraints backstop application logic

Important invariants should have database constraints or transactional safeguards when possible.

Examples:

- foreign keys;
- unique mapping IDs;
- non-negative quantities where appropriate;
- immutable finalized versions;
- appointment hold expiry semantics;
- idempotency keys for external integrations.

## 3.6 Append/amend instead of silently rewriting history

Clinical and legally significant records should preserve history.

Finalized clinical notes, signed treatment plans, signed consents, issued document snapshots, and audit events are not silently overwritten.

Corrections should create amendments/superseding versions with actor, timestamp, and reason.

## 3.7 Public and private surfaces are separate trust zones

The public website may expose:

- clinic information;
- providers marked public;
- public services;
- safe booking availability;
- booking-request submission.

The public website must never have broad patient-table access.

## 3.8 Graceful failure

External failures must not lose clinic data.

Example:

```text
Appointment saved in EMR
        ↓
Google API temporarily fails
        ↓
Appointment still exists
        ↓
Calendar sync job = retry_pending
        ↓
staff sees integration warning
```

---

# 4. High-Level System Topology

```text
                                    INTERNET
                                       │
                  ┌────────────────────┴─────────────────────┐
                  │                                          │
          PUBLIC CLINIC WEBSITE                        PRIVATE EMR
                  │                                          │
     marketing / public booking                  authenticated staff UI
                  │                                          │
                  └────────────────────┬─────────────────────┘
                                       │
                              NEXT.JS SERVER LAYER
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
  Public Booking API            Auth + Authorization            Domain Services
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                                  POSTGRESQL
                                       │
    ┌─────────────────┬────────────────┼─────────────────┬──────────────────┐
    │                 │                │                 │                  │
 Tenant/Branch     Clinical        Scheduling        Billing          Audit/Outbox
    │                 │                │                 │                  │
    └─────────────────┴────────────────┼─────────────────┴──────────────────┘
                                       │
                              Durable Automation
                                       │
       ┌──────────────────┬────────────┼─────────────┬──────────────────┐
       │                  │            │             │                  │
 Google Calendar         SMS          Email       Messenger later    Backup Jobs
       │                                                            │
       │                                                        backup bucket
       │
  Provider Work Calendar

Private clinical originals ─────────────→ Cloudflare R2 (production) / MinIO (local dev)
Public/project media ────────────────────→ Cloudflare R2 (production) / MinIO (local dev)
Image derivatives ───────────────────────→ Workers + Cloudflare Images → R2/cache (production)
```

---

# 5. Multi-Tenant and Multi-Branch Model

## 5.1 Core hierarchy

Use terminology consistently:

- **Platform** = SaaS product itself.
- **Organization** = one dental business/customer/tenant.
- **Branch** = physical clinic location belonging to an organization.
- **Member** = authenticated user associated with an organization.
- **Provider** = dentist/clinical provider profile.
- **Resource** = branch-specific physical item/location used for scheduling.

## 5.2 Tenant identifiers

Core tenant-owned tables should carry `organization_id` directly or derive it through a strongly constrained parent.

For highly sensitive or frequently queried tables, direct `organization_id` is often worth the denormalization because it makes RLS, auditing, and tenant-safe indexing simpler.

Do not let the frontend pick an arbitrary tenant ID from a hidden form field.

## 5.3 Branch model

`branches` should include concepts such as:

- organization ID;
- branch name;
- address;
- timezone (default Asia/Manila for first tenant);
- phone/contact channels;
- opening hours;
- active/inactive state;
- booking settings;
- reminder overrides;
- website visibility;
- public map/location metadata.

## 5.4 Shared patient record

A patient is organization-level.

Branch context belongs on operational records:

- appointment branch;
- encounter branch;
- charge origin branch;
- payment receiving branch;
- inventory movement branch;
- document issuing branch where relevant.

This allows organization-wide continuity while preserving branch reporting.

## 5.5 Shared balance with branch attribution

The patient account can be organization-level while every financial event keeps branch attribution.

Example:

```text
Charge: ₱5,000
Origin branch: Branch A
Provider: Dr. X

Payment: ₱2,000
Received at: Branch B
Applied to: Branch A charge
```

Organization balance is correct while branch reports can still show where work happened and where money was received.

---

# 6. Identity, Authentication, and Membership

## 6.1 Supabase Auth responsibilities

Supabase Auth manages identity/session concerns such as:

- email/password or approved authentication method;
- login/logout;
- password reset;
- session refresh;
- verified account state.

Do not treat `auth.users` as the full employee/provider domain model.

## 6.2 Application membership tables

Maintain domain tables for:

- user profile;
- organization membership;
- branch membership/access;
- role assignments;
- provider linkage;
- invitation status;
- active/suspended status.

## 6.3 Roles

Baseline roles:

- Organization Owner / Super Admin
- Clinic Administrator / Manager
- Dentist
- Receptionist
- Dental Assistant
- Visiting / On-call Specialist
- future Accounting/Billing role if needed

## 6.4 Clinical access decision

Confirmed requirement: dentists in the same dental organization need cross-branch access to patient clinical records so continuity of care is possible.

**Safety refinement:** regular organization dentists can receive organization-wide clinical access. Visiting/on-call specialists should default to access only to patients/cases assigned to them, with explicit expansion by an authorized administrator when clinically needed.

This protects patient privacy without preventing specialist care.

## 6.5 Receptionist access

Receptionists need organization/branch scheduling access, demographics, contacts, appointment communications, acquisition/referral entry, and permitted billing data.

They should not automatically receive unrestricted access to every sensitive clinical detail unless the clinic explicitly chooses that policy and the security review approves it.

## 6.6 Branch access

A user may belong to multiple branches. Authorization helpers should support:

- organization-wide permission;
- one-branch permission;
- selected-branches permission;
- assigned-patient-only clinical permission.

---

# 7. Patient Identity, Duplicate Detection, Family, and Guardians

## 7.1 Primary duplicate signal

The clinic prefers **Name + Birthday** as the main duplicate-detection signal.

Do **not** make normalized name + date of birth a hard unique database constraint because different people can legitimately share both.

Instead:

1. normalize name for search/comparison;
2. compare birth date;
3. show a duplicate warning;
4. optionally compare mobile/email as secondary signals;
5. require staff confirmation to create a second likely duplicate;
6. provide a controlled merge workflow later.

## 7.2 Patient merge

Patient merge is high-risk and audited.

Merge must:

- never destroy clinical history;
- preserve source patient IDs as aliases/history;
- re-parent related records transactionally;
- require privileged permission;
- show a detailed preview before execution;
- generate an audit event.

## 7.3 Family/household relationships

Support relationships such as:

- parent/guardian;
- child/minor;
- spouse;
- dependent;
- emergency contact;
- household billing contact later if needed.

Avoid creating one shared “family medical record.” Every patient still has an independent clinical record.

## 7.4 Minor patients

Architecture must support guardian/contact/consent relationships without assuming the patient's phone/email is always their own.

---

# 8. Public Website Architecture

## 8.1 One website for both branches

Both branches share one public website because they share owner and business identity.

Suggested public structure:

```text
/
/about
/services
/dentists
/branches
/branches/[branch-slug]
/book
/contact
```

## 8.2 Website/EMR deployment shape

The public site and private EMR may live in one Next.js codebase initially for engineering simplicity, but they must remain separate route groups/trust boundaries.

Example:

```text
app/
  (public)/
  (booking)/
  (auth)/
  (emr)/
  api/
```

If the SaaS later grows, public marketing surfaces can be separated without changing domain APIs.

## 8.3 Public data

Public provider/service/branch data should be explicitly publishable, not rendered by directly exposing internal tables wholesale.

## 8.4 Booking endpoints

Public booking uses purpose-built endpoints/functions that expose only:

- safe service information;
- provider names/photos explicitly public;
- safe availability slots;
- booking request submission;
- short-lived appointment management tokens.

No public endpoint should accept a patient ID and return a patient record.

---

# 9. Online Booking and Appointment Holds

## 9.1 Default booking policy

Initial policy: **review-first**.

Online appointments create a request/pending appointment that staff reviews before final confirmation.

The system must support configurable modes at organization/branch/service level:

- `REQUIRES_REVIEW`
- `AUTO_CONFIRM`

Organization default can be review-first; specific routine procedures may later opt into auto-confirm.

## 9.2 Slot hold

When a user selects a slot during an online booking flow, create a temporary hold.

Confirmed preference:

- hold duration: **5 minutes**
- state transition: `HELD → CONFIRMED/REQUESTED` or `HELD → EXPIRED`

The hold should be enforced server/database-side, not only visually in React.

## 9.3 Concurrency

Two users must not both successfully book the same provider/resource slot because they clicked at nearly the same moment.

The booking transaction must re-check conflicts at commit time.

A scheduling design phase should evaluate PostgreSQL exclusion constraints/range strategies or carefully serialized application logic rather than relying on “check then insert” alone.

## 9.4 Online booking inputs

For new patient requests, keep first-step data minimal:

- first/last name;
- birthday only if needed for existing-patient matching or later step;
- mobile;
- email optional/configurable;
- service;
- branch/preference;
- preferred provider or any provider;
- date/time;
- acquisition source;
- referrer when applicable.

Full medical history belongs in secure digital intake after the appointment workflow has progressed.

---

# 10. Scheduling Engine

## 10.1 Scheduling is a domain service

Do not encode scheduling rules only in the calendar component.

The scheduling engine must reason over:

- organization;
- branch;
- procedure/service;
- specialty;
- qualified provider;
- provider branch schedule;
- provider time off/blocks;
- organization-wide provider conflicts;
- Google Calendar busy intervals;
- required branch resource/equipment;
- resource availability;
- procedure duration;
- temporary website holds;
- existing EMR appointments.

## 10.2 Cross-branch provider conflict prevention

Confirmed requirement: the same dentist must never be booked at two branches simultaneously.

Provider collision detection is therefore **organization-wide**, even when branch calendars are viewed separately.

## 10.3 Branch-specific resources

Examples:

```text
Branch A
├── Chair A1
├── Chair A2
├── Panoramic X-ray
└── Surgery Room

Branch B
├── Chair B1
├── Chair B2
└── Chair B3
```

A procedure requiring a device available only in Branch A must not be offered as directly bookable in Branch B unless a valid alternative workflow exists.

## 10.4 Multi-provider appointments

Do not store only `appointment.dentist_id`.

Use appointment-provider relationships so an appointment can include:

- primary provider;
- assistant provider;
- consultant;
- surgeon;
- restorative dentist;
- specialist.

## 10.5 Appointment state

Separate:

- scheduling state;
- confirmation state;
- waiting-room/encounter state when useful.

Do not overload one status enum with every operational concept.

Suggested scheduling lifecycle concepts:

- REQUESTED
- HELD
- SCHEDULED
- CONFIRMATION_PENDING
- CONFIRMED
- AWAITING_SPECIALIST
- RESCHEDULE_REQUESTED
- CANCELLED
- NO_SHOW
- COMPLETED

Clinical encounter state may separately include:

- NOT_ARRIVED
- CHECKED_IN
- IN_CHAIR
- FINISHED

---

# 11. Provider Availability and Google Calendar

## 11.1 EMR source of truth

Google Calendar is not the appointment database.

## 11.2 Calendar used for EMR-created events

Confirmed clinic preference:

- create EMR events in the provider's selected **Work Calendar**.

Each provider connection stores the chosen destination calendar ID.

## 11.3 Busy calendars

Architecture should allow a provider to select one or more Google calendars that participate in free/busy checks.

A provider may choose:

- Work Calendar only;
- Work + Personal for conflict blocking;
- exclude irrelevant calendars such as birthdays.

The EMR only needs busy ranges for private personal events; it does not need their title/details.

## 11.4 Event title privacy

Confirmed preference for the first clinic:

```text
Maria S. — Cleaning
```

This is the **Detailed** mode.

Architecture requirement: calendar title detail remains configurable because procedure + patient initials can reveal health-related information. Store this as an organization/provider integration setting, not a hard-coded string.

Possible modes:

- High Privacy: `Dental Appointment`
- Balanced: `Cleaning`
- Detailed: `Maria S. — Cleaning`

The initial tenant may explicitly select Detailed.

## 11.5 Idempotent sync

Maintain an internal appointment-to-Google mapping and idempotency strategy.

Never create duplicate calendar events simply because a network response timed out.

## 11.6 Sync failure

Store:

- sync state;
- last attempt;
- last success;
- error category;
- retry count;
- provider connection health.

Reception should be able to see that the EMR appointment is valid even when Calendar sync is temporarily degraded.

---

# 12. Communication Architecture

## 12.1 Desired channel priority

Confirmed long-term preference:

1. Messenger primary
2. SMS fallback
3. Email additional

## 12.2 MVP constraint

Confirmed MVP direction:

- website booking;
- **manual Messenger** initially;
- automated Messenger integration later.

Therefore the initial automated reminder implementation should not pretend Messenger automation exists.

Recommended MVP behavior:

- SMS and/or email automation can operate through adapters;
- communication preferences can record Messenger as preferred;
- staff can receive a task/queue indicator to send a manual Messenger reminder where desired;
- communication log can record `MANUAL_MESSENGER` events;
- once Meta integration is approved, automated Messenger becomes another provider behind the same notification interface.

## 12.3 Notification adapter

Create a channel-neutral application interface such as:

```text
NotificationService
  sendSms(...)
  sendEmail(...)
  sendMessenger(...)  // unavailable/feature-flagged initially
```

Domain logic should not call Twilio/Semaphore/Meta directly.

## 12.4 Delivery attempts

Model a communication separately from its attempts.

This allows:

```text
Reminder #123
├── Messenger attempt: manual/pending
├── SMS attempt: delivered
└── Email attempt: delivered
```

## 12.5 Automation rule scope

Confirmed preference: rules are primarily **organization-wide**.

Support hierarchy:

```text
Organization default
        ↓
Branch override (optional)
        ↓
Procedure/provider override only if later justified
```

Do not duplicate every rule for both branches unless they actually differ.

---

# 13. Reliable Automation and Domain Events

## 13.1 Event-driven design

Business actions create domain events/outbox records inside the same database transaction when possible.

Examples:

- PatientCreated
- AppointmentRequested
- AppointmentScheduled
- AppointmentConfirmed
- AppointmentRescheduled
- AppointmentCancelled
- ProviderAssigned
- SpecialistRequested
- AppointmentCompleted
- TreatmentPlanFinalized
- TreatmentCompleted
- RecallDue
- PaymentRecorded
- InventoryBelowReorderLevel

## 13.2 Transactional outbox pattern

Recommended for reliability:

1. transaction writes business state;
2. transaction writes outbox event;
3. worker claims event;
4. worker performs external side effect;
5. worker records result;
6. failures retry with backoff/dead-letter policy.

This prevents the classic failure where the appointment is saved but the system loses all knowledge that a reminder/calendar update still needs to happen.

## 13.3 Scheduled reminders

Do not create millions of browser timers.

Store scheduled jobs/reminders in PostgreSQL with `due_at`, state, attempt count, and idempotency key.

A periodic scheduler claims due work.

## 13.4 Idempotency

External effects must tolerate retries.

Use deterministic/idempotency keys where supported and internal uniqueness guards where providers do not support them.

---

# 14. Odontogram Architecture

## 14.1 MVP requirement

Confirmed: **odontogram is required in the first clinically usable version**, not postponed to a distant phase.

## 14.2 Open-source research

The frontend review expanded the odontogram candidates.

### Selected implementation — `react-advanced-odontogram`

Upstream repository: `ZoliQua/React-Odontogram-Modul`

Project-controlled fork: `Ditherys/React-Odontogram-Modul` (`https://github.com/Ditherys/React-Odontogram-Modul`)

Relevant characteristics at research time:

- React + TypeScript;
- SVG-based clinical editor;
- multi-surface caries/restoration support;
- endodontic/prosthetic states;
- periodontal charting;
- FDI, Universal, and Palmer notation;
- read-only mode;
- touch/accessibility testing;
- export capabilities;
- MIT license.

This is the selected implementation because its clinical feature set is closest to the current requirement. It must still pass the clinical, security, Next.js, touch, maintenance, and data-mapping prototype gate before production launch. A project-controlled fork already exists and is the approved source for the spike and project-specific fixes. Fork ownership does not remove the prototype gate. Preserve the upstream MIT copyright/license notice. For production, pin an explicitly approved fork tag/commit or controlled versioned package; never follow the fork's moving `main` branch. Treat the upstream repository only as a source of candidate updates, and merge upstream releases into the controlled fork only after review and regression testing. The fork currently retains inherited upstream `repository`/`bugs` fields in `package.json`; those fields do not change the approved source and should be corrected before publishing a project-controlled package.

### Candidate B — `odontogram`

Repository: `biomathcode/odontogram`

Relevant characteristics at research time:

- framework-independent Web Component using Lit;
- works in React/Next.js;
- adult/baby/geriatric modes;
- FDI/Universal/Palmer notation;
- interactive five-surface tooth regions;
- JSON export/rehydration;
- PNG export;
- accessibility support.

### Candidate C — `react-odontogram`

Repository: `biomathcode/react-odontogram`

Relevant characteristics at research time:

- React component;
- SVG-based;
- FDI, Universal, and Palmer notation;
- tooth selection;
- condition coloring;
- read-only display;
- structured tooth detail objects;
- MIT license.

It is useful as a reference or tooth-selector/visualization candidate, but its public model is less complete for our required surface-level clinical charting.

## 14.3 Important rule: library is not the clinical data model

Do **not** make the database schema equal to a library's internal JSON structure.

Instead:

```text
Our Odontogram Domain Model
        ↓ adapter
UI Library / Custom Renderer
```

If the library becomes abandoned or clinically insufficient, the renderer can be replaced without migrating every patient chart.

### Dependency ownership policy

- Use the controlled `Ditherys/React-Odontogram-Modul` fork during the spike.
- Keep `ZoliQua/React-Odontogram-Modul` configured conceptually as upstream/update source only.
- Before production, pin an approved fork tag/commit or controlled versioned package; do not track a moving branch.
- Preserve the MIT copyright and permission notice.
- Commit and enforce the package lockfile.
- Pin the approved version; no unattended major/minor upgrades.
- Build our own regression tests for every clinical behavior the EMR relies on.
- Keep the adapter boundary so a future renderer can replace it without changing canonical patient data.

## 14.4 Prototype evaluation criteria

Before productionizing the selected library/fork, evaluate:

- adult dentition;
- primary dentition;
- mixed dentition;
- tooth surfaces;
- missing/extracted teeth;
- caries;
- fillings/restorations;
- crowns;
- root canal/endodontic state;
- implants;
- pontics/bridges;
- dentures/prosthetics where needed;
- orthodontic markers later;
- periodontal data relationship (likely separate periodontal chart rather than forcing it into odontogram);
- historical snapshots;
- treatment planned vs existing vs completed;
- printing/PDF clarity;
- touch/stylus usability on iPad;
- keyboard/accessibility;
- performance;
- SSR/client-component compatibility in Next.js;
- license and maintenance health.

## 14.5 Versioned odontogram state

The system should preserve clinically meaningful history.

Do not simply mutate one JSON blob forever.

Likely design:

- current normalized tooth/surface state for efficient rendering/querying;
- encounter/treatment events as source history;
- snapshots/versions for historical reconstruction when needed.

Exact schema belongs in `DATABASE_DESIGN.md` and must be validated with the dentist.

---

# 15. Treatment Discussion Canvas

## 15.1 Supported devices

Confirmed target:

- iPad/tablet;
- laptop/desktop;
- mobile phone for safe viewing and appropriately adapted editing flows;
- touch;
- stylus;
- mouse.

Use Pointer Events rather than separate mouse/touch-only logic where practical. The canvas may remain larger-screen optimized, but phone access must render intentionally and provide a clear safe alternative when precision editing is not validated for the small viewport.

## 15.2 Storage model

Confirmed: use **editable source + rendered snapshot**.

Store:

- structured vector/canvas scene JSON (application-defined/versioned);
- rendered PNG/WebP preview;
- optional PDF render when formally issued;
- source image/X-ray reference if annotated;
- linked treatment plan/version;
- author/provider;
- timestamps.

Do not store only a screenshot if dentists need to reopen and edit the discussion.

## 15.3 Library isolation

Like the odontogram, do not make patient records depend directly on one canvas library's undocumented private internals. Use a versioned application-level schema or wrapper/adapter.

## 15.4 Formal discussion snapshot

When a patient acknowledges/signs a treatment discussion, freeze an immutable document/version while allowing a new revision later.

---

# 16. Documents, PDF, Printing, and Signatures

## 16.1 Shared document engine

Create one document-generation subsystem for:

- patient record summary;
- treatment plan;
- treatment plan packet with drawing;
- treatment estimate;
- statement of account;
- prescription;
- referral letter;
- consent;
- dental certificate;
- X-ray/lab request;
- post-op instructions;
- appointment slip;
- annotated image output.

Do not build unrelated PDF code inside each page.

## 16.2 Live document vs issued snapshot

Separate:

- **live data view** — current treatment plan/account/etc.;
- **issued snapshot** — exact version shown/signed/printed/emailed at a specific time.

## 16.3 Immutable signed versions

Confirmed: signed/finalized PDFs are immutable records.

If the treatment plan changes:

```text
Treatment Plan v1 — signed
Treatment Plan v2 — revised
```

Do not regenerate v1 from current mutable data and call it the same document.

## 16.4 Signatures

Support both:

- digital signature/initial on tablet;
- print → physical signature → scan/photo upload.

Signature does not replace the documented informed-consent discussion.

---

# 17. Billing Architecture

## 17.1 Initial scope

Confirmed MVP billing scope:

- Treatment Estimate
- Charges
- Payments
- Balance
- Statement of Account

BIR-compliant invoicing/e-invoicing is a separate compliance-focused module and is not assumed by ordinary PDF generation.

## 17.2 No fixed procedure price

The procedure catalog describes the treatment, duration, specialty, resource needs, and optionally a default/range for convenience.

Actual estimate items store:

- proposed procedure;
- patient/case;
- branch;
- provider where relevant;
- quantity;
- agreed/estimated amount;
- discount/adjustment if permitted;
- notes;
- version.

Actual charges are created from performed care according to clinic workflow, not blindly copied from a global procedure price.

## 17.3 Branch attribution

Financial records preserve:

- treatment/charge branch;
- provider;
- payment receiving branch;
- payment method;
- allocation to charge(s).

This supports one organization balance and correct branch analytics.

---

# 18. Inventory and Equipment Architecture

Inventory is promoted to an important product area because the second branch is newly opened.

## 18.1 Separate concepts

Do not combine these into one table:

### Schedulable resources/equipment

Examples:

- dental chair;
- surgery room;
- panoramic X-ray unit;
- specialized device.

These affect appointment availability.

### Consumable inventory

Examples:

- gloves;
- anesthetic cartridges;
- composite;
- bonding materials;
- brackets;
- impression materials;
- burs;
- disposable supplies.

These affect stock management.

## 18.2 Inventory scope

Minimum architecture should support:

- inventory item catalog;
- unit of measure;
- branch stock balance;
- stock receipts;
- manual adjustment with reason;
- consumption/issue;
- branch-to-branch transfer;
- transfer requested/in-transit/received state;
- reorder level per branch;
- low-stock alerts;
- supplier/vendor reference later;
- lot/expiry tracking for selected items later if needed;
- inventory movement audit.

## 18.3 Stock is derived from movements

Prefer an append-oriented movement ledger as the accounting source:

```text
+ RECEIVE 100
- CONSUME 5
- TRANSFER_OUT 20
+ TRANSFER_IN 20
+ ADJUST 2 (reason required)
```

A cached balance can exist for performance but must remain reconcilable to movements.

## 18.4 Cross-branch transfers

A transfer must not instantly add stock to Branch B when Branch A merely ships it.

Suggested lifecycle:

```text
DRAFT → APPROVED → IN_TRANSIT → RECEIVED
```

Stock ownership/availability updates according to defined movement semantics.

## 18.5 Procedure consumption

Automatic material deduction by procedure may be valuable later, but do not make it mandatory in MVP because actual materials can vary case by case. Start with manual/assisted consumption and optionally procedure templates later.

---

# 19. Clinical File Storage Architecture

## 19.1 Supported initial files

Focus on moderate-size files:

- photos;
- exported dental X-ray images;
- PDFs;
- scanned forms;
- consent scans;
- referral documents;
- treatment discussion images;
- medical clearance;
- lab reports.

## 19.2 CBCT/DICOM policy

Confirmed preference: avoid very heavy CBCT storage initially.

MVP should support:

- CBCT report PDF;
- selected screenshots/derived images;
- metadata/reference noting where full study is stored externally if necessary.

Do not promise full DICOM PACS functionality in the first version.

Future DICOM/CBCT support requires separate architecture for:

- multi-file studies;
- viewer;
- large uploads;
- imaging metadata;
- retention;
- bandwidth;
- clinical interoperability.

## 19.3 R2 object-key design

Do not expose PHI in object names.

Prefer opaque IDs:

```text
org/{org_uuid}/patients/{patient_uuid}/files/{file_uuid}/original
```

Avoid:

```text
Maria_Santos_Root_Canal_Xray.jpg
```

## 19.4 Private delivery

Use short-lived signed/presigned access after server authorization.

Public buckets are inappropriate for patient clinical assets.

## 19.5 Metadata in PostgreSQL

Store in DB:

- object key;
- organization/patient linkage;
- MIME type;
- original filename separately;
- size;
- checksum;
- category;
- uploader;
- uploaded timestamp;
- retention state;
- deleted/voided state;
- optional malware-scan state;
- document version relation.

## 19.6 Upload limits

Define configurable limits by category. Reject unsupported executables and unexpected content types.

Use direct-to-R2 presigned uploads for larger acceptable files when helpful so Vercel functions do not proxy every byte.

---

# 20. Backup and Disaster-Recovery Architecture

## 20.1 Goal

Backup is not a “download everything” button. It is a layered recovery strategy.

Protect against:

- accidental row deletion;
- bad deployment/migration;
- application bug;
- malicious deletion;
- accidental file removal;
- provider outage;
- project deletion;
- ransomware/credential compromise;
- human error.

## 20.2 Database layer

For production use, prefer a paid Supabase project with managed backups.

Current Supabase behavior at architecture research time:

- paid projects receive managed daily database backups;
- retention depends on plan;
- Point-in-Time Recovery is an optional stronger recovery mechanism;
- Supabase database backups do **not** restore Storage API objects.

Architecture decision:

### Prototype / early production

- Supabase managed daily database backup;
- automated logical dump on a separate schedule;
- encrypted/off-site storage of logical dumps in a dedicated private R2 backup bucket;
- periodic restore test to staging.

### Higher-value production/SaaS

- evaluate PITR based on budget and acceptable Recovery Point Objective;
- keep periodic independent logical dumps even when PITR exists, because provider-managed backup and independent export protect against different failure modes.

## 20.3 Backup transfer/bandwidth

Backups should be generated server-to-server/CI-to-object-storage, not downloaded through clinic browsers.

This means routine backup traffic does not depend on the clinic office internet connection.

R2 currently does not charge egress bandwidth for standard object delivery, but backup design should still minimize unnecessary full copies and prioritize restore reliability over raw download volume.

## 20.4 File protection

For R2 clinical files:

- original clinical objects should be immutable by application convention;
- “replace file” creates a new object/version rather than overwriting the old object;
- deletion in the UI should normally be soft-delete/void first;
- use R2 bucket-lock retention rules for high-value prefixes where appropriate;
- consider separate backup/archive bucket or periodic copy for critical files as the product matures;
- move older backups to Infrequent Access when operationally appropriate and retention economics are understood.

## 20.5 RPO/RTO targets

Define before real patient use.

Initial planning targets (not guarantees):

- **RPO**: <= 24h using daily backup; much lower if PITR enabled
- **RTO**: documented restore procedure; target to be tested empirically

For a mature SaaS, these targets must be tightened and supported by actual drills.

## 20.6 Restore testing

A backup that has never been restored is an assumption.

Create a recurring engineering procedure:

1. restore DB backup/logical dump to isolated staging;
2. verify schema/data integrity;
3. restore/relink representative object files;
4. run automated smoke tests;
5. record result/date/duration;
6. remediate failures.

## 20.7 No raw backup in Git

Never commit patient/database backup content to a Git repository.

---

# 21. Offline and Poor-Connectivity Behavior

## 21.1 No full offline EMR in MVP

Internet access is considered generally available for the target branches. Full offline replication would greatly expand security and synchronization complexity.

Therefore MVP is online-first.

## 21.2 Graceful degradation

Requirements:

- clear connectivity indicator;
- disable actions that cannot be safely committed;
- preserve unsaved form state during brief network failures where feasible;
- retry idempotent safe operations;
- never show “Saved” until server confirms;
- show unsynced external integrations separately from core record save state.

## 21.3 Sensitive local caching

Do not indiscriminately cache patient records in service workers/localStorage for offline use.

If persistent local draft recovery is later implemented for clinical notes, it requires explicit security design, short retention, logout cleanup, and ideally encryption/key strategy. For MVP, prefer in-memory draft state plus frequent server autosave drafts when online.

---

# 22. Audit Architecture

## 22.1 Required audit events

Confirmed minimum includes:

- patient viewed;
- patient created/updated/merged;
- clinical note created/finalized/amended;
- treatment plan created/finalized/revised;
- consent signed/refused;
- file uploaded/downloaded/voided;
- patient record PDF exported;
- appointment created/rescheduled/cancelled;
- provider assignment changed;
- specialist access granted;
- billing charge/payment/adjustment changed;
- inventory stock adjustment/transfer;
- role/permission changed;
- integration connected/disconnected;
- sensitive settings changed.

## 22.2 Audit log semantics

Audit events should be append-only to ordinary application users.

Fields include:

- ID;
- organization;
- branch context if relevant;
- actor user/system/integration;
- actor role;
- action;
- target type/ID;
- timestamp;
- success/failure;
- request correlation ID;
- minimal before/after metadata where appropriate and safe;
- IP/device/session metadata only as justified by privacy/security policy.

Do not dump entire clinical records into audit metadata.

---

# 23. Delete, Void, and Amendment Rules

## 23.1 Clinical records

Confirmed policy: follow append/amend recommendation.

Final clinical records are not hard-deleted through normal UI.

Use concepts such as:

- draft;
- finalized;
- amended;
- voided with reason;
- superseded.

## 23.2 Administrative mistakes

Certain non-clinical drafts can be hard-deleted if they have no regulatory/business significance, but this is decided table-by-table.

## 23.3 Files

User-facing delete generally means soft-delete/void. Physical object deletion happens later only according to retention policy and permission.

---

# 24. Analytics Architecture

## 24.1 Organization-wide + branch filters

Confirmed requirement: analytics combine both branches with branch filtering.

```text
All Branches
Branch A
Branch B
```

## 24.2 Operational analytics first

Use PostgreSQL views/materialized views/query layer initially. Do not introduce a data warehouse before scale justifies it.

## 24.3 Metrics

Architecture must preserve dimensions necessary for:

- new patients;
- acquisition source;
- booking channel;
- referral source;
- website conversion;
- no-show rate;
- appointment confirmation rate;
- branch volume;
- provider utilization;
- chair/resource utilization;
- treatment acceptance;
- charges/payments;
- shared balance and branch attribution;
- inventory stock/movement;
- recall performance;
- future retention/LTV.

## 24.4 Event attribution

Keep acquisition source and booking channel separate.

Example:

```text
Acquisition Source: Facebook
Booking Channel: Messenger
Branch: Branch A
```

or:

```text
Acquisition Source: Google Search
Booking Channel: Website
Branch: Branch B
```

---

# 25. Inventory Analytics

Support at least:

- current quantity by branch;
- below-reorder items;
- receipts by period;
- consumption by period;
- manual adjustments;
- branch transfers;
- dead/slow-moving stock later;
- expiry exposure later;
- approximate material cost by procedure later if data quality supports it.

---

# 26. RLS and Authorization Strategy

## 26.1 Defense in depth

Supabase RLS is mandatory for tables exposed through Supabase APIs. The application server must also perform domain authorization.

Do not say “RLS exists, therefore server authorization is unnecessary.”

## 26.2 Tenant policy pattern

Conceptually:

```text
current auth user
   ↓
organization membership
   ↓
requested row.organization_id
   ↓
role/permission + branch/assignment constraints
```

## 26.3 Service-role caution

Server/service credentials that bypass RLS must be narrowly used. Any code using elevated credentials assumes full responsibility for tenant checks.

Create an explicit repository rule: **never use service-role access in arbitrary UI helper code**.

## 26.4 Public booking

Public anonymous role does not receive generic patient table privileges. Use controlled server endpoints/RPC/functions that validate allowed input and perform only the required booking operation.

---

# 27. Domain and Code Organization

Frontend feature organization, selected frontend libraries, design tokens, responsive rules, scheduler adapter, odontogram prototype gate, treatment-canvas rules, PDF UI, and testing conventions are specified in `FRONTEND_ARCHITECTURE.md`.

Recommended project shape (subject to implementation review):

```text
src/
  app/
    (public)/
    (booking)/
    (auth)/
    (emr)/
    api/

  domains/
    organizations/
    branches/
    auth/
    patients/
    guardians/
    providers/
    scheduling/
    resources/
    acquisition/
    referrals/
    communications/
    automations/
    calendar/
    clinical/
    odontogram/
    treatment-plans/
    treatment-discussions/
    documents/
    billing/
    inventory/
    recalls/
    analytics/
    audit/

  infrastructure/
    supabase/
    storage/          # S3-compatible: MinIO (local) / R2 (production)
    google/
    email/
    sms/
    messenger/
    jobs/
    observability/

  components/
  lib/
  types/
```

Important: this is a boundary guide, not a command to create dozens of empty folders before they are needed.

---

# 28. Database Design Direction

Exact SQL belongs in the next document, but architecture requires the following conceptual entities.

## 28.1 Tenancy

```text
organizations
branches
profiles
organization_members
member_branch_access
roles
permissions
member_role_assignments
```

## 28.2 Providers

```text
providers
provider_branch_memberships
provider_specialties
provider_availability_rules
provider_availability_exceptions
provider_time_off
```

## 28.3 Patients/family

```text
patients
patient_contacts
patient_addresses
patient_relationships
patient_guardians
patient_alerts
patient_allergies
patient_medications
medical_history_entries
```

## 28.4 Acquisition/referral

```text
acquisition_sources
booking_channels
patient_acquisitions
referrers
patient_referrals
outgoing_clinical_referrals
```

## 28.5 Scheduling

```text
procedures
procedure_specialty_requirements
procedure_resource_requirements
appointments
appointment_holds
appointment_providers
appointment_procedures
appointment_resources
appointment_status_history
resources
resource_types
resource_blocks
```

## 28.6 Google

```text
google_connections
google_calendar_preferences
google_event_mappings
integration_sync_jobs
integration_errors
```

## 28.7 Clinical

```text
clinical_encounters
clinical_notes
clinical_note_versions
odontogram_findings / odontogram_events / snapshots (final design TBD)
treatments
prescriptions
```

## 28.8 Treatment plans/discussions

```text
treatment_plans
treatment_plan_versions
treatment_plan_items
treatment_discussions
treatment_discussion_versions
treatment_discussion_assets
acknowledgments
```

## 28.9 Files/documents

```text
patient_files
documents
document_versions
document_signatures
consents
consent_versions
```

## 28.10 Communications/automation

```text
communications
communication_attempts
notification_templates
automation_rules
scheduled_jobs
outbox_events
webhook_receipts
```

## 28.11 Billing

```text
patient_accounts
charges
payments
payment_allocations
statements
```

## 28.12 Inventory

```text
inventory_items
inventory_item_categories
branch_inventory_settings
inventory_movements
inventory_receipts
inventory_transfers
inventory_transfer_items
suppliers (later/optional)
```

## 28.13 Audit

```text
audit_events
security_events
```

---

# 29. Transaction Boundaries

Important multi-step changes should be transactional.

Examples:

## 29.1 Appointment creation

One transaction should create/update:

- appointment;
- hold conversion;
- provider assignment;
- resource reservations;
- status history;
- outbox event;

External SMS/Calendar happens **after commit** through jobs.

## 29.2 Payment

One transaction:

- payment;
- payment allocations;
- patient account balance derivation/materialization;
- audit/outbox.

## 29.3 Inventory transfer receipt

One transaction:

- transfer status;
- outgoing/incoming movements as designed;
- destination stock effect;
- audit event.

---

# 30. API Design Direction

## 30.1 Internal UI mutations

Use Server Actions or Route Handlers according to fit, but all mutation pathways must call the same domain service/business rules.

Do not implement one set of validation in Server Actions and a contradictory set in `/api` routes.

## 30.2 Public API

Public booking endpoints need:

- schema validation;
- rate limiting;
- bot/spam protections as needed;
- origin/CSRF strategy according to authentication model;
- idempotency for submission retries;
- minimal responses that do not leak patient existence.

## 30.3 Integration webhooks

Webhook endpoints need:

- provider signature/token validation;
- replay/idempotency handling;
- event receipt storage;
- asynchronous processing where appropriate;
- no trust in inbound payload without validation.

---

# 31. Validation Strategy

Use layered validation:

1. UI validation for user experience;
2. server schema validation for trust boundary;
3. domain invariant validation;
4. database constraints for integrity.

The frontend saying `required` is not enough.

---

# 32. Concurrency and Race Conditions

Explicitly test:

- two website users selecting same slot;
- two receptionists booking same provider;
- same dentist across two branches;
- chair conflict;
- Google sync retry after timeout;
- duplicate reminder job claim;
- two payments submitted twice;
- two inventory transfers/adjustments;
- treatment plan edited while patient signs older version.

Use optimistic concurrency/version columns or transactions/locks where appropriate.

---

# 33. Search Architecture

MVP can use PostgreSQL indexes and text/trigram search for:

- patients;
- mobile numbers;
- providers;
- referrals;
- procedures;
- inventory.

Do not introduce Elasticsearch/Algolia unless actual scale/search requirements justify it.

Patient search results must remain authorization-aware.

---

# 34. Performance Direction

Prioritize correct data boundaries before micro-optimization.

Key likely hot paths:

- today's appointments;
- week calendar;
- patient search;
- patient timeline;
- provider availability;
- resource availability;
- dashboard summary;
- inventory branch balances.

Use indexed foreign keys, tenant/branch/date composite indexes, pagination, and query profiling.

Avoid N+1 query patterns in calendar/timeline screens.

---

# 35. Observability

Production should include:

- structured application logs without unnecessary PHI;
- error tracking;
- integration health;
- job/queue metrics;
- failed reminder count;
- Google sync failures;
- backup job success;
- storage upload failures;
- database health/slow-query monitoring;
- security-relevant alerts.

Never send full clinical notes, patient file contents, OAuth tokens, passwords, or raw secrets into error-reporting tools.

---

# 36. Environment Strategy

At minimum:

```text
DEVELOPER WORKSTATION + LOCAL SUPABASE VERIFICATION
SUPABASE CLOUD DEV
CLOUD TEST / PREVIEW
FUTURE SEPARATE STAGING (ONLY AFTER FORMAL APPROVAL)
PRODUCTION
```

Rules:

- Next.js and a disposable local Supabase stack run on the developer workstation for Phase 2 and accepted Phase 3 checkpoint verification; the local stack may contain deterministic synthetic data only and is never canonical, staging, production, or a backup;
- local object storage uses MinIO under ADR-022; Cloudflare R2 is deferred to deployment readiness;
- canonical persistent structured data for DEV, Cloud TEST, any future separately approved staging, and production is hosted in separate Supabase Cloud projects;
- Cloud DEV and Cloud TEST use deterministic synthetic data only; neither accepts production-derived or de-identified patient, clinical, financial, or workforce data;
- Git migrations remain authoritative across local and hosted targets; local verification plus dedicated review is acceptance evidence for Phase 2 and accepted Phase 3 checkpoints, and guarded Cloud TEST verification is mandatory before production;
- automated destructive database tests use the disposable local project for Phase 2 and accepted Phase 3 verification and the dedicated disposable Cloud TEST project before production;
- a future staging environment may use formally de-identified data only in a separate project after documented approval and validation of the anonymization controls; it must not share Cloud TEST data or credentials;
- production uses a separate Supabase Cloud project;
- future file/media environments use separate R2 buckets/prefix boundaries/credentials;
- no real, copied-production, or canonical patient/application data is stored on the developer workstation; ADR-020 permits only disposable synthetic local data;
- separate OAuth redirect configurations;
- separate SMS/email test behavior;
- production secrets are not available to development agents by default.

---

# 37. Data Migration from Paper

The dentist wants digitization while retaining printing.

Migration should support gradual adoption:

- register patient demographics;
- scan/import essential existing documents;
- manually encode critical medical alerts/history;
- create baseline odontogram where clinically needed;
- mark imported historical data source/date;
- avoid pretending scanned paper is structured data;
- allow old paper folder reference during transition.

Do not require the clinic to digitize every historical sheet before using appointments.

---

# 38. Printing/PDF Security

Generated patient PDFs are sensitive.

Requirements:

- permission check before generation;
- audit export event;
- short-lived generated download URLs;
- no public static URL;
- temporary render cleanup when not retained;
- retained signed/issued documents stored privately;
- optional confidential footer;
- patient record export selectable scope/date range;
- avoid including internal notes unless explicitly selected/authorized.

---

# 39. Inventory and Branch Launch Priorities

Because Branch B is newly opened, implementation planning should collect:

- initial stock list;
- opening quantities;
- items stored only at one branch;
- equipment list per branch;
- transfer workflow today;
- reorder process;
- who can adjust stock;
- who approves transfers/purchases;
- whether expiry/lot numbers matter for current materials.

This discovery can occur in parallel with core EMR architecture, but inventory domain tables should not be an afterthought.

---

# 40. Recommended MVP Technical Slice

A clinically useful prototype should be delivered in vertical slices rather than building every database table first.

## Slice 0 — Foundation

- repository;
- CI;
- Next.js/Tailwind;
- Supabase Cloud DEV project setup with Git-managed migrations and project-scoped tooling;
- organizations/branches;
- Auth;
- memberships/roles;
- RLS baseline;
- audit foundation;
- synthetic fixtures.

## Slice 1 — Patients

- shared organization patient record;
- branch context;
- patient search;
- duplicate warning name + DOB;
- family/guardian relationships;
- medical alerts/history;
- timeline foundation.

## Slice 2 — Providers/branches/resources

- providers;
- specialties;
- branch schedules;
- on-call role;
- chairs/equipment;
- conflict primitives.

## Slice 3 — Scheduling + website booking

- clinic calendar;
- both-branch view;
- 5-minute holds;
- review-first online request;
- configurable auto-confirm;
- organization-wide provider conflict;
- branch resource conflict.

## Slice 4 — Google Calendar

- provider OAuth;
- work calendar selection;
- free/busy calendar selection;
- EMR → Google sync;
- retries/reconciliation.

## Slice 5 — Communications

- email/SMS adapters;
- reminders;
- manual Messenger logging/task;
- communication center;
- organization-wide default reminder rules.

## Slice 6 — Clinical core + odontogram

- encounters;
- notes;
- odontogram prototype candidate evaluation;
- production odontogram domain model;
- treatment history.

## Slice 7 — Treatment plan + drawing + documents

- variable estimates;
- treatment-plan versions;
- discussion canvas editable source + render;
- PDF engine;
- digital/physical signature workflows.

## Slice 8 — Billing

- charges;
- payments;
- allocations;
- shared balance;
- branch reporting;
- SOA.

## Slice 9 — Inventory

- item catalog;
- branch stock;
- movements;
- transfers;
- reorder alerts.

## Slice 10 — Analytics

- organization dashboard;
- branch filters;
- acquisition/referral;
- appointment/no-show;
- provider/resource utilization;
- financial operational reporting;
- inventory metrics.

## Later — Messenger automation, recalls, advanced specialist workflow, SaaS billing, AI/MCP

---

# 41. Security Gate Before Real Patient Data

Do not onboard real patients until the following are reviewed and tested:

- tenant isolation;
- role matrix;
- RLS policies;
- public booking isolation;
- server authorization;
- secure file upload/download;
- audit logs;
- backups and restore test;
- session security;
- secrets;
- rate limiting;
- input validation;
- signed document versioning;
- clinical amendment behavior;
- data export permissions;
- privacy/legal review appropriate for Philippine operations.

---

# 42. Architecture Decision Record Registry and Backlog

ADR identifiers are assigned by the repository, not by this architecture backlog. A number is authoritative only when it is reserved by the active implementation plan or represented by an accepted file in `docs/decisions/`.

## 42.1 Current ADR registry

```text
ADR-001 — Next.js + Supabase core stack                         [reserved by Phase 1]
ADR-002 — Organization/branch tenancy                           [reserved by Phase 1]
ADR-003 — Authorization defense in depth                        [reserved by Phase 1]
ADR-004 — Single Next.js repo for public website + private EMR [reserved by Phase 1]
ADR-005 — Cloudflare R2 canonical storage + Workers/Images media pipeline [accepted]
ADR-016 — Supabase Cloud-first development; local prohibition superseded      [superseded in part]
ADR-017 — Phase 1 secure migration baseline and grant-last invariant       [accepted]
ADR-018 — Nonproduction database test tooling per environment              [accepted]
ADR-019 — Bounded fixed patient-role delegation                            [accepted]
ADR-020 — Local Phase 2 verification; Cloud TEST closeout/production gate    [accepted]
ADR-021 — Guarded local verification for Phase 3; Cloud TEST pre-production gate [accepted]
ADR-022 — Local MinIO object storage for development                        [accepted]
```

`ADR-006` through `ADR-015` are intentionally unassigned. Do not reuse the old pre-numbered backlog from earlier drafts as authority. Prefer `ADR-020` and above for future ADR files unless a deliberate reconciliation explicitly assigns an earlier gap.

## 42.2 Future ADR topics — intentionally unnumbered

Create these only when the corresponding implementation phase makes the decision concrete:

- organization-level patient-record access semantics if Phase 1 tenancy ADRs do not already cover them;
- event/outbox automation model;
- Google Calendar source-of-truth and free/busy strategy;
- appointment holds and cross-branch conflict strategy;
- odontogram domain model independent from renderer library;
- editable treatment-discussion source + immutable formal snapshots;
- document versioning and signatures;
- billing without fixed global procedure prices;
- R2/Supabase layered backup strategy;
- inventory movement ledger + branch transfer model;
- Messenger automation architecture;
- other irreversible decisions identified by future phase plans.

Do not create empty ADRs solely to consume a number.

---

# 43. Remaining Questions — Non-Blocking vs Blocking

Most major architecture questions are now answered.

## 43.1 Blocking before DATABASE_DESIGN.md

These should be validated with the dentist during schema design:

1. Which exact user roles exist today at each branch?
2. Should dental assistants see full clinical notes or only selected fields?
3. Should regular dentists truly have organization-wide access to all patients, or should access be narrowed when they are not involved in care?
4. What exact odontogram conditions/statuses does the dentist use today?
5. Which tooth numbering notation should be default in the clinic UI (FDI likely candidate, but validate)?
6. What procedures/services require specific equipment/chairs?
7. What are the current inventory units and whether lot/expiry tracking is required immediately?
8. Which payment methods are used?
9. Do they need refunds/credit balances in MVP?
10. What existing record forms should our generated PDFs match?

## 43.2 Can be decided during implementation

- exact email provider;
- exact SMS provider;
- exact canvas library;
- whether odontogram candidate is forked or replaced;
- PDF rendering library;
- charting library for analytics;
- exact observability provider.

All should sit behind application interfaces where practical.

---

# 44. Research Notes Used for This Architecture

Research was checked against current primary/official sources in August 2026.

## 44.1 Odontogram candidates

- GitHub: `biomathcode/react-odontogram`
- GitHub: `biomathcode/odontogram`

These are candidates for evaluation, not pre-approved clinical dependencies.

## 44.2 Cloudflare R2

Architecture decisions rely on current Cloudflare documentation describing:

- S3 compatibility;
- private/presigned URL access;
- encryption at rest/in transit;
- high durability;
- bucket locks;
- Standard/Infrequent Access classes;
- no egress bandwidth fees under current R2 pricing.

**Local development:** MinIO (S3-compatible Docker object storage) satisfies the
same S3 API surface locally without cloud credentials. See ADR-022.

## 44.3 Cloudflare Images + Workers

Current Cloudflare documentation confirms:

- the Images binding can transform image bytes/streams directly inside a Worker rather than requiring a public source URL;
- transformed output can be resized/re-encoded, including modern image formats;
- transformed responses are not automatically cached by the Images binding, so Workers Cache / appropriate cache headers should be used for repeated delivery;
- Cloudflare provides an official pattern for transforming user-uploaded images and storing transformed output in R2;
- R2 event notifications can send object-create events to Cloudflare Queues for asynchronous consumer processing.

This supports an R2-centered media architecture without Cloudinary as a default dependency. The application still owns authorization, derivative naming/status, clinical-original preservation, and audit behavior.

## 44.4 Supabase backups

Current Supabase documentation confirms:

- paid-plan managed database backups;
- optional PITR;
- logical dump capability through Supabase CLI;
- database backups do not include Storage API objects;
- automated scheduled backup workflows can be implemented.

## 44.5 Supabase scheduling/RLS

Current official docs support:

- Postgres RLS with Supabase Auth;
- pg_cron / Supabase Cron;
- scheduled Edge Function invocation.

## 44.6 Next.js/Vercel

Current official docs support:

- App Router Route Handlers for HTTP endpoints;
- Vercel Cron for scheduled function invocation where useful.

---

# 45. Instructions for Claude and Codex

Before implementing any phase:

1. Read `MASTER_PRODUCT_PLAN.md`.
2. Read this document.
3. Read relevant ADRs.
4. Inspect current code and migrations.
5. Produce a bounded implementation plan.
6. Identify tenant/branch/security implications.
7. Identify data migrations.
8. Define tests before calling the feature complete.
9. Do not silently change an architecture decision.
10. If a dependency forces a change, propose an ADR.

## 45.1 Reviewer checklist

The second agent reviewing a change should ask:

- Can Organization A ever read Organization B data?
- Can a user forge a different organization/branch ID?
- Does the server re-check permissions?
- Could two users create conflicting appointments?
- Could a retry duplicate a calendar event/payment/SMS?
- Does history remain intact after correction?
- Does the public website expose patient existence?
- Are clinical files private and short-lived when delivered?
- Does audit history record sensitive actions without leaking full PHI?
- Can this change work for both branches?
- Would this still work when we add a second SaaS tenant?

---

# 46. Immediate Next Documentation Step

The major design documents now exist:

```text
MASTER_PRODUCT_PLAN.md
TECHNICAL_ARCHITECTURE.md
DATABASE_DESIGN.md
FRONTEND_ARCHITECTURE.md
SECURITY_ARCHITECTURE.md
```

The next planning artifact should be a bounded **Phase 1 Foundation implementation plan**. It should translate these documents into an incremental repository/bootstrap sequence covering authentication, organization/branch tenancy, memberships, baseline RLS, audit infrastructure, environment separation, security headers, and test scaffolding.

No real patient data should be introduced until the production security gates in `SECURITY_ARCHITECTURE.md` are satisfied.

---

# 47. Current Architecture Summary

The approved architecture can be summarized as:

```text
ONE FUTURE-SAAS PLATFORM
        ↓
ORGANIZATION / DENTAL BUSINESS
        ↓
TWO BRANCHES TODAY, MANY LATER
        ↓
ONE SHARED ORGANIZATION PATIENT RECORD
        ↓
BRANCH-SCOPED APPOINTMENTS / RESOURCES / STOCK / REPORTING
        ↓
NEXT.JS + TYPESCRIPT
        ↓
SUPABASE AUTH + POSTGRESQL + RLS
        ↓
DOMAIN SERVICES ON SERVER
        ↓
EVENT/OUTBOX AUTOMATION
        ↓
GOOGLE CALENDAR + SMS + EMAIL + LATER MESSENGER
        ↓
CLOUDFLARE R2 PRIVATE CLINICAL FILES
        ↓
VERSIONED DOCUMENTS + AUDIT + BACKUPS
```

This is the baseline that implementation should preserve unless an approved ADR changes it.
