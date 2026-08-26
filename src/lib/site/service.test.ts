import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { SiteServiceError, mapSiteRpcError } from "./errors";
import {
  getPublicSite,
  getPublicSiteSettings,
  updatePublicSiteSettings,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const orgId = "c2000000-0000-0000-0000-000000000002";
const orgSlug = "smilelab-demo-dental";

const publicSiteRow = {
  organizationName: "SmileLab Demo Dental",
  address: "100 Example Avenue, Synthetic City, Demo Province",
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: "A modern dental clinic.",
  contactPhone: "+63281234567",
  contactEmail: "hello@example.test",
  addressOverride: null,
  operatingHours: { Monday: "8:00 AM - 5:00 PM" },
  privacyNotice: "We respect your privacy.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: "https://booking.example.test",
  socialLinks: { facebook: "https://facebook.com/exampleclinic" },
  providers: [
    {
      displayName: "Juan Dela Cruz",
      bio: "General dentist focused on preventive care.",
      primarySpecialtyLabel: "General Dentistry",
    },
  ],
  procedures: [
    { name: "Cleaning", description: "Professional teeth cleaning." },
  ],
};

const settingsRow = {
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: "A modern dental clinic.",
  contactPhone: "+63281234567",
  contactEmail: "hello@example.test",
  addressOverride: null,
  operatingHours: { Monday: "8:00 AM - 5:00 PM" },
  privacyNotice: "We respect your privacy.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: "https://booking.example.test",
  socialLinks: { facebook: "https://facebook.com/exampleclinic" },
  version: 3,
};

const updateInput = {
  actingBranchId: branchId,
  expectedVersion: 3,
  settings: {
    heroHeading: "Smiles for the whole family",
    heroSubtext: "Gentle, honest dental care in one place.",
    aboutText: "A modern dental clinic.",
    contactPhone: "+63281234567",
    contactEmail: "hello@example.test",
    addressOverride: null,
    operatingHours: { Monday: "8:00 AM - 5:00 PM" },
    privacyNotice: "We respect your privacy.",
    messengerLink: "https://m.me/exampleclinic",
    bookingLink: "https://booking.example.test",
    socialLinks: { facebook: "https://facebook.com/exampleclinic" },
  },
};

describe("site service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapSiteRpcError({ code: "42501", message: "not authorized" })).toEqual(new SiteServiceError("NOT_AUTHORIZED"));
    expect(mapSiteRpcError({ code: "42501", message: "stale version" })).toEqual(new SiteServiceError("STALE_VERSION"));
    expect(mapSiteRpcError({ code: "22023", message: "invalid input" })).toEqual(new SiteServiceError("INVALID_INPUT"));
    expect(mapSiteRpcError({ code: "P0001", message: "boom" })).toEqual(new SiteServiceError("FAILED"));
    expect(mapSiteRpcError("boom")).toEqual(new SiteServiceError("FAILED"));
  });
});

