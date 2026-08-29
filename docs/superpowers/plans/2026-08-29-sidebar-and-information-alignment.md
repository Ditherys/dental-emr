# Sidebar and Information Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent wide-desktop header, place organization/branch context at the top of the sidebar and account access at the bottom, and replace distant dashboard/finance summary values with compact, left-anchored paired rows.

**Architecture:** Keep the existing server-derived authorization and branch-context data flow unchanged. Extend the existing description-list component vocabulary with one semantic paired variant, give the existing branch and account controls explicit shell presentations, then compose those controls differently at the current `xl` breakpoint. Preserve wide tables and task-specific work surfaces; this is a presentation-only slice with no database, server-action, authorization, or dependency changes.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind CSS, shadcn/ui/Radix primitives, Lucide, Vitest/Testing Library, Playwright.

## Global Constraints

- This plan implements the accepted design in `docs/superpowers/specs/2026-08-29-sidebar-and-information-alignment-design.md` only.
- Do not start implementation until the owner explicitly authorizes it and the unrelated current odontogram working tree has been checkpointed or otherwise made safe. Work remains on `main`; do not create a branch or worktree.
- Before editing, run `git status --short` and preserve every pre-existing change. In particular, do not touch `src/components/odontogram/`, the dirty patient workspace files, odontogram migrations/tests, or other files from the active clinical checkpoint.
- Do not run `db:reset:local`, any hosted database command, Cloud TEST E2E, or production operation. This slice has no schema, RLS, tenancy, secret, or patient-data work.
- Do not add dependencies. Use the existing `DescriptionList`, `Button`, `DropdownMenu`, and `Sheet` primitives.
- Do not change branch-option derivation, `BranchContextProvider`, `visibleNavigationHrefs`, sign-out behavior, financial calculations, analytics calculations, or server authorization.
- Keep table numeric columns right-aligned. Keep intentional title/action and status/action separation. Only short summary facts move to paired rows.
- Follow the checked-in Next.js 16 guidance already identified for client boundaries, Tailwind, layouts, Vitest, and Playwright under `node_modules/next/dist/docs/`.
- Use deterministic synthetic values in tests. Never copy patient or production data into fixtures, screenshots, logs, or documentation.
- Each implementation task below is its own focused commit. Stage exact files rather than `git add .` because the repository currently contains unrelated work.

## File Map and Interfaces

**Create:**

- `src/components/ui/description-list.test.tsx` — shared paired-list semantics and layout contract.
- `src/components/layout/user-menu.test.tsx` — account-menu presentation contract.
- `src/app/(emr)/reports/finance/finance-report.test.tsx` — finance summary regression coverage.

**Modify:**

- `src/components/ui/description-list.tsx` — add `CompactDescriptionList` and `CompactDescriptionItem`.
- `src/components/layout/branch-selector.tsx` — add `presentation?: "topbar" | "sidebar" | "rail"`.
- `src/components/layout/branch-context.test.tsx` — verify branch selector presentations without changing authorized options.
- `src/components/layout/user-menu.tsx` — add the same three presentation choices.
- `src/components/layout/mobile-navigation.tsx` — accept `organizationName` and mirror top/middle/bottom sidebar hierarchy.
- `src/components/layout/shell-layout.tsx` — relocate branch/account controls and hide the header at `xl`.
- `src/components/layout/shell-layout.test.tsx` — verify hierarchy, responsive compositions, and collapsed access.
- `src/app/(emr)/dashboard/analytics-dashboard.tsx` and `.test.tsx` — use paired operational-summary rows.
- `src/app/(emr)/reports/finance/finance-report.tsx` — use paired financial-summary rows.
- `e2e/responsive-accessibility.spec.ts` — author shell and summary responsive contracts; local listing only until Cloud TEST is authorized.
- `docs/AI_HANDOFF.md` — update only after the existing odontogram owner changes are checkpointed and this implementation reaches review.

**Shared component contract produced by Task 1:**

```tsx
<CompactDescriptionList className="mt-3">
  <CompactDescriptionItem
    label="Appointments"
    hint="Non-cancelled starts"
    valueClassName="text-lg font-semibold tabular-nums"
  >
    12
  </CompactDescriptionItem>
</CompactDescriptionList>
```

The list renders `dl[data-layout="paired"]`; each item renders a two-column `div` containing one `dt` and one `dd`. Consumers may style the value, but they may not move the value to the far edge with `ml-auto`, `justify-between`, or `text-right`.

---

## Task 1: Add the semantic compact paired-list primitive

**Files:**

- Create: `src/components/ui/description-list.test.tsx`
- Modify: `src/components/ui/description-list.tsx:1-34`

- [ ] **Step 1: Write the failing shared-component tests**

