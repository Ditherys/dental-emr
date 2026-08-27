import { beforeEach, describe, expect, it, vi } from "vitest";

type Query = {
  select: (value: string) => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string, options?: unknown) => Query;
  limit: (count: number) => Query;
  maybeSingle: () => Query;
};

function makeQuery(result: unknown): Query {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return query as unknown as Query;
}

const from = vi.fn((table: string): Query => {
  void table;
  return makeQuery({ data: null, error: null });
});

const { createSupabaseClient, getSupabaseServerConfig } = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  getSupabaseServerConfig: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createSupabaseClient }));
vi.mock("@/lib/supabase/server-config", () => ({ getSupabaseServerConfig }));

import { loadBookingOptions } from "./options";

const orgId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";
const providerId = "c6000000-0000-0000-0000-000000000006";
const secondProviderId = "c6000000-0000-0000-0000-000000000007";

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseServerConfig.mockReturnValue({ url: "https://example.supabase.co", secretKey: "secret" });
  createSupabaseClient.mockImplementation(() => ({ from }));
});

function resetTables(results: Record<string, unknown>) {
  from.mockImplementation((table: string) => makeQuery(results[table] ?? { data: null, error: null }));
}

describe("booking options read", () => {
  it("loads website-visible procedures with codes and modes plus branch-assigned providers", async () => {
    resetTables({
      organizations: { data: { id: orgId }, error: null },
      branches: { data: { id: branchId }, error: null },
      procedures: {
        data: [
          { code: "CLEANING", name: "Teeth cleaning", description: "Professional cleaning.", online_booking_enabled: true, booking_mode: "REQUIRES_REVIEW" },
          { code: "IMPLANT", name: "Implant consult", description: "Specialist review.", online_booking_enabled: false, booking_mode: "REQUEST_ONLY" },
        ],
        error: null,
      },
      providers: {
        data: [
          { id: providerId, first_name: "Jose", middle_name: null, last_name: "Dela Cruz", suffix: null },
          { id: secondProviderId, first_name: "Ana", middle_name: null, last_name: "Santos", suffix: null },
        ],
        error: null,
      },
      provider_branches: {
        data: [{ provider_id: providerId }],
        error: null,
      },
    });

    await expect(loadBookingOptions("smilelab-demo-dental")).resolves.toEqual({
      procedures: [
        { code: "CLEANING", name: "Teeth cleaning", description: "Professional cleaning.", isInstant: true },
        { code: "IMPLANT", name: "Implant consult", description: "Specialist review.", isInstant: false },
      ],
      providers: [{ providerId, displayName: "Jose Dela Cruz" }],
    });

    expect(from).toHaveBeenCalledWith("organizations");
    expect(from).toHaveBeenCalledWith("branches");
    expect(from).toHaveBeenCalledWith("procedures");
    expect(from).toHaveBeenCalledWith("providers");
    expect(from).toHaveBeenCalledWith("provider_branches");
    expect(from).not.toHaveBeenCalledWith(expect.stringMatching(/patient|clinical|appointment|audit/));
  });

  it("returns null when the org slug does not resolve", async () => {
    resetTables({ organizations: { data: null, error: null } });
    await expect(loadBookingOptions("unknown-clinic")).resolves.toBeNull();
  });

  it("returns empty options when no website-visible branch resolves", async () => {
    resetTables({
      organizations: { data: { id: orgId }, error: null },
      branches: { data: null, error: null },
    });
    await expect(loadBookingOptions("smilelab-demo-dental")).resolves.toEqual({ procedures: [], providers: [] });
  });

  it("degrades to null when the reference-data read throws", async () => {
    createSupabaseClient.mockImplementation(() => {
      throw new Error("missing server config");
    });
    await expect(loadBookingOptions("smilelab-demo-dental")).resolves.toBeNull();
  });
});