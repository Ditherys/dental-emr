# ADR-030 — Odontogram longitudinal record revamp

**Status:** Accepted — explicitly authorized by the project owner 2026-08-30

**Date:** 2026-08-30

**Decision owner:** Project owner

**Amends:** [ADR-026](ADR-026-billing-ledger-provider-compensation.md),
[ADR-029](ADR-029-odontogram-local-completion-window.md),
`docs/specs/odontogram-integration.md`, and
`docs/plans/odontogram-integration-plan.md`

**Related:** `docs/superpowers/specs/2026-08-30-odontogram-clinical-record-revamp-design.md`,
`docs/specs/billing-ledger-provider-compensation.md`, and
`docs/plans/billing-ledger-provider-compensation-plan.md`

## Context

The accepted odontogram foundation needs a complete longitudinal clinical record
without making renderer state, a mutable financial balance, or media storage
outside the approved private object-store boundary authoritative. Earlier O12
language excluded the controlled interchange and media workflow now required by
the accepted revamp design. The dentist payment path also needs a narrower
default than a general billing role, and legacy drawing storage must be retired
without an unsafe broad cleanup.

## Decision

1. Rebuild the odontogram workspace/adapter while preserving canonical clinical,
   ledger, tenancy, audit, and file foundations.
2. Amend O12 to include staged FHIR/JSON import, authorized FHIR/JSON/PDF/SVG/PNG
   output, and private clinical photographs.
3. Grant DENTIST `payment.record` only for an already clinically authorized
   patient and an active permitted receiving branch; preserve all cross-branch
   allocation checks and deny adjustment/refund/void/analytics by default.
4. Retire drawing UI/writes immediately. Physical drawing-table cleanup is a
   guarded O13 forward migration that fails on unrecognized data.
5. Preserve ADR-029's local-only completion and deferred Cloud TEST gate.

## Consequences

- This ADR controls over earlier conflicting O12/O13/O14 language, including
  the older O12 import/export exclusion and any prior drawing-authoring
  requirement. Those earlier statements are superseded only to the extent of
  this decision; their remaining tenancy, audit, migration, and acceptance
  requirements remain in force.
- Import is staged, tenant-scoped, bounded, reviewable, and dentist-confirmed;
  parsing alone never writes canonical clinical state. Export is generated from
  authorized canonical data, server-side permission-checked, and audited.
- Clinical photographs remain private clinical records: PostgreSQL holds
  protected metadata, MinIO/R2 holds originals and approved derivatives through
  the existing provider-neutral storage boundary, and no generic attachment
  permission substitutes for clinical-record authorization.
- The dentist payment exception does not grant payment void, refund, adjustment,
  allocation reversal, PDC clearance, or financial-analytics authority. A
  payment allocation still requires every receiving/origin branch check in the
  accepted billing ledger contract.
- Drawing UI and mutation paths are removed before physical storage retirement.
  The O13 migration may delete only positively identified deterministic
  synthetic-development drawing rows; it must fail closed and leave data and
  schema intact when any unrecognized row exists.
- All implementation remains on `main` with guarded forward migrations only;
  `db:reset:local`, hosted commands, and production use remain unauthorized by
  this decision. O14 can be recorded only as locally implemented and verified
  with Cloud TEST, independent release review, and final owner acceptance
  pending.

## Revisit triggers

Revisit if the interchange needs unsupported clinical mappings, a media flow
would weaken private delivery or original preservation, drawing cleanup finds
ambiguous/non-synthetic data, a different renderer/dependency is proposed, or
Cloud TEST/production access is needed.
