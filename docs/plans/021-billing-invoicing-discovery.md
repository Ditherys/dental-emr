# Phase 21 — Billing Enhancement / BIR-Compliant Invoicing Discovery

**Status:** Accepted 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 21. No new product requirements are
invented, and **no regulated invoice functionality is implemented from
assumptions.**

**Goal:** Produce the discovery record that the clinic owner and accountant
confirm before any compliant invoicing is designed or built: the clinic's
taxpayer and system status, the applicable BIR registration/invoicing
requirements, and a bounded design for invoice numbering, data, and reporting
that stays gated on that confirmation.

## Global Constraints

- All Phase 1–20 doctrine applies unchanged.
- The discovery record is documentation only. It writes no migrations, changes
  no schema, grants nothing, and touches no canonical billing data.
- Nothing in this phase is legal, tax, or accounting advice. Every BIR concept
  is recorded as an item to confirm with the clinic's accountant or the BIR,
  not as authoritative fact.
- The future canonical billing ledger (DATABASE_DESIGN §22 and DB-9) already
  separates posted charges, payments, and allocations with per-branch
  attribution and ledger-style balance derivation; the invoicing design in this
  record must compose with that ledger rather than add a parallel source of
  truth.
- Implementation of compliant invoicing, numbering, or e-invoice features is
  explicitly deferred until the owner confirms the discovery answers and the
  design is separately reviewed and approved.

## Tasks

- [x] **P21-01: Author the bounded discovery plan**
  - Record the scope from `MASTER_PRODUCT_PLAN.md` §Phase 21 and the
    do-not-build-from-assumptions rule.

- [x] **P21-02: Write the BIR invoicing discovery record**
  - `docs/discovery/021-bir-invoicing-requirements.md` capturing:
    - owner confirmation checklist (taxpayer status, VAT vs non-VAT, business
      registration, billing contact, invoice types used today);
    - BIR concepts to verify with the accountant (registered documents, number
      series authority, computerized-accounting authority, invoicing vs
      receipt usage, tax types/rates, retention/record-keeping, e-invoicing
      applicability, receipts/invoices for walk-in vs advanced bookings);
    - a bounded design for invoice numbering, invoice data, and reporting that
      composes with the canonical billing ledger and stays branch-attributable;
    - the explicit acceptance gate: no invoicing implementation until the owner
      confirms the confirmation checklist and the design is reviewed.

- [x] **P21-03: Record acceptance in the plan and handoff**

## Explicitly Deferred

- All invoicing, payment, charge, statement, and e-invoice implementation.
- Financial analytics beyond Phase 20's deferred list until a canonical billing
  ledger phase exists and is separately approved.

## Acceptance Criteria

- The discovery record exists and documents the owner confirmation items, the
  BIR concepts that must be verified with the accountant, and a bounded
  numbering/data/reporting design.
- The design composes with the canonical billing ledger and preserves branch
  attribution.
- No schema, migration, grant, or regulated feature changed in this phase.

## Verification

- Documentation review only. Cloud TEST remains the deployment gate; this phase
  makes no database or application changes.