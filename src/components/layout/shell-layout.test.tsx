// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/app-brand", () => ({
  AppBrand: () => <div>Dental EMR</div>,
}));
vi.mock("@/components/layout/branch-selector", () => ({
  BranchSelector: ({ presentation = "topbar" }: { presentation?: string }) => (
    <button data-testid={`branch-${presentation}`}>Branch</button>
  ),
}));
vi.mock("@/components/layout/desktop-navigation", () => ({
  DesktopNavigation: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="desktop-navigation" data-collapsed={String(collapsed)} />
  ),
}));
vi.mock("@/components/layout/mobile-navigation", () => ({
  MobileNavigation: ({ organizationName }: { organizationName: string }) => (
    <button
      data-testid="mobile-navigation"
      data-organization={organizationName}
    >
      Menu
    </button>
  ),
}));
vi.mock("@/components/layout/user-menu", () => ({
  UserMenu: ({ presentation = "topbar" }: { presentation?: string }) => (
    <button data-testid={`account-${presentation}`}>Account</button>
  ),
}));

import { ShellLayout } from "./shell-layout";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderShell() {
  return renderShellWithProps();
}

function renderShellWithProps({
  organizationName = "Synthetic Dental",
}: {
  organizationName?: string;
} = {}) {
  return render(
    <ShellLayout
      organizationName={organizationName}
      visibleNavigationHrefs={["/dashboard"]}
    >
      <p>Page content</p>
    </ShellLayout>,
  );
}

describe("ShellLayout", () => {
  it("puts branch context above navigation and account access at the sidebar bottom", () => {
    renderShell();

    const sidebar = screen.getByLabelText("Application sidebar");
    const branch = within(sidebar).getByTestId("branch-sidebar");
    const navigation = within(sidebar).getByTestId("desktop-navigation");
    const account = within(sidebar).getByTestId("account-sidebar");

    expect(
      branch.compareDocumentPosition(navigation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      navigation.compareDocumentPosition(account) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(sidebar).queryByText("Dental EMR workspace"),
    ).not.toBeInTheDocument();
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
    expect(screen.getByTestId("desktop-navigation")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("starts expanded without deriving the initial render from browser storage", () => {
    window.localStorage.setItem("emr:sidebar-collapsed", "1");

    renderShell();

    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
    expect(screen.getByTestId("desktop-navigation")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });

  it("keeps long organization names discoverable in the expanded shell", () => {
    const longOrganizationName =
      "Synthetic Dental Organization With A Deliberately Long Name For Shell Discoverability";

    renderShellWithProps({ organizationName: longOrganizationName });

    const sidebar = screen.getByLabelText("Application sidebar");
    const sidebarName = within(sidebar).getAllByText(longOrganizationName)[1];
    const banner = screen.getByRole("banner");
    const bannerName = within(banner).getByText(longOrganizationName);

    expect(sidebarName).toHaveClass("break-words");
    expect(sidebarName).toHaveAttribute("title", longOrganizationName);
    expect(bannerName).toHaveAttribute("title", longOrganizationName);
  });
});
