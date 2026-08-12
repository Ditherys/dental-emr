// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/login/actions", () => ({
  signOut: vi.fn(),
}));

import { AccessRevoked } from "./access-revoked";

afterEach(cleanup);

describe("AccessRevoked", () => {
  it("provides a non-disclosing revoked-access state and an explicit sign-out path", () => {
    render(<AccessRevoked />);

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByRole("heading", {
        name: "Your workspace access is no longer active.",
      }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent("contact an organization administrator");
    expect(
      within(alert).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("Synthetic Dental A");
    expect(alert).not.toHaveTextContent(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });
});
