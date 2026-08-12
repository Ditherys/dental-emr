import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports only a minimal, fixed status", async () => {
    const response = GET();

    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("prevents caching so status reflects the live process", () => {
    const response = GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never leaks environment, infrastructure, or tenant details", async () => {
    const response = GET();
    const rawBody = JSON.stringify(await response.json());

    expect(rawBody).not.toMatch(
      /supabase|env|secret|key|token|version|organization|database|branch/i,
    );
  });
});