Create `src/components/ui/description-list.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CompactDescriptionItem,
  CompactDescriptionList,
  DescriptionItem,
  DescriptionList,
} from "./description-list";

afterEach(cleanup);

describe("description lists", () => {
  it("preserves the existing stacked description-list contract", () => {
    render(
      <DescriptionList className="test-grid">
        <DescriptionItem label="Branch">Synthetic Main</DescriptionItem>
      </DescriptionList>,
    );

    expect(screen.getByText("Branch").closest("dt")).toBeInTheDocument();
    expect(screen.getByText("Synthetic Main").closest("dd")).toBeInTheDocument();
    expect(screen.getByText("Branch").closest("dl")).toHaveClass("test-grid");
  });

  it("keeps paired labels, hints, and values in one bounded semantic row", () => {
    const { container } = render(
      <CompactDescriptionList className="test-list">
        <CompactDescriptionItem
          label="Appointments"
          hint="Non-cancelled starts"
          className="test-row"
          valueClassName="tabular-nums"
        >
          12
        </CompactDescriptionItem>
      </CompactDescriptionList>,
    );

    const list = container.querySelector('dl[data-layout="paired"]');
    const term = screen.getByText("Appointments").closest("dt");
    const value = screen.getByText("12").closest("dd");

    expect(list).toHaveClass("max-w-xl", "test-list");
    expect(term).toContainElement(screen.getByText("Non-cancelled starts"));
    expect(term?.parentElement).toHaveClass("grid", "test-row");
    expect(value).toHaveClass("text-left", "tabular-nums");
    expect(value?.parentElement).toBe(term?.parentElement);
  });

  it("allows long text to wrap instead of clipping it", () => {
    render(
      <CompactDescriptionList>
        <CompactDescriptionItem label="Current organization">
          Synthetic Dental Organization With A Deliberately Long Name
        </CompactDescriptionItem>
      </CompactDescriptionList>,
    );

    expect(screen.getByText(/Deliberately Long Name/).closest("dd")).toHaveClass(
      "break-words",
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run:

```powershell
npx vitest run "src/components/ui/description-list.test.tsx"
```

Expected: FAIL because `CompactDescriptionList` and `CompactDescriptionItem` are not exported yet. A failure caused by environment or unrelated compilation is not the expected red state; resolve that before proceeding.

- [ ] **Step 3: Implement the smallest paired variant beside the existing components**

Append these exports to `src/components/ui/description-list.tsx`; do not alter the current `DescriptionList` or `DescriptionItem` behavior:

```tsx
export function CompactDescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      data-layout="paired"
      className={cn("w-full max-w-xl divide-y border-y text-sm", className)}
    >
      {children}
    </dl>
  );
}

export function CompactDescriptionItem({
  label,
  hint,
  children,
  className,
  valueClassName,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(7.5rem,12rem)_minmax(0,1fr)] items-start gap-x-4 px-3 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]",
        className,
      )}
    >
      <dt className="min-w-0 font-medium">
        <span className="break-words">{label}</span>
        {hint && (
          <span className="mt-0.5 block break-words text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-left",
          valueClassName,
        )}
      >
        {children}
      </dd>
    </div>
  );
}
```

The 7.5 rem phone label track keeps the two-column relationship at 360–430 px; the 12 rem track aligns desktop values without pushing them across a 36 rem container.

- [ ] **Step 4: Run the focused suite and static check**

Run:

```powershell
npx vitest run "src/components/ui/description-list.test.tsx"
npx eslint "src/components/ui/description-list.tsx" "src/components/ui/description-list.test.tsx"
```

Expected: both commands PASS.

- [ ] **Step 5: Commit only the shared primitive**

```powershell
git add -- "src/components/ui/description-list.tsx" "src/components/ui/description-list.test.tsx"
git commit -m "feat: add compact paired description rows"
```

---

## Task 2: Make branch and account controls reusable in topbar, sidebar, and rail positions

**Files:**

- Modify: `src/components/layout/branch-selector.tsx:1-75`
- Modify: `src/components/layout/branch-context.test.tsx:105-151`
- Modify: `src/components/layout/user-menu.tsx:1-56`
- Create: `src/components/layout/user-menu.test.tsx`

- [ ] **Step 1: Add failing branch-presentation tests**

Add these cases inside `describe("branch selector", ...)` in `branch-context.test.tsx`:

```tsx
it("fills the expanded sidebar without changing the selected branch", () => {
  render(
    <BranchContextProvider model={branchScopedModel}>
      <BranchSelector presentation="sidebar" />
    </BranchContextProvider>,
  );

  expect(
    screen.getByRole("button", { name: "Branch context: Demo Main" }),
  ).toHaveClass("w-full", "justify-start");
  expect(screen.getByText("Demo Main")).toBeVisible();
});