describe("site service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid slugs, foreign keys, and forbidden settings keys before an RPC", async () => {
    await expect(getPublicSite("")).rejects.toBeInstanceOf(z.ZodError);
    await expect(getPublicSite("NOT_A_SLUG")).rejects.toBeInstanceOf(z.ZodError);
    await expect(getPublicSite("   ")).rejects.toBeInstanceOf(z.ZodError);

    await expect(getPublicSiteSettings("not-a-uuid")).rejects.toBeInstanceOf(z.ZodError);

    await expect(updatePublicSiteSettings({
      ...updateInput,
      actingBranchId: "foreign",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updatePublicSiteSettings({
      ...updateInput,
      expectedVersion: 0,
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updatePublicSiteSettings({
      ...updateInput,
      organizationId: "foreign-org",
    })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a partial settings snapshot that would silently wipe omitted fields", async () => {
    const { settings: fullSettings, ...rest } = updateInput;
    await expect(updatePublicSiteSettings({
      ...rest,
      settings: { ...fullSettings, socialLinks: undefined },
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(updatePublicSiteSettings({
      ...rest,
      settings: { heroHeading: "Only a heading" },
    })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects oversized and non-string setting values before an RPC", async () => {
    await expect(updatePublicSiteSettings({
      ...updateInput,
      settings: { ...updateInput.settings, heroHeading: "x".repeat(201) },
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(updatePublicSiteSettings({
      ...updateInput,
      settings: { ...updateInput.settings, contactEmail: "y".repeat(321) },
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(updatePublicSiteSettings({
      ...updateInput,
      settings: { ...updateInput.settings, operatingHours: { Monday: 5 } },
    })).rejects.toBeInstanceOf(z.ZodError);

    const oversizedHours = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`day-${i}`.padEnd(64, "x"), "z".repeat(500)]),
    );
    await expect(updatePublicSiteSettings({
      ...updateInput,
      settings: { ...updateInput.settings, operatingHours: oversizedHours },
    })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("site service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("reads the public site by slug with the exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: publicSiteRow, error: null });
    await expect(getPublicSite(orgSlug)).resolves.toEqual({
      ...publicSiteRow,
      operatingHours: publicSiteRow.operatingHours,
      socialLinks: publicSiteRow.socialLinks,
    });
    expect(rpc).toHaveBeenLastCalledWith("get_public_site", { p_org_slug: orgSlug });
  });

  it("returns null for an unknown or inactive org slug", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPublicSite("unknown-clinic")).resolves.toBeNull();
    expect(rpc).toHaveBeenLastCalledWith("get_public_site", { p_org_slug: "unknown-clinic" });
  });

  it("normalizes missing settings objects to empty records", async () => {
    rpc.mockResolvedValueOnce({ data: { ...publicSiteRow, operatingHours: null, socialLinks: null }, error: null });
    await expect(getPublicSite(orgSlug)).resolves.toEqual({
      ...publicSiteRow,
      operatingHours: {},
      socialLinks: {},
    });
  });

  it("reads settings for the acting branch with the exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: settingsRow, error: null });
    await expect(getPublicSiteSettings(branchId)).resolves.toEqual(settingsRow);
    expect(rpc).toHaveBeenLastCalledWith("get_public_site_settings", { p_acting_branch_id: branchId });
  });

  it("returns first-version empty settings when no settings row exists", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPublicSiteSettings(branchId)).resolves.toEqual({
      heroHeading: null,
      heroSubtext: null,
      aboutText: null,
      contactPhone: null,
      contactEmail: null,
      addressOverride: null,
      operatingHours: {},
      privacyNotice: null,
      messengerLink: null,
      bookingLink: null,
      socialLinks: {},
      version: 1,
    });
  });

  it("binds update settings to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ organization_id: orgId, version: 4 }], error: null });
    await expect(updatePublicSiteSettings(updateInput)).resolves.toEqual({ organizationId: orgId, version: 4 });
    expect(rpc).toHaveBeenLastCalledWith("update_public_site_settings", {
      p_acting_branch_id: branchId,
      p_expected_version: 3,
      p_settings: updateInput.settings,
    });
  });

  it("rejects a malformed public site or settings keyset", async () => {
    rpc.mockResolvedValueOnce({ data: { ...publicSiteRow, patientCount: 5 }, error: null });
    await expect(getPublicSite(orgSlug)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: { ...settingsRow, version: -1 }, error: null });
    await expect(getPublicSiteSettings(branchId)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ organization_id: orgId }], error: null });
    await expect(updatePublicSiteSettings(updateInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(updatePublicSiteSettings(updateInput)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each read and mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(getPublicSiteSettings(branchId)).rejects.toEqual(new SiteServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(updatePublicSiteSettings(updateInput)).rejects.toEqual(new SiteServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "stale version" } });
    await expect(updatePublicSiteSettings(updateInput)).rejects.toEqual(new SiteServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "boom" } });
    await expect(getPublicSite(orgSlug)).rejects.toEqual(new SiteServiceError("FAILED"));
  });
});