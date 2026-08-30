# Billing Ledger and Provider Compensation Specification

**Status:** Accepted by the project owner on 2026-08-28 for B0-B11 local-only
implementation; see `docs/BILLING_ODONTOGRAM_ACCEPTANCE_REVIEW.md`.

**Prepared:** 2026-08-28

## Purpose

Provide the internal financial source of truth needed to associate completed
dental procedures with their actual charge, treating provider, collected
payments, approved direct costs, and provider earnings. This specification does
not authorize BIR-regulated invoice or receipt generation.

The ledger is a prerequisite for the enhanced odontogram workflow because a
completed clinical treatment must not be reduced to a visual tooth state or a
mutable price field. Clinical completion and charge posting must be attributable,
transactional, and auditable.

## Goals

- Record actual charges separately from treatment-plan estimates.
- Record who treated the patient separately from who entered the record.
- Record payments and explicit payment-to-charge allocations.
- Support deposits and partly allocated patient account credits.
- Calculate provider earnings from allocated, cleared collections.
- Support provider defaults and procedure-specific compensation overrides.
- Support gross or approved-direct-cost-net compensation bases.
- Preserve branch attribution for production and collections analytics.
- Expose a permission-gated financial summary beside a completed procedure.
- Preserve immutable ledger history through reversals, refunds, and voids.

## Non-goals

- BIR invoice, official receipt, acknowledgment receipt, or e-invoice output.
- Tax, VAT, percentage-tax, withholding, or payroll calculation.
- HMO claims or insurer adjudication.
- General accounting, bank reconciliation, or clinic expense accounting.
- Shared provider earnings within one charge. Shared work uses separate charges.
- A mutable patient balance column.
- Financial values embedded in narrative clinical text or renderer state.

## Canonical Financial Model

PostgreSQL/Supabase is authoritative. Financial records use relational,
append-only ledger rows. Client state is an editor projection only.

All source monetary amounts are nonnegative integer centavos with an explicit
currency. Event kinds and directions determine their signed reporting and
balance effect; reversal rows do not store independently entered negative source
amounts. The first release supports PHP only. A single amount is bounded to
99,999,999,999 centavos (PHP 999,999,999.99). Database and server calculations
use `bigint`; JSON/form values use base-10 digit strings and are never converted
to JavaScript `number`. Rates are integer basis points from 0 through 10,000.

### Estimates and charges

A treatment-plan estimate is advisory. It can seed a proposed charge amount but
is not revenue and is never treated as an actual charge.

A charge is posted only when an authorized staff member confirms the actual
amount. A completed in-clinic treatment requires a treating provider and a
charge. A zero-centavo charge is allowed only with a bounded reason and explicit
`billing.adjust` authorization; it remains visible in production counts but adds
no production amount, collection, or provider earnings.

The completion UI presents the plan estimate and procedure default only as
suggestions and provides a required actual-price input to an actor authorized for
that completion/charge. Editing the actual price never changes the estimate or
catalog default. Amount paid is not entered into the charge field: it is recorded
as a separate payment and explicit allocation, allowing partial payments,
deposits, refunds, and later analytics to remain accurate.

The charge snapshots the procedure, patient, organization, branch, provider,
actual price, service date, posting date, and either the resolved compensation
rate/basis or explicit `NO_ACTIVE_AGREEMENT` state. Later catalog or compensation
changes must not rewrite the snapshot/event chain.

### Treating-provider and service-date authority

An ordinary dentist never supplies the authoritative earning provider. The
completion RPC resolves the authenticated user's active same-organization
provider through `providers.linked_user_id`. When an appointment is linked, that
provider must also have an active assignment in `appointment_providers`; the
appointment, patient, organization, and branch must match. Without an appointment,
the linked provider must be active at the acting branch.

A BILLING-role charge linked to completed clinical work inherits provider,
patient, branch, and service date from that authorized immutable clinical/
appointment relationship; BILLING cannot select or replace those values. A
standalone administrative charge that has no treating provider is explicitly
classified as non-clinical and is excluded from provider earnings.

The default service date is the server-trusted appointment start for an assigned
appointment, otherwise `statement_timestamp()`. `recorded_at`/`posted_at` always
use server time. Ordinary dentists cannot choose another provider, service date,
rate, compensation basis, or charge date.