it("keeps the branch menu accessible in the collapsed rail", () => {
  render(
    <BranchContextProvider model={branchScopedModel}>
      <BranchSelector presentation="rail" />
    </BranchContextProvider>,
  );

  const trigger = screen.getByRole("button", {
    name: "Branch context: Demo Main",
  });
  expect(trigger).toHaveClass("size-9");
  expect(screen.queryByText("Demo Main")).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute("title", "Working branch: Demo Main");
});
```

- [ ] **Step 2: Create the failing account-presentation tests**

Create `src/components/layout/user-menu.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/login/actions", () => ({ signOut: vi.fn() }));

import { UserMenu } from "./user-menu";

afterEach(cleanup);

describe("UserMenu", () => {
  it("shows an explicit account label in the expanded sidebar", () => {
    render(<UserMenu presentation="sidebar" />);

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    expect(trigger).toHaveClass("w-full", "justify-start");
    expect(screen.getByText("Account")).toBeVisible();
  });

  it("keeps an accessible icon trigger in the collapsed rail", () => {
    render(<UserMenu presentation="rail" />);

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    expect(trigger).toHaveClass("size-9");
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("title", "Account");
  });
});
```

- [ ] **Step 3: Run both focused suites and confirm the expected type/API failures**

```powershell
npx vitest run "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx"
```

Expected: FAIL because neither component accepts `presentation`.

- [ ] **Step 4: Implement `BranchSelector` presentation behavior**

Add `cn` and a local presentation type. Replace the current function signature and its initial derivation with this exact block:

```tsx
import { cn } from "@/lib/utils";

type BranchSelectorPresentation = "topbar" | "sidebar" | "rail";

export function BranchSelector({
  presentation = "topbar",
}: {
  presentation?: BranchSelectorPresentation;
}) {
  const { model, selection, selectBranch } = useBranchContext();
  const selectedBranch = model.branches.find(({ id }) => id === selection);
  const selectedLabel =
    selection === ALL_BRANCHES_VALUE
      ? "All Branches"
      : (selectedBranch?.name ?? "No branch access");
  const hasOptions = model.allowAllBranches || model.branches.length > 0;
  const rail = presentation === "rail";
}
```

Then replace only the current trigger and `DropdownMenuContent` opening tag with:

```tsx
<DropdownMenuTrigger asChild disabled={!hasOptions}>
  <Button
    variant="outline"
    className={cn(
      "min-w-0 justify-start gap-2",
      presentation === "topbar" &&
        "max-w-36 px-2.5 sm:min-w-44 sm:max-w-64",
      presentation === "sidebar" && "w-full max-w-none px-2.5",
      rail && "size-9 justify-center px-0",
    )}
    aria-label={`Branch context: ${selectedLabel}`}
    title={rail ? `Working branch: ${selectedLabel}` : undefined}
  >
    <Building2 className="size-4 shrink-0" aria-hidden="true" />
    {!rail && <span className="truncate">{selectedLabel}</span>}
    {!rail && hasOptions && (
      <ChevronDown className="ml-auto size-4 shrink-0" aria-hidden="true" />
    )}
  </Button>
</DropdownMenuTrigger>
<DropdownMenuContent
  align={presentation === "topbar" ? "end" : "start"}
  side={rail ? "right" : "bottom"}
  className="w-[min(20rem,calc(100vw-1.5rem))] sm:w-(--radix-dropdown-menu-trigger-width) sm:min-w-56"
>
```

Leave the current `DropdownMenuLabel`, `DropdownMenuRadioGroup`, All Branches condition, `model.branches.map`, and closing tags unchanged. That retained block is the authorization-sensitive option construction and must not be rewritten.

- [ ] **Step 5: Implement `UserMenu` presentation behavior**

Add `cn` and the local union, then replace the function signature and trigger with:

```tsx
import { cn } from "@/lib/utils";

type UserMenuPresentation = "topbar" | "sidebar" | "rail";

export function UserMenu({
  presentation = "topbar",
}: {
  presentation?: UserMenuPresentation;
}) {
  const rail = presentation === "rail";
}
```

Use this exact trigger and content opening tag inside the unchanged `DropdownMenu`:

```tsx
<DropdownMenuTrigger asChild>
  <Button
    variant="ghost"
    className={cn(
      "gap-2",
      presentation === "sidebar" && "w-full justify-start",
      rail && "size-9 justify-center px-0",
    )}
    aria-label="Open account menu"
    title={rail ? "Account" : undefined}
  >
    <span className="grid size-7 place-items-center rounded-md bg-brand-navy-100 text-brand-navy-950">
      <UserRound className="size-4" aria-hidden="true" />
    </span>
    {!rail && (
      <>
        <span className={cn(presentation === "topbar" && "hidden sm:inline")}>Account</span>
        <ChevronDown
          className={cn("size-4", presentation === "topbar" && "hidden sm:block")}
          aria-hidden="true"
        />
      </>
    )}
  </Button>
