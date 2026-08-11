import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "./safe-redirect";

describe("getSafeRedirectPath", () => {
  it("keeps an internal path and query string", () => {
    expect(getSafeRedirectPath("/settings/account?source=auth")).toBe(
      "/settings/account?source=auth",
    );
  });

  it.each([
    null,
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%5Cattacker.example",
    "/%E0%A4%A",
  ])("falls back for an unsafe destination: %s", (destination) => {
    expect(getSafeRedirectPath(destination)).toBe("/dashboard");
  });
});
