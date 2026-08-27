# BIR-Compliant Invoicing — Discovery Record

**Status:** Discovery only. **Not legal, tax, or accounting advice.** This
record documents the questions the clinic owner must confirm with an accountant
or the BIR before any compliant invoicing is designed or built.

**Prepared:** 2026-08-27, as Phase 21 of the Dental EMR & Practice Management
Platform. This phase changes no schema, writes no migrations, grants nothing,
and implements no invoicing.

---

## 1. Purpose

The master product plan (§Phase 21) requires that the clinic confirm its
taxpayer and system status, consult the accountant/BIR rules, and document the
requirements before designing invoice numbering, data, and reporting. This
record is that confirmation scaffold and the resulting bounded design.

## 2. Owner Confirmation Checklist

The clinic owner must answer these before implementation can be considered:

| # | Item | Why it matters | Owner answer (to confirm) |
| --- | --- | --- | --- |
| 1 | Registered business name and BIR taxpayer identification number | Determines the legal seller identity on invoices | |
| 2 | Tax type: VAT-registered or non-VAT | Determines which registered documents and tax computations apply | |
| 3 | BIR Certificate of Registration (COR) details | Establishes registered document types and authorized number series | |
| 4 | Registered document types used today (e.g., sales invoices, official receipts, acknowledgment receipts) | The system must match what the clinic is actually authorized to issue | |
| 5 | Whether the clinic uses a computerized accounting system (CAS) or loose-leaf books | Determines whether special BIR authority applies before issuing system-generated invoices | |
| 6 | Number series: manual/printed series vs. system-generated series | Drives whether numbering must be pre-registered/authorized or can be generated and reported | |
| 7 | For dental/medical services: whether "sales invoice" or "official receipt" is the correct registered document | Services commonly use receipts; the accountant confirms the correct type | |
| 8 | Applicable tax type and rate for the clinic's services | VAT vs. percentage tax rates must be confirmed with the accountant for the current year | |
| 9 | Who issues documents: each branch separately or the whole clinic | Determines per-branch number series and reporting | |
| 10 | Walk-in vs. online/advanced-booked patients | Determines whether receipts must print immediately at the branch or can be generated after service | |
| 11 | Retention and record-keeping obligations | Informs how long invoice/ledger data must be preserved and whether it must be reportable/exportable | |
| 12 | Whether e-invoicing / e-receipting requirements apply to the clinic | A statutory development; the accountant confirms current applicability and timelines | |
| 13 | Billing contact (owner or accountant) to approve the final design | Required sign-off before any implementation | |

## 3. BIR Concepts to Verify With the Accountant

These are concepts to confirm — not statements of current law. The accountant
determines what applies to this clinic and the current period.

- Registered invoice/receipt documents and the difference between sales
  invoices and official receipts for services.
- Authorization to print or authority for a computerized accounting system
  before issuing system-generated numbered documents.
- Number series: consecutive, non-repeating, un-reused numbering; voided
  documents preserved (never deleted) with the reason.
- Required document fields for the applicable document type (seller details,
  buyer details, description, amounts, tax computation, authority/series data).
- VAT vs. percentage tax computation on the document and the correct current
  rate.
- Record-keeping, retention, and reporting obligations, including any
  electronic filing/reporting requirements.
- Branch-level series if each branch must issue and report separately.

## 4. Bounded Design (gated on confirmation)

This design is **proposed only** and composes with the canonical billing ledger
(DATABASE_DESIGN §22 / DB-9: posted charges, payments, allocations, ledger-style
balance). It is not implemented by Phase 21.

### 4.1 Numbering

- One invoice/receipt number series per (organization, branch, document type)
  when branch-level issuance is confirmed; otherwise one per organization.
- Consecutive per series, starting from the confirmed starting number, never
  reused. Voided documents keep their number and are marked VOIDED with a
  reason and actor; they are never physically deleted.
- If system-generated numbering requires pre-registration/authority, the number
  range and sequence are configured only after the accountant confirms the
  authority; the application never silently invents series.
- All numbers are appended to the append-only audit trail on issuance.

### 4.2 Data

- Invoice/receipt documents are derived records: they reference the confirmed
  charge/payment ledger rows (branch-attributable) rather than duplicating
  amounts in a second source of truth.
- Buyer/payor data comes from the patient/contact records and is captured at
  issuance, never invented.
- A printed/PDF document is a snapshot (versioned, like clinical documents) so
  re-printing never silently changes an issued document.
- No real taxpayer data in development; tests use deterministic synthetic
  taxpayers only.

### 4.3 Reporting

- Issued document registers (per branch/organization) with number, date,
  patient/payor, ledger reference, amount, tax, and status.
- Voided-document registers.
- Export is role-gated and audited, consistent with SECURITY_ARCHITECTURE §28.3
  (patient/ledger-level exports require explicit permission and audit).

### 4.4 Access

- Billing roles and permissions (e.g., `billing.read`, `billing.write`,
  `payment.record` from the SECURITY_ARCHITECTURE permission list) are assigned
  only when the billing implementation phase is separately planned; nothing is
  added now.

## 5. Implementation Gate

Compliant invoicing is **not** implemented until:

1. The clinic owner completes the Section 2 confirmation checklist;
2. The accountant/BIR confirms the applicable requirements (Section 3);
3. This design (Section 4) is revised against those answers and approved;
4. A bounded implementation plan is authored and reviewed under the same
   process as every other phase.

Until then, the platform continues to operate without regulated invoice
generation, and no billing permission, table, migration, or grant exists in
this repository for it.