</DropdownMenuTrigger>
<DropdownMenuContent
  align={presentation === "topbar" ? "end" : "start"}
  side={rail ? "right" : "bottom"}
  className="min-w-56"
>
```

Leave the authenticated label, account-and-security link, sign-out form/action, and closing tags unchanged.

- [ ] **Step 6: Run focused tests, typecheck, and lint**

```powershell
npx vitest run "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx"
npx eslint "src/components/layout/branch-selector.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.tsx" "src/components/layout/user-menu.test.tsx"
npm run typecheck
```

Expected: PASS. Existing branch authorization-option tests must remain green.

- [ ] **Step 7: Commit exact control files**

```powershell
git add -- "src/components/layout/branch-selector.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.tsx" "src/components/layout/user-menu.test.tsx"
git commit -m "refactor: support sidebar shell controls"
```

---

## Task 3: Recompose the application shell

**Files:**

- Modify: `src/components/layout/mobile-navigation.tsx:1-118`
- Modify: `src/components/layout/shell-layout.tsx:1-130`
- Modify: `src/components/layout/shell-layout.test.tsx:1-49`

- [ ] **Step 1: Replace shell mocks with observable presentation probes and add failing tests**

In `shell-layout.test.tsx`, import `fireEvent` and `within`, update the mocks, and replace the one-test body with these contracts:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/layout/branch-selector", () => ({
  BranchSelector: ({ presentation = "topbar" }: { presentation?: string }) => (
    <button data-testid={`branch-${presentation}`}>Branch</button>
  ),
}));
vi.mock("@/components/layout/mobile-navigation", () => ({
  MobileNavigation: ({ organizationName }: { organizationName: string }) => (
    <button data-testid="mobile-navigation" data-organization={organizationName}>Menu</button>
  ),
}));
vi.mock("@/components/layout/user-menu", () => ({
  UserMenu: ({ presentation = "topbar" }: { presentation?: string }) => (
    <button data-testid={`account-${presentation}`}>Account</button>
  ),
}));

it("puts branch context above navigation and account access at the sidebar bottom", () => {
  renderShell();

  const sidebar = screen.getByLabelText("Application sidebar");
  const branch = within(sidebar).getByTestId("branch-sidebar");
  const navigation = within(sidebar).getByTestId("desktop-navigation");
  const account = within(sidebar).getByTestId("account-sidebar");

  expect(branch.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(navigation.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(sidebar).queryByText("Dental EMR workspace")).not.toBeInTheDocument();
});

it("keeps only the compact header below the desktop sidebar breakpoint", () => {
  renderShell();

  const banner = screen.getByRole("banner");
  expect(banner).toHaveClass("xl:hidden");
  expect(screen.getByTestId("mobile-navigation")).toHaveAttribute(
    "data-organization",
    "Synthetic Dental",
  );
  expect(within(banner).getByTestId("branch-topbar")).toBeInTheDocument();
  expect(within(banner).getByTestId("account-topbar")).toBeInTheDocument();
});

it("keeps branch and account access when the desktop sidebar collapses", () => {
  renderShell();
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

  const sidebar = screen.getByLabelText("Application sidebar");
  expect(within(sidebar).getByTestId("branch-rail")).toBeInTheDocument();
  expect(within(sidebar).getByTestId("account-rail")).toBeInTheDocument();
  expect(screen.getByTestId("desktop-navigation")).toHaveAttribute("data-collapsed", "true");
});
```

Add this helper above the tests so every case has identical props:

```tsx
function renderShell() {
  return render(
    <ShellLayout
      organizationName="Synthetic Dental"
      visibleNavigationHrefs={["/dashboard"]}
    >
      <p>Page content</p>
    </ShellLayout>,
  );
}
```

Keep the existing test proving local storage does not control the first render.

- [ ] **Step 2: Run the shell test and confirm it fails on the old hierarchy**

```powershell
npx vitest run "src/components/layout/shell-layout.test.tsx"
```

Expected: FAIL because sidebar branch/account probes and `MobileNavigation.organizationName` do not yet exist, and the header lacks `xl:hidden`.

- [ ] **Step 3: Mirror the hierarchy in `MobileNavigation`**

Import `BranchSelector` and `UserMenu`, add the organization prop, and replace the body of `MobileNavigation` with this complete composition. Keep the separate `NavLink` function below it unchanged:

