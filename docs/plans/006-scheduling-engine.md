# Phase 6 — Scheduling Engine

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). No prior spec/plan existed; this
plan is derived strictly from `docs/MASTER_PRODUCT_PLAN.md` §12/§13 and the
accepted architecture documents (`docs/DATABASE_DESIGN.md` §13/§14,
`docs/TECHNICAL_ARCHITECTURE.md`, `docs/SECURITY_ARCHITECTURE.md`). No new
product requirements are invented beyond the approved scheduling domain.

**Goal:** A dental-aware scheduling engine: provider recurring availability,
exceptions/time off, an appointment state machine with separate status
dimensions, provider assignment (zero-to-many providers), database-level
conflict detection via reservation ledgers with exclusion constraints, a basic
chair/resource model, calendar day/week views, and cancellation/rescheduling
with preserved history.

## Global Constraints

- All Phase 1–5 doctrine applies unchanged: org tenant boundary, RLS on every
  exposed table, no browser-role base-table DML, SECURITY DEFINER RPCs with
  empty search paths and terminal grants registered exactly, one atomic audit
  event per mutation with `{}` metadata (scheduling events may carry a bounded
  reason/old/new metadata where clinically useful), optimistic versions where a
  mutable record is edited, AAL2 NOT required this phase, synthetic fixtures
  only, additive-only migrations.
- **Appointments are branch-scoped** (an appointment belongs to a branch; a
  provider may work at multiple branches). Provider double-booking is rejected
  **across the whole organization** (not just within a branch) via the
  provider reservation ledger.
- Appointment status is split into **three independent dimensions** to avoid a
  status explosion: `scheduling_status`, `confirmation_status`,
  `encounter_status` (DATABASE_DESIGN §14.1).
- Conflict prevention is **validated at commit time** in a single
  transactional RPC, with the reservation-ledger exclusion constraints as the
  final database-level race-condition protection (DATABASE_DESIGN §14.5/§14.7).
- An appointment may exist with zero providers (awaiting specialist).
- Reschedule preserves history via `appointment_status_history` plus the
  audit trail; the appointment record continues (RESCHEDULED is a history
  entry, not a terminal status).
- Cancellation releases the provider/resource reservation slots atomically.
- No public/website booking surface, no holds, no Google Calendar, no
  waitlist, no reminders in this phase (deferred to Phases 8/9/13).
- A device at Branch A cannot satisfy a Branch B booking.

## Role matrix for `appointment.read` / `appointment.write`

- `appointment.read` + `appointment.write`: OWNER, ADMIN, DENTIST, RECEPTIONIST
  (receptionists create and view appointments; dentists manage their own).
- `appointment.read` only: DENTAL_ASSISTANT (read the schedule).
- Neither: VISITING_SPECIALIST, BILLING (least privilege; may be granted later).

## Tasks

- [x] **P6-01: Scheduling permission contract**
  - Permission catalog rows `appointment.read` / `appointment.write` with stable
    descriptions; role_permissions per the matrix above; `PermissionCode` +
    policy test; pgTAP proving exactly the matrix (positive and negative).

- [x] **P6-02: Resource foundation schema**
  - Migrations: `resource_types` (org, code, name, schedulable),
    `branch_resources` (org, branch, resource_type, name, status, serial,
    notes, online_booking_eligible, version, created/archived), and
    `resource_unavailability` (org, resource, starts_at, ends_at, reason).
    RLS enabled, zero base grants, access-path indexes, tenant-safe composite
    FKs, CHECK ends_at > starts_at. pgTAP.

- [x] **P6-03: Provider availability schema**
  - Migrations: `provider_availability_rules` (org, provider, branch, weekday,
    starts_at_local, ends_at_local, valid_from, valid_to, active) and
    `provider_schedule_exceptions` (org, provider, branch, exception_type
    UNAVAILABLE/ADDITIONAL_AVAILABILITY/LEAVE, starts_at, ends_at, reason,
    created_by). Provider must belong to the org; branch must belong to the
    org. RLS + zero base grants + indexes. pgTAP.

