# Phase 23 — Advanced Operations (Decision Record)

**Status:** Accepted 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 23, which lists **potential** items with
no acceptance criteria and no confirmed product requirements. This phase is a
decision record; no item is implemented from the menu.

**Goal:** Record each candidate advanced-operations item, assess it against
existing canonical data and confirmed requirements, and decide whether it is
approved for a future bounded plan or deferred. No implementation occurs
without a separately approved bounded plan.

## Candidate Assessments

| Candidate | Requires | Prerequisite data today | Decision |
| --- | --- | --- | --- |
| Waitlist automation | Queue entries plus appointment/availability integration and clinic-defined waitlist semantics | Queue entries (Phase 7) and appointment scheduling (Phase 6) exist | **Defer** — waitlist semantics are not confirmed; a bounded plan is required first |
| HMO | A payer/coverage model and billing integration | No canonical payer model; billing ledger is gated on Phase 21 confirmation | **Defer** — depends on the billing decision |
| Advanced finance | The canonical billing ledger and Phase 21 discovery outcome | Billing ledger not yet built (gated) | **Defer** — sequenced after billing |
| Patient portal | Patient self-service decisions, auth model, and integration with intake/booking precedents | Public booking/intake surfaces exist as separate bounded scopes | **Defer** — product requirements not confirmed |
| Schedule optimization | Canonical resource capacity hours (noted deferred in Phase 20) and optimization goals | Capacity hours are not modeled | **Defer** — depends on capacity modeling |
| No-show prediction | Historical outcome data, a privacy-safe model, and product intent | Appointment outcomes exist; ML is outside current scope and privacy-sensitive | **Defer** — requires confirmed product intent and review |

## Decision

- None of the six candidates are confirmed product requirements. Each is
  deferred and, if the owner confirms one, becomes a separately authored,
  reviewed, and approved bounded plan under the same process as every phase.
- No schema, migration, grant, dependency, feature, or application code is
  added in this phase.

## Acceptance Criteria

- The decision record exists, each candidate is assessed against canonical data,
  and the deferral rationale is explicit.
- No implementation happened in this phase.

## Verification

- Documentation review only. Cloud TEST remains the deployment gate; this phase
  makes no database or application changes.