# Phase 22 — Messenger Integration (Boundary & Requirements)

**Status:** Accepted 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 22. The plan's own precondition —
"after Meta app/business requirements are understood" — is not met in this
environment (no Meta app, no credentials, no webhook verification surface), so
this phase delivers the verified requirements record, the integration boundary
ADR, and the gated implementation design. No live Messenger connection or
webhook is built from assumptions.

**Goal:** Document the Meta platform requirements the clinic owner must confirm,
record ADR-023 (the Messenger integration boundary), and define a bounded
design that reuses the Phase 8 unified communication system so that connected
chat never discloses clinical records and every message is logged through the
common communication history.

## Global Constraints

- All Phase 1–21 doctrine applies unchanged.
- Meta app/business requirements are verified and documented before any
  connection, webhook, or outbound adapter is implemented.
- Messenger is an external integration that is **not locally verifiable**
  (AGENTS.md doctrine). No production credentials, app secrets, page access
  tokens, or webhook secrets enter the repository or any development/test
  environment.
- All chat message history is canonical in the Phase 8 `communications` system;
  Messenger never becomes the system of record for clinic communication.
- Ordinary chat never discloses clinical records; only appointment utility
  content (times, location, confirm/cancel) is permitted.
- Patient-initiated conversations follow Meta's conversation-based messaging
  rules; automated outbound messages use only approved utility/template paths.
- This phase adds no schema, migration, grant, dependency, or application code.

## Tasks

- [x] **P22-01: Author the bounded boundary plan** (this document).
- [x] **P22-02: Write the Messenger requirements + boundary record**
  - `docs/discovery/022-messenger-requirements.md`: owner confirmation items,
    Meta concepts to verify, the bounded design (channel seam, webhook
    verification, inbound logging, staff handoff, template allowlist, no
    clinical content), and the implementation gate.
- [x] **P22-03: Record ADR-023 (Messenger integration boundary)**
  - `docs/decisions/ADR-023-messenger-integration-boundary.md`.
- [x] **P22-04: Record acceptance in the plan and handoff**

## Explicitly Deferred (implementation)

- Connecting a clinic Facebook Page to Meta's Messaging API.
- Live webhook ingestion and HMAC verification (requires a Cloud TEST endpoint
  and Meta-verifiable configuration).
- Outbound Messenger adapter and reminder-adapter extension of the Phase 8
  worker.
- Optional guided booking assistant (explicitly optional in the master plan).
- Staff handoff threads and any schema for inbound conversations.

## Acceptance Criteria

- The requirements record documents the owner confirmation items and the Meta
  concepts that must be verified, plus a bounded design that reuses the common
  communication system, keeps clinical data out of ordinary chat, and preserves
  patient-initiated conversation rules.
- ADR-023 records the integration boundary and the decision to keep
  implementation gated.
- No schema, migration, grant, dependency, or application code changed in this
  phase.

## Verification

- Documentation review only. Cloud TEST remains the deployment gate; this phase
  makes no database or application changes.