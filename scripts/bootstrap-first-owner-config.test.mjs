import { describe, expect, it } from "vitest";

import { validateBootstrapTarget } from "./bootstrap-first-owner-config.mjs";

describe("first-owner bootstrap target validation", () => {
  it("accepts the exact local Supabase target only for local development", () => {
    expect(
      validateBootstrapTarget({
        appEnvironment: "development",
        projectId: "local",
        url: "http://127.0.0.1:54321",
      }),
    ).toBe("http://127.0.0.1:54321");
  });

  it("rejects a local target outside local development", () => {
    expect(() =>
      validateBootstrapTarget({
        appEnvironment: "test",
        projectId: "local",
        url: "http://127.0.0.1:54321",
      }),
    ).toThrow("local Supabase is allowed only for development");
  });

  it("retains exact Cloud URL matching for non-local projects", () => {
    expect(() =>
      validateBootstrapTarget({
        appEnvironment: "development",
        projectId: "devproject123",
        url: "https://anotherproject.supabase.co",
      }),
    ).toThrow("does not match SUPABASE_PROJECT_ID");
  });
});