```tsx
export function MobileNavigation({
  organizationName,
  visibleHrefs,
}: {
  organizationName: string;
  visibleHrefs: readonly NavigationHref[];
}) {
  const pathname = usePathname();
  const { ungrouped, groups } = groupedNavigationItems(visibleHrefs);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          aria-label="Open primary navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(20rem,88vw)] gap-0 rounded-none bg-sidebar p-0"
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between the available application screens.
          </SheetDescription>
          <AppBrand href="/dashboard" />
        </SheetHeader>
        <div className="shrink-0 space-y-2 border-b px-3 py-3">
          <div className="min-w-0 px-1">
            <p className="text-xs text-muted-foreground">Current organization</p>
            <p className="truncate text-sm font-medium">{organizationName}</p>
          </div>
          <BranchSelector presentation="sidebar" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <nav aria-label="Primary navigation" className="space-y-1">
            {ungrouped.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveItem(pathname, item.href)}
              />
            ))}
            {groups.map(({ group, items }) => (
              <div key={group} className="pt-3 first:pt-0">
                <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                  {group}
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActiveItem(pathname, item.href)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <UserMenu presentation="sidebar" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Recompose `ShellLayout` at the existing `xl` breakpoint**

Make these exact structural changes:

1. Keep the brand/collapse row first.
2. Replace the organization-only block with an always-present context block:

```tsx
<div className={cn("shrink-0 border-b", collapsed ? "grid place-items-center p-2" : "space-y-2 px-3 py-3") }>
  {collapsed ? (
    <BranchSelector presentation="rail" />
  ) : (
    <>
      <div className="min-w-0 px-1">
        <p className="text-xs font-medium text-muted-foreground">Current organization</p>
        <p className="mt-0.5 truncate text-sm font-medium text-sidebar-foreground">
          {organizationName}
        </p>
      </div>
      <BranchSelector presentation="sidebar" />
    </>
  )}
</div>
```

3. Keep `DesktopNavigation` in the existing `min-h-0 flex-1 overflow-y-auto` region.
4. Replace the “Dental EMR workspace” footer with:

```tsx
<div className={cn("shrink-0 border-t", collapsed ? "grid place-items-center p-2" : "p-3") }>
  <UserMenu presentation={collapsed ? "rail" : "sidebar"} />
</div>
```

5. Mark the compact header `xl:hidden`, pass `organizationName` into the drawer, and keep topbar controls explicitly in topbar mode:

```tsx
<header className="sticky top-0 z-40 border-b bg-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm xl:hidden print:hidden">
  <div className="flex min-h-16 items-center gap-2 px-3 sm:px-4 lg:px-6">
    <MobileNavigation
      organizationName={organizationName}
      visibleHrefs={visibleNavigationHrefs}
    />
    <div className="hidden min-w-0 sm:block">
      <p className="truncate text-xs text-muted-foreground">
        Current organization
      </p>
      <p className="truncate text-sm font-medium">{organizationName}</p>
    </div>
    <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
      <BranchSelector presentation="topbar" />
      <UserMenu presentation="topbar" />
    </div>
  </div>
</header>
```

6. Update main sizing for both compositions:

```tsx
className="min-h-[calc(100svh-4rem)] scroll-mt-20 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 xl:min-h-svh xl:scroll-mt-0 print:p-0"
```

Remove the now-unused `Separator` import. Do not alter the skip link, breakpoint, grid widths, or collapse-state semantics.

- [ ] **Step 5: Run focused shell/control tests and checks**

```powershell
npx vitest run "src/components/layout/shell-layout.test.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx"
npx eslint "src/components/layout/mobile-navigation.tsx" "src/components/layout/shell-layout.tsx" "src/components/layout/shell-layout.test.tsx"
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit only the shell composition**

```powershell
git add -- "src/components/layout/mobile-navigation.tsx" "src/components/layout/shell-layout.tsx" "src/components/layout/shell-layout.test.tsx"
git commit -m "feat: move branch and account into sidebar"
```

---

## Task 4: Convert the dashboard operational summary to paired rows

**Files:**

- Modify: `src/app/(emr)/dashboard/analytics-dashboard.test.tsx:42-91`
- Modify: `src/app/(emr)/dashboard/analytics-dashboard.tsx:237-270`

- [ ] **Step 1: Strengthen the dashboard test around semantic proximity**

In the first `AnalyticsDashboard` test, add these assertions after the existing heading check:

```tsx
const pairedList = container.querySelector('dl[data-layout="paired"]');
const appointmentsTerm = screen.getByText("Appointments").closest("dt");
const appointmentsValue = appointmentsTerm?.parentElement?.querySelector("dd");

expect(pairedList).toBeInTheDocument();
expect(pairedList).toHaveClass("max-w-xl");
expect(appointmentsTerm?.parentElement).toBe(appointmentsValue?.parentElement);
expect(appointmentsValue).toHaveTextContent("12");
expect(appointmentsValue).toHaveClass("text-left", "tabular-nums");
```

Keep the current no-`data-kpi-grid` and metric-value assertions.

- [ ] **Step 2: Run the dashboard test and confirm the expected failure**

```powershell
npx vitest run "src/app/(emr)/dashboard/analytics-dashboard.test.tsx"
```

