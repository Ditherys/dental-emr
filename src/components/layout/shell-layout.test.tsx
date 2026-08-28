// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/app-brand", () => ({
  AppBrand: () => <div>Dental EMR</div>,
}));
vi.mock("@/components/layout/branch-selector", () => ({
  BranchSelector: () => null,
}));
vi.mock("@/components/layout/desktop-navigation", () => ({
  DesktopNavigation: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="desktop-navigation" data-collapsed={String(collapsed)} />
  ),
}));
vi.mock("@/components/layout/mobile-navigation", () => ({
  MobileNavigation: () => null,
}));
vi.mock("@/components/layout/user-menu", () => ({
  UserMenu: () => null,
}));

import { ShellLayout } from "./shell-layout";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("ShellLayout", () => {
  it("starts expanded without deriving the initial render from browser storage", () => {
    window.localStorage.setItem("emr:sidebar-collapsed", "1");

    render(
      <ShellLayout
        organizationName="Synthetic Dental"
        visibleNavigationHrefs={["/dashboard"]}
      >
        <p>Page content</p>
      </ShellLayout>,
    );

    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
    expect(screen.getByTestId("desktop-navigation")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });
});
