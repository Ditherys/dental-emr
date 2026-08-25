import { describe, expect, it } from "vitest";

import { mapProviderRpcError, ProviderServiceError } from "./errors";
import { createSpecialtySchema } from "./schema";

describe("provider service boundary", () => {
  it.each([
    [{ code: "42501", message: "not authorized" }, "NOT_AUTHORIZED"],
    [{ code: "P0001", message: "stale version" }, "STALE"],
    [{ code: "P0001", message: "invalid state" }, "INVALID_STATE"],
    [{ code: "22023", message: "invalid input" }, "INVALID_INPUT"],
    [{ code: "P0002", message: "not found" }, "NOT_FOUND_OR_DENIED"],
    [{ code: "XX000", message: "unexpected" }, "FAILED"],
  ] as const)("maps %s to a safe error", (error, code) => {
    expect(mapProviderRpcError(error)).toEqual(new ProviderServiceError(code));
  });

  it("does not normalize arbitrary specialty values into valid RPC input", () => {
    const input = { actingBranchId: "33000000-0000-0000-0000-000000000001", code: "general dentistry", name: "General", actorUserId: "33000000-0000-0000-0000-000000000002" };
    expect(createSpecialtySchema.safeParse(input).success).toBe(false);
  });
});
