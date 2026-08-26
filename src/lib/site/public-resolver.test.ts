import { beforeEach, describe, expect, it, vi } from "vitest";

function makeQuery({ data, error }: { data: { slug: string } | null; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

const { createAdminClient, getPublicSite, organizationsQuery } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPublicSite: vi.fn(),
  organizationsQuery: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("./service", () => ({ getPublicSite }));

import {
  configuredPublicOrgSlug,
  loadPublicSite,
  resolvePublicOrgSlug,
} from "./public-resolver";

beforeEach(() => {
  vi.clearAllMocks();
  createAdminClient.mockImplementation(() => ({ from: organizationsQuery }));
});

describe("public org slug resolution", () => {
  it("reads the configured public slug from the environment with trimming", () => {
    expect(configuredPublicOrgSlug({ NEXT_PUBLIC_CLINIC_ORG_SLUG: " smilelab-demo-dental " })).toBe("smilelab-demo-dental");
    expect(configuredPublicOrgSlug({})).toBeNull();
    expect(configuredPublicOrgSlug({ NEXT_PUBLIC_CLINIC_ORG_SLUG: "  " })).toBeNull();
  });

  it("prefers the configured slug over the active-org fallback", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLINIC_ORG_SLUG", "smilelab-demo-dental");
    await expect(resolvePublicOrgSlug()).resolves.toBe("smilelab-demo-dental");
    expect(createAdminClient).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("falls back to the first active organization when unconfigured", async () => {
    organizationsQuery.mockReturnValue(makeQuery({ data: { slug: "smilelab-demo-dental" }, error: null }));
    await expect(resolvePublicOrgSlug()).resolves.toBe("smilelab-demo-dental");
    expect(createAdminClient).toHaveBeenCalledTimes(1);
  });

  it("returns null when the active-org fallback query fails", async () => {
    organizationsQuery.mockReturnValue(makeQuery({ data: null, error: { message: "boom" } }));
    await expect(resolvePublicOrgSlug()).resolves.toBeNull();
  });

  it("degrades to null when the fallback client itself throws", async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error("missing server config");
    });
    await expect(resolvePublicOrgSlug()).resolves.toBeNull();
  });

  it("loads the public site for the resolved slug", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLINIC_ORG_SLUG", "smilelab-demo-dental");
    getPublicSite.mockResolvedValueOnce({ organizationName: "SmileLab Demo Dental" });
    await expect(loadPublicSite()).resolves.toEqual({ organizationName: "SmileLab Demo Dental" });
    expect(getPublicSite).toHaveBeenCalledWith("smilelab-demo-dental");
    vi.unstubAllEnvs();
  });

  it("returns null without an RPC when no slug resolves", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLINIC_ORG_SLUG", "");
    organizationsQuery.mockReturnValue(makeQuery({ data: null, error: null }));
    await expect(loadPublicSite()).resolves.toBeNull();
    expect(getPublicSite).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});