Expected: FAIL because the old summary is an unconstrained `dl` with `justify-between` and `text-right`.

- [ ] **Step 3: Replace only the summary markup**

Import the new primitives:

```tsx
import {
  CompactDescriptionItem,
  CompactDescriptionList,
} from "@/components/ui/description-list";
```

Replace the existing operational-summary `dl` with:

```tsx
<CompactDescriptionList className="mt-3">
  {summaryDefinitions.map((definition) => {
    const metric = state.summary.find(
      (row) => row.metricCode === definition.code,
    );
    const detail = metricDetail(metric);

    return (
      <CompactDescriptionItem
        key={definition.code}
        label={definition.label}
        hint={definition.hint}
        valueClassName="text-lg font-semibold tabular-nums"
      >
        <span>{metricValue(metric)}</span>
        {detail && (
          <span className="block text-xs font-normal text-muted-foreground">
            {detail}
          </span>
        )}
      </CompactDescriptionItem>
    );
  })}
</CompactDescriptionList>
```

Do not change filters, `useActionState`, metric calculation helpers, breakdown tables/lists, empty/error behavior, or metric-definition copy.

- [ ] **Step 4: Run the dashboard and shared-list tests**

```powershell
npx vitest run "src/app/(emr)/dashboard/analytics-dashboard.test.tsx" "src/components/ui/description-list.test.tsx"
npx eslint "src/app/(emr)/dashboard/analytics-dashboard.tsx" "src/app/(emr)/dashboard/analytics-dashboard.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Commit the dashboard slice**

```powershell
git add -- "src/app/(emr)/dashboard/analytics-dashboard.tsx" "src/app/(emr)/dashboard/analytics-dashboard.test.tsx"
git commit -m "refactor: compact dashboard summary values"
```

---

## Task 5: Replace finance KPI cards with the same paired summary vocabulary

**Files:**

- Create: `src/app/(emr)/reports/finance/finance-report.test.tsx`
- Modify: `src/app/(emr)/reports/finance/finance-report.tsx:1-105`

- [ ] **Step 1: Write a failing finance summary test with synthetic ledger totals**

Create `src/app/(emr)/reports/finance/finance-report.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  loadFinancialReportAction: vi.fn(),
  loadPendingPdcAction: vi.fn(),
}));

import { FinanceReport } from "./finance-report";
import type { FinancialSummaryRow } from "@/lib/billing/types";

const baseRow: FinancialSummaryRow = {
  period: "2026-08-29",
  metricCode: "PRODUCTION",
  metricLabel: "Production",
  branchId: null,
  providerId: null,
  procedureId: null,
  paymentMethodCode: null,
  productionCentavos: 0,
  collectionCentavos: 0,
  pendingPdcCentavos: 0,
  clinicContributionCentavos: 0,
  unresolvedCompensationCentavos: 0,
};

const summary: FinancialSummaryRow[] = [
  { ...baseRow, metricCode: "PRODUCTION", productionCentavos: 125_000 },
  { ...baseRow, metricCode: "COLLECTION", metricLabel: "Collections", collectionCentavos: 75_000 },
  { ...baseRow, metricCode: "PENDING_PDC", metricLabel: "Pending PDC", pendingPdcCentavos: 30_000 },
  { ...baseRow, metricCode: "CLINIC_CONTRIBUTION", metricLabel: "Clinic contribution", clinicContributionCentavos: 50_000 },
];

afterEach(cleanup);

describe("FinanceReport", () => {
  it("renders financial totals as compact paired rows, not KPI cards", () => {
    const { container } = render(
      <FinanceReport
        actingBranchId="d1000000-0000-0000-0000-000000000001"
        initialSummary={summary}
        initialPending={[]}
      />,
    );

    const list = container.querySelector('dl[data-layout="paired"]');
    const productionTerm = screen.getByText("Production").closest("dt");
    const productionValue = screen.getByText("PHP 1,250.00").closest("dd");

    expect(screen.getByText("Financial summary")).toBeInTheDocument();
    expect(list).toHaveClass("max-w-xl");
    expect(productionTerm?.parentElement).toBe(productionValue?.parentElement);
    expect(productionValue).toHaveClass("text-left", "font-mono", "tabular-nums");
    expect(screen.getByText("PHP 750.00")).toBeInTheDocument();
    expect(screen.getByText("PHP 300.00")).toBeInTheDocument();
    expect(screen.getByText("PHP 500.00")).toBeInTheDocument();
  });
});
```

Keep these exact `PHP` assertions aligned with the checked-in deterministic `formatPhpCentavos` output; do not replace the formatter with locale-sensitive browser formatting.

- [ ] **Step 2: Run the test and confirm the expected failure**

```powershell
npx vitest run "src/app/(emr)/reports/finance/finance-report.test.tsx"
```

Expected: FAIL because `Financial summary` and the paired semantic list do not exist.

- [ ] **Step 3: Replace only the four-card grid**

Import the paired components and replace the existing `lg:grid-cols-4` block with:

```tsx
<section aria-labelledby="financial-summary-title">
  <h3 id="financial-summary-title" className="text-base font-semibold">
    Financial summary
  </h3>
  <CompactDescriptionList className="mt-3">
    {Object.entries(METRIC_LABELS).map(([code, label]) => (
      <CompactDescriptionItem
        key={code}
        label={label}
        valueClassName="font-mono font-semibold tabular-nums"
      >
        {formatPhpCentavos(BigInt(Math.trunc(summaryTotals[code] ?? 0)))}
      </CompactDescriptionItem>
    ))}
  </CompactDescriptionList>
