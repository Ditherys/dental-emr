# ADR-023 — Messenger integration boundary

**Status:** Accepted — 2026-08-27

**Date:** 2026-08-27

**Decision owner:** Project owner

**Related:** [ADR-004](ADR-004-single-nextjs-repo.md),
[ADR-016](ADR-016-supabase-cloud-first-development.md),
[ADR-020](ADR-020-local-supabase-hybrid-development.md),
`MASTER_PRODUCT_PLAN.md` §Phase 22, `TECHNICAL_ARCHITECTURE.md`,
`SECURITY_ARCHITECTURE.md`, `DATABASE_DESIGN.md`

## Context

`MASTER_PRODUCT_PLAN.md` §Phase 22 lists Messenger integration (Page
connection, webhooks, automated appointment utility messages, a reminder
adapter, an optional guided booking assistant, and staff handoff), but only
"after Meta app/business requirements are understood." Those requirements are
not yet confirmed for the clinic: there is no Meta app, no Page connection, no
app-review status, and no webhook verification surface in this environment.
AGENTS.md doctrine treats external integrations (Google Calendar/OAuth, SMS/email
providers, Messenger) as not locally verifiable, forbids production credentials
in the repository, and requires any material architecture change to be recorded
in an ADR before implementation.

Meanwhile the platform already has a unified Phase 8 communication system: the
`communications` table is both the durable outbox and the observable history,
with bounded template types, channel (`EMAIL`, `SMS`), idempotency, retries, and
delivery state. Any Messenger adapter should extend that system rather than
create a parallel messaging store, and clinical content must never flow through
ordinary chat.

## Decision

1. **Messenger integration is a boundary, not an implementation, in Phase 22.**
   This phase delivers the verified requirements record and this ADR; it does
   not connect a Page, add a webhook, add a dependency, change the
   `communications` schema, or add application code.

2. **The Phase 8 communication system remains the single messaging boundary.**
   Messenger is added as a `MESSENGER` channel behind the existing
   enqueue/worker/status path when implemented, reusing `idempotency_key`,
   `provider_id`/`provider_message_id`, retries, and observable delivery state.
   No parallel messaging store is created, and Messenger never becomes the
   system of record for clinic communication.

3. **Only appointment utility content may be sent through chat.** The template
   allowlist is bounded (time, location/branch, confirm/cancel/reschedule
   actions). Clinical text, notes, prescriptions, odontogram content, and
   patient-identifying documents are structurally excluded and never routed
   through Messenger.

4. **Patient-initiated conversations follow Meta's conversation-based
   messaging rules** as verified against current Meta documentation; automated
   outbound messages use only approved utility/template paths.

5. **A single verified webhook endpoint** validates Meta's app-secret signature
   before processing; the verification token and secret are never logged and
   never stored in the repository. Inbound events are written append-only into
   the common communication history with idempotent handling.

6. **Staff handoff is role-gated server-side**; no browser client can
   impersonate the clinic channel, and replies are logged in the common history.

7. **No Meta credentials, app secrets, page tokens, or webhook secrets** enter
   the repository, `.env.local`, tests, screenshots, logs, or agent prompts.
   Implementation integration tests target Cloud TEST only after the clinic
   owner configures the connection; local development stays on EMAIL/SMS.

8. **The optional guided booking assistant is out of scope** until the clinic
   confirms it wants it and the Meta requirements are verified.

## Consequences

### Benefits

- satisfies the master plan's "do not build from assumptions" precondition;
- keeps a single durable communication boundary and history;
- no clinical data can leak through ordinary chat by construction;
- no external dependency, credential, or unverifiable integration is added to
  the repository.

### Tradeoffs and risks

- real Messenger delivery, webhook verification, template approval, and
  conversation-window behavior cannot be validated locally and must be tested
  against Cloud TEST at deployment readiness;
- Meta policy/API changes may alter the design before implementation;
- the clinic must complete the owner confirmation items before implementation
  can be planned.

## Revisit triggers

Revisit when the clinic confirms it wants Messenger, when Meta app-review and
requirements are verified, when Messenger API/policy materially changes, or
when a bounded Messenger implementation plan is authored for approval.