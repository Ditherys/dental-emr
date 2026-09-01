// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitClinicalNoteAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitClinicalNoteAction: mocks.recordVisitClinicalNoteAction,
}));

import { ClinicalNoteForm } from "./clinical-note-form";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

function renderForm() {
  const onRecorded = vi.fn();
  const utils = render(
    <ClinicalNoteForm patientId={patientId} branchId={branchId} onRecorded={onRecorded} />,
  );
  return { ...utils, onRecorded };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: true });
});

describe("ClinicalNoteForm bounded visit note", () => {
  it("records an authored note under the managed visit from route context only", async () => {
    const user = userEvent.setup();
    const { onRecorded } = renderForm();

    await user.selectOptions(screen.getByLabelText("Note type"), "PROGRESS");
    await user.type(screen.getByLabelText("Note"), "Synthetic visit note");
    await user.click(screen.getByRole("button", { name: "Record note" }));

    await waitFor(() => expect(mocks.recordVisitClinicalNoteAction).toHaveBeenCalledTimes(1));
    const input = mocks.recordVisitClinicalNoteAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toEqual({
      patientId,
      branchId,
      noteType: "PROGRESS",
      content: "Synthetic visit note",
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    });
    expect(input).not.toHaveProperty("encounterId");
    expect(input).not.toHaveProperty("createdBy");
    expect(onRecorded).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("offers only authored note types and never the amendment type the correction path owns", () => {
    renderForm();

    const options = Array.from(
      screen.getByLabelText("Note type").querySelectorAll("option"),
    ).map((option) => option.getAttribute("value"));
    expect(options).toEqual(["PROGRESS", "CONSULTATION", "PROCEDURE", "POST_OP", "REFERRAL", "FREE_FORM"]);
    expect(options).not.toContain("AMENDMENT");
  });

  it("refuses an empty note without calling the server", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Note"), "   ");
    await user.click(screen.getByRole("button", { name: "Record note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/note is required/i);
    expect(mocks.recordVisitClinicalNoteAction).not.toHaveBeenCalled();
  });

  it("shows a safe retry error with no optimistic note when persistence fails", async () => {
    const user = userEvent.setup();
    mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    const { onRecorded } = renderForm();

    await user.type(screen.getByLabelText("Note"), "Synthetic visit note");
    await user.click(screen.getByRole("button", { name: "Record note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/access or selected branch changed/i);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note")).toHaveValue("Synthetic visit note");

    mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: true });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mocks.recordVisitClinicalNoteAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitClinicalNoteAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const retry = mocks.recordVisitClinicalNoteAction.mock.calls[1]?.[0] as { idempotencyKey: string };
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("rotates the request key when the authored note changes after a failure", async () => {
    const user = userEvent.setup();
    // Replaying the key for an edited note would return the original stored note
    // and report the edit as recorded when only the first one exists.
    mocks.recordVisitClinicalNoteAction.mockRejectedValueOnce(new Error("network"));
    renderForm();

    await user.type(screen.getByLabelText("Note"), "Synthetic visit note");
    await user.click(screen.getByRole("button", { name: "Record note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be recorded/i);

    mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: true });
    await user.type(screen.getByLabelText("Note"), " amended");
    await user.click(screen.getByRole("button", { name: "Record note" }));

    await waitFor(() => expect(mocks.recordVisitClinicalNoteAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitClinicalNoteAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const edited = mocks.recordVisitClinicalNoteAction.mock.calls[1]?.[0] as { idempotencyKey: string; content: string };
    expect(edited.content).toBe("Synthetic visit note amended");
    expect(edited.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("rotates the request key when only the note type changes after a failure", async () => {
    const user = userEvent.setup();
    mocks.recordVisitClinicalNoteAction.mockResolvedValueOnce({ ok: false, code: "FAILED" });
    renderForm();

    await user.type(screen.getByLabelText("Note"), "Synthetic visit note");
    await user.click(screen.getByRole("button", { name: "Record note" }));
    await waitFor(() => expect(mocks.recordVisitClinicalNoteAction).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByLabelText("Note type"), "POST_OP");
    await user.click(screen.getByRole("button", { name: "Record note" }));

    await waitFor(() => expect(mocks.recordVisitClinicalNoteAction).toHaveBeenCalledTimes(2));
    const first = mocks.recordVisitClinicalNoteAction.mock.calls[0]?.[0] as { idempotencyKey: string };
    const second = mocks.recordVisitClinicalNoteAction.mock.calls[1]?.[0] as { idempotencyKey: string; noteType: string };
    expect(second.noteType).toBe("POST_OP");
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});
