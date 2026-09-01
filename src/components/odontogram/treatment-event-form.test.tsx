/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordTreatmentEventAction, refresh } = vi.hoisted(() => ({
  recordTreatmentEventAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({ recordTreatmentEventAction }));

import { TreatmentEventForm, deriveTreatmentRequestKey } from "./treatment-event-form";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";
const fillingId = "c3000000-0000-0000-0000-000000000003";
const implantId = "c3000000-0000-0000-0000-000000000004";
const caseId = "c5000000-0000-0000-0000-000000000005";
const cashMethodId = "c6000000-0000-0000-0000-000000000006";

const procedures = [
  { procedureId: fillingId, name: "Synthetic composite filling" },
  { procedureId: implantId, name: "Synthetic implant placement" },
];

const activeFindings = [
  { entryId: "c7000000-0000-0000-0000-000000000007", toothCode: "16", findingCode: "CARIES", label: "Caries · tooth 16 · O, M" },
  { entryId: "c7000000-0000-0000-0000-000000000008", toothCode: "16", findingCode: "MISSING", label: "Missing · tooth 16" },
  { entryId: "c7000000-0000-0000-0000-000000000009", toothCode: "26", findingCode: "CARIES", label: "Caries · tooth 26 · O" },
];

function renderForm(overrides: Partial<React.ComponentProps<typeof TreatmentEventForm>> = {}) {
  const onServiceDateChange = vi.fn();
  const onRecorded = vi.fn();
  const props = {
    patientId,
    branchId,
    patientIdentifier: "TEV-A-1 · Patient A1",
    toothCodes: ["16"] as readonly string[],
    serviceDate: "2026-09-01",
    onServiceDateChange,
    procedures,
    activeFindings,
    planItems: [],
    openCases: [],
    paymentMethods: [{ paymentMethodId: cashMethodId, name: "Cash" }],
    onRecorded,
    ...overrides,
  };
  return { ...render(<TreatmentEventForm {...props} />), onServiceDateChange, onRecorded, props };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  recordTreatmentEventAction.mockResolvedValue({ ok: true });
});

describe("deriveTreatmentRequestKey", () => {
  it("is stable for the same facts and different after an edit", async () => {
    const facts = { procedureId: fillingId, amountCentavos: 250000 };
    const first = await deriveTreatmentRequestKey(facts);
    const again = await deriveTreatmentRequestKey({ ...facts });
    const edited = await deriveTreatmentRequestKey({ ...facts, amountCentavos: 260000 });

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(again).toBe(first);
    expect(edited).not.toBe(first);
    // Reverting the edit returns to the original key, so a retry replays rather
    // than double-charging.
    expect(await deriveTreatmentRequestKey({ ...facts })).toBe(first);
  });
});

describe("TreatmentEventForm", () => {
  it("requires a performed date", () => {
    renderForm();
    expect(screen.getByLabelText(/performed date/i)).toBeRequired();
  });

  it("offers only findings compatible with the selected treatment, and no mark-tooth-healthy shortcut", async () => {
    const user = userEvent.setup();
    renderForm();

    // A restoration can resolve caries on a treated tooth, but not a missing tooth.
    expect(screen.getByLabelText(/Caries · tooth 16/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Missing · tooth 16/)).not.toBeInTheDocument();
    // A finding on a tooth this event does not treat is never offered.
    expect(screen.queryByLabelText(/Caries · tooth 26/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^treatment$/i), "IMPLANT");

    expect(screen.getByLabelText(/Missing · tooth 16/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Caries · tooth 16/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark tooth healthy/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mark tooth healthy/i)).not.toBeInTheDocument();
  });

  it("shows the charge confirmation before writing and cancels without writing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByLabelText(/occlusal/i));
    fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: "2500.00" } });
    await user.click(screen.getByRole("button", { name: /review charge/i }));

    expect(await screen.findByText(/2,500\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(recordTreatmentEventAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/actual cost/i)).toHaveValue("2500.00");
  });

  it("submits route context and clinical facts only, with no forged attribution", async () => {
    const user = userEvent.setup();
    const { onRecorded } = renderForm();

    await user.click(screen.getByLabelText(/Caries · tooth 16/));
    await user.click(screen.getByLabelText(/occlusal/i));
    fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: "2500.00" } });
    await user.click(screen.getByRole("button", { name: /review charge/i }));
    await user.click(await screen.findByRole("button", { name: /cannot be edited after/i }));

    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(1));
    const submitted = recordTreatmentEventAction.mock.calls[0][0];
    expect(submitted).toMatchObject({
      patientId,
      branchId,
      procedureId: fillingId,
      eventKind: "PERFORMED",
      serviceDate: "2026-09-01",
      chargeAmountCentavos: 250000,
      resolvedFindingIds: ["c7000000-0000-0000-0000-000000000007"],
    });
    expect(submitted.clinicalDetail).toMatchObject({
      toothCodes: ["16"],
      detail: { code: "RESTORATION", material: "composite" },
    });
    for (const forbidden of ["organizationId", "treatingProviderId", "createdBy", "providerDisplay", "encounterId"]) {
      expect(submitted).not.toHaveProperty(forbidden);
    }
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });

  it("refuses an over-precise, zero, or negative cost before any server call", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByLabelText(/occlusal/i));
    for (const amount of ["2500.555", "0", "-10"]) {
      fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: amount } });
      await user.click(screen.getByRole("button", { name: /review charge/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/cost/i);
      expect(screen.queryByRole("button", { name: /cannot be edited after/i })).not.toBeInTheDocument();
    }
    expect(recordTreatmentEventAction).not.toHaveBeenCalled();
  });

  it("records a follow-up against an existing case with no charge and no confirmation dialog", async () => {
    const user = userEvent.setup();
    renderForm({
      openCases: [
        { procedureCaseId: caseId, caseVersion: 3, procedureId: fillingId, label: "Composite filling · opened 2026-08-01" },
      ],
    });

    await user.selectOptions(screen.getByLabelText(/^treatment$/i), "ORTHODONTIC");
    await user.selectOptions(screen.getByLabelText(/lifecycle/i), "FOLLOW_UP");

    expect(screen.queryByLabelText(/actual cost/i)).not.toBeInTheDocument();
    expect(screen.getByText(/original charge/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /record follow-up/i }));

    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(1));
    const submitted = recordTreatmentEventAction.mock.calls[0][0];
    expect(submitted).toMatchObject({
      eventKind: "FOLLOW_UP",
      existingCaseId: caseId,
      expectedCaseVersion: 3,
    });
    expect(submitted.chargeAmountCentavos).toBeNull();
  });

  it("allocates an immediate payment only to the case being recorded", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByLabelText(/occlusal/i));
    fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: "2500.00" } });
    await user.selectOptions(screen.getByLabelText(/payment option/i), "PAY_NOW");
    fireEvent.change(screen.getByLabelText(/payment amount/i), { target: { value: "1000.00" } });
    await user.click(screen.getByRole("button", { name: /review charge/i }));
    await user.click(await screen.findByRole("button", { name: /cannot be edited after/i }));

    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(1));
    expect(recordTreatmentEventAction.mock.calls[0][0].immediatePayment).toMatchObject({
      paymentMethodId: cashMethodId,
      amountCentavos: 100000,
      paymentDate: "2026-09-01",
    });
  });

  it("reuses the request key for an unmodified retry and rotates it after an edit", async () => {
    const user = userEvent.setup();
    recordTreatmentEventAction.mockResolvedValue({ ok: false, code: "FAILED" });
    renderForm();

    await user.click(screen.getByLabelText(/occlusal/i));
    fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: "2500.00" } });
    await user.click(screen.getByRole("button", { name: /review charge/i }));
    await user.click(await screen.findByRole("button", { name: /cannot be edited after/i }));
    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(1));
    const firstKey = recordTreatmentEventAction.mock.calls[0][0].idempotencyKey;

    await user.click(await screen.findByRole("button", { name: /^retry$/i }));
    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(2));
    expect(recordTreatmentEventAction.mock.calls[1][0].idempotencyKey).toBe(firstKey);

    fireEvent.change(screen.getByLabelText(/actual cost/i), { target: { value: "2600.00" } });
    await user.click(screen.getByRole("button", { name: /review charge/i }));
    await user.click(await screen.findByRole("button", { name: /cannot be edited after/i }));
    await waitFor(() => expect(recordTreatmentEventAction).toHaveBeenCalledTimes(3));
    expect(recordTreatmentEventAction.mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
  });

  it("keeps every control at a safe touch size and uses no inline style", () => {
    const { container } = renderForm();

    for (const control of container.querySelectorAll("button, select, input[type='date'], input[type='text']")) {
      expect(control.className).toMatch(/min-h-11/);
    }
    expect(container.querySelector("[style]")).toBeNull();
  });
});
