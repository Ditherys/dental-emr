# Evidence — TEST-01 responsive and accessibility manual QA

**Date:** 2026-08-15 (Asia/Manila)  
**Tester:** Codex, with the project owner entering TEST-only credentials and MFA  
**Target:** local Next.js development server configured against the disposable
`dental-emr-test-01` Supabase project  
**Browser:** Codex in-app Browser on Windows, using explicit viewport overrides  
**Data:** synthetic TEST fixtures only; no real patient or workforce data used

## Result

**Acceptance status: COMPLETE.** The two defects found by the
emulator-assisted pass were fixed on 2026-08-15 and their hosted regressions
are green. Every checklist item requiring a physical device or real
assistive technology — the full phone pass (P1–P9), the iPad attached-keyboard
check (T3), native 200% desktop zoom (D4), a real screen reader pass over
navigation/labels (D5), real native Tab traversal and focus-ring visibility
(D1/D2), and a real screen reader announcing a genuine successful mutation
(X2) — is now verified on real hardware/assistive technology with no defects
found. H-6 is closed.

The uncommitted TEST-01 harness changes were independently reviewed before this
pass. Lint, typecheck, secret scanning, unit tests (235/235), the session-boundary
suite (5/5), and the two changed iPad navigation/orientation paths (2/2) passed.
The handoff reports a prior full 54/54 run; this session did not rerun all 54.

Status legend:

- **Pass** — directly verified in the named environment.
- **Pass (emulator)** — directly verified with the in-app Browser viewport,
  not physical hardware.
- **Partial** — useful evidence exists, but the checklist's exact input mode
  was unavailable.
- **Not verified** — requires a device or assistive-technology pass.
- **Fail** — a concrete defect was reproduced.

## Phone (360 px and 430 px)

| # | Result | Evidence |
|---|---|---|
| P1 | Pass (physical device) | The project owner reached the app on a physical phone via an ngrok tunnel to the local dev server, signed in, and completed MFA challenge/verify end to end (after a transient hosted-Auth `"Unable to verify the session security level"` error cleared on retry — consistent with the known rate-limit sensitivity of the shared TEST identities documented elsewhere in this handoff, not an app defect). Reached the dashboard on real hardware. |
| P2 | Pass (physical device) | The device's native on-screen keyboard did not cover the field being edited or the relevant action button. |
| P3 | Pass (physical device) | The Add Branch form was filled end to end using one-handed thumb input only; no field required two-handed precision. |
| P4 | Pass (emulator + physical spot check) | Login, dashboard, branch selector, branch settings, account/MFA, and workforce invitation all measured zero page-level horizontal overflow at 360 px and 430 px; no overflow observed on the physical device either. |
| P5 | Pass (emulator) | The collapsed navigation opened, trapped focus, closed with Escape, and restored focus to `Open primary navigation`. |
| P6 | Pass (physical device) | Branch-selector dropdown options, including a non-matching re-selection, were reliably tappable; selecting a different branch correctly updated the trigger button's label and closed the menu. General navigation/button targets also felt reliably tappable on real hardware, confirming the automated 44 px coarse-pointer regression against real touch input. |
| P7 | Pass (emulator) | A populated branch draft survived 360x740 to 740x360 and back with its value intact and zero horizontal overflow. |
| P8 | Pass (physical device) | Native OS pinch-zoom/text-size to approximately 200% kept text legible and the layout usable, on real hardware rather than emulated viewport scaling. |
| P9 | Pass (physical device) | Signing in as the suspended synthetic identity on the physical phone produced a clear block/redirect, not a stuck or broken screen. |

## iPad (portrait and landscape)

| # | Result | Evidence |
|---|---|---|
| T1 | Pass (emulator) | Dashboard navigation and branch selector remained visible and usable at 834x1194 and 1194x834. Both widths correctly used collapsed navigation below the 1280 px breakpoint. |
| T2 | Pass (emulator) | The complete unsaved branch draft survived portrait-to-landscape resizing without horizontal overflow. |
| T3 | Pass (physical device) | A physical attached/Bluetooth keyboard on a real iPad navigated the branch form and controls naturally via Tab/Enter/arrow keys. |
| T4 | Pass (emulator/code inspection) | Navigation, menus, branch selection, forms, and account controls were usable without hover or dragging. |
| T5 | Pass (emulator) | Tablet portrait, landscape, and narrower split-view-equivalent widths showed no page-level horizontal overflow. |

## Desktop / laptop

