/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { ClinicalPhotoDisplay } from "./clinical-photo-gallery";
import { BeforeAfterCompare } from "./before-after-compare";

const basePhoto: ClinicalPhotoDisplay = {
  photoId: "22000000-0000-0000-0000-000000000011",
  patientId: "22000000-0000-0000-0000-000000000001",
  procedureCaseId: null,
  category: "BEFORE",
  displayFilename: "2026-08-01_before_01.jpg",
  captureAt: "2026-08-01T09:00:00+08:00",
  toothCodes: ["11"],
  surfaces: [],
  note: "Synthetic baseline",
  processingStatus: "READY",
  pairedPhotoId: "22000000-0000-0000-0000-000000000012",
  version: 1,
  displayUrl: "/private/before.jpg",
};
const afterPhoto: ClinicalPhotoDisplay = {
  ...basePhoto,
  photoId: "22000000-0000-0000-0000-000000000012",
  category: "AFTER",
  displayFilename: "2026-08-30_after_01.jpg",
  captureAt: "2026-08-30T10:00:00+08:00",
  note: "Synthetic result",
  pairedPhotoId: basePhoto.photoId,
  displayUrl: "/private/after.jpg",
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("BeforeAfterCompare", () => {
  it("renders dated, private side-by-side previews and does not reveal original filenames", () => {
    render(
      <BeforeAfterCompare
        open
        before={basePhoto}
        after={afterPhoto}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Before and after comparison" })).toBeVisible();
    expect(screen.getByAltText("Before photo: 2026-08-01_before_01.jpg")).toHaveAttribute("src", "/private/before.jpg");
    expect(screen.getByAltText("After photo: 2026-08-30_after_01.jpg")).toHaveAttribute("src", "/private/after.jpg");
    expect(screen.getByText("2026-08-01_before_01.jpg")).toBeVisible();
    expect(screen.queryByText("camera-before.jpg")).not.toBeInTheDocument();
  });

  it("supports an accessible overlay comparison position", async () => {
    const user = userEvent.setup();
    render(<BeforeAfterCompare open before={basePhoto} after={afterPhoto} />);

    await user.click(screen.getByRole("button", { name: "Overlay" }));
    expect(screen.getByRole("slider", { name: "Comparison position" })).toHaveValue("50");
    fireEvent.change(screen.getByRole("slider", { name: "Comparison position" }), { target: { value: "72" } });
    expect(screen.getByRole("slider", { name: "Comparison position" })).toHaveValue("72");
    expect(screen.getByRole("button", { name: "Side by side" })).toHaveAttribute("aria-pressed", "false");
  });
});