</section>
```

Do not modify `totals`, `METRIC_FIELD`, action states, refresh forms, pending-cheque table, table right alignment, or empty/error behavior.

- [ ] **Step 4: Run finance, shared-list, billing money, and static checks**

```powershell
npx vitest run "src/app/(emr)/reports/finance/finance-report.test.tsx" "src/components/ui/description-list.test.tsx" "src/lib/billing/money.test.ts"
npx eslint "src/app/(emr)/reports/finance/finance-report.tsx" "src/app/(emr)/reports/finance/finance-report.test.tsx"
npm run typecheck
```

If `src/lib/billing/money.test.ts` does not exist at execution time, locate the exact formatter suite with `rg -l "formatPhpCentavos" src --glob "*.test.*"` and run that existing suite; do not create a redundant formatter test here.

Expected: PASS.

- [ ] **Step 5: Commit the finance slice**

```powershell
git add -- "src/app/(emr)/reports/finance/finance-report.tsx" "src/app/(emr)/reports/finance/finance-report.test.tsx"
git commit -m "refactor: replace finance KPI cards with paired rows"
```

---

## Task 6: Lock the responsive contract, complete the consistency audit, and prepare review evidence

**Files:**

- Modify: `e2e/responsive-accessibility.spec.ts:250-328`
- Modify: `docs/AI_HANDOFF.md` only after preflight confirms its current owner changes are checkpointed

- [ ] **Step 1: Add an authored shell-position contract to Playwright**

Add this test after the existing authenticated-shell test:

```ts
test("@responsive @shell branch and account follow the active shell composition", async ({
  page,
}, testInfo) => {
  await loginOwner(page);

  const width = page.viewportSize()?.width ?? 0;
  const sidebar = page.getByRole("complementary", {
    name: "Application sidebar",
  });
  const topbar = page.getByRole("banner");

  if (width >= 1280) {
    await expect(sidebar).toBeVisible();
    await expect(topbar).toBeHidden();
    await expect(
      sidebar.getByRole("button", { name: /Branch context:/ }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();

    await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(
      sidebar.getByRole("button", { name: /Branch context:/ }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();
  } else {
    await expect(sidebar).toBeHidden();
    await expect(topbar).toBeVisible();
    await topbar
      .getByRole("button", { name: "Open primary navigation" })
      .click();

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(
      drawer.getByRole("button", { name: /Branch context:/ }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();
  }

  await expectNoHorizontalOverflow(page, `shell composition (${testInfo.project.name})`);
});
```

This uses the existing project matrix: Desktop Chrome exercises the 1280 px breakpoint, responsive desktop exercises 1440 px, and phone/iPad projects exercise compact compositions. Do not add more Playwright projects.

- [ ] **Step 2: Add a bounded paired-summary browser contract**

Add a helper near the other local E2E helpers:

```ts
async function expectCompactPairedSummary(
  page: Page,
  label: string,
  context: string,
) {
  const list = page.locator('dl[data-layout="paired"]').first();
  const row = list.locator("div", { has: page.locator("dt", { hasText: label }) });
  const listBox = await list.boundingBox();
  const labelBox = await row.locator("dt").boundingBox();
  const valueBox = await row.locator("dd").boundingBox();

  expect(listBox, `${context}: paired list is not rendered`).not.toBeNull();
  expect(labelBox, `${context}: label is not rendered`).not.toBeNull();
  expect(valueBox, `${context}: value is not rendered`).not.toBeNull();
  expect(listBox!.width, `${context}: list exceeds max-w-xl`).toBeLessThanOrEqual(577);
  expect(
    valueBox!.x - labelBox!.x,
    `${context}: value is too far from its label`,
  ).toBeLessThan(320);
}
```

Ensure `Page` is imported from `@playwright/test`, then add:

```ts
test("@responsive dashboard and finance keep summary values close to labels", async ({
  page,
}) => {
  await loginOwner(page);

  await expectCompactPairedSummary(page, "Appointments", "dashboard summary");
  await expectNoHorizontalOverflow(page, "dashboard paired summary");

  await page.goto("/reports/finance");
  await expect(page.getByRole("heading", { name: "Finance report" })).toBeVisible();
  await expectCompactPairedSummary(page, "Production", "finance summary");
  await expectNoHorizontalOverflow(page, "finance paired summary");
});
```

If a role-scoped synthetic identity cannot access finance, that is an authorization-fixture issue; do not broaden route permissions or bypass server authorization to make the test pass.

- [ ] **Step 3: List the E2E suite without contacting Cloud TEST**

```powershell
npm run test:e2e:list
```

Expected: PASS with the new tests listed across the intended projects. Do **not** run `npm run test:e2e:responsive` in this checkpoint unless the owner separately authorizes guarded Cloud TEST.

- [ ] **Step 4: Perform the source consistency sweep and record its bounded conclusion**

Run:

```powershell
rg -n "justify-between|text-right|lg:grid-cols-4|data-kpi-grid|<dl" "src/app/(emr)" "src/components"
```

Review every result using the accepted selection rule. Expected conclusion:

- dashboard and finance summary violations are gone;
- patient overview/demographics, appointment detail, branch/procedure/intake/file facts already group labels and values locally and need no migration;
- tables, ledgers, schedules, row-end statuses/actions, and headings/actions retain intentional right alignment or separation;
- public marketing grids and any unaccepted odontogram/periodontal UI are out of scope.

Do not make speculative cleanup edits merely to eliminate search matches. If a new genuine short-fact violation has appeared since this plan was written, stop and add a focused failing test plus a separately reviewed task before changing it.

- [ ] **Step 5: Run the complete local quality gate**

```powershell
npx vitest run "src/components/ui/description-list.test.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx" "src/components/layout/shell-layout.test.tsx" "src/app/(emr)/dashboard/analytics-dashboard.test.tsx" "src/app/(emr)/reports/finance/finance-report.test.tsx"
npm run lint
npm run typecheck
npm run test:unit
npm run build
git diff --check
```

Expected: every command PASS. If unrelated pre-existing odontogram work causes a full-suite or build failure, capture the exact failure, prove the focused UI suites independently, and do not claim the complete gate passed.

- [ ] **Step 6: Review the diff for scope, privacy, and responsive regressions**

Run:

```powershell
git status --short
git diff --stat
git diff -- "src/components/ui/description-list.tsx" "src/components/layout" "src/app/(emr)/dashboard" "src/app/(emr)/reports/finance" "e2e/responsive-accessibility.spec.ts"
```

Confirm:

- no server action, database, authorization, branch model, financial formula, or analytics formula changed;
- no current odontogram file is in the implementation diff;
- no secret, patient content, presigned URL, token, or production identifier appears;
- no new dependency or generic KPI-card abstraction was added;
- shell order is branch above authorized navigation and account at the bottom;
- the compact header is hidden only when the persistent `xl` sidebar is active.

- [ ] **Step 7: Update the handoff and commit review evidence**

After verifying the pre-existing handoff changes have been checkpointed, update `docs/AI_HANDOFF.md` in its established format with:

- exact commits produced by Tasks 1–5;
- files and behavior changed;
- focused/full commands and actual outcomes;
- `npm run test:e2e:list` result;
- explicit note that authenticated Cloud TEST execution was not authorized/run;
- source-audit conclusion and remaining browser gate;
- confirmation that tenancy, RLS, server authorization, analytics math, and finance math did not change.

Then stage only the E2E and handoff files:

```powershell
git add -- "e2e/responsive-accessibility.spec.ts" "docs/AI_HANDOFF.md"
git commit -m "test: cover responsive shell and paired summaries"
```

- [ ] **Step 8: Request independent review before acceptance**

Have the reviewer inspect the exact implementation commit range rather than the dirty working tree. Review specifically for:

- branch/account keyboard access in expanded, collapsed, compact-bar, and drawer compositions;
- duplicate landmarks or duplicate accessible controls when the drawer opens;
- breakpoint mismatch at 1280 px;
- long organization/branch names and Philippine peso values overflowing;
- accidental changes to server-derived navigation/branch authorization;
- accidental conversion of wide tables or ledgers to the compact summary component;
- Cloud TEST browser verification still outstanding.

Do not deploy or mark production-ready from local evidence alone.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-29-sidebar-and-information-alignment.md`.

Two execution options after explicit owner authorization and a safe working-tree checkpoint:

1. **Subagent-Driven (recommended):** execute one task at a time with a fresh implementation pass and review after each focused commit.
2. **Inline Execution:** execute this plan sequentially in the current session, stopping at each commit boundary for verification.

In either mode, the same TDD steps, exact staging boundaries, local quality gate, independent review, and Cloud TEST restriction apply.
