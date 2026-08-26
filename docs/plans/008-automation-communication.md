# Phase 8 — Automation & Communication Core

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §16–18 and §Phase 8 plus accepted architecture.
No new product requirements are invented.

**Goal:** A first-class automation core: appointment reminders are durable,
retryable, idempotent, observable, and never block the appointment save that
created them. External sending is async; the communications table is both the
durable queue and the unified communication history. Real SMS/email vendors are
external dependencies and are represented by a provider-neutral adapter
interface with a deterministic local test adapter; no vendor is hard-coded.

## Global Constraints

- All Phase 1–7 doctrine applies unchanged.
- **Sending never blocks the appointment transaction**: appointment mutations
  only insert durable communication jobs (an INSERT inside the same
  transaction); a separate worker claims and sends due jobs.
- Jobs are idempotent: `(organization_id, idempotency_key)` is unique; retry
  never duplicates a send.
- Jobs are retryable with bounded attempts and a failure/dead-letter state;
  permanent validation errors are not retried forever.
- Cancellation/rescheduling cancels obsolete scheduled reminder jobs.
- Staff can see delivered/failed state per communication (dashboard).
- Reminder body is **template-only with bounded non-clinical content** — no
  sensitive clinical details, no full notes. No patient clinical data in any
  communication body.
- Real providers are not contacted in tests: a deterministic local adapter
  records delivery. External adapter behavior is NOT VERIFIED in this phase.
- No Messenger in this phase (Phase 22). No webhooks/push (Phase 9/23).

## Role matrix

- `communication.view` + `communication.send`: OWNER, ADMIN, RECEPTIONIST.
- Neither: DENTIST, DENTAL_ASSISTANT, VISITING_SPECIALIST, BILLING
  (least privilege; provider-facing comms may be added in Phase 10/23).

## Tasks

- [ ] **P8-01: Communication permission contract**
  - `communication.view` / `communication.send` permission rows + matrix;
    `PermissionCode` + policy test; pgTAP proving the matrix.

- [ ] **P8-02: Communications durable job + history schema**
  - `communications` table: org, branch nullable, patient nullable (org
    composite FK), channel (EMAIL/SMS), template_type (CONFIRMATION, REMINDER,
    RESCHEDULE, CANCELLATION), recipient (bounded address/number), subject/body
    (template-only, bounded, no clinical content), provider_id (adapter),
    provider_message_id, status (QUEUED/SENT/DELIVERED/FAILED/CANCELLED),
    idempotency_key, attempts, max_attempts, next_attempt_at, scheduled_for,
    sent_at/delivered_at/failed_at/cancelled_at, created_at/updated_at.
    RLS enabled, zero base grants, indexes (org,status,next_attempt_at;
    org,patient; org,appointment), unique (org, idempotency_key), CHECKs.
    pgTAP.

- [ ] **P8-03: Enqueue/cancel/list RPCs + appointment automation triggers**
  - `enqueue_communication` (SECURITY DEFINER, communication.send gated) inserts
    a QUEUED job with a caller-provided idempotency_key (reject duplicates).
  - `cancel_communication` for obsolete jobs (only QUEUED/SENT-with-attempts
    pending) — used when an appointment is cancelled/rescheduled.
  - `list_communications` (communication.view gated, bounded projection, no
    clinical content, no audit on read).
  - **Appointment automation triggers**: BEFORE/AFTER triggers on appointments
    enqueue CONFIRMATION on create/confirm, REMINDER at 48h/24h (scheduled_for
    in the future) — the enqueue is just an INSERT so it never blocks the
    appointment save; CANCELLATION template enqueued on cancel; obsolete
    reminder jobs cancelled on reschedule/cancel. Triggers run as the
    appointment write actor via the RPC transaction (SECURITY DEFINER helper
    with empty search_path, revoked).
  - pgTAP: enqueue duplicate idempotency rejected; cancel releases only
    pending; appointment create enqueues exactly one confirmation; cancel
    enqueues cancellation + cancels reminders; tenant/permission denials.

- [ ] **P8-04: Worker + provider adapter abstraction**
  - `process_due_communications` SECURITY DEFINER RPC: claims up to N due jobs
    with `FOR UPDATE SKIP LOCKED`, marks them PROCESSING (status stays QUEUED
    with attempts+1? no — use a distinct claim via next_attempt_at/attempts),
    and returns the claimed jobs to the server worker. Server worker:
    `src/lib/communication/` — provider adapter interface
    (`sendSms`/`sendEmail` returning provider_message_id), a deterministic
    `test` adapter (no network; records delivery) selected by env, an
    `acknowledge_communication` RPC (status SENT + provider_message_id) and a
    `fail_communication` RPC (status FAILED after max_attempts, else re-queue
    with backoff next_attempt_at). Unit tests prove idempotency (a job sent
    once is never re-sent), retry, and duplicate-send rejection.

- [ ] **P8-05: Communication dashboard UI**
  - Private `/settings/communications` (or `/communications`) page gated on
    communication.view: dense table of communications with status, channel,
    template, recipient (masked), attempts, timestamps, delivery state; phone
    list; retry/cancel actions gated on communication.send; server actions
    recheck permissions + acting branch. Tests.

- [ ] **P8-06: Integration verification + phase review**

## Explicitly deferred

- Real SMS/email vendor adapters and Philippine number normalization
  (external dependency; adapter interface is ready).
- Messenger integration (Phase 22).
- Webhooks/push, waitlist, recall automation (Phases 9/18/23).
- Clinic-configurable reminder rules UI (schema supports template_type +
  scheduled_for offsets; rule config UI deferred).
- Worker scheduling/pg_cron (production scheduling; the worker entry point and
  local loop are provided, Cloud TEST remains the deployment gate).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 8)

- external send does not block appointment save (enqueue-only in-appointment);
- jobs are retryable/idempotent (attempts, unique idempotency key, worker);
- cancellation cancels obsolete reminders;
- staff can see whether reminder delivered/failed;
- duplicate send tests pass.

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Worker + adapter logic covered by unit tests with
  the deterministic adapter. Cloud TEST remains the pre-production gate.