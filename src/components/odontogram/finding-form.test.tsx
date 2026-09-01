// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitToothFindingsAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitToothFindingsAction: mocks.recordVisitToothFindingsAction,
}));

import { FindingForm } from "./finding-form";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

function renderForm(overrides: Partial<Parameters<typeof FindingForm>[0]> = {}) {
  const onRecorded = vi.fn();
  const onClinicalDateChange = vi.fn();
  const utils = render(
    <FindingForm
      patientId={patientId}
      branchId={branchId}
      toothCodes={["16"]}
      clinicalDate="2026-09-01"
      onClinicalDateChange={onClinicalDateChange}
      onRecorded={onRecorded}
      {...overrides}
    />,
  );
  return { ...utils, onRecorded, onClinicalDateChange };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: true });
});

describe("FindingForm canonical write", () => {
  it("submits route context, the selected teeth, surfaces, the explicit clinical date and a uuid idempotency key", async () => {
    const user = userEvent.setup();
    const { onRecorded } = renderForm({ toothCodes: ["16", "17"] });

    await user.selectOptions(screen.getByLabelText("Finding"), "CARIES");
    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("checkbox", { name: /mesial/i }));
    await user.type(screen.getByLabelText(/^Note/), "Synthetic occlusal caries");
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
    const input = mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toEqual({
      patientId,
      branchId,
      toothCodes: ["16", "17"],
      findingCode: "CARIES",
      surfaces: ["O", "M"],
      status: "ACTIVE",
      clinicalDate: "2026-09-01",
      note: "Synthetic occlusal caries",
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    });
    expect(input).not.toHaveProperty("organizationId");
    expect(input).not.toHaveProperty("treatingProviderId");
    expect(input).not.toHaveProperty("createdBy");
    expect(onRecorded).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("carries an explicitly edited clinical date up to the composer and into the write", async () => {
    const { onClinicalDateChange, rerender } = renderForm();

    fireEvent.change(screen.getByLabelText("Clinical date"), { target: { value: "2026-08-20" } });
    expect(onClinicalDateChange).toHaveBeenCalledWith("2026-08-20");

    rerender(
      <FindingForm
        patientId={patientId}
        branchId={branchId}
        toothCodes={["16"]}
        clinicalDate="2026-08-20"
        onClinicalDateChange={onClinicalDateChange}
        onRecorded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    fireEvent.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
    expect(mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0]).toMatchObject({ clinicalDate: "2026-08-20" });
  });

  it("offers only the surfaces every selected tooth actually owns", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm({ toothCodes: ["11"] });

    expect(screen.getByRole("checkbox", { name: /incisal/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /occlusal/i })).not.toBeInTheDocument();

    rerender(
      <FindingForm
        patientId={patientId}
        branchId={branchId}
        toothCodes={["11", "16"]}
        clinicalDate="2026-09-01"
        onClinicalDateChange={vi.fn()}
        onRecorded={vi.fn()}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: /incisal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /occlusal/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /buccal/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Finding"), "MISSING");
    expect(screen.queryByRole("group", { name: "Surfaces" })).not.toBeInTheDocument();
  });

  it("requires a surface for a surface finding and refuses one for a whole-tooth finding", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Record finding" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one surface/i);
    expect(mocks.recordVisitToothFindingsAction).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Finding"), "MISSING");
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
    expect(mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0]).toMatchObject({
      findingCode: "MISSING",
      surfaces: [],
    });
  });

  it("shows a safe retry error and records no unsaved finding when persistence fails", async () => {
    const user = userEvent.setup();
    mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: false, code: "CONFLICT" });
    const { onRecorded } = renderForm();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be recorded/i);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
    // Nothing may be presented as recorded before the server confirms it.
    expect(screen.queryByText(/finding recorded/i)).not.toBeInTheDocument();

    mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: true });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const retry = mocks.recordVisitToothFindingsAction.mock.calls[1]?.[0] as { idempotencyKey: string };
    // A retry after an ambiguous failure must replay the same request key.
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("rotates the request key when the clinical facts change after a failure", async () => {
    const user = userEvent.setup();
    // The ambiguous case: the request may have committed before the response was
    // lost. Replaying its key for an *edited* finding would return the original
    // server result and report the edit as recorded when it never was.
    mocks.recordVisitToothFindingsAction.mockRejectedValueOnce(new Error("network"));
    renderForm();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be recorded/i);

    mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: true });
    await user.selectOptions(screen.getByLabelText("Finding"), "SEALANT");
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const edited = mocks.recordVisitToothFindingsAction.mock.calls[1]?.[0] as { idempotencyKey: string; findingCode: string };
    expect(edited.findingCode).toBe("SEALANT");
    expect(edited.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it.each([
    ["surface", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("checkbox", { name: /buccal/i }))],
    ["clinical date", async () => { fireEvent.change(screen.getByLabelText("Clinical date"), { target: { value: "2026-08-11" } }); }],
    ["note", async (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByLabelText(/^Note/), "Edited")],
  ])("rotates the request key when the %s changes after a failure", async (_label, edit) => {
    const user = userEvent.setup();
    mocks.recordVisitToothFindingsAction.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    renderForm();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));
    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));

    await edit(user);
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const second = mocks.recordVisitToothFindingsAction.mock.calls[1]?.[0] as { idempotencyKey: string };
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("uses a fresh request key for a genuinely new finding", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));
    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("checkbox", { name: /buccal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));
    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(2));

    const first = mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const second = mocks.recordVisitToothFindingsAction.mock.calls[1]?.[0] as { idempotencyKey: string };
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("blocks a duplicate submission while the first one is still in flight", async () => {
    const user = userEvent.setup();
    let release: ((value: { ok: true }) => void) | undefined;
    mocks.recordVisitToothFindingsAction.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );
    renderForm();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));
    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /recording/i }));

    release?.({ ok: true });
    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
  });

  it("keeps hit areas touch safe and uses no inline style or JS hover handler", () => {
    const { container } = renderForm();

    expect(screen.getByRole("button", { name: "Record finding" }).className).toContain("min-h-11");
    for (const element of container.querySelectorAll("input, select, textarea, button")) {
      expect(element.getAttribute("style")).toBeNull();
    }
  });
});
