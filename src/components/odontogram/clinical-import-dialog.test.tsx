// @vitest-environment jsdom

import * as React from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyClinicalImportBatchAction,
  archiveClinicalImportBatchAction,
  createClinicalImportBatchAction,
  getClinicalImportBatchAction,
} = vi.hoisted(() => ({
  applyClinicalImportBatchAction: vi.fn(),
  archiveClinicalImportBatchAction: vi.fn(),
  createClinicalImportBatchAction: vi.fn(),
  getClinicalImportBatchAction: vi.fn(),
}));

vi.mock("@/app/(emr)/patients/[patientId]/odontogram-interchange-actions", () => ({
  applyClinicalImportBatchAction,
  archiveClinicalImportBatchAction,
  createClinicalImportBatchAction,
  getClinicalImportBatchAction,
}));

import { ClinicalImportDialog } from "./clinical-import-dialog";

const patientId = "22222222-2222-4222-8222-222222222222";
const otherPatientId = "77777777-7777-4777-8777-777777777777";
const branchId = "11111111-1111-4111-8111-111111111111";
const batchId = "33333333-3333-4333-8333-333333333333";

const NEW_ID = "44444444-4444-4444-8444-000000000001";
const DUPLICATE_ID = "44444444-4444-4444-8444-000000000002";
const CONFLICT_ID = "44444444-4444-4444-8444-000000000003";
const UNSUPPORTED_ID = "44444444-4444-4444-8444-000000000004";

function candidate(
  candidateId: string,
  ordinal: number,
  classification: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    candidateId,
    ordinal,
    classification,
    kind: "TOOTH_FINDING",
    toothCode: "17",
    clinicalCode: "CARIES",
    surfaces: ["O"],
    clinicalDate: "2026-08-01",
    note: null,
    unsupportedLabel: null,
    unsupportedReason: null,
    appliedAt: null,
    ...overrides,
  };
}

const batch = {
  batchId,
  status: "STAGED" as const,
  format: "EMR_JSON_V1" as const,
  sourceDigest: "a".repeat(64),
  stagedCount: 4,
  createdAt: "2026-09-01T01:00:00+00:00",
  candidates: [
    candidate(NEW_ID, 1, "NEW"),
    candidate(DUPLICATE_ID, 2, "DUPLICATE", { toothCode: "16" }),
    candidate(CONFLICT_ID, 3, "CONFLICT", { toothCode: "16", clinicalCode: "RESTORATION" }),
    candidate(UNSUPPORTED_ID, 4, "UNSUPPORTED", {
      kind: "UNSUPPORTED",
      toothCode: null,
      clinicalCode: null,
      surfaces: [],
      clinicalDate: null,
      unsupportedLabel: "Organization",
      unsupportedReason: "UNSUPPORTED_RESOURCE",
    }),
  ],
};

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn();
  const utils = render(
    <ClinicalImportDialog
      open
      onOpenChange={onOpenChange}
      patientId={patientId}
      branchId={branchId}
      providerDisplay="Dr Synthetic"
      clinicalDate="2026-09-01"
      onApplied={onApplied}
      {...overrides}
    />,
  );
  return { ...utils, onOpenChange, onApplied };
}

async function reviewFile(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['{"format":"dental-emr.clinical-chart"}'], "records.json", {
    type: "application/json",
  });
  await user.upload(screen.getByLabelText("File"), file);
  await user.click(screen.getByRole("button", { name: "Review file" }));
}

beforeEach(() => {
  createClinicalImportBatchAction.mockReset();
  getClinicalImportBatchAction.mockReset();
  applyClinicalImportBatchAction.mockReset();
  archiveClinicalImportBatchAction.mockReset();
  createClinicalImportBatchAction.mockResolvedValue({
    ok: true,
    batchId,
    stagedCount: 4,
    replayed: false,
  });
  getClinicalImportBatchAction.mockResolvedValue({ ok: true, batch });
  applyClinicalImportBatchAction.mockResolvedValue({ ok: true, appliedCount: 1, replayed: false });
  archiveClinicalImportBatchAction.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("ClinicalImportDialog", () => {
  it("shows the batch format, the counts and one row per candidate", async () => {
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(await screen.findByTestId("import-batch-format")).toHaveTextContent("EMR_JSON_V1");
    expect(screen.getByTestId("import-batch-count")).toHaveTextContent("4");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(screen.getByText(/Organization/)).toBeInTheDocument();
  });

  it("selects only the supported new records by default", async () => {
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(await screen.findByLabelText("Apply record 1")).toBeChecked();
    expect(screen.getByLabelText("Apply record 2")).not.toBeChecked();
    expect(screen.getByLabelText("Apply record 3")).not.toBeChecked();
    expect(screen.getByLabelText("Apply record 4")).not.toBeChecked();
  });

  it("refuses to let a conflict or an unsupported record be selected at all", async () => {
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(await screen.findByLabelText("Apply record 3")).toBeDisabled();
    expect(screen.getByLabelText("Apply record 4")).toBeDisabled();
    expect(screen.getByLabelText("Apply record 2")).toBeEnabled();
  });

  it("requires an explicit confirmation before anything can be applied", async () => {
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    const apply = await screen.findByRole("button", { name: /Apply 1 record/ });
    expect(apply).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /I have reviewed these records/ }));
    expect(apply).toBeEnabled();
  });

  it("names the signed-in provider and the clinical date in the confirmation", async () => {
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(
      await screen.findByText(/recorded by Dr Synthetic on 2026-09-01/),
    ).toBeInTheDocument();
  });

  it("applies exactly the records the clinician selected", async () => {
    const user = userEvent.setup();
    const { onApplied, onOpenChange } = renderDialog();
    await reviewFile(user);

    await user.click(await screen.findByLabelText("Apply record 2"));
    await user.click(screen.getByRole("checkbox", { name: /I have reviewed these records/ }));
    await user.click(screen.getByRole("button", { name: /Apply 2 records/ }));

    const [request] = applyClinicalImportBatchAction.mock.calls[0];
    expect(request.candidateIds.sort()).toEqual([NEW_ID, DUPLICATE_ID].sort());
    expect(request.candidateIds).not.toContain(CONFLICT_ID);
    expect(request.candidateIds).not.toContain(UNSUPPORTED_ID);
    expect(Object.keys(request).sort()).toEqual([
      "batchId",
      "branchId",
      "candidateIds",
      "idempotencyKey",
      "patientId",
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it("reports a refused document in words and never reaches the apply path", async () => {
    createClinicalImportBatchAction.mockResolvedValue({
      ok: false,
      code: "INVALID_INPUT",
      rejection: "EMBEDDED_AUTHORITY",
    });
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /names its own clinic, branch or provider/,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(applyClinicalImportBatchAction).not.toHaveBeenCalled();
  });

  it("reports an unreadable document without offering anything to apply", async () => {
    createClinicalImportBatchAction.mockResolvedValue({
      ok: false,
      code: "INVALID_INPUT",
      rejection: "XML_NOT_SUPPORTED",
    });
    const user = userEvent.setup();
    renderDialog();
    await reviewFile(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/XML documents are not accepted/);
  });

  it("abandons the batch rather than leaving it pending when the review is discarded", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await reviewFile(user);

    await user.click(await screen.findByRole("button", { name: "Discard batch" }));

    expect(archiveClinicalImportBatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ batchId, branchId, patientId }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("never carries one patient's proposed records into another patient's chart", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog();
    await reviewFile(user);
    expect(await screen.findByRole("table")).toBeInTheDocument();

    rerender(
      <ClinicalImportDialog
        open
        onOpenChange={vi.fn()}
        patientId={otherPatientId}
        branchId={branchId}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("File")).toBeInTheDocument();
  });
});
