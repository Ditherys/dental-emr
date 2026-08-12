import { describe, expect, it } from "vitest";

import { currentTotp } from "../e2e/support/totp";

describe("foundation E2E TOTP helper", () => {
  it("matches the RFC 6238 SHA-1 vector truncated to six digits", () => {
    expect(
      currentTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000),
    ).toBe("287082");
  });
});
