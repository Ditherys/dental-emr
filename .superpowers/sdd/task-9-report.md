# Task 9 / O7 — Current Status Workspace and Chronological Record

Date: 2026-08-30

Status: locally implemented and verified; Cloud TEST and final release acceptance remain pending.

## Delivered scope

- Added the renderer-independent `ProgressEventDTO` projection and an
  oldest-to-newest patient progress-record table. The base projection uses
  append-only odontogram entries and final periodontal examinations; it does
  not manufacture financial amounts, balances, procedure-case IDs, or actor
  identities absent from the approved DTO.
- Added the patient-keyed Current Status panel below the chart. Direct treatment
  opens the existing selected-tooth, signed-in clinical-entry workflow; no
  provider picker is present.
- Added a procedure follow-up dialog that requires an existing case, captures
  occurred date and bounded note, and states that it creates no charge. The
  section renders an actionable follow-up only when its caller provides both
  authoritative case choices and an authorized recording callback. O7 does not
  supply a no-op browser mutation or infer a case ID.
- Desktop selection stays in the persistent inspector; tablet/phone selection
  uses the existing bottom sheet. Toolbar and Current Status controls have
  44px minimum touch targets. The chart remains internally horizontally
  scrollable rather than forcing page overflow.
- Patient transitions clear selected-tooth, sheet, direct-entry, and follow-up
  transient state. No Reset, Classic renderer, drawing path, provider picker,
  or grouped case accordion was added.

## Review follow-up — patient isolation and phone chronology

- The workspace now scopes its in-memory DTO snapshot, selected tooth, and
  progress projection to the route `patientId` synchronously during render.
  A route change therefore renders no prior patient data while the replacement
  fetch is pending. Initial DTOs and fetch responses must match the requested
  patient ID; mismatches are discarded and surface a generic load error.
- The chronological table is retained from the `md` breakpoint upward. Below
  that breakpoint, the same oldest-to-newest events render as an accessible
  stacked ordered list with date, event/procedure, tooth/surface, actor, note,
  and only the financial values that are present.
- Regression coverage includes a deferred patient-B fetch after patient-A,
  invalid same-route initial DTO rejection, rejected mismatched fetch DTOs,
  and phone-list/table responsive composition and chronology order.

## Final review follow-up — supplied progress ownership

- `initialProgressEvents` now carries its owning `patientId` with its event
  array. The workspace accepts that projection only when it matches the route;
  otherwise it falls back to the matching DTO projection or an empty record.
  This prevents retained patient-A progress rows from reappearing after
  patient-B route effects flush.
- The mobile-only Open inspector control now uses the required 44px minimum
  target (`min-h-11`), with a component integration assertion.

## Verification

| Command | Result |
| --- | --- |
| `npm run test:unit -- 'src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx' src/components/odontogram` | PASS — 12 files, 41 tests |
| `npm run lint` | PASS — no errors or warnings |
| `npm run typecheck` | PASS — strict TypeScript clean |
| `git diff --check` | PASS — no whitespace errors (Git emitted expected Windows LF/CRLF notices) |

The red phase was recorded before implementation: the three new component
tests initially failed because the required components did not exist; the
patient-section direct-treatment test initially failed because selection always
opened a sheet. Both now pass in the focused suite above.

## Commit

Implementation commit: `a54644554c9fd03aaa4929b58a8617013213c841` — `feat: add patient odontogram status workspace`.

Follow-up commit: `f4e5f67e888a6ebc223fe26bbd954566d25a5b64` — `fix: isolate odontogram workspace patient data`.

## Residual gates

- Cloud TEST database/RLS/authorization, hosted E2E, responsive/accessibility,
  security/advisor review, and owner release acceptance remain mandatory under
  ADR-029.
- O7 intentionally does not add a procedure-case follow-up server action or a
  new charge path. An authorized case-linked recording boundary is required
  before the follow-up dialog becomes actionable in the patient section; the
  separate confirmed-procedure workflow remains the only charge path.
