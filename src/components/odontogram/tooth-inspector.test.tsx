// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  amendToothClinicalEntryAction: vi.fn(),
  voidToothClinicalEntryAction: vi.fn(),
  resolveLegacyOdontogramEntryAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => mocks);

import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import { ToothInspector } from "./tooth-inspector";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

const entry = {
  id: "c4000000-0000-0000-0000-000000000004",
  patient_id: patientId,
  tooth_code: "16",
  kind: "FINDING",
  clinical_code: "CARIES",
  status: "ACTIVE",
  lifecycle: "OPEN",
  event_state: "CURRENT",
  provenance: "INTERNAL",
  notes: "Synthetic entry",
  version: 1,
  recorded_at: "2026-03-09T04:00:00+00:00",
  recorded_by: null,
  treating_provider_id: null,
  encounter_id: null,
  treatment_plan_item_id: null,
  charge_id: null,
  effective_at: null,
  completed_at: null,
  voided_at: null,
  supersedes_entry_id: null,
  superseded_by_entry_id: null,
  surfaces: ["O"],
} as unknown as ToothClinicalEntryDTO;

const dto = {
  patientId,
  entries: [entry],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
} as PatientOdontogramDTO;

function renderInspector(overrides: Partial<Parameters<typeof ToothInspector>[0]> = {}) {
  const onMutated = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ToothInspector
      patientId={patientId}
      actingBranchId={branchId}
      fdi={16}
      dto={dto}
      notation="FDI"
      canWriteClinical
      onClose={onClose}
      onMutated={onMutated}
      {...overrides}
    />,
  );
  return { ...utils, onMutated, onClose };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.amendToothClinicalEntryAction.mockResolvedValue({ ok: true });
  mocks.voidToothClinicalEntryAction.mockResolvedValue({ ok: true });
});

describe("ToothInspector correction surface", () => {
  it("no longer offers the permanent details/history stack, the record dialog, Done, or the relationship cards", () => {
    renderInspector();

    // The record composer owns clinical writes now; the drawer owns state and
    // history. Only corrections remain here.
    expect(screen.queryByRole("tab", { name: /details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /history/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record finding or treatment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(screen.queryByText("Bridge workflow")).not.toBeInTheDocument();
    expect(screen.queryByText("Implant workflow")).not.toBeInTheDocument();
  });

  it("keeps amend reachable and waits for the parent refetch before refreshing the route", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const onMutated = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    renderInspector({ onMutated });

    await user.click(screen.getByRole("button", { name: "Amend" }));
    await user.click(screen.getByRole("button", { name: "Save amendment" }));

    await waitFor(() => expect(mocks.amendToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    expect(mocks.amendToothClinicalEntryAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      entryId: entry.id,
      expectedVersion: 1,
      notes: "Synthetic entry",
    });
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
    release?.();
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("keeps void reachable and reports a denied correction without leaking the database message", async () => {
    const user = userEvent.setup();
    mocks.voidToothClinicalEntryAction.mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    renderInspector();

    await user.click(screen.getByRole("button", { name: "Void" }));
    await user.click(screen.getByRole("button", { name: "Void entry" }));

    await waitFor(() => expect(mocks.voidToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(/access or selected branch changed/i);
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });

  it("hides every correction affordance in read-only clinical state", () => {
    renderInspector({ canWriteClinical: false });

    expect(screen.queryByRole("button", { name: "Amend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only access/i)).toBeVisible();
  });

  it("keeps touch targets safe on the correction controls", () => {
    renderInspector();

    expect(screen.getByRole("button", { name: "Amend" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Void" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("min-h-11");
  });
});
