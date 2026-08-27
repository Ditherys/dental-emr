// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingOptions } from "@/lib/booking/options";

import { BookingForm } from "./booking-form";

const orgSlug = "smilelab-demo-dental";
const requestId = "c7000000-0000-0000-0000-000000000007";
const managementToken = "11111111-2222-3333-4444-555555555555";
const providerId = "c6000000-0000-0000-0000-000000000006";
const slotStartsAt = "2026-09-01T09:00:00+00:00";
const slotEndsAt = "2026-09-01T09:30:00+00:00";
const idempotencyKey = "11111111-2222-3333-4444-555555555555";

const options: BookingOptions = {
  procedures: [
    { code: "CLEANING", name: "Teeth cleaning", description: "Professional cleaning.", isInstant: true },
    { code: "IMPLANT", name: "Implant consult", description: "Specialist review.", isInstant: false },
  ],
  providers: [{ providerId, displayName: "Dr. Jose Dela Cruz" }],
};

const fetchMock = vi.fn();

function renderForm() {
  return render(
    <BookingForm orgSlug={orgSlug} organizationName="SmileLab Demo Dental" options={options} />,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Juan" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Dela Cruz" } });
  fireEvent.change(screen.getByLabelText("Birth date"), { target: { value: "1990-05-20" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+639181234567" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  const originalCrypto = globalThis.crypto;
  vi.stubGlobal("crypto", {
    ...(originalCrypto && typeof originalCrypto === "object"
      ? { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) }
      : {}),
    randomUUID: vi.fn(() => idempotencyKey),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BookingForm", () => {
  it("renders only the minimal booking fields", () => {
    renderForm();

    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Birth date")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit booking request" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("shows real slots for an instant procedure", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/public/booking/slots")) {
        return new Response(JSON.stringify({ slots: [{ startsAt: slotStartsAt, endsAt: slotEndsAt }] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "CLEANING" } });

    const slotButtons = await screen.findAllByRole("radio");
    expect(slotButtons.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/booking/slots?slug=${orgSlug}&procedureCode=CLEANING&daysAhead=7`,
    );
  });

  it("shows a review note and no slot picker for a request-only procedure", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "IMPLANT" } });

    expect(screen.getByText(/reviewed by our clinic first/i)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the allowlisted payload and shows the management token once", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/public/booking/slots")) {
        return new Response(JSON.stringify({ slots: [{ startsAt: slotStartsAt, endsAt: slotEndsAt }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ requestId, managementToken, status: "SUBMITTED", holdExpiresAt: null }),
        { status: 200 },
      );
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "CLEANING" } });
    const slotButtons = await screen.findAllByRole("radio");
    fireEvent.click(slotButtons[0]);

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Submit booking request" }));

    await waitFor(() => expect(screen.getByTestId("management-token")).toHaveTextContent(managementToken));
    expect(screen.getByText(/Save your management code/)).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/public/booking"))!;
    expect(JSON.parse(String(init?.body))).toEqual({
      orgSlug,
      submission: {
        firstName: "Juan",
        lastName: "Dela Cruz",
        birthDate: "1990-05-20",
        mobile: "+639181234567",
        email: null,
        requestedProcedureCode: "CLEANING",
        requestedProviderId: null,
        requestedStartsAt: slotStartsAt,
        idempotencyKey,
        acquisitionSourceCode: null,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /I've saved this code/i }));
    expect(screen.queryByTestId("management-token")).not.toBeInTheDocument();
  });

  it("submits a request-only booking without a slot", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/public/booking")) {
        return new Response(
          JSON.stringify({ requestId, managementToken, status: "SUBMITTED", holdExpiresAt: null }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "IMPLANT" } });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Submit booking request" }));

    await waitFor(() => expect(screen.getByTestId("management-token")).toHaveTextContent(managementToken));

    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/public/booking"))!;
    expect(JSON.parse(String(init?.body))).toEqual({
      orgSlug,
      submission: expect.objectContaining({
        requestedProcedureCode: "IMPLANT",
        requestedStartsAt: null,
      }),
    });
  });

  it("shows a safe message when a submit reports the slot is no longer available", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/public/booking/slots")) {
        return new Response(JSON.stringify({ slots: [{ startsAt: slotStartsAt, endsAt: slotEndsAt }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: "That time is no longer available. Choose another slot and try again." }),
        { status: 409 },
      );
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "CLEANING" } });
    const slotButtons = await screen.findAllByRole("radio");
    fireEvent.click(slotButtons[0]);

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Submit booking request" }));

    expect(await screen.findByText(/That time is no longer available/)).toBeInTheDocument();
    expect(screen.queryByTestId("management-token")).not.toBeInTheDocument();
  });

  it("keeps 44px touch targets on the primary controls", async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/public/booking/slots")) {
        return new Response(JSON.stringify({ slots: [{ startsAt: slotStartsAt, endsAt: slotEndsAt }] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });
    renderForm();

    expect(screen.getByRole("button", { name: "Submit booking request" })).toHaveClass("min-h-11");
    expect(screen.getByLabelText("First name")).toHaveClass("h-11");
    expect(screen.getByLabelText("Mobile number")).toHaveClass("h-11");

    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "CLEANING" } });
    const slotButtons = await screen.findAllByRole("radio");
    expect(slotButtons[0]).toHaveClass("min-h-11");
  });
});