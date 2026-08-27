// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getIntakeForm, getPublicSite, resolvePublicOrgSlug, IntakeServiceError } = vi.hoisted(() => ({
  getIntakeForm: vi.fn(),
  getPublicSite: vi.fn(),
  resolvePublicOrgSlug: vi.fn(),
  IntakeServiceError: class IntakeServiceError extends Error {},
}));

vi.mock("@/lib/intake/service", () => ({ getIntakeForm }));
vi.mock("@/lib/intake/errors", () => ({ IntakeServiceError }));
vi.mock("@/lib/site/service", () => ({ getPublicSite }));
vi.mock("@/lib/site/public-resolver", () => ({ resolvePublicOrgSlug }));

import type { IntakeFormDetail } from "@/lib/intake/types";

import IntakeTokenPage from "./page";

const orgSlug = "smilelab-demo-dental";
const token = "11111111-2222-3333-4444-555555555555";

const medicalDetail: IntakeFormDetail = {
  formId: "c7000000-0000-0000-0000-000000000007",
  formType: "MEDICAL_HISTORY",
  templateVersion: "v1",
  consentBody: null,
  privacyNotice: "Our clinic privacy notice.",
  expiresAt: "2026-09-03T09:00:00+00:00",
  status: "PENDING",
};

const consentDetail: IntakeFormDetail = {
  ...medicalDetail,
  formType: "CONSENT",
  consentBody: "We will keep your dental records private.",
};

const forbiddenTokens = ["Intake Patient", "P1701-A-0001", "diagnosis", "clinical notes", "patient search", "answers"];

beforeEach(() => {
  vi.clearAllMocks();
  resolvePublicOrgSlug.mockResolvedValue(orgSlug);
  getPublicSite.mockResolvedValue({ organizationName: "SmileLab Demo Dental", messengerLink: null });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public intake page", () => {
  it("renders the medical-history fields for a medical form link", async () => {
    getIntakeForm.mockResolvedValue(medicalDetail);

    render(await IntakeTokenPage({ params: Promise.resolve({ token }) }));

    expect(screen.getByRole("heading", { name: "Medical history" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /currently taking any medications/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Please describe your allergies/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit form" })).toBeInTheDocument();
    expect(getIntakeForm).toHaveBeenCalledWith(orgSlug, token);
  });

  it("renders the consent body and privacy acknowledgement for a consent link", async () => {
    getIntakeForm.mockResolvedValue(consentDetail);

    render(await IntakeTokenPage({ params: Promise.resolve({ token }) }));

    expect(screen.getByRole("heading", { name: "Consent" })).toBeInTheDocument();
    expect(screen.getByText("We will keep your dental records private.")).toBeInTheDocument();
    expect(screen.getByText("Our clinic privacy notice.")).toBeInTheDocument();
    expect(screen.getByLabelText(/I acknowledge the privacy notice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I consent" })).toBeInTheDocument();
  });

  it("shows the inert invalid-link message for a wrong or expired token", async () => {
    getIntakeForm.mockResolvedValue(null);

    render(await IntakeTokenPage({ params: Promise.resolve({ token }) }));

    expect(screen.getByRole("heading", { name: "Link not found" })).toBeInTheDocument();
    expect(screen.getByText(/This link is invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit form" })).not.toBeInTheDocument();
  });

  it("shows the invalid-link message when the service fails without leaking a reason", async () => {
    getIntakeForm.mockRejectedValue(new IntakeServiceError("NOT_FOUND"));

    render(await IntakeTokenPage({ params: Promise.resolve({ token }) }));

    expect(screen.getByText(/This link is invalid or has expired/)).toBeInTheDocument();
  });

  it("exposes no patient or clinical content in the rendered DOM", async () => {
    getIntakeForm.mockResolvedValue(medicalDetail);
    const { container } = render(await IntakeTokenPage({ params: Promise.resolve({ token }) }));
    const text = container.textContent ?? "";

    for (const tokenName of forbiddenTokens) {
      expect(text.toLowerCase()).not.toContain(tokenName);
    }
  });
});