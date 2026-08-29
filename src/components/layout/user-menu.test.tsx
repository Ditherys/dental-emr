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
