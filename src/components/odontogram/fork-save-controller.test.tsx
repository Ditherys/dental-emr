// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type * as React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordToothClinicalEntryAction } = vi.hoisted(() => ({
  recordToothClinicalEntryAction: vi.fn(),
}));

vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({ recordToothClinicalEntryAction }));

import type { ForkClinicalDraft } from "@/lib/odontogram/fork-adapter";
import { ForkSaveController } from "./fork-save-controller";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";

const cariesDraft: ForkClinicalDraft = {
  toothCode: "16",
  surfaces: ["O", "B"],
  kind: "FINDING",
  status: "ACTIVE",
  detail: { code: "CARIES", depth: "DENTIN", icdas: 3, cars: null, radiographicDepth: null },
  note: "Monitor after restoration",
};

const rootCanalDraft: ForkClinicalDraft = {
  toothCode: "11",
  surfaces: ["O"],
  kind: "TREATMENT",
  status: "ACTIVE",
  detail: { code: "ROOT_CANAL", state: "endo-filling" },
  note: null,
};

function renderController(overrides: Partial<React.ComponentProps<typeof ForkSaveController>> = {}) {
  return render(
    <ForkSaveController
      patientId={patientId}
      actingBranchId={branchId}
      canWriteClinical
      drafts={[cariesDraft]}
      onSaved={vi.fn()}
      onError={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ForkSaveController", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    recordToothClinicalEntryAction.mockResolvedValue({ ok: true });
  });

  it("requires confirmation with occurrence details and sends only route-scoped canonical fields", async () => {
    const user = userEvent.setup();
    renderController();

    await user.click(screen.getByRole("button", { name: /review chart change/i }));
    expect(screen.getByText(/tooth 16/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/O, B/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/occurrence date/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/clinical note/i)).toHaveValue("Monitor after restoration");
    expect(within(dialog).queryByLabelText(/provider/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/occurrence date/i), "2026-08-30");
    await user.click(screen.getByRole("button", { name: /confirm chart change/i }));

    await waitFor(() => expect(recordToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    const input = recordToothClinicalEntryAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      actingBranchId: branchId,
      patientId,
      toothCode: "16",
      surfaces: ["O", "B"],
      kind: "FINDING",
      status: "ACTIVE",
      detail: cariesDraft.detail,
      notes: "Monitor after restoration",
      occurredAt: "2026-08-30T12:00:00+08:00",
    });
    expect(input).not.toHaveProperty("providerId");
    expect(input).not.toHaveProperty("organizationId");
    expect(input.idempotencyKey).toEqual(expect.any(String));
  });

  it("deduplicates equal drafts and does not resubmit a confirmed fingerprint", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const view = renderController({ drafts: [cariesDraft, { ...cariesDraft }] as readonly ForkClinicalDraft[], onSaved });

    expect(screen.getAllByText(/tooth 16/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /review chart change/i }));
    await user.type(screen.getByLabelText(/occurrence date/i), "2026-08-30");
    await user.click(screen.getByRole("button", { name: /confirm chart change/i }));
    await waitFor(() => expect(recordToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    view.rerender(
      <ForkSaveController
        patientId={patientId}
        actingBranchId={branchId}
        canWriteClinical
        drafts={[cariesDraft]}
        onSaved={onSaved}
        onError={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /review chart change/i })).not.toBeInTheDocument();
    expect(recordToothClinicalEntryAction).toHaveBeenCalledTimes(1);
  });

  it("serializes rapid drafts and gives each confirmed mutation a fresh idempotency key", async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: { ok: true }) => void) | undefined;
    recordToothClinicalEntryAction
      .mockImplementationOnce(() => new Promise<{ ok: true }>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true });
    renderController({ drafts: [cariesDraft, rootCanalDraft] });

    const reviewButtons = screen.getAllByRole("button", { name: /review chart change/i });
    expect(reviewButtons).toHaveLength(1);
    await user.click(reviewButtons[0]!);
    await user.type(screen.getByLabelText(/occurrence date/i), "2026-08-30");
    await user.click(screen.getByRole("button", { name: /confirm chart change/i }));
    await waitFor(() => expect(recordToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/root canal/i)).not.toBeInTheDocument();

    resolveFirst?.({ ok: true });
    await waitFor(() => expect(screen.getByRole("button", { name: /review chart change/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /review chart change/i }));
    await user.type(screen.getByLabelText(/occurrence date/i), "2026-08-31");
    await user.click(screen.getByRole("button", { name: /confirm chart change/i }));
    await waitFor(() => expect(recordToothClinicalEntryAction).toHaveBeenCalledTimes(2));
    const firstKey = (recordToothClinicalEntryAction.mock.calls[0]?.[0] as { idempotencyKey: string }).idempotencyKey;
    const secondKey = (recordToothClinicalEntryAction.mock.calls[1]?.[0] as { idempotencyKey: string }).idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it("is a no-op in read-only mode", () => {
    renderController({ canWriteClinical: false });
    expect(screen.queryByRole("button", { name: /review chart change/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(recordToothClinicalEntryAction).not.toHaveBeenCalled();
  });

  it("retains a failed or stale draft and exposes retry without dropping it", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    recordToothClinicalEntryAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    renderController({ onError });

    await user.click(screen.getByRole("button", { name: /review chart change/i }));
    await user.type(screen.getByLabelText(/occurrence date/i), "2026-08-30");
    await user.click(screen.getByRole("button", { name: /confirm chart change/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/changed|refresh/i)));
    expect(screen.getByText(/tooth 16/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry chart change/i })).toBeInTheDocument();
  });
});
