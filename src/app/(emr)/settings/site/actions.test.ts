import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  SiteServiceError,
  revalidatePath,
  requirePermission,
  updatePublicSiteSettings,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  SiteServiceError: class SiteServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  updatePublicSiteSettings: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/site/service", () => ({ SiteServiceError, updatePublicSiteSettings }));

import { updatePublicSiteSettingsAction } from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const orgId = "c2000000-0000-0000-0000-000000000002";

function settingsForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("actingBranchId", branchId);
  form.set("expectedVersion", "3");
  form.set("heroHeading", "Smiles for the whole family");
  form.set("heroSubtext", "Gentle, honest dental care in one place.");
  form.set("aboutText", "A modern dental clinic.");
  form.set("contactPhone", "+63281234567");
  form.set("contactEmail", "hello@example.test");
  form.set("addressOverride", "");
  form.set("privacyNotice", "We respect your privacy.");
  form.set("messengerLink", "https://m.me/exampleclinic");
  form.set("bookingLink", "https://booking.example.test");
  form.set("operatingHours-key-0", "Monday");
  form.set("operatingHours-value-0", "8:00 AM - 5:00 PM");
  form.set("socialLinks-key-0", "facebook");
  form.set("socialLinks-value-0", "https://facebook.com/exampleclinic");
  for (const [name, value] of Object.entries(overrides)) {
    form.set(name, value);
  }
  return form;
}

const expectedSettings = {
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: "A modern dental clinic.",
  contactPhone: "+63281234567",
  contactEmail: "hello@example.test",
  addressOverride: "",
  operatingHours: { Monday: "8:00 AM - 5:00 PM" },
  privacyNotice: "We respect your privacy.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: "https://booking.example.test",
  socialLinks: { facebook: "https://facebook.com/exampleclinic" },
};

describe("site settings server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechecks site.manage against the submitted branch immediately before saving", async () => {
    requirePermission.mockResolvedValueOnce({});
    updatePublicSiteSettings.mockResolvedValueOnce({ organizationId: orgId, version: 4 });

    const result = await updatePublicSiteSettingsAction({}, settingsForm());

    expect(result).toEqual({ ok: true, message: "Website settings saved.", version: 4 });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "site.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(updatePublicSiteSettings.mock.invocationCallOrder[0]);
    expect(updatePublicSiteSettings).toHaveBeenCalledWith({
      actingBranchId: branchId,
      expectedVersion: 3,
      settings: expectedSettings,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/site");
  });

  it("validates crafted branch identifiers and expected versions before authorization", async () => {
    const result = await updatePublicSiteSettingsAction({}, settingsForm({ actingBranchId: "foreign", expectedVersion: "0" }));
    expect(result).toEqual({ fieldErrors: expect.any(Object) });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(updatePublicSiteSettings).not.toHaveBeenCalled();
  });

  it("drops forged or unknown form fields before the service call", async () => {
    requirePermission.mockResolvedValueOnce({});
    updatePublicSiteSettings.mockResolvedValueOnce({ organizationId: orgId, version: 4 });

    await updatePublicSiteSettingsAction({}, settingsForm({
      organizationId: "foreign-org",
      patientName: "Real Patient",
      diagnosis: "Routine cleaning",
    }));

    expect(updatePublicSiteSettings).toHaveBeenCalledWith({
      actingBranchId: branchId,
      expectedVersion: 3,
      settings: expectedSettings,
    });
  });

  it("returns a safe denial when site manage is revoked for the branch", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await updatePublicSiteSettingsAction({}, settingsForm());
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(updatePublicSiteSettings).not.toHaveBeenCalled();
  });

  it("maps a stale version to a reload prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    updatePublicSiteSettings.mockRejectedValueOnce(new SiteServiceError("STALE_VERSION"));
    const result = await updatePublicSiteSettingsAction({}, settingsForm());
    expect(result).toEqual({ ok: false, message: "These website settings changed elsewhere. Reload and try again." });
  });

  it("maps an invalid input rejection to a check-your-values prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    updatePublicSiteSettings.mockRejectedValueOnce(new SiteServiceError("INVALID_INPUT"));
    const result = await updatePublicSiteSettingsAction({}, settingsForm());
    expect(result).toEqual({ ok: false, message: "Some website settings could not be saved. Check the values and try again." });
  });

  it("maps an unexpected failure to a generic safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    updatePublicSiteSettings.mockRejectedValueOnce(new SiteServiceError("FAILED"));
    const result = await updatePublicSiteSettingsAction({}, settingsForm());
    expect(result).toEqual({ ok: false, message: "The website settings could not be saved. Try again." });
  });
});