- [x] **P6-04: Appointment core schema**
  - `appointments` (org, branch, patient composite FK, procedure, title,
    starts_at, ends_at, scheduling_status, confirmation_status,
    encounter_status, booking_channel_code ref, chief_complaint,
    internal_scheduling_notes, patient_visible_notes, version, timestamps,
    cancelled_at, completed_at; CHECK ends_at > starts_at).
  - `appointment_providers` (org, appointment, provider, provider_role,
    assignment_status; unique(appointment, provider, provider_role)).
  - `appointment_resources` (org, appointment, resource, purpose).
  - `appointment_status_history` (org, appointment, status_dimension,
    old_value, new_value, changed_by, reason).
  - All tenant-safe composite FKs, RLS, zero base grants, indexes. pgTAP.

- [x] **P6-05: Reservation ledgers + exclusion constraints**
  - `provider_reservations` and `resource_reservations` with a maintained
    `timespan tstzrange` and a **partial GiST EXCLUDE USING gist** on
    (provider_id WITH =, timespan WITH &&) WHERE reservation_status = 'ACTIVE'
    (and the resource analog), preventing overlapping active reservations
    anywhere in the org. RLS, zero base grants, indexes. pgTAP proves the
    exclusion constraint rejects overlap and allows back-to-back `[start,end)`
    ranges.

- [x] **P6-06: Appointment RPCs**
  - `create_appointment` / `reschedule_appointment` / `cancel_appointment` /
    `update_appointment_status` / `list_appointments`. SECURITY DEFINER, empty
    search paths, org derived from active acting branch, appointment.write
    gated. Creation validates conflicts inside one transaction:
    - provider active at org + assigned/active at the branch;
    - provider availability rule covers the slot (no UNAVAILABLE/LEAVE
      exception);
    - provider has no overlapping ACTIVE reservation (whole org);
    - required resource has no overlapping ACTIVE reservation (branch);
    - patient belongs to org.
    On conflict the whole transaction fails cleanly. Reservation rows are
    created/updated atomically with the appointment and its audit event.
    Reschedule inserts status-history entries and re-creates reservation rows
    (releasing the old slots); cancel releases reservation rows. pgTAP
    positive/negative + concurrency probes (double booking, resource conflict,
    release-on-cancel).

- [x] **P6-07: Scheduling read RPCs**
  - `list_availability` (provider schedule for a window), `find_available_slots`
    (bounded slot enumeration honoring availability, exceptions, buffers,
    existing reservations), `list_appointments_for_calendar` (bounded day/week
    projection). appointment.read gated, org/branch scoped, deterministic,
    bounded limits, no audit. Terminal grants. pgTAP.

- [x] **P6-08: Server services**
  - `src/lib/scheduling/` Zod schemas/types/errors/service for all scheduling
    RPCs, server-only, offline mocked unit tests.

- [x] **P6-09: Calendar UI**
  - Private `/schedule` page with a day/week view (semantic grid), dense
    appointments, appointment detail/create/reschedule/cancel dialogs, provider
    and branch filters; server actions revalidate appointment.write + acting
    branch; phone composition. Tests.

- [ ] **P6-10: Integration verification + phase review**

## Explicitly deferred

- Website booking holds/slots and `booking_holds` (Phase 13).
- Google Calendar sync (Phase 9).
- Reminders/notifications (Phase 8).
- Waitlist / no-show automation (Phase 7/18).
- Inventory/consumable linkage (Phase 19).
- Provider recurring-availability editor UI (Phase 10; schema only here).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 6)

- server rejects provider double booking;
- resource conflict prevented;
- appointment can exist without provider while awaiting specialist;
- reschedule history preserved;
- cancellation releases slot.

## Verification

- Full local db reset/provision/test (`test:db:local`) with all suites;
- `security:migrations`, `security:secrets`, `security:audit`;
- `test:unit`, `lint`, `typecheck`, `build`;
- Cloud TEST remains the pre-production gate (not required to pass locally).
