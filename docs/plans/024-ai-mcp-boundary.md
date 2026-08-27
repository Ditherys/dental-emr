# Phase 24 — AI / MCP (Boundary & Gate)

**Status:** Accepted 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 24 and §48. AI/MCP is intentionally
late-stage and gated on a mature authorization/audit architecture; the platform
is still pre-production (Cloud TEST remains the deployment gate), so this phase
records the boundary and the gate, and implements nothing.

**Goal:** Record ADR-024 (AI/MCP boundary) and the §48 safety model so that any
future MCP tool surface reuses the same application authorization layer as the
UI, never becomes a privileged backdoor, and requires explicit user
confirmation plus audit for sensitive writes — while AI stays limited to
administrative/query assistance, not diagnosis.

## Global Constraints

- All Phase 1–23 doctrine applies unchanged.
- **No MCP tool surface, AI client, assistant, or privileged backdoor is added
  in this phase.** The authorization/audit architecture is not yet proven in
  production; the master plan explicitly requires that maturity first.
- MCP tool calls, when implemented, must use the same authorization layer as
  the UI (application server checks plus RLS/RPC boundaries). Never create a
  privileged MCP backdoor that bypasses clinic permissions.
- Sensitive writes follow §48.3: AI proposes → server resolves the exact target
  → user sees a confirmation → the authorized tool executes → an audit event is
  recorded.
- AI is administrative/query assistance only. No diagnosis or treatment
  decisions. Clinical-note drafting, if ever added, requires dentist review and
  finalization.
- No AI/clinical content, prompts, or outputs may contain real patient data in
  development or test environments.

## Tasks

- [x] **P24-01: Author the bounded boundary plan** (this document).
- [x] **P24-02: Record ADR-024 (AI/MCP boundary)**
  - `docs/decisions/ADR-024-ai-mcp-boundary.md`.
- [x] **P24-03: Record acceptance in the plan and handoff**

## Explicitly Deferred (implementation)

- Any MCP server, tool registration, AI client, assistant UI, or admin query
  surface.
- Read-query tools ("who are my patients today", etc.) until production gates
  are met and a bounded plan is approved.
- Write tools (reminders, specialist requests, reschedule, cancel, follow-up
  tasks) until the §48.3 confirm-and-audit flow is designed and approved.
- Clinical-note drafting.

## Acceptance Criteria

- ADR-024 records the boundary, the reuse of the application authorization
  layer, the no-backdoor rule, the confirm-and-audit flow for sensitive writes,
  and the administrative-only AI boundary.
- No MCP/AI schema, migration, grant, dependency, or application code changed in
  this phase.

## Verification

- Documentation review only. Cloud TEST remains the deployment gate; this phase
  makes no database or application changes.