| # | Result | Evidence |
|---|---|---|
| D1 | Pass (physical device) | Real Tab/Shift+Tab traversal on a desktop browser showed a visible focus ring at every stop across login, dashboard, branch selector, add-branch, and account/MFA. |
| D2 | Pass (physical device) | Native sequential Tab order matched visual layout end to end (brand → primary navigation → branch context → account menu → page content). |
| D3 | Pass | Mobile sheet, branch menu, and account menu closed with Escape and restored focus to their triggers. The sheet exposed dialog semantics and a close control. |
| D4 | Pass (physical device) | Native 200% browser zoom on a real desktop browser produced no overflow or clipping across the tested screens. |
| D5 | Pass (real assistive technology) | A real screen reader announced page headings, landmarks, form labels, and validation errors correctly across login, MFA challenge, dashboard, branch selector, add-branch, and account/invite screens, with no unlabeled controls or silent errors found. |
| D6 | Pass (code inspection) | The global stylesheet provides a `prefers-reduced-motion: reduce` override for animation, transition, and scroll behavior. |

## Cross-cutting

| # | Result | Evidence |
|---|---|---|
| X1 | Pass | Branch and invitation errors use `role="alert"`, `aria-invalid`, and matching `aria-describedby` IDs. A hosted non-mutating invitation submission now returns only the expected email error; valid TEST organization/role identifiers are not rejected. |
| X2 | Pass (real assistive technology) | With a real screen reader running, submitting the Add Branch form to create a genuine new synthetic branch produced its inline `role="status"` success message, and the screen reader announced it automatically without manual navigation. |
| X3 | Pass for checked surfaces | Rendered samples measured 16.29:1 for body text, 5.47:1 for muted dashboard text, 5.08:1 for muted sidebar text, and 11.84:1 for active navigation. The automated axe matrix is also reported green. |
| X4 | Pass | All visible data and draft values were synthetic. No real clinical or personal data was captured. |

## Defects raised

### QA-01 — High — workforce invitation rejects valid database UUIDs

**Status: Resolved 2026-08-15.**

**Affected:** `src/app/(emr)/settings/users/invite/actions.ts`  
**Observed:** submitting the empty-email validation case returned both
`Enter a valid email address.` and `Choose an organization.` even though the
organization select contained the valid selected value
`22000000-0000-0000-0000-000000000001`.  
**Cause:** `organizationId`, `roleId`, and non-empty `branchId` use `z.uuid()`,
which rejects PostgreSQL-valid UUID-shaped fixture IDs whose RFC version nibble
is not one of the versions accepted by Zod. The repository already has a
`databaseUuid` validator for this boundary.  
**Impact:** invitation issuance cannot reach authorization or persistence for
the current TEST data, so the Phase 1 workforce invitation surface is
functionally blocked.  
**Recommended fix:** use `databaseUuid` for all three database identifier
fields while keeping empty branch scope explicit.  
**Proof test:** action tests must submit PostgreSQL-valid, non-RFC-versioned
organization/role/branch UUIDs and reach the mocked authorization/persistence
boundary; add a negative malformed-ID case and rerun the hosted invitation
flow.

### QA-02 — Medium — coarse-pointer targets remain below project guidance

**Status: Resolved in code, emulator regression coverage, and physical-device
confirmation, all 2026-08-15.**

**Affected:** `src/app/globals.css`, shared form control class strings, and
`src/components/ui/dropdown-menu.tsx`  
**Observed:** phone-width inputs/selects/buttons measured 40 px; branch radio
items measured 28 px. The coarse-pointer rule covers `data-slot="button"` and
`data-slot="dropdown-menu-item"`, but the branch selector uses
`data-slot="dropdown-menu-radio-item"`, and native inputs/selects have no
coarse-pointer minimum.  
**Impact:** frequently used phone/tablet controls are less thumb-safe than the
project's approximately 44 px target, despite passing the automated WCAG 24 px
floor.  
**Recommended fix:** apply a 44 px coarse-pointer minimum to owned form
controls and dropdown radio/checkbox/sub-trigger slots without increasing
compact fine-pointer desktop density.  
**Proof test:** open the branch selector under a coarse-pointer Playwright
project and assert every visible option plus all form inputs/selects are at
least 44 px high; repeat P6 on a physical phone.

### QA-03 — Low — add-branch action recedes as the directory grows

**Affected:** branch-settings information architecture  
**Observed:** with nine synthetic locations, the add-branch form begins about
2,107 px below the top of the 360 px page because the entire directory precedes
it.  
**Impact:** dynamically adding branches makes the primary create workflow
progressively harder to discover and reach on phones.  
**Recommended fix:** add an accessible `Add branch` jump action near the page
heading (or another non-modal progressive disclosure) that moves focus to the
form without changing authorization or persistence.  
**Proof test:** verify keyboard and touch activation moves visible focus to the
form heading at phone/tablet/desktop widths and preserves an in-progress draft.

## Remediation verification — 2026-08-15

- QA-01 now uses the shared `databaseUuid` validator for organization, role,
  and optional branch identifiers. Six focused action tests pass, including
  PostgreSQL-valid non-versioned identifiers and malformed-ID rejection before
  authorization or persistence.
- A hosted, authenticated invitation regression passed 1/1. It submitted an
  empty email so no invitation could be created, while proving the selected
  TEST organization and role crossed the real server-action boundary without
  UUID errors.
- QA-02 now applies a 44 px coarse-pointer minimum to owned text-like native
  form controls and dropdown item, checkbox, radio, and submenu-trigger slots.
- The responsive suite now asserts stable rendered 44 px targets under coarse
  pointers. The full five-project responsive matrix passed 35/35 in bounded
  groups: 14/14 across the two phone widths, 14/14 across iPad portrait and
  landscape, and 7/7 at desktop-responsive. The first monolithic invocation
  exceeded its 10-minute command wrapper without producing a result, so it is
  not counted as evidence; all project/test combinations were subsequently
  rerun successfully in the bounded groups above.
- Lint, typecheck, 239/239 unit tests, and the production build pass.
- The prior authenticated in-app Browser session was no longer attached when
  follow-up began. Hosted Playwright coverage was used instead; no credentials
  were re-entered or exposed and no branch, invitation, membership, MFA factor,
  or account setting was changed.

## Physical phone pass — 2026-08-15 (later same day)

**Tester:** the project owner, on a physical phone, reached via an ngrok
tunnel to the local dev server configured against TEST-01.

P1–P9 were all exercised directly on real hardware: sign-in and MFA
challenge/verify, native on-screen keyboard behavior, one-handed thumb form
fill, zero horizontal overflow, collapsed-navigation focus handling, real
touch-target tappability (including the branch selector, whose trigger label
correctly updated after selecting a different branch), orientation resize,
native OS pinch/zoom to ~200%, and the suspended-identity block. All nine
passed with no defects observed. See the updated Phone table above.

One non-defect note: MFA verification initially surfaced
`"Unable to verify the session security level."` (thrown from
`src/lib/auth/mfa.ts`'s `getAuthenticatorAssuranceLevel` check). This call
runs server-side against hosted Supabase Auth and is unrelated to the ngrok
tunnel; it cleared on retry, consistent with the shared TEST identity being
rate-limited from concurrent use (automated suite runs plus manual testing)
rather than an application defect.

## Tablet/desktop physical + assistive-technology pass — 2026-08-15 (later same day)

**Tester:** the project owner, using a physical iPad with an attached
keyboard (T3), native 200% zoom in a real desktop browser (D4), and a real
screen reader (D5).

All three passed with no defects: the iPad's attached keyboard navigated the
branch form and controls naturally; 200% desktop zoom produced no overflow or
clipping; and the screen reader correctly announced headings, landmarks, form
labels, and validation errors across login, MFA challenge, dashboard, branch
selector, add-branch, and account/invite screens.

## Desktop keyboard traversal and genuine-mutation pass — 2026-08-15 (later same day)

**Tester:** the project owner, on a real desktop browser with native Tab/
Shift+Tab traversal (D1/D2), and with a real screen reader running while
submitting a genuine Add Branch mutation against TEST-01 (X2).

D1/D2 passed: every stop from login through dashboard, branch selector,
add-branch, and account/MFA showed a visible focus ring, in an order matching
the visual layout. X2 passed: creating a new, uniquely named synthetic branch
produced the form's inline `role="status"` success message, and the screen
reader spoke it automatically the moment it appeared, with no manual
navigation required to discover it.

This Add Branch submission was the first genuine mutation performed against
TEST-01 during any manual QA pass in this evidence file; it created one new
synthetic branch row and changed nothing else (no invitation, membership, MFA
factor, or account setting).

## Remaining acceptance work

None. H-6's full checklist (phone P1–P9, tablet T1–T5, desktop D1–D6, and
cross-cutting X1–X4) is now verified. TEST-01 was not deleted during any of
these passes; it now contains one additional synthetic branch created for the
X2 check above, which should be accounted for (or cleaned up) before TEST-01
is finally disposed.