`billing.attribution.override` permits OWNER/ADMIN only to select a different
active, branch-valid provider or a non-future service date. Every override
requires a bounded reason and produces a dedicated audit event containing only
the affected identifiers/dates, not clinical narrative. The override does not
change the rate directly; the server resolves the effective agreement for the
approved provider and service date. Corrections after posting are append-only
attribution events, not silent updates. The current charge attribution is the
latest valid event in the attribution chain. If allocations already exist, one
atomic operation locks the charge and allocations, appends the correction,
reverses the old provider's cumulative earning target, and either appends the new
provider's cumulative target using the agreement effective on the corrected
authoritative service date or records `NO_ACTIVE_AGREEMENT` for later resolution.
Allocations and the original charge snapshot remain unchanged. A correction
cannot make provider, branch, or patient relationships historically invalid.

### Payments and allocations

A payment records money received from or for one patient account. A payment can
be unallocated, partly allocated, or allocated across multiple charges.

Allocation is explicit. The UI may recommend oldest-due-first allocations, but
an authorized user confirms the final allocation. A charge cannot receive net
allocations above its adjusted amount due. Unallocated cleared money remains a
patient account credit.

The default payment-method catalog is CASH, CARD, GCASH, MAYA, BANK_TRANSFER,
CHEQUE, and OTHER. An organization may rename, deactivate, or add methods without
changing historical records.

### Post-dated cheques

Post-dated cheques use HELD, DEPOSITED, CLEARED, BOUNCED, CANCELLED, and REPLACED
states. Legal transitions are HELD -> DEPOSITED/CANCELLED/REPLACED;
DEPOSITED -> CLEARED/BOUNCED/CANCELLED/REPLACED; and BOUNCED -> REPLACED.
CLEARED, CANCELLED, and REPLACED are terminal. Before clearance, a cheque is
pending coverage only. It does not reduce the patient balance, count as
collections, or generate provider earnings.

CLEARED locks and revalidates the cheque, patient, receiving branch, proposed
allocations, charges, adjusted due, and ordinary payment allocations. If any
proposed allocation became stale, clearance fails atomically and staff must
explicitly revise it. Successful clearance atomically creates the payment and
confirmed allocations. BOUNCED, CANCELLED, and REPLACED create no collections.
Duplicate clearance is rejected. Cheque numbers and bank details are protected
financial data and must not enter ordinary logs or unrestricted analytics.

### Adjustments, refunds, and corrections

Discounts, write-offs, charge credits/debits, refunds, charge/payment voids, and
allocation reversals are explicit records. Posted ledger rows are not deleted or
silently edited. Corrections append the appropriate compensating record with
actor, reason, event time, and idempotency key.

- A payment refund has explicit `payment_refund_allocations`. Each component
  references either an original payment allocation or the payment's unallocated
  credit. Components must sum to the refund. An allocated component first
  appends exactly one equal `payment_allocation_reversal` with cause REFUND and a
  unique one-to-one component link, plus the derived earning reversal; the
  component is attribution metadata and is not counted a second time against the
  allocation. An unallocated component consumes account credit. A refund cannot
  exceed net unrefunded payment value.
- Voiding a charge with allocations atomically reverses every net allocation and
  associated earning entry before the charge-void event. Released cleared money
  becomes unallocated patient credit; it is not automatically refunded.
- A payment may be voided only through one operation that reverses all remaining
  allocations/earnings and removes its unallocated credit. It is one unique full-
  principal event, is rejected if any refund already exists, and cannot be
  followed by allocation or refund. Use refund, not void, when money was actually
  returned.
- Every charge adjustment is charge-linked. A credit cannot reduce adjusted due
  below net allocations unless the same transaction explicitly reverses enough
  allocations to unallocated credit. A debit increases due but generates no
  earnings until cleared money is allocated. Adjustment reversal is a separate
  signed event referencing the original adjustment.
- A partial allocation reversal releases that amount as unallocated credit and
  appends the exact provider-earning reversal delta.

Every consuming/correcting operation is capped under row lock. The authoritative
allocation consumption is the sum of source-linked
`payment_allocation_reversals`, including refund-generated rows; it cannot exceed
the source allocation. An allocated refund component contributes only through
its one equal reversal row. Unallocated refund components cannot exceed current
payment credit. Direct-cost and charge-adjustment reversals are
exact, one-time full reversals of their referenced source entries; they cannot be
partial or repeated. Charge void and payment void are unique terminal events.
Database constraints plus locked transaction checks prevent two concurrent
operations from consuming the same remaining amount.

### Derived balances

