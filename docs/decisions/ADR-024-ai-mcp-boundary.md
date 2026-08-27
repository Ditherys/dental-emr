# ADR-024 — AI / MCP boundary

**Status:** Accepted — 2026-08-27

**Date:** 2026-08-27

**Decision owner:** Project owner

**Related:** [ADR-003](ADR-003-authorization-defense-in-depth.md),
[ADR-016](ADR-016-supabase-cloud-first-development.md),
`MASTER_PRODUCT_PLAN.md` §Phase 24 and §48, `SECURITY_ARCHITECTURE.md`,
`TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`

## Context

`MASTER_PRODUCT_PLAN.md` §Phase 24 and §48 describe a late-stage, carefully
permissioned AI/MCP surface: read queries and a small set of write actions that
reuse the same application authorization layer as the UI, never form a
privileged backdoor, require user confirmation plus audit for sensitive writes,
and remain administrative/query assistance rather than diagnosis or treatment
decisions. The master plan explicitly states AI/MCP is implemented only after
the core authorization/audit architecture is mature.

The platform is currently pre-production: Cloud TEST remains the mandatory
deployment gate, no production patient data exists in any environment, and the
authorization/audit architecture has not yet been proven under production
conditions. Building any MCP tool surface or AI client now would violate the
master plan's own sequencing.

## Decision

1. **No AI/MCP implementation occurs in Phase 24.** No MCP server, tool
   registration, AI client, assistant UI, admin query surface, or privileged
   backdoor is added. This phase records the boundary and the gate only.

2. **MCP tool calls, when implemented, reuse the same application authorization
   layer as the UI.** The existing application-server checks plus the RPC/RLS
   boundaries are the only path to data and actions. No MCP backdoor bypasses
   clinic permissions, and no service-role/elevated credential is exposed to
   any AI client or assistant.

3. **Sensitive writes follow §48.3 exactly:** AI proposes an action → the server
   resolves the exact target → the user sees a confirmation → the authorized
   tool executes → an audit event is recorded. No write tool executes without
   the confirmation step.

4. **AI is administrative/query assistance only.** No diagnosis or treatment
   decisions. Clinical-note drafting, if ever added, requires dentist review
   and finalization and a separately approved plan.

5. **No real patient, clinical, or financial data in AI development or test
   environments.** Synthetic deterministic data only, consistent with existing
   security doctrine.

6. **Implementation is gated on** a mature, production-proven authorization/audit
   architecture; the Cloud TEST deployment gate; and a bounded, independently
   reviewed plan for the specific MCP/AI surface.

## Consequences

### Benefits

- respects the master plan's late-stage sequencing and the do-not-build-from-
  assumptions rule;
- no privileged AI surface, credential exposure, or audit gap is introduced;
- the confirm-and-audit flow is recorded before any tool is designed.

### Tradeoffs and risks

- no AI/MCP capability exists yet, which is the intended state;
- once gated, the read/write tool surface still requires a bounded plan and
  review before implementation.

## Revisit triggers

Revisit when the platform passes the Cloud TEST deployment gate, when the
authorization/audit architecture is proven in production, when the clinic
confirms a specific administrative AI/MCP use case, or when a bounded AI/MCP
implementation plan is authored for approval.