# Phase 10 — Specialist / On-call Workflow

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §14 and §Phase 10 plus accepted architecture. No
new product requirements are invented.

**Goal:** A visiting/on-call specialist request workflow where a specialist is
never shown as automatically bookable just because they are registered, the
availability request carries only a minimal case description (never full
clinical history), and an accepted request assigns the provider and triggers the
existing appointment/calendar/communication automation.

## Global Constraints

- All Phase 1–9 doctrine applies unchanged.
- The specialist request state machine: DRAFT → SENT → ACCEPTED → ASSIGNED, or
  SENT → DECLINED / ALTERNATE_TIME_REQUESTED / EXPIRED / CANCELLED. Forward
  transitions only, server-validated, with a status history ledger.
- Availability request content is minimal and non-clinical (bounded
  `case_summary`); separate limited-case access is out of scope (Phase 14).
- Acceptance ASSIGNS the provider (appointment_providers ASSIGNED, role
  SPECIALIST) and triggers appointment/calendar/communication automation via the
  existing internal enqueue helpers — no new automation paths.
- An on-call/visiting provider is not automatically bookable: they appear in
  slot enumeration only if an explicit recurring availability rule exists
  (pgTAP-proven; find_available_slots is unchanged and requires rules).
- No Google requirement: request notification uses the communication adapter;
  works without a calendar connection.

## Role matrix

- `specialist.request` (create/list/respond): OWNER, ADMIN, DENTIST,
  RECEPTIONIST. Responding additionally requires the responder to be the
  requested provider's linked user OR an org OWNER/ADMIN.

## Tasks

- [x] **P10-01: Specialist request permission contract**
  - `specialist.request` permission row + matrix; `PermissionCode` + policy
    test; pgTAP proving the matrix.

- [x] **P10-02: Specialist request schema**
  - `specialist_requests`: org, branch, patient composite FK, appointment
    composite FK (nullable), required_specialty (org/global, nullable),
    requested_provider (org FK, nullable), requested_starts_at/ends_at
    (nullable window), case_summary (bounded <=1000, minimal, non-clinical),
    request_channel (EMAIL/SMS), status
    (DRAFT/SENT/ACCEPTED/ASSIGNED/DECLINED/ALTERNATE_TIME_REQUESTED/EXPIRED/
    CANCELLED), response_message bounded, expires_at, version, timestamps.
  - `specialist_request_status_history`: org, request FK, old_value/new_value,
    changed_by, reason, changed_at.
  - RLS, zero base grants, access-path indexes, pgTAP.

- [x] **P10-03: Specialist request RPCs + automation + bookability guarantee**
  - `private.has_specialist_permission_at_branch(acting_branch_id, code)`
    helper.
  - `create_specialist_request` (specialist.request gated; status SENT, expiry
    default +48h, enqueues a notification communication via the internal
    enqueue with the minimal case_summary).
  - `respond_specialist_request` (accept/decline/alternate-time; verifies the
    responder is the requested provider's linked user or org OWNER/ADMIN;
    ACCEPTED → insert appointment_providers SPECIALIST ASSIGNED +
    enqueue_calendar_sync_internal CREATE/UPDATE + enqueue communication).
  - `cancel_specialist_request` / `list_specialist_requests` (bounded
    projection; no clinical data beyond case_summary).
  - Status history entries per transition; one atomic audit event per
    mutation with bounded metadata.
  - pgTAP: state machine, responder authorization (provider linked user,
    admin, foreign denial), minimal-case privacy (case_summary never combined
    with clinical content), acceptance triggers assignment + calendar +
    communication automation atomically, **on-call not automatically
    bookable** (find_available_slots returns zero for a VISITING/ON_CALL
    provider with no availability rule), expiration → EXPIRED.

- [x] **P10-04: Server services + UI**
  - `src/lib/specialist/` service layer mirroring `src/lib/calendar/`
    (schemas/types/errors/service) + offline tests.
  - Minimal `/specialists` page (OWNER/ADMIN/DENTIST/RECEPTIONIST): list
    requests (dense table/phone), create request dialog (patient + specialty +
    requested provider + window + minimal case summary), respond actions
    (accept/decline/alternate for the responder), status history view. Server
    actions recheck specialist.request + responder rules + acting branch.
    Tests.

- [x] **P10-05: Integration verification + phase review**

## Explicitly deferred

- Limited clinical-case access for accepted specialists (Phase 14).
- Messenger channel for specialist requests (Phase 22).
- On-call rotation/roster management.
- Specialist request expiry sweeper job (expiration computed server-side on
  read/respond; a scheduled sweeper is a Phase 8-worker extension).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 10)

- on-call provider does not appear automatically bookable unless policy allows
  (pgTAP: no availability rules → no slots);
- availability request does not expose unnecessary clinical data (minimal
  bounded case_summary only);
- acceptance assigns provider and triggers appointment/calendar automation.

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the pre-production gate.