The patient account balance is derived from signed charge/void events, signed
charge adjustments/reversals, and net allocation/reversal events. For each
payment, `net_payment_principal = posted_amount - valid_full_payment_void_amount`
and `availability = net_payment_principal - net_refunds - net_allocations`.
A valid payment void therefore makes principal and residual availability zero
after atomically reversing allocations; it never recreates account credit.
Positive availability on a nonvoid payment is account credit. Pending PDCs are
shown separately and do not alter either value.

Charge payment status is derived as UNPAID, PARTIAL, or PAID. Excess cleared
money is patient account credit rather than an over-allocation to a charge.

## Provider Compensation

Each provider can have an effective-dated default compensation agreement. A
procedure-specific rate can override that default. The active rate and basis are
resolved and snapshotted on the authoritative service date, not the later payment
date.

Missing configuration never silently means 0%. If no active agreement exists on
the authoritative service date, the charge still posts with compensation state
`NO_ACTIVE_AGREEMENT`, null rate/basis, and an explicit unresolved-compensation
liability. Allocations may proceed but create no earning entry until OWNER/ADMIN
with `compensation.manage` resolves the charge to an eligible effective-dated
agreement in an audited append-only event. Resolution snapshots rate/basis and
appends the cumulative earning target at resolution time; it does not backdate an
earning event or rewrite the charge. A procedure override without an active
parent agreement is invalid. Analytics report unresolved allocated compensation
separately so clinic contribution is not presented as settled.

Earnings are recognized only from valid cleared payment allocations:

- **Gross basis:** eligible basis is cumulative valid allocations.
- **Net direct-cost basis:** eligible basis is the amount by which cumulative
  valid allocations exceed cumulative approved direct costs.

Procedure direct-cost defaults are UI suggestions only. An actual charge direct
cost is an append-only APPROVAL entry with a positive source amount created by
OWNER/ADMIN under `billing.adjust`; a REVERSAL entry has a positive source amount,
references the original, and supplies the opposite signed effect.
There is no mutable DRAFT/APPROVED status in the financial ledger. Late approval
or reversal locks the charge and allocations, recalculates the cumulative target,
and appends the required signed earning delta in the same transaction.

For net compensation, net approved direct costs are recovered first. On an
installment plan, the dentist earns nothing until cleared allocated collections
exceed those costs. Each allocation or cost correction derives the cumulative
earning target and appends only the delta from existing earning entries.

The positive earning target uses integer half-up rounding:
`(eligible_basis_centavos * rate_bps + 5000) / 10000`. Reversals never round an
independent negative fraction; they append the signed difference between the
new positive cumulative target and prior signed earning entries. This prevents
installment rounding drift.

Refunds, charge voids, and allocation reversals append negative earning entries.
Historical rate snapshots remain unchanged.

One charge has one primary earning provider. If two providers deliver distinct
parts of a treatment, each part is a separate charge with its own provider.

## Analytics Semantics

The default report is an immutable event-period ledger. It never filters only
current status and therefore never rewrites a closed period:

- **Production events:** charge POSTED is positive at `posted_at`; charge VOID is
  negative at `voided_at`; charge debit/credit and reversal events carry their
  signed amount at their own event time. An attribution correction appends an
  equal negative/positive reclassification between old and new provider/service-
  date dimensions at correction time, so organization total production is
  unchanged. Service date is a separate grouping.
- **Collection events:** allocation is positive at `allocated_at`; allocation
  reversal, including refund/void distribution, is negative at its event time.
  Refunds are not subtracted again because their allocation components already
  create negative collection events. Unallocated payments are account credit,
  not collections.
- **Direct-cost events:** approval is positive expense and reversal is negative
  expense at its own event time.
- **Provider earnings:** signed earning entries at their event time.
- **Pending cheque coverage:** non-cleared PDC proposals, always separate.
- **Clinic contribution:** signed net collection events minus signed approved
  direct-cost events minus signed provider-earning events. Charge adjustments
  affect production/balance, not this cash-oriented contribution formula.

Reports also offer an explicit **as-of cutoff** projection that derives current
net charge, collection, cost, and earning state through the cutoff and may group
by original service date. It is labelled as-of and is never confused with the
immutable event-period report.

Production and earnings use charge-origin branch. Payment receipt volume uses
payment-receiving branch. Allocated collections and clinic contribution use the
linked charge-origin branch; cross-branch reports preserve both dimensions.

Clinic contribution must not be labelled net profit. Rent, payroll, taxes,
unallocated overhead, and other expenses are outside this model.

