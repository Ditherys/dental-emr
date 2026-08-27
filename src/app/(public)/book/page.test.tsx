// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicSite, loadBookingOptions, resolvePublicOrgSlug } = vi.hoisted(() => ({
  getPublicSite: vi.fn(),
  loadBookingOptions: vi.fn(),
  resolvePublicOrgSlug: vi.fn(),
}));

vi.mock("@/lib/site/service", () => ({ getPublicSite }));
vi.mock("@/lib/site/public-resolver", () => ({ resolvePublicOrgSlug }));
vi.mock("@/lib/booking/options", () => ({ loadBookingOptions }));

import type { BookingOptions } from "@/lib/booking/options";

import BookPage from "./page";

const orgSlug = "smilelab-demo-dental";

const options: BookingOptions = {
  procedures: [
    { code: "CLEANING", name: "Teeth cleaning", description: "Professional cleaning.", isInstant: true },
    { code: "IMPLANT", name: "Implant consult", description: "Specialist review.", isInstant: false },
  ],
  providers: [{ providerId: "c6000000-0000-0000-0000-000000000006", displayName: "Dr. Jose Dela Cruz" }],
};

const forbiddenTokens = ["patient search", "diagnosis", "clinical", "medical history", "treatment notes", "billing", "PhilHealth"];

beforeEach(() => {
  vi.clearAllMocks();
  resolvePublicOrgSlug.mockResolvedValue(orgSlug);
  getPublicSite.mockResolvedValue({ organizationName: "SmileLab Demo Dental", messengerLink: null });
  loadBookingOptions.mockResolvedValue(options);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ slots: [] }), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public book page", () => {
  it("renders the minimal booking form with no patient search", async () => {
    render(await BookPage());

    expect(screen.getByRole("heading", { name: "Book an appointment" })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Birth date")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit booking request" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("exposes only website-visible procedures and providers", async () => {
    render(await BookPage());

    expect(screen.getByRole("option", { name: "Teeth cleaning" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Implant consult" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "CLEANING" } });
    expect(screen.getByRole("option", { name: "Dr. Jose Dela Cruz" })).toBeInTheDocument();

    expect(loadBookingOptions).toHaveBeenCalledWith(orgSlug);
  });

  it("exposes no patient or clinical content in the rendered DOM", async () => {
    const { container } = render(await BookPage());
    const text = container.textContent ?? "";

    for (const token of forbiddenTokens) {
      expect(text.toLowerCase()).not.toContain(token);
    }
  });

  it("renders a graceful placeholder when no public org resolves", async () => {
    resolvePublicOrgSlug.mockResolvedValueOnce(null);

    render(await BookPage());

    expect(screen.getByRole("heading", { name: "Booking" })).toBeInTheDocument();
    expect(screen.getByText(/Online booking is not available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit booking request" })).not.toBeInTheDocument();
  });
});