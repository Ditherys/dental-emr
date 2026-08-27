// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IntakeFormDetail } from "@/lib/intake/types";

import { IntakeForm } from "./intake-form";

const orgSlug = "smilelab-demo-dental";
const token = "11111111-2222-3333-4444-555555555555";
const formId = "c7000000-0000-0000-0000-000000000007";

const medicalDetail: IntakeFormDetail = {
  formId,
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

const fetchMock = vi.fn();

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntakeForm", () => {
  it("submits the bounded answers for a medical-history form and shows confirmation", async () => {
    fetchMock.mockResolvedValueOnce(response({ formId, status: "SUBMITTED", submittedAt: "2026-08-27T09:30:00+00:00" }, 200));
    render(<IntakeForm orgSlug={orgSlug} token={token} detail={medicalDetail} organizationName="SmileLab Demo Dental" />);

    fireEvent.click(within(screen.getByRole("radiogroup", { name: /currently taking any medications/ })).getByRole("radio", { name: "No" }));
    fireEvent.change(screen.getByLabelText(/Please describe your allergies/), { target: { value: "None" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit form" }));

    expect(await screen.findByRole("heading", { name: "Form submitted" })).toBeInTheDocument();
    expect(screen.getByText("Status: SUBMITTED")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/public/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, token, answers: { hasMedications: "no", allergyDetails: "None" }, privacyAcknowledged: false }),
    });
  });

  it("requires the privacy acknowledgement before submitting a consent form", async () => {
    render(<IntakeForm orgSlug={orgSlug} token={token} detail={consentDetail} organizationName="SmileLab Demo Dental" />);

    const submitButton = screen.getByRole("button", { name: "I consent" });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I acknowledge the privacy notice/));
    expect(screen.getByRole("button", { name: "I consent" })).toBeEnabled();
  });

  it("submits a consent form with the acknowledgement and confirmation", async () => {
    fetchMock.mockResolvedValueOnce(response({ formId, status: "SUBMITTED", submittedAt: "2026-08-27T09:30:00+00:00" }, 200));
    render(<IntakeForm orgSlug={orgSlug} token={token} detail={consentDetail} organizationName="SmileLab Demo Dental" />);

    fireEvent.click(screen.getByLabelText(/I acknowledge the privacy notice/));
    fireEvent.click(screen.getByRole("button", { name: "I consent" }));

    expect(await screen.findByRole("heading", { name: "Form submitted" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/public/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, token, answers: { consentGiven: "yes" }, privacyAcknowledged: true }),
    });
  });

  it("shows the invalid-link message for a 404 submission", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "This link is invalid or has expired." }, 404));
    render(<IntakeForm orgSlug={orgSlug} token={token} detail={medicalDetail} organizationName={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit form" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/);
  });

  it("shows a generic error on failure without echoing submitted answers", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "boom" }, 500));
    render(<IntakeForm orgSlug={orgSlug} token={token} detail={medicalDetail} organizationName={null} />);

    fireEvent.change(screen.getByLabelText(/Please describe your allergies/), { target: { value: "secret-medication" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit form" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be submitted/);
    expect(alert.textContent).not.toContain("secret-medication");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Form submitted" })).not.toBeInTheDocument());
  });
});