// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/login/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: ComponentProps<"a"> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

const usePathnameMock = vi.fn(() => "/dashboard");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { BranchContextProvider } from "@/components/layout/branch-context";
import { MobileNavigation } from "./mobile-navigation";
import type { BranchContextModel } from "@/lib/authorization/policy";

const navigationModel: BranchContextModel = {
  organization: { id: "org-a", name: "Synthetic Dental" },
  branches: [{ id: "branch-a1", name: "Demo Main" }],
  allowAllBranches: false,
};

beforeEach(() => {
  usePathnameMock.mockReturnValue("/dashboard");
});

afterEach(cleanup);

function renderNavigation(organizationName = "Synthetic Dental") {
  return render(
    <BranchContextProvider model={navigationModel}>
      <MobileNavigation
        organizationName={organizationName}
        visibleHrefs={["/dashboard"]}
      />
    </BranchContextProvider>,
  );
}

describe("MobileNavigation", () => {
  it("opens from the keyboard and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    renderNavigation();

    const trigger = screen.getByRole("button", {
      name: "Open primary navigation",
    });
    trigger.focus();

    await user.keyboard("{Enter}");

    const drawerNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(drawerNavigation).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("navigation", { name: "Primary navigation" }),
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("closes the drawer when account navigation is activated", async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(
      screen.getByRole("button", { name: "Open primary navigation" }),
    );
    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Account & security" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("navigation", { name: "Primary navigation" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps long organization names discoverable in the expanded drawer", async () => {
    const user = userEvent.setup();
    const longOrganizationName =
      "Synthetic Dental Organization With A Deliberately Long Main Branch Context Name";

    renderNavigation(longOrganizationName);
    await user.click(
      screen.getByRole("button", { name: "Open primary navigation" }),
    );

    const drawer = screen.getByRole("dialog", { name: "Primary navigation" });
    const organizationName = within(drawer).getByText(longOrganizationName);

    expect(organizationName).toHaveClass("break-words");
    expect(organizationName).toHaveAttribute("title", longOrganizationName);
  });
});
