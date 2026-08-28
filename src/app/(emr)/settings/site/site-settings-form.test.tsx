// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updatePublicSiteSettingsAction } = vi.hoisted(() => ({
  updatePublicSiteSettingsAction: vi.fn(),
}));

vi.mock("./actions", () => ({ updatePublicSiteSettingsAction }));

import type { PublicSiteSettings } from "@/lib/site/types";

import { SiteSettingsForm } from "./site-settings-form";

const branchId = "c1000000-0000-0000-0000-000000000001";

const settings: PublicSiteSettings = {
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: "A modern dental clinic.",
  contactPhone: "+63281234567",
  contactEmail: "hello@example.test",
  addressOverride: "Suite 12, 100 Example Avenue",
  operatingHours: { Monday: "8:00 AM - 5:00 PM", Saturday: "9:00 AM - 12:00 PM" },
  privacyNotice: "We respect your privacy.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: "https://booking.example.test",
  socialLinks: { facebook: "https://facebook.com/exampleclinic" },
  version: 3,
};

function renderForm() {
  return render(<SiteSettingsForm actingBranchId={branchId} initialSettings={settings} />);
}

function settingsFromForm(formData: FormData) {
  function recordPairs(prefix: string) {
    const result: Record<string, string> = {};
    let index = 0;
    while (true) {
      const key = String(formData.get(`${prefix}-key-${index}`) ?? "");
      const value = String(formData.get(`${prefix}-value-${index}`) ?? "");
      if (!key && !value) break;
      if (key) result[key] = value;
      index += 1;
    }
    return result;
  }
  return {
    actingBranchId: String(formData.get("actingBranchId")),
    expectedVersion: Number(formData.get("expectedVersion")),
    settings: {
      heroHeading: String(formData.get("heroHeading")),
      heroSubtext: String(formData.get("heroSubtext")),
      aboutText: String(formData.get("aboutText")),
      contactPhone: String(formData.get("contactPhone")),
      contactEmail: String(formData.get("contactEmail")),
      addressOverride: String(formData.get("addressOverride")),
      operatingHours: recordPairs("operatingHours"),
      privacyNotice: String(formData.get("privacyNotice")),
      messengerLink: String(formData.get("messengerLink")),
      bookingLink: String(formData.get("bookingLink")),
      socialLinks: recordPairs("socialLinks"),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updatePublicSiteSettingsAction.mockResolvedValue({ ok: true, message: "Website settings saved.", version: 4 });
});
afterEach(cleanup);

describe("SiteSettingsForm", () => {
  it("renders every admin-editable setting with its current value", () => {
    renderForm();

    expect(screen.getByLabelText(/Heading/)).toHaveValue("Smiles for the whole family");
    expect(screen.getByLabelText(/Subtext/)).toHaveValue("Gentle, honest dental care in one place.");
    expect(screen.getByLabelText(/About text/)).toHaveValue("A modern dental clinic.");
    expect(screen.getByLabelText(/Phone/)).toHaveValue("+63281234567");
    expect(screen.getByLabelText(/Email/)).toHaveValue("hello@example.test");
    expect(screen.getByLabelText(/Display address/)).toHaveValue("Suite 12, 100 Example Avenue");
    expect(screen.getByLabelText(/Privacy notice/)).toHaveValue("We respect your privacy.");
    expect(screen.getByLabelText(/Booking link/)).toHaveValue("https://booking.example.test");
    expect(screen.getByLabelText(/Messenger link/)).toHaveValue("https://m.me/exampleclinic");
    expect(screen.getByDisplayValue("8:00 AM - 5:00 PM")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9:00 AM - 12:00 PM")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://facebook.com/exampleclinic")).toBeInTheDocument();
  });

  it("uses the shared compact control height with 44px touch targets via the coarse-pointer stylesheet", () => {
    renderForm();

    for (const id of ["site-hero-heading", "site-hero-subtext", "site-about-text", "site-contact-phone", "site-contact-email", "site-address-override", "site-booking-link", "site-messenger-link", "site-privacy-notice"]) {
      const control = document.getElementById(id);
      expect(control).toBeInTheDocument();
      if (control instanceof HTMLInputElement) expect(control).toHaveClass("h-10");
    }
    expect(screen.getByRole("button", { name: "Save website settings" })).toHaveClass("min-h-11");
    expect(screen.getAllByRole("button", { name: "Add Operating hours" })[0]).toHaveClass("min-h-11");
    expect(screen.getAllByRole("button", { name: "Add Social links" })[0]).toHaveClass("min-h-11");
  });

  it("submits the full settings snapshot through the server action", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save website settings" }));

    await waitFor(() => expect(updatePublicSiteSettingsAction).toHaveBeenCalledTimes(1));
    const formData = updatePublicSiteSettingsAction.mock.calls[0][1] as FormData;
    expect(settingsFromForm(formData)).toEqual({
      actingBranchId: branchId,
      expectedVersion: 3,
      settings: {
        heroHeading: "Smiles for the whole family",
        heroSubtext: "Gentle, honest dental care in one place.",
        aboutText: "A modern dental clinic.",
        contactPhone: "+63281234567",
        contactEmail: "hello@example.test",
        addressOverride: "Suite 12, 100 Example Avenue",
        operatingHours: { Monday: "8:00 AM - 5:00 PM", Saturday: "9:00 AM - 12:00 PM" },
        privacyNotice: "We respect your privacy.",
        messengerLink: "https://m.me/exampleclinic",
        bookingLink: "https://booking.example.test",
        socialLinks: { facebook: "https://facebook.com/exampleclinic" },
      },
    });
  });

  it("shows a stale-version prompt and does not advance the optimistic version", async () => {
    updatePublicSiteSettingsAction.mockResolvedValue({ ok: false, message: "These website settings changed elsewhere. Reload and try again." });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save website settings" }));

    expect(await screen.findByText("These website settings changed elsewhere. Reload and try again.")).toHaveAttribute("role", "alert");
    expect(updatePublicSiteSettingsAction.mock.calls[0][1].get("expectedVersion")).toBe("3");
  });

  it("advances the optimistic version after a successful save", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save website settings" }));
    expect(await screen.findByText("Website settings saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save website settings" }));
    await waitFor(() => expect(updatePublicSiteSettingsAction).toHaveBeenCalledTimes(2));
    expect(updatePublicSiteSettingsAction.mock.calls[1][1].get("expectedVersion")).toBe("4");
  });

  it("shows a safe inline error when the action rejects validation", async () => {
    updatePublicSiteSettingsAction.mockResolvedValue({ fieldErrors: { "settings.heroHeading": ["Too long."] } });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save website settings" }));

    expect(await screen.findByText("Too long.")).toBeInTheDocument();
  });
});