Reports support period, branch, provider, procedure, and payment-method filters.
The default result is aggregate. Patient-level drill-down requires patient-read
and billing-read authorization and an audit event where the established export
or sensitive-read conventions require it.

## Clinical Integration

Completing a planned in-clinic treatment uses one server/database transaction:

1. Reauthorize clinical completion and charge posting.
2. Lock and validate the treatment-plan item and patient.
3. Create the completed clinical record with treating-provider attribution.
4. Transition the treatment-plan item to COMPLETED.
5. Post the charge and snapshot its financial inputs.
6. Append clinical and financial audit events.
7. Return the clinical-record and charge identifiers.

Failure rolls back the entire operation. A planned crown does not become an
existing crown merely because it was accepted or paid. It becomes completed
clinical state only through the completion transaction.

The progress/procedure-note workspace displays a live, permission-gated
financial projection: charged amount, adjustments, allocated paid amount,
pending cheque coverage, remaining balance, and payment status. Mutable amounts
are not copied into finalized clinical narrative text.

## Authorization

The permission contract adds:

- `billing.read`
- `billing.charge`
- `payment.record`
- `billing.adjust`
- `billing.attribution.override`
- `compensation.manage`
- `compensation.own.read`
- `financial.analytics.read`

ADR-026 deliberately refines the security architecture's earlier example
`billing.write` permission into granular charge, payment, adjustment,
attribution, compensation, and financial-analytics permissions. Operational
`analytics.view` is not reused because it would give the BILLING role unrelated
operational analytics. The security architecture must be updated at acceptance;
no catch-all `billing.write` permission is introduced.

Default responsibilities:

| Actor | Allowed financial responsibility |
| --- | --- |
| OWNER | All financial permissions organization-wide under ADR-025 |
| ADMIN | All listed financial permissions; no clinical access is implied |
| BILLING | `billing.read`, `billing.charge`, and `payment.record`; statements and bounded charge/payment reconciliation only; no adjustment, attribution override, compensation, or provider-earnings analytics |
| DENTIST | `billing.read` only for already-authorized patients; `billing.charge` only through own/assigned clinical completion; bounded `payment.record` only for an already clinically authorized patient at an active permitted receiving branch (with every existing allocation branch check); and `compensation.own.read`. `billing.adjust`, refund, payment void, allocation reversal, PDC clearance, and financial analytics remain denied by default |
| RECEPTIONIST | `billing.read` and `payment.record`; no charge, adjustment, compensation, or analytics permission |
| DENTAL_ASSISTANT / VISITING_SPECIALIST | No financial permission by default |

These are fixed system-role defaults. Existing organization-wide versus
branch-scoped assignment rules remain authoritative: organization-wide roles use
their organization scope, while branch-scoped roles can act only through an
active assignment for the affected operational branch. Organizations may use the
existing custom role/permission model for narrower delegation, but cannot weaken
tenant, branch, patient, provider-own, or elevated-adjustment invariants.
Suspended/inactive members and foreign-tenant actors receive no access.

Operation scope is normative:

| Operation | Organization-wide assignment | Branch-scoped assignment |
| --- | --- | --- |
| Patient account read | Itemized organization account after patient-read authorization | Organization balance/account-credit totals for the authorized patient, but itemized events only from branches where the actor has active `billing.read`; hidden-branch rows are never returned |
| Charge post | Any origin branch, subject to patient/clinical rules | Requires `billing.charge` at the charge-origin branch |
| Charge adjustment/attribution correction without allocation reversal | Any origin branch with the elevated permission | Requires the applicable elevated permission at the charge-origin branch; ordinary branch billing roles remain denied |
| Charge void or credit that reverses allocations | Any same-organization origin/receiving combination with elevated permission | Requires `billing.adjust` at the charge-origin branch and `payment.record` at every affected payment-receiving branch |
| Payment record | Any receiving branch | Requires `payment.record` at the payment-receiving branch. For the DENTIST default, the patient must additionally already be clinically authorized to that dentist and the receiving branch must be active and permitted |
| Payment void | Any same-organization receiving/origin combination | Requires `payment.record` at the receiving branch and every origin branch with a net allocation |
| Allocation, allocation reversal, allocated refund component, or PDC clearance | Any same-organization receiving/origin combination | Requires `payment.record` at the receiving branch and at every affected charge-origin branch; Branch-A-only staff cannot mutate a Branch-B charge, so cross-branch credit remains unallocated until an actor with both scopes acts |
| Unallocated-credit refund component | Any receiving branch | Requires `payment.record` at the payment-receiving branch; it cannot expose charge details from another branch |
| Own earnings | All own-provider charges in the organization | Only own-provider charges whose origin branch is covered by an active `compensation.own.read` assignment |
| Financial analytics | Organization aggregates | Only aggregates whose origin/receiving dimension is an actively permitted branch; organization-wide totals require an organization-wide `financial.analytics.read` assignment |

All itemized patient-account operations also require the established applicable
patient permission. A same-organization total never authorizes mutation or
reveals hidden-branch event descriptions, providers, or procedure details.

The DENTIST `payment.record` amendment is intentionally narrower than the
BILLING/RECEPTIONIST path. It permits recording a payment and an allocation only
when the dentist satisfies the clinically authorized patient and active permitted
receiving-branch predicates and, for every allocation, the existing
receiving/charge-origin branch checks. It grants no payment void, refund,
allocation reversal, PDC clearance, charge adjustment, attribution override,
compensation management, or financial analytics by default. Server code and
database RPCs must prove these predicates rather than trusting client-supplied
patient, branch, collector, or role fields.

Every operation is authorized in server code and again in PostgreSQL. The
browser cannot select its tenant, actor, earnings provider, or audit identity.
The provider-own rule resolves the current user's same-organization provider
record through `providers.linked_user_id`.

## Tenancy and Data Integrity

- Every ledger row is organization-scoped.
- Patient, provider, branch, procedure, payment, and charge relationships use
  organization-safe composite foreign keys.
- Charge-origin branch and payment-receiving branch remain distinct.
- Exposed tables enable RLS and have zero base-table browser DML.
- Browser access uses narrow SECURITY DEFINER functions with empty `search_path`,
  internal permission checks, exact terminal grants, and bounded projections.
- Organization and actor values are derived from authenticated context and
  trusted rows, never from untrusted client values.
- Mutations use idempotency keys; balance-affecting operations lock their rows.
- Editable configuration uses optimistic versions and effective-date overlap
  constraints.

## Audit Requirements

Audit at least:

- Charge post and void
- Direct-cost approval and reversal
- Adjustment create and reversal
- Payment record, void, and refund distribution
- Allocation and allocation reversal
- PDC record, status transition, and clearance
- Treating-provider/service-date attribution override
- Compensation agreement create/change/end
- Treatment completion with charge
- Earnings-report access and patient-level financial export

Events identify actor, organization, patient where relevant, branch, action,
entity identifier, timestamp, result, and bounded non-clinical metadata.
Payment references, cheque details, narrative clinical text, and patient names
must not be copied into ordinary audit metadata.

## User Experience

The patient Account section uses a dense statement layout, not dashboard cards.
It shows dated charges, adjustments, payments, allocations, credit, PDC pending
coverage, and the derived balance. Desktop uses a ledger table; phone uses a
compact chronological list with equivalent meaning and touch-safe actions.

Procedure settings hold default fee and direct-cost defaults. Provider settings
hold effective compensation agreements and procedure overrides. Rare settings
remain in dialogs or secondary screens rather than the clinical chart toolbar.

Dentists receive an own-earnings view. Owner/admin analytics clearly separate
production, collections, pending PDCs, provider earnings, and clinic contribution.

## Acceptance Criteria

- Estimates, charges, payments, allocations, and earnings remain distinct.
- Partial and multi-charge payments produce correct derived balances.
- Unallocated payments remain account credit.
- PDCs affect collections and earnings only after clearance.
- Provider rate/basis snapshots remain historically stable; direct-cost events
  remain append-only and reconcile earnings when added/reversed.
- Net compensation recovers approved direct costs first.
- Refunds, voids, and reversals produce compensating history.
- A payment void leaves zero principal/availability, and cumulative correction
  components cannot consume more than their source under concurrency.
- Branch-scoped account detail and mutations follow the operation/scope matrix;
  valid cross-branch allocation requires both receiving/origin scope.
- Missing compensation configuration is visible and unresolved, never silently
  0%; later resolution appends earnings without rewriting the charge.
- Patient and tenant isolation hold under forged identifiers and direct RPC calls.
- A dentist can read only their own earnings; receptionist earnings access fails.
- Completed treatment and its charge are atomic and attributable.
- The clinical workspace can show paid and remaining amounts without making the
  clinical note a financial source of truth.
- No BIR-regulated document is generated.
