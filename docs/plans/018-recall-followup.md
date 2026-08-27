# Phase 18 — Recall & Follow-up Automation

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 18 plus accepted architecture. No new
product requirements are invented.

**Goal:** Recall rules configured by dentist/clinic, due-date tracking, reminder
automation through the Phase 8 communication worker, booking-from-recall that
links correctly to an appointment, an overdue list, retention analytics, and
patient opt-out/preferences respected.

## Global Constraints

- All Phase 1–17 doctrine applies unchanged.
- Recall rules are org/branch-configurable; completed treatment can create a
  recall (auto on clinical encounter finalize via trigger, plus a manual RPC).
- A booked recall links correctly to an appointment (recall.appointment_id
  org-scoped FK).
- Opt-outs/preferences respected: patient-level recall opt-out (default in) is
  enforced before any reminder enqueue; a recall can also be OPTED_OUT
  individually.
- Reminders reuse the Phase 8 communication worker (enqueue via the internal
  helper; delivery/status observable in the Phase 8 dashboard).
- Overdue is a computed state (`due_date < now()` AND status SCHEDULED); the
  list RPC surfaces it. Retention analytics are aggregate counts by rule/status
  (bounded, analytics-style, no patient rows).

## Role matrix

- `recall.manage` (rules + recall mutations): OWNER, ADMIN, DENTIST.
- `recall.read` (overdue list + view): OWNER, ADMIN, DENTIST, RECEPTIONIST.

## Tasks

- [ ] **P18-01: Recall permission + schema**
  - `recall.manage` / `recall.read` permission rows + matrix; `PermissionCode`
    + policy test; pgTAP.
  - `recall_rules`: org, branch nullable, name bounded, interval_months int
    1..120, channel (EMAIL/SMS/NONE), is_active default true, version,
    timestamps; branch nullable composite FK. RLS + zero grants.
  - `patient_recall_preferences`: org, patient composite FK PK, recall_opt_out
    boolean default false, updated_at. RLS + zero grants.
  - `recalls`: org, branch, patient composite FK, recall_rule FK, due_date,
    status (SCHEDULED/OVERDUE/COMPLETED/CANCELLED/OPTED_OUT), reminder_sent_at,
    reminders_sent int default 0, appointment_id org FK nullable, created_by,
    version, timestamps. RLS + zero grants + indexes (org, status, due_date;
    org, patient).
  - pgTAP.

- [ ] **P18-02: Recall RPCs + automation trigger**
  - `private.has_recall_permission_at_branch(acting_branch_id, code)` helper.
  - `create_recall_rule` / `update_recall_rule` / `list_recall_rules`
    (recall.manage; branch-scoped or clinic-wide; audit 'recall.rule.created/
    updated' {}).
  - `create_recall(acting_branch_id, patient_id, rule_id, due_date null)` —
    recall.manage gated; computes due_date = now() + rule.interval_months if
    null; audit 'recall.created' {}.
  - `set_recall_opt_out(acting_branch_id, patient_id, opt_out boolean)` —
    recall.manage gated (patient preference is clinic-managed; patient-facing
    opt-out self-service is deferred); upsert patient_recall_preferences; audit
    'recall.preferences.updated' {}.
  - `complete_recall` / `cancel_recall` (recall.manage; versioned; audit each).
  - `link_recall_appointment(acting_branch_id, recall_id, expected_version,
    appointment_id)` — recall.manage gated; appointment org-scoped; versioned;
    status stays (booked recall links correctly); audit 'recall.appointment_
    linked' {}.
  - `enqueue_recall_reminder(acting_branch_id, recall_id, expected_version)` —
    recall.manage gated; respects patient opt-out (skip if opted out or
    individual OPTED_OUT) and channel NONE; enqueues a Phase 8 REMINDER
    communication to the patient primary contact via the internal enqueue;
    sets reminder_sent_at + reminders_sent+1 (only when actually enqueued —
    idempotent per recall+day? keep simple: increments only on enqueue);
    audit 'recall.reminder_enqueued' {}.
  - `list_recalls(acting_branch_id, patient_id null, status null)` —
    recall.read gated; bounded 200; overdue is derived (status SCHEDULED AND
    due_date < now()); no audit.
  - `get_recall_retention_summary(acting_branch_id)` — recall.read gated;
    aggregate counts by rule + status (no patient rows); no audit.
  - **Automation trigger**: extend the P14 clinical encounter finalize path —
    a NEW trigger `private.recall_after_encounter_finalize()` AFTER UPDATE on
    clinical_encounters when status→FINALIZED: creates recalls for each active
    matching recall_rule (branch or org-wide) for that encounter's patient
    (recall rows SCHEDULED with due_date). Completed treatment creates recall.
    Revoke all; empty search_path.
  - pgTAP (rule config, auto-recall on finalize, opt-out respected at reminder
    enqueue, booked recall links correctly, overdue derived, retention summary
    aggregate, permission denials, audit per mutation + rollback, tenant
    isolation).

- [ ] **P18-03: Server services + UI**
  - `src/lib/recall/` service layer + offline tests.
  - `/recalls` page (recall.read gated; overdue list first, dense table/phone):
    create recall, enqueue reminder, complete/cancel, link to appointment,
    mark rule management (recall.manage) via a rules dialog, retention summary
    counts, patient opt-out toggle. Server actions recheck recall.read/manage
    + branch. Tests.

- [ ] **P18-04: Integration verification + phase review**

## Explicitly deferred

- Patient-facing opt-out self-service (portal).
- Recall booking self-service from patient side.
- Retention analytics charts (Phase 20; aggregate counts here).
- No-show/recall waitlist integration.

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 18)

- recall rule is dentist/clinic configured (RPC-managed rules);
- completed treatment can create recall (encounter-finalize trigger);
- booked recall links correctly (link_recall_appointment);
- opt-outs/preferences respected (patient prefs + OPTED_OUT + skip logic).

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.