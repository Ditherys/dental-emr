# Task 3 Report — Mount the controlled fork as the patient chart

Date: 2026-08-30
Base: `2826553`

## Implementation

- Added `ForkOdontogram`, a patient-keyed wrapper that composes only the
  vendored fork's provider, measured chart, tooth-information, and clinical
  control surfaces. It does not mount the fork demo shell, topbar, settings,
  import UI, classic anatomy selector, or reset controls.
- Set measured anatomy before the provider's passive initialization so its
  first SVG build uses the measured templates. Current and planned state are
  hydrated from `buildForkPayload`; a grid-readiness observer attaches the
  state-change listener only after fork initialization so hydration/init echoes
  do not become dentist-authored drafts.
- Fork edits are converted through `forkPayloadToClinicalDraft` with
  status-qualified `buildForkRelationshipBaselines`. The callback contains only
  bounded canonical drafts and no patient, organization, branch, provider, or
  raw fork JSON identity/state payload.
- Replaced the patient route's `MeasuredChart` and `OdontogramToolbar` render
  path with the controlled wrapper while retaining patient-keyed DTO loading,
  FDI inspector selection, periodontal entry, current-status actions,
  chronological records, and the existing print/history projection pending
  Task 5.
- Added scoped fork styles that map to EMR tokens and Geist, keep measured SVG
  widths intact in a contained horizontal scroll region, stack controls below
  the chart at tablet widths, and preserve touch-safe inputs.

## TDD evidence

- RED: `npm run test:unit -- src/components/odontogram/fork-odontogram.test.tsx`
  failed because `./fork-odontogram` did not exist.
- GREEN: the focused wrapper suite passes 4/4. It verifies fork surface IDs,
  inline measured SVG, current/plan hydration, hydration-echo suppression,
  reset/classic/import absence, canonical draft emission, tooth selection, and
  read-only behavior.
- The updated patient-section suite passes 12/12 and verifies the fork wrapper
  replaces the measured chart/toolbar while inspector, authorization, patient
  switching, periodontal, progress/history, and relationship workflows remain.

## Verification

- `npm run test:unit -- src/components/odontogram/fork-odontogram.test.tsx 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx'` — PASS (2 files, 16 tests)
- `npm run typecheck` — PASS
- `npx eslint 'src/components/odontogram/fork-odontogram.tsx' 'src/components/odontogram/fork-odontogram.test.tsx' 'src/app/(emr)/patients/[patientId]/odontogram-section.tsx' 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx'` — PASS
- `git diff --check` — PASS (line-ending notices only)
- Patient render-path grep confirms no `MeasuredChart`, `OdontogramToolbar`, or
  `BridgeOverlay` import/usage remains.

## Self-review / concerns

- This task intentionally exposes canonical drafts only; it does not persist
  them. Audited confirmation/persistence is Task 4, so the route currently holds
  the latest drafts in patient-keyed transient state.
- The existing printable history block remains until Task 5 replaces it with a
  fork-derived read-only chart.
- The controlled fork is a module-level singleton. The provider is keyed by
  patient identity and tears down on key change; the wrapper must remain a
  single patient-chart instance per document.
- Real-browser responsive/accessibility verification and Cloud TEST remain
  pending under ADR-029.
