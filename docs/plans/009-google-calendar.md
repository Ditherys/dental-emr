# Phase 9 — Google Calendar Integration

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §15 and §Phase 9 plus accepted architecture. No
new product requirements are invented.

**Goal:** Per-provider optional calendar connection where the EMR is the source
of truth and Google Calendar is a convenience sync. EMR→Google events are
idempotent (retry never duplicates), sync failures never make the EMR
appointment disappear, free/busy is the only inbound read (never personal event
details to reception), privacy modes are conservative by default, and OAuth
tokens never reach the browser or logs.

**IMPORTANT EXTERNAL-DEPENDENCY BOUNDARY:** Google OAuth and the Calendar API are
real external services that cannot be exercised in local verification. As with
Phase 8, this phase builds the provider-neutral adapter interface and a
deterministic local test adapter. Real Google behavior is **NOT VERIFIED** in
this phase and Cloud TEST remains the deployment gate.

## Global Constraints

- All Phase 1–8 doctrine applies unchanged.
- The EMR appointment is authoritative; a failed sync is an actionable warning,
  never a change to the appointment.
- Tokens: stored only as an encrypted/opaque server-side reference. The test
  adapter requires no real token. Never log tokens.
- Privacy modes default to the conservative `HIGH_PRIVACY` title
  (`Dental Appointment`); more detailed modes require explicit clinic selection
  (schema stores the mode; UI for selecting it is minimal).
- Idempotency: stable external event id derived from appointment + provider so
  retries never create duplicate events.
- Sync is asynchronous (durable job), never blocking the appointment save.
- Free/busy inbound is the ONLY Google read surfaced to scheduling; personal
  event titles are never shown to reception.

## Role matrix

- `calendar.manage`: OWNER, ADMIN, DENTIST (a dentist connects their own
  calendar). No other role.

## Tasks

- [x] **P9-01: Calendar permission contract**
  - `calendar.manage` permission row + matrix; `PermissionCode` + policy test;
    pgTAP proving only OWNER/ADMIN/DENTIST.

- [x] **P9-02: Calendar integration + sync-job + link schema**
  - `calendar_integrations`: org, provider composite FK, google_account_ref
    (opaque, server-side), calendar_id (bounded), privacy_mode
    (HIGH_PRIVACY/BALANCED/DETAILED default HIGH_PRIVACY), connection_status
    (CONNECTED/DISCONNECTED/ERROR), last_synced_at, version, timestamps.
  - `calendar_event_links`: org, appointment composite FK, provider composite
    FK, external_event_id (unique within org+provider), operation
    (CREATE/UPDATE/CANCEL), sync_status (PENDING/SYNCED/FAILED/CANCELLED),
    attempts, max_attempts, last_error bounded, last_synced_at, version,
    unique(org, appointment, provider, operation) where relevant.
  - `calendar_sync_jobs`: durable queue (org, appointment, provider, operation,
    status QUEUED/PROCESSED/FAILED/CANCELLED, attempts, next_attempt_at,
    external_event_id nullable, idempotency via stable external_event_id,
    created_at). RLS + zero grants + indexes. pgTAP.

- [x] **P9-03: Sync RPCs + appointment automation trigger**
  - `private.has_calendar_permission_at_branch(acting_branch_id, code)` helper.
  - `enqueue_calendar_sync` (calendar.manage gated): enqueue a sync job for an
    appointment+provider with operation, idempotent via stable key.
  - `cancel_calendar_sync` / `list_calendar_syncs` (view via calendar.manage;
    bounded projection, no personal event details).
  - `claim_due_calendar_syncs` / `acknowledge_calendar_sync` /
    `fail_calendar_sync` / `record_calendar_event_link` (worker path, gated on
    calendar.manage for a service account).
  - Appointment automation trigger (extends P8-03 trigger): on
    create/schedule → enqueue CREATE sync for each ASSIGNED provider with a
    connected integration; on reschedule → UPDATE; on cancel → CANCEL. Enqueue
    is in-transaction only. pgTAP.

- [x] **P9-04: Calendar adapter + sync worker**
  - `src/lib/calendar/adapters/`: `CalendarAdapter` interface
    (createEvent/updateEvent/cancelEvent/getFreeBusy), deterministic `test`
    adapter (stable external_event_id per appointment+provider — proves
    no-duplicate; records ops; returns synthetic busy blocks), resolver by env.
  - `src/lib/calendar/worker.ts`: processes due sync jobs (claim → adapter →
    acknowledge with external_event_id, or fail), never re-creates a duplicate
    (stable id + link unique).
  - `src/lib/calendar/service.ts` + schema/types/errors mirroring
    `src/lib/communication/`.
  - Unit tests: no-duplicate retry, EMR-correct-when-Google-down (adapter
    failure → job FAILED, appointment untouched), free/busy returns only busy
    ranges (no event details), privacy mode title selection.

- [x] **P9-05: Calendar status UI**
  - Minimal `/settings/calendar` page (OWNER/ADMIN/DENTIST): per-provider
    integration status (connected/error), sync job failures with Retry/actions,
    no Google event details shown. Dense table/phone list. Server actions
    recheck calendar.manage + branch. Tests.

- [x] **P9-06: Integration verification + phase review**

## Explicitly deferred

- Real Google OAuth flow, token refresh, and Calendar API adapter (external;
  adapter interface + test adapter ready; NOT VERIFIED locally).
- Inbound Google free/busy polling into provider availability (Phase 9 scope
  covers the adapter read; wiring into slot availability is Phase 10).
- Webhooks/push reconciliation (Phase 23); provider calendar picker UI.

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 9)

- EMR remains correct if Google is down (adapter failure → job FAILED, sync
  warning, appointment untouched);
- personal event details are not shown to reception when using free/busy
  (adapter returns busy ranges only);
- retry does not duplicate events (stable external_event_id + link unique);
- provider reassignment updates mappings (enqueue UPDATE/CANCEL by provider);
- tokens never reach browser logs (opaque ref, no logging, test adapter only).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Real Google behavior is an explicit
  NOT VERIFIED / EXTERNAL DEPENDENCY note.