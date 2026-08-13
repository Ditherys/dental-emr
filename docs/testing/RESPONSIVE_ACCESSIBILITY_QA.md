# Responsive and accessibility QA (R9)

**Scope:** the Phase 1 private EMR surfaces — sign-in, MFA challenge, dashboard
shell, branch settings, account & security, workforce invitation.

Two layers, and the second is not optional:

1. **Automated** — `npm run test:e2e:responsive` runs `e2e/responsive-accessibility.spec.ts` on phone-360, phone-430, iPad portrait, iPad landscape, and desktop. It checks axe WCAG 2.1 A/AA rule violations, horizontal overflow, WCAG 2.2 minimum target size, focus visibility, and keyboard operability of navigation and the branch selector.
2. **Manual** — the checklist below. An automated scan can tell you a page is not obviously broken. It cannot tell you a clinician can use it one-handed on a phone in a treatment room, that a virtual keyboard does not bury the field being typed into, or that a focus order makes sense. Those are the failures that reach real users.

Automated coverage is roughly a third of WCAG failures by common estimate. Treat
a green run as a floor, never as a pass.

## Prerequisites

The authenticated flows need the hosted Cloud TEST project and its synthetic
identities — see `e2e/README.md`. Sign-in-screen checks run without them.

```powershell
npm run test:e2e:responsive
```

## Manual pass — record the result for each row

Record device/emulator, browser, date, and tester. Attach screenshots only from
synthetic data. Never screenshot real patient or workforce information.

### Phone (≈360 px and ≈430 px)

| # | Check | Result |
|---|---|---|
| P1 | Sign in, complete the MFA challenge, and reach the dashboard using only the phone | |
| P2 | The six-digit MFA field is not obscured by the virtual keyboard; the submit control is reachable while the keyboard is open | |
| P3 | The branch-settings form can be completed end to end with the virtual keyboard open, scrolling to each field without losing entered values | |
| P4 | No page scrolls horizontally at any point, including with the keyboard open | |
| P5 | The collapsed navigation opens, is dismissible, and returns focus to its trigger | |
| P6 | Every control the workflow requires can be hit accurately with a thumb; note any target that feels cramped even if it passes the 24 px automated floor | |
| P7 | Rotating to landscape mid-form preserves entered values and does not break the layout | |
| P8 | Text remains legible without pinch-zoom; no content is clipped at 200% browser text size | |
| P9 | The suspended/revoked-access screen is readable and its sign-out control is reachable | |

### iPad (portrait and landscape)

| # | Check | Result |
|---|---|---|
| T1 | The dashboard shell and branch selector are usable by touch in both orientations | |
| T2 | Rotating between orientations preserves the current screen and any entered form values | |
| T3 | An attached hardware keyboard can drive the whole sign-in → dashboard → branch-settings path | |
| T4 | No interaction the workflow needs is hover-only or drag-only | |
| T5 | Split-view / slide-over at reduced width does not overflow horizontally | |

### Desktop / laptop

| # | Check | Result |
|---|---|---|
| D1 | The complete path is operable by keyboard alone, with a visible focus indicator at every stop | |
| D2 | Focus order follows the visual order on every Phase 1 screen | |
| D3 | Dialogs, sheets, and menus trap focus while open and restore it on close | |
| D4 | Browser zoom at 200% produces no horizontal page scrolling | |
| D5 | A screen reader announces the page title, headings, form labels, validation errors, and the branch context control meaningfully | |
| D6 | `prefers-reduced-motion` is respected by any transition | |

### Cross-cutting

| # | Check | Result |
|---|---|---|
| X1 | Validation errors are announced, not conveyed by colour alone | |
| X2 | Toast/status messages are reachable by assistive technology | |
| X3 | Contrast of the neutral-first palette meets AA for body text and UI controls in every state | |
| X4 | No clinical or personal data appears in any captured evidence | |

## Recording the result

Phase 1 acceptance requires this pass to be **completed and recorded**, or
explicitly declared an acceptance blocker. A blank checklist is a blocker, not a
pass. File the completed table under `docs/evidence/` with the tester, date,
devices, and any defect raised.

## Known automated-check limitations

- The target-size assertion enforces the WCAG 2.2 **minimum** (24 px). The project's own guidance prefers larger coarse-pointer targets; that judgement stays with row P6 rather than failing the build, because a build failure would push contributors toward a mechanical fix rather than a design one.
- axe cannot evaluate focus *order*, only focus visibility. Row D2 covers order.
- Virtual-keyboard behaviour, screen-reader output, and one-handed reachability have no reliable automated proxy. Rows P2, P3, D5.
