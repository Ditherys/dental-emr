# Phase 7 — Walk-in & Queue

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §21 and §Phase 7 plus accepted architecture docs.
No new product requirements are invented.

**Goal:** A reception-facing walk-in and waiting-queue workflow that never
pretends a walk-in had a pre-existing scheduled appointment. Queue state is a
separate operational dimension from appointment lifecycle (walk-in has no
appointment until one is explicitly created), and queue status changes must not
corrupt appointment status.

## Global Constraints

- All Phase 1–6 doctrine applies unchanged (org tenant, RLS, no browser base
  DML, SECURITY DEFINER RPCs with empty search paths + terminal grants, one
  atomic audit event per mutation with bounded metadata, optimistic versions,
  synthetic fixtures, additive migrations).
- A walk-in creates a **queue entry**, not an appointment. An appointment may
  later be created from the queue via the existing scheduling surface; the
  queue entry and appointment remain distinct records.
- Queue statuses: `WAITING`, `READY`, `CALLED`, `IN_CHAIR`, `COMPLETED`,
  `LEFT`, `CANCELLED`. Forward transitions only, validated server-side.
- No waitlist automation (Phase 18/21.3), no no-show automation, no chair
  availability enforcement in this phase beyond recording an optional
  provider/resource on the queue entry.

## Role matrix

- `queue.read` + `queue.manage`: OWNER, ADMIN, RECEPTIONIST.
- `queue.read` only: DENTIST, DENTAL_ASSISTANT.
- Neither: VISITING_SPECIALIST, BILLING.

## Tasks

- [ ] **P7-01: Queue permission + schema**
  - Permission catalog rows `queue.read`/`queue.manage` with stable
    descriptions; role_permissions per matrix; `PermissionCode` + policy test;
    pgTAP proving the matrix.
  - `queue_entries` table: org, branch composite FK, patient composite FK,
    status (WAITING/READY/CALLED/IN_CHAIR/COMPLETED/LEFT/CANCELLED), optional
    provider_id (org FK), optional resource_id (org+branch FK), chief complaint
    <=2000, arrived_at, version, created_at, updated_at, completed_at/left_at
    consistency checks. RLS enabled, zero base grants, access-path indexes
    (org, branch, status; org, branch, arrived_at), pgTAP.

- [ ] **P7-02: Queue RPCs**
  - `create_walkin_entry(acting_branch_id, patient_id, chief_complaint, provider_id, resource_id)`
    — queue.manage gated; patient must be org patient; defaults status WAITING;
    one audit `queue.entry.created` ({} metadata).
  - `update_queue_status(acting_branch_id, queue_entry_id, expected_version, new_status, reason)`
    — queue.manage gated; lock + optimistic version; forward transitions only
    (WAITING→READY, WAITING→CANCELLED, READY→CALLED, CALLED→IN_CHAIR,
    IN_CHAIR→COMPLETED, and WAITING→LEFT, READY→LEFT, CALLED→LEFT); IN_CHAIR
    allowed only from CALLED; COMPLETED sets completed_at; LEFT sets left_at;
    CANCELLED terminal; one audit `queue.entry.status_updated` with
    {old_value, new_value, reason?}.
  - `list_queue(acting_branch_id, include_terminal boolean)` — queue.read
    gated; bounded 200-row projection ordered by arrived_at; no audit.
  - Terminal grants + pgTAP (positive/negative/transition violations/audit
    rollback/tenant isolation). Audit metadata allowlist already covers
    old_value/new_value/reason from P6-06.

- [ ] **P7-03: Server services**
  - `src/lib/queue/` Zod schemas/types/errors/service mirroring
    `src/lib/scheduling/`; offline mocked unit tests.

- [ ] **P7-04: Queue UI**
  - Private `/queue` page (server-gated on queue.read), dense waiting-queue
    list (desktop table / phone list), `+ Walk-in` dialog with existing-patient
    picker (authorized searchPatientsAction) or new-patient quick registration,
    queue status action buttons (44px) gated on queue.manage, phone
    composition. Server actions revalidate queue.manage + acting branch. Tests.

- [ ] **P7-05: Integration verification + phase review**

## Explicitly deferred

- Waitlist / no-show automation (Phase 18).
- Chair availability enforcement at queue time (Phase 6 resource scheduling
  already exists; queue chair assignment is optional metadata here).
- Queue analytics (Phase 20).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 7)

- walk-in can be created without fake pre-booking (queue entry ≠ appointment);
- receptionist can see current queue;
- queue status does not corrupt appointment status (separate tables; queue
  transitions never touch appointment rows).

## Verification

- Full local db reset/provision/test; `security:migrations`/`secrets`/`audit`;
  `test:unit`, `lint`, `typecheck`, `build`. Cloud TEST remains the
  pre-production gate.