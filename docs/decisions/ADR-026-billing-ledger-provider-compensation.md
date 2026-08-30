# ADR-026 — Billing ledger and provider compensation boundary

**Status:** Accepted — explicitly approved by the project owner 2026-08-28

**Date:** 2026-08-28

**Decision owner:** Project owner

**Related:** [ADR-025](ADR-025-owner-full-access.md),
`docs/specs/billing-ledger-provider-compensation.md`,
`docs/plans/billing-ledger-provider-compensation-plan.md`,
`DATABASE_DESIGN.md`, and `SECURITY_ARCHITECTURE.md`

## Context

The platform needs to record the actual amount charged for completed dental
work, the treating provider, money actually collected, and provider earnings
without making a treatment-plan estimate, a mutable patient balance, or a
renderer-specific odontogram state authoritative. The existing architecture
requires organization-scoped financial records with branch attribution, narrow
server-side authorization, RLS, auditability, and append-oriented correction
history.

## Decision

1. PostgreSQL/Supabase is the authoritative financial system of record. New
   billing data uses normalized, organization-scoped relational tables with
   RLS, zero base-table grants, composite tenant-safe foreign keys, attribution,
   and append-only correction events.
2. Monetary source values are nonnegative PHP centavo `bigint` values; JSON and
   form values are base-10 strings. Rates are integer basis points. Client
   state does not calculate canonical balances or earnings.
3. Treatment-plan estimates remain advisory. Authorized completion posts a
   separately confirmed actual charge, retains treating-provider and branch
   attribution, and snapshots the resolved compensation basis/rate or an
   explicit unresolved state.
4. Payments and explicit allocations are separate from charges. Refunds,
   reversals, voids, reallocation, approved direct costs, and provider earnings
   append events instead of rewriting financial history. A patient balance is
   derived, never a mutable source-of-truth column.
5. Provider earnings derive from cleared allocated collections according to the
   charge snapshot and approved direct-cost events. This is internal operational
   reporting, not payroll, tax, BIR invoicing, an official receipt, or general
   accounting.
6. All high-impact writes use narrow server-authorized database boundaries that
   derive actor, organization, and permitted branch server-side, record an
   audit event atomically, and preserve clinical/provider authority rules.
7. As amended by ADR-030, DENTIST receives bounded `payment.record` only for an
   already clinically authorized patient and active permitted receiving branch.
   Existing receiving/charge-origin allocation checks still apply. DENTIST does
   not receive adjustment, refund, payment void, allocation reversal, PDC
   clearance, or financial-analytics authority by default.

## Consequences

- The billing ledger becomes the prerequisite for an odontogram treatment to
  carry actual price, treating provider, payment, and earnings analytics.
- BIR-regulated documents, tax, HMO claims, and mutable account balances remain
  out of scope.
- Existing treatment-plan values require an expand/compatibility/contract
  migration sequence; the legacy decimal estimate is removed only after the
  reviewed compatibility evidence required by B11.
- The dentist payment exception is implemented only by later guarded,
  server-authorized revamp permission/RPC migrations with negative authorization
  coverage; it neither weakens cross-branch allocation checks nor rewrites
  billing ledger history.

## Revisit triggers

Revisit before adding regulated invoicing, payroll/tax calculation, multiple
currencies, shared-provider compensation on one charge, HMO adjudication, or a
financial integration that would require a new authority boundary.
