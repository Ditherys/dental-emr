// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClinicalGallerySheet,
  ClinicalPhotoAttachmentProvider,
  useClinicalPhotoAttachment,
} from "./clinical-gallery-sheet";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function AttachmentProbe() {
  const attach = useClinicalPhotoAttachment();
  return (
    <button
      type="button"
      disabled={!attach}
      onClick={() =>
        attach?.({
          toothCodes: ["11", "21"],
          clinicalDate: "2026-09-01T10:30",
          procedureCaseId: "22000000-0000-0000-0000-000000000021",
        })
      }
    >
      Attach photograph
    </button>
  );
}

describe("ClinicalGallerySheet", () => {
  it("keeps private clinical images out of the document until the panel is opened", () => {
    render(
      <ClinicalGallerySheet open={false} onOpenChange={vi.fn()}>
        <p data-testid="gallery-panel">Clinical photographs</p>
      </ClinicalGallerySheet>,
    );

    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("presents the gallery in one named panel with a close affordance", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ClinicalGallerySheet open onOpenChange={onOpenChange}>
        <p data-testid="gallery-panel">Clinical photographs</p>
      </ClinicalGallerySheet>,
    );

    const panel = await screen.findByRole("dialog", { name: "Clinical photographs" });
    expect(within(panel).getByTestId("gallery-panel")).toBeVisible();

    await user.click(within(panel).getByRole("button", { name: "Close photographs" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers a bounded retry instead of the gallery when the photographs could not be loaded", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <ClinicalGallerySheet open onOpenChange={vi.fn()} loadFailed onRetry={onRetry}>
        <p data-testid="gallery-panel">Clinical photographs</p>
      </ClinicalGallerySheet>,
    );

    const panel = await screen.findByRole("dialog", { name: "Clinical photographs" });
    expect(within(panel).queryByTestId("gallery-panel")).not.toBeInTheDocument();
    const failure = within(panel).getByRole("alert");
    expect(failure).toHaveTextContent("photographs could not be loaded");

    await user.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("clinical photo attachment context", () => {
  it("offers no attachment path when no photo workflow is mounted above it", () => {
    render(<AttachmentProbe />);
    expect(screen.getByRole("button", { name: "Attach photograph" })).toBeDisabled();
  });

  it("hands the composer's selected teeth, clinical date, and procedure case to the photo workflow", async () => {
    const user = userEvent.setup();
    const attach = vi.fn();
    render(
      <ClinicalPhotoAttachmentProvider attach={attach}>
        <AttachmentProbe />
      </ClinicalPhotoAttachmentProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Attach photograph" }));
    expect(attach).toHaveBeenCalledWith({
      toothCodes: ["11", "21"],
      clinicalDate: "2026-09-01T10:30",
      procedureCaseId: "22000000-0000-0000-0000-000000000021",
    });
  });
});
