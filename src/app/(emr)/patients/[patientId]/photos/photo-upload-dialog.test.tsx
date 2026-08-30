/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhotoUploadDialog, type PhotoUploadDraft } from "./photo-upload-dialog";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("PhotoUploadDialog", () => {
  it("proposes a safe display filename without showing the original camera filename", async () => {
    render(
      <PhotoUploadDialog
        open
        onOpenChange={vi.fn()}
        canWriteClinical
        defaultCaptureAt="2026-08-30T10:00:00+08:00"
        defaultToothCodes={["11"]}
        onSubmit={vi.fn()}
      />,
    );

    const file = new File(["synthetic image"], "original-camera-name.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });

    expect(screen.getByLabelText("Display filename")).toHaveValue("2026-08-30_progress_tooth-11_01.jpg");
    expect(screen.queryByText("original-camera-name.jpg")).not.toBeInTheDocument();
    expect(screen.getByText(/JPEG image selected/i)).toBeVisible();
  });

  it("requires explicit confirmation and submits the bounded metadata draft", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PhotoUploadDialog
        open
        onOpenChange={vi.fn()}
        canWriteClinical
        defaultCaptureAt="2026-08-30T10:00:00+08:00"
        defaultToothCodes={["11"]}
        procedureCases={[{ procedureCaseId: "22000000-0000-0000-0000-000000000021", display: "Composite restoration" }]}
        onSubmit={onSubmit}
      />,
    );

    const file = new File(["synthetic image"], "camera.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });
    await user.selectOptions(screen.getByLabelText("Photo category"), "AFTER");
    await user.clear(screen.getByLabelText("Display filename"));
    await user.type(screen.getByLabelText("Display filename"), "final-after.png");
    await user.selectOptions(screen.getByLabelText("Procedure case"), "22000000-0000-0000-0000-000000000021");
    await user.type(screen.getByLabelText("Clinical note"), "Synthetic after-treatment note");

    const submit = screen.getByRole("button", { name: "Confirm and add to record" });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining<Partial<PhotoUploadDraft>>({
        displayFilename: "final-after.png",
        category: "AFTER",
        originalClientFilename: "camera.png",
        procedureCaseId: "22000000-0000-0000-0000-000000000021",
        note: "Synthetic after-treatment note",
      }),
    );
  });

  it("rejects unsupported files and keeps the confirmation disabled", () => {
    render(<PhotoUploadDialog open onOpenChange={vi.fn()} canWriteClinical onSubmit={vi.fn()} />);

    const file = new File(["synthetic file"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/JPEG, PNG, or WebP/i);
    expect(screen.getByRole("button", { name: "Confirm and add to record" })).toBeDisabled();
  });

  it("rejects empty image files before they reach private storage", () => {
    render(<PhotoUploadDialog open onOpenChange={vi.fn()} canWriteClinical onSubmit={vi.fn()} />);

    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/must not be empty/i);
    expect(screen.getByRole("button", { name: "Confirm and add to record" })).toBeDisabled();
  });

  it("does not expose upload controls to a read-only user", () => {
    render(<PhotoUploadDialog open onOpenChange={vi.fn()} canWriteClinical={false} onSubmit={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Add clinical photograph" });
    expect(within(dialog).getByText(/read-only access/i)).toBeVisible();
    expect(within(dialog).queryByLabelText("Photo file")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Confirm and add to record" })).not.toBeInTheDocument();
  });
});
