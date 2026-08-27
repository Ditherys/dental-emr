# Messenger Integration — Requirements & Boundary Record

**Status:** Requirements and boundary only. **Not legal advice, not a Meta
approval, and not an implemented integration.** Every Meta concept below is an
item to confirm against Meta's current documentation and the clinic's Page/app
status.

**Prepared:** 2026-08-27, as Phase 22 of the Dental EMR & Practice Management
Platform. This phase changes no schema, writes no migrations, adds no
dependency, and connects no Page.

---

## 1. Purpose

`MASTER_PRODUCT_PLAN.md` §Phase 22 lists connecting the clinic Page, webhook
messages, automated appointment utility messages, a reminder adapter, an
optional guided booking assistant, and staff handoff — but only after Meta
app/business requirements are understood. Those requirements are not yet
confirmed for this clinic, so this record is the confirmation scaffold and
boundary design. ADR-023 records the boundary decision.

## 2. Owner Confirmation Items

| # | Item | Why it matters | Owner answer (to confirm) |
| --- | --- | --- | --- |
| 1 | Whether the clinic will operate a Messenger channel at all in the first deployment | Determines if this phase ever proceeds to implementation | |
| 2 | The clinic Facebook Page(s) and admin identity | Needed to connect the Page and manage permissions | |
| 3 | Who is responsible for creating the Meta app and completing app review | Determines ownership of the external configuration | |
| 4 | Whether Messenger will be used for appointment utility messages, reminders, or full conversations | Sets the scope of outbound vs. conversational messaging | |
| 5 | Which staff roles should receive and reply to inbound conversations | Drives the staff handoff design and role gating | |
| 6 | Data-retention preference for inbound chat history | Informs how long inbound conversations are kept and whether they are reportable | |

## 3. Meta Concepts to Verify (with Meta's current docs)

- Messenger Platform app creation, Page connection, and required permissions.
- App review / configuration status needed before production messaging.
- Webhook subscription and verification flow, and the required verification
  token and app secret handling.
- Conversation-based messaging rules: how conversations are opened, the
  standard/utility/template paths, and what is allowed inside a conversation
  window versus outside it.
- User opt-in/consent requirements and how patient-initiated conversations are
  handled.
- Message/template categories and the process to get templates approved for
  automated outbound messages.
- Any additional products (e.g., an "appointment reminders" or "guided
  assistant" capability) that change requirements.

## 4. Bounded Design (gated on confirmation)

This design is **proposed only** and is not implemented by Phase 22.

### 4.1 Channel seam

- The Phase 8 `communications` table is the durable outbox and unified history.
  The Messenger adapter is added as a new channel (`MESSENGER`) behind the same
  enqueue/worker/status path, reusing `provider_id`/`provider_message_id`,
  `idempotency_key`, retries, and observable delivery state. No parallel
  messaging store is created.
- Template types stay bounded and clinic-owned. Only appointment utility
  content is allowed in outbound chat: appointment time, location/branch,
  confirm/cancel/reschedule actions. Clinical text, notes, prescriptions, and
  odontogram content are structurally excluded by the template allowlist and
  are never routed through Messenger.

### 4.2 Webhook

- A single verified webhook endpoint validates Meta's signature (app-secret
  HMAC) before processing; the verification token is never logged and never
  enters the repository.
- Inbound events are written as append-only rows in the common communication
  history (sender, conversation reference, bounded payload, timestamps), with
  idempotent handling so re-delivered events do not duplicate.
- Wrong/unknown signature or malformed payload is rejected without side
  effects; no patient enumeration is possible through the endpoint.

### 4.3 Inbound conversations and staff handoff

- Patient-initiated conversations are acknowledged within the applicable
  conversation rules; automated replies only ever contain appointment utility
  content.
- Staff replies go through the same role-gated server path as outbound messages
  and are logged in the common history. No browser client can impersonate the
  clinic channel.
- No clinical data is disclosed through ordinary chat; the record is the
  source of truth for clinical content.

### 4.4 Reminder adapter and optional assistant

- The Phase 8 reminder worker may gain a Messenger delivery adapter only after
  the required template/approval path is confirmed and Cloud TEST-verified.
- The optional guided booking assistant is out of scope until the clinic
  confirms it wants it and Meta requirements are verified.

### 4.5 Environment and credentials

- No Meta credentials, app secrets, page tokens, or webhook secrets in the
  repository, `.env.local`, tests, screenshots, logs, or agent prompts
  (AGENTS.md security doctrine).
- Implementation integration testing happens against Cloud TEST only after the
  connection is configured by the clinic owner; local development continues to
  use the verified EMAIL/SMS channels.

## 5. Implementation Gate

Messenger implementation begins only when:

1. The clinic owner completes the Section 2 confirmation items;
2. The Meta requirements in Section 3 are verified against current Meta docs
   and app-review status;
3. This design (Section 4) is revised against those answers and approved;
4. ADR-023 is confirmed or amended;
5. A bounded implementation plan is authored and reviewed, and Cloud TEST is
   the verification target.

Until then the platform continues on EMAIL/SMS only, and no Messenger channel,
webhook, token, dependency, or application code exists for it.