# Sidebar and Information Alignment Design

**Status:** User-approved design; implementation is not yet authorized by this document.

**Date:** 2026-08-29

## Context

The private EMR currently keeps the working-branch selector and account menu in
a persistent top header. On wide desktop screens, the dashboard operational
summary also renders each label and value at opposite ends of a container as
wide as `max-w-7xl`. This makes a reader move horizontally from a label such as
“Appointments” to find its value.

The source-level consistency audit found three relevant patterns:

- the dashboard operational summary is the clearest opposite-edge scanning
  problem;
- the finance report uses a four-card KPI grid, which conflicts with the
  approved clinical-workstation and anti-template direction;
- several existing patient, intake, file, branch, and procedure views already
  keep related labels and values close through small description grids. Those
  patterns should be preserved and unified rather than replaced wholesale.

The live authenticated browser audit was intentionally not run. The repository's
approved E2E identities target guarded Cloud TEST, which was not authorized for
this planning task, and the existing local login is not acceptable deterministic
test evidence. The audit therefore used source, component tests, and the
authoritative frontend architecture. A browser-based wireframe comparison was
used only for design selection, not as acceptance evidence.

## Goals

1. Remove the wide-screen application header and move persistent desktop
   context into the sidebar.
2. Put the organization and working-branch control near the top of the sidebar.
3. Anchor account access at the bottom of the sidebar.
4. Use a compact, left-anchored label/value rhythm for summaries and descriptive
   facts throughout the private EMR.
5. Keep wide domain work surfaces, including tables, schedules, ledgers, and
   clinical tools, as wide as their tasks require.
6. Preserve responsive, touch-safe, keyboard-accessible access to navigation,
   branch switching, and account actions.
7. Establish a reusable component rule that prevents future pages from
   reintroducing distant label/value pairs or decorative KPI grids.

## Non-goals

- No database, migration, RLS, authorization, tenancy, analytics-query,
  financial-calculation, or branch-selection semantic change.
- No new authentication profile or workforce data is added to the account menu.
- No navigation item, permission requirement, or route is added or removed.
- No redesign of tables, schedules, ledgers, forms, patient context, or clinical
  editors beyond the label/value consistency rule.
- No blanket removal of `justify-between`; it remains valid for headings with
  actions, row-end statuses, and other intentional separation.
- No replacement of right-aligned numeric table columns. Tables keep conventional
  numeric alignment for column comparison.
- No dependency addition or material architecture change.
- No implementation work in unfinished or separately gated odontogram phases.

## Chosen Direction

The approved direction is **compact paired rows**.

Summary facts use a stable two-column reading rhythm:

```text
Appointments          12
Completed              9
Confirmation rate     67%
```

The value column begins near the label column and is left-aligned. The list does
not stretch the relationship to opposite page edges merely because its parent
page is wide. Supporting tables and work surfaces below the summary may still
use the full content width.

The alternatives were rejected for these reasons:

- a dense metric grid increases two-dimensional scanning and recreates the
  generic KPI-card dashboard pattern;
- constraining existing opposite-edge rows solves the dashboard symptom but
  does not create a reusable alignment rule for the rest of the application.

## Application Shell

### Wide desktop

At the existing 1280 px `xl` wide-desktop sidebar breakpoint, the persistent
top header is removed. The expanded sidebar is organized in this order:

1. Dental EMR brand and sidebar collapse control;
2. muted organization context followed by the working-branch selector;
3. the existing server-authorized navigation in its scrollable region;
4. the account menu anchored to the bottom edge.

The current “Dental EMR workspace” footer is removed. The main content begins at
the top of its grid column, retains the existing responsive page padding, and
uses the full viewport height without subtracting a header height.

### Collapsed wide-desktop sidebar

The collapsed rail retains all essential shell functions:

- the branch control remains available through a building icon with an
  accessible name, current-context tooltip, and branch menu;
- navigation retains accessible labels and tooltips;
- account access remains anchored at the bottom through the existing account
  icon/menu;
- the collapse/expand control remains keyboard accessible.

Collapsing the sidebar does not change organization, branch, role, permission,
or route state. Persisting the collapsed preference across sessions is not part
of this slice.

### Compact laptop, tablet, and phone

Below the persistent-sidebar breakpoint, a compact top bar remains because the
sidebar becomes a drawer. It provides immediate access to the navigation menu,
working branch, and account actions without requiring a desktop sidebar.

The navigation drawer mirrors the desktop information hierarchy:

1. brand and working-branch context near the top;
2. authorized navigation in a scrollable middle region;
3. account access at the bottom.

The drawer and compact bar must not create duplicate landmarks or confusing tab
order. Drawer controls use touch-safe targets, respect safe-area insets, and
remain usable with the on-screen keyboard.

### Authorization boundary

The shell continues to consume the server-derived organization authorization
state and `visibleNavigationHrefs`. Moving controls does not make browser state
an authorization source. Branch choice remains a UI context selection over the
already authorized branch set; server actions and RLS continue to reauthorize
the acting branch.

## Compact Label/Value System

### Shared component behavior

The existing description-list vocabulary is extended with a paired-row variant
instead of adding an unrelated metric-card system. The variant must:

- render semantic `dl`, `dt`, and `dd` elements;
- use one consistent label column and one nearby value column;
- align the start of every value in a list;
- use `tabular-nums` for comparable counts, percentages, durations, and money;
- allow a short muted hint beneath a label without moving the value away;
- allow values to wrap safely when they are textual or unusually long;
- constrain summary lists to a default maximum width of 36 rem (`max-w-xl`)
  while allowing parent sections to remain wide;
- use flat separators or whitespace rather than a card per metric;
- preserve sufficient row height and touch behavior when a row contains an
  interactive element.

At phone widths, the two-column relationship remains when it fits. The label
column may shrink and wrap, and the value column remains content-sized. A row
may stack only when its actual content cannot fit without overflow; information
must not be clipped or silently omitted.

### Application rules

Use compact paired rows for:

- summary counts, rates, totals, and balances;
- short descriptive facts shown as label/value pairs;
- bounded financial summaries where the value needs to stay close to its label.

Do not use compact paired rows for:

- multidimensional data that belongs in a table;
- timelines or chronological ledgers;
- a title paired with a button or status;
- ordinary list rows whose right-edge action/status is intentionally distinct;
- long-form content that reads better as stacked prose.

## Audited Application Scope

### Required corrections

1. **Dashboard operational summary** — replace full-width opposite-edge flex
   rows with the paired-row variant. Keep the branch/activity breakdown tables
   and phone lists in their domain-appropriate forms.
2. **Finance summary** — replace the four bordered KPI cards with the same
   paired-row summary vocabulary. Keep monetary formatting and signed-ledger
   meaning unchanged.
3. **Shared description lists** — add the paired-row capability centrally and
   document its selection rule through component tests.

### Consistency sweep

Review the following existing surfaces and migrate only genuine short
label/value facts that materially differ from the approved pattern:

- patient overview and demographics;
- appointment detail;
- patient billing and procedure payment summary;
- inventory balance summaries;
- acquisition and other aggregate reports;
- branch, procedure, intake, and file detail blocks;
- account and settings summaries.

The sweep must preserve existing good compact patterns where labels and values
are already locally grouped. A source occurrence of `justify-between`,
`text-right`, a grid, or a card is not sufficient by itself to justify a change.
Every change must improve the semantic relationship or scanning path.

New or unaccepted odontogram/periodontal UI work is excluded even if it contains
similar layout utilities. It may adopt the shared rule only within a separately
authorized checkpoint.

## Data Flow, States, and Errors

All data continues to enter the components through the current server components,
server actions, and typed DTOs. This design changes composition only.

- Existing loading, empty, error, and permission-denied messages remain in
  place.
- Moving the branch control must not reset its current selection or broaden the
  options supplied by `BranchContextProvider`.
- Moving the account menu must not change sign-out behavior or the account and
  security link.
- Dropdowns must remain within the viewport when opened from the top, bottom,
  expanded, collapsed, or drawer sidebar positions.
- A failed analytics refresh continues to preserve the last successful summary
  while showing the existing bounded error message.

## Accessibility

- Preserve the skip-to-content link and one clearly identified main region.
- Use semantic navigation, complementary/sidebar, and mobile header landmarks
  without duplicate accessible names when both responsive compositions exist in
  the DOM.
- Keep visible keyboard focus for sidebar, drawer, branch, and account controls.
- Collapsed icon controls require accessible names and non-hover-only discovery.
- Desktop fine-pointer controls may remain compact; coarse-pointer controls
  generally provide about 44 px targets.
- Summary labels and values remain programmatically associated through
  description-list semantics.
- Color remains secondary reinforcement and is never the only way to interpret
  a metric or status.

## Responsive Acceptance

Check representative widths around 390, 430, 768, 1024, 1280, and 1440 px.
Acceptance requires:

- no page-level accidental horizontal overflow;
- no clipped navigation, branch, account, or page actions;
- the desktop header absent only when the persistent sidebar composition is
  active;
- compact navigation, branch, and account access present when the sidebar is a
  drawer;
- the expanded and collapsed desktop sidebar both usable by keyboard;
- branch and account menus positioned within the viewport;
- paired summary values close to and consistently aligned with their labels;
- long labels, hints, monetary values, and localized numbers wrapping without
  overlap;
- wide tables retaining contained horizontal scrolling only where genuinely
  necessary;
- safe-area and virtual-keyboard behavior preserved on phones and tablets.

## Verification Strategy

### Component and unit tests

- Extend shell layout tests to prove wide-desktop hierarchy, collapsed access,
  mobile composition, and removal of the desktop workspace footer/header role.
- Test branch and account controls in expanded, collapsed, and drawer contexts
  through accessible roles and names.
- Add shared description-list tests for paired semantics, hints, long content,
  and class/variant composition.
- Update dashboard tests to prove the operational summary uses the paired-row
  system and still avoids a KPI grid.
- Update finance report tests to prove the four-card grid is absent and money
  values remain formatted correctly.
- Add focused tests for any additional screen changed by the consistency sweep.

### Static and build verification

Run the relevant focused Vitest suites, then:

```text
npm run lint
npm run typecheck
npm run test:unit
npm run build
git diff --check
```

### Browser verification

Author or update responsive Playwright coverage for the shell, dashboard, and
finance report at the representative widths. The test must check landmarks,
keyboard reachability, menu visibility, touch targets, and horizontal overflow.

The repository's current authenticated E2E path uses guarded Cloud TEST. Test
files may be prepared as part of implementation, but no hosted execution is
authorized by this design. Cloud TEST remains a separate mandatory gate before
production acceptance.

## Delivery Boundaries

- This design approves planning only. Implementation requires explicit owner
  authorization and must not be mixed into the current uncommitted odontogram
  checkpoint.
- Work stays on `main` when authorized, consistent with the current project
  execution rule; no branch or worktree is created.
- The implementation commit must include only the reviewed shell, shared UI,
  affected page, test, and documentation files.
- Temporary `.superpowers/` visual-companion artifacts and unrelated existing
  working-tree changes must not be staged or committed.
- No production, hosted development, or Cloud TEST connection is required to
  implement the local component changes.

## Success Criteria

The change is successful when a user can scan `Appointments 12` and comparable
facts as one compact visual unit, the desktop shell no longer spends vertical
space on a redundant header, branch and account context occupy predictable
sidebar positions, and the same rule is consistently applied without weakening
authorization or forcing wide domain data into narrow layouts.
