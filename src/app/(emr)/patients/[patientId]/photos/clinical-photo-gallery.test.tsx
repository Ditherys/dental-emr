/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClinicalPhotoDisplay } from "./clinical-photo-gallery";
import { ClinicalPhotoGallery } from "./clinical-photo-gallery";

const patientId = "22000000-0000-0000-0000-000000000001";
const beforeId = "22000000-0000-0000-0000-000000000011";
const afterId = "22000000-0000-0000-0000-000000000012";

const photos: ClinicalPhotoDisplay[] = [
  {
    photoId: beforeId,
    patientId,
    procedureCaseId: "22000000-0000-0000-0000-000000000021",
    category: "BEFORE",
    displayFilename: "2026-08-01_before_tooth-11_01.jpg",
    captureAt: "2026-08-01T09:00:00+08:00",
    toothCodes: ["11"],
    surfaces: ["O"],
    note: "Synthetic baseline photograph",
    processingStatus: "READY",
    pairedPhotoId: afterId,
    version: 1,
    previewUrl: "/private/preview-before.jpg",
    displayUrl: "/private/display-before.jpg",
    photographerDisplayName: "Dr. Synthetic Dentist",
    procedureDisplayName: "Composite restoration",
  },
  {
    photoId: afterId,
    patientId,
    procedureCaseId: "22000000-0000-0000-0000-000000000021",
    category: "AFTER",
    displayFilename: "2026-08-30_after_tooth-11_01.jpg",
    captureAt: "2026-08-30T10:00:00+08:00",
    toothCodes: ["11"],
    surfaces: ["O"],
    note: "Synthetic post-treatment photograph",
    processingStatus: "READY",
    pairedPhotoId: beforeId,
    version: 1,
    previewUrl: "/private/preview-after.jpg",
    displayUrl: "/private/display-after.jpg",
    photographerDisplayName: "Dr. Synthetic Dentist",
    procedureDisplayName: "Composite restoration",
  },
  {
    photoId: "22000000-0000-0000-0000-000000000013",
    patientId,
    procedureCaseId: null,
    category: "DIAGNOSTIC",
    displayFilename: "2026-08-15_diagnostic_01.png",
    captureAt: "2026-08-15T11:00:00+08:00",
    toothCodes: ["26"],
    surfaces: [],
    note: null,
    processingStatus: "PROCESSING",
    pairedPhotoId: null,
    version: 1,
    photographerDisplayName: "Dr. Other Dentist",
  },
];

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("ClinicalPhotoGallery", () => {
  it("renders safe metadata and never renders the original client filename", () => {
    render(
      <ClinicalPhotoGallery
        patientId={patientId}
        actingBranchId="32000000-0000-0000-0000-000000000001"
        initialPhotos={photos}
        canWriteClinical
      />,
    );

    expect(screen.getByRole("heading", { name: "Clinical photographs" })).toBeVisible();
    expect(screen.getByText("2026-08-30_after_tooth-11_01.jpg")).toBeVisible();
    expect(screen.queryByText("original-camera-name.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeVisible();
  });

  it("can hydrate canonical DTOs with short-lived private derivative URLs", async () => {
    const resolveDerivativeUrl = vi.fn().mockResolvedValue("/private/minted-thumbnail.jpg");
    const canonicalPhotos = photos.map((photo) => {
      const canonical = { ...photo };
      delete canonical.thumbnailUrl;
      delete canonical.previewUrl;
      delete canonical.displayUrl;
      return canonical;
    });
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={canonicalPhotos} canWriteClinical resolveDerivativeUrl={resolveDerivativeUrl} />);

    await waitFor(() => expect(screen.getByAltText(/After photograph: 2026-08-30/i)).toHaveAttribute("src", "/private/minted-thumbnail.jpg"));
    expect(resolveDerivativeUrl).toHaveBeenCalledWith(expect.objectContaining({ photoId: afterId }), "thumbnail");
  });

  it("filters by category, date, tooth, procedure, and photographer", async () => {
    const user = userEvent.setup();
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={photos} canWriteClinical />);

    await user.selectOptions(screen.getByLabelText("Filter by category"), "AFTER");
    expect(screen.getByText("2026-08-30_after_tooth-11_01.jpg")).toBeVisible();
    expect(screen.queryByText("2026-08-01_before_tooth-11_01.jpg")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter by category"), "ALL");
    await user.type(screen.getByLabelText("Filter by procedure"), "Composite");
    expect(screen.getByText("2026-08-30_after_tooth-11_01.jpg")).toBeVisible();
    expect(screen.queryByText("2026-08-15_diagnostic_01.png")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Filter by procedure"));
    await user.type(screen.getByLabelText("Filter by tooth"), "26");
    expect(screen.getByText("2026-08-15_diagnostic_01.png")).toBeVisible();
    expect(screen.queryByText("2026-08-30_after_tooth-11_01.jpg")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Filter by tooth"));
    await user.selectOptions(screen.getByLabelText("Filter by photographer"), "Dr. Other Dentist");
    expect(screen.getByText("2026-08-15_diagnostic_01.png")).toBeVisible();
  });

  it("keeps critical write actions out of read-only mode", () => {
    render(
      <ClinicalPhotoGallery
        patientId={patientId}
        actingBranchId="32000000-0000-0000-0000-000000000001"
        initialPhotos={photos}
        canWriteClinical={false}
        onOpenUpload={vi.fn()}
        onRename={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add clinical photograph" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename photo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive photo" })).not.toBeInTheDocument();
    expect(screen.getByText("Read-only access")).toBeVisible();
  });

  it("opens a focused private preview and compares a paired before/after record", async () => {
    const user = userEvent.setup();
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={photos} canWriteClinical />);

    await user.click(within(screen.getByTestId(`clinical-photo-${afterId}`)).getByRole("button", { name: "View photo" }));
    const previewDialog = await screen.findByRole("dialog", { name: "Photo preview" });
    expect(within(previewDialog).getByAltText(/2026-08-30_after/i)).toHaveAttribute("src", "/private/display-after.jpg");

    await user.click(within(previewDialog).getByRole("button", { name: "Compare before and after" }));
    const compareDialog = await screen.findByRole("dialog", { name: "Before and after comparison" });
    expect(within(compareDialog).getByAltText(/Before photo/i)).toHaveAttribute("src", "/private/display-before.jpg");
    expect(within(compareDialog).getByAltText(/After photo/i)).toHaveAttribute("src", "/private/display-after.jpg");
  });

  it("starts pairing from the gallery and sends both patient photos to the parent", async () => {
    const user = userEvent.setup();
    const onPair = vi.fn();
    const unpairedBefore = { ...photos[0]!, photoId: "22000000-0000-0000-0000-000000000014", pairedPhotoId: null, displayFilename: "2026-08-02_before_tooth-11_02.jpg" };
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={[...photos, unpairedBefore]} canWriteClinical onPair={onPair} />);

    await user.click(screen.getByRole("button", { name: "Pair with another photo" }));
    expect(screen.getByRole("status")).toHaveTextContent(/select the matching before\/after photograph/i);
    await user.click(screen.getAllByRole("button", { name: "Select as matching photo" })[0]!);
    expect(onPair).toHaveBeenCalledWith(unpairedBefore, photos[1]);
  });

  it("confirms archive intent before calling the parent", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={photos} canWriteClinical onArchive={onArchive} />);

    await user.click(screen.getAllByRole("button", { name: "Archive photo" })[0]!);
    const dialog = await screen.findByRole("alertdialog", { name: "Archive clinical photograph?" });
    expect(within(dialog).getByText(/original media is retained/i)).toBeVisible();
    expect(onArchive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Archive photo" }));
    expect(onArchive).toHaveBeenCalledWith(photos[1]);
  });

  it("confirms and sanitizes a display rename without changing the media object", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<ClinicalPhotoGallery patientId={patientId} actingBranchId="32000000-0000-0000-0000-000000000001" initialPhotos={photos} canWriteClinical onRename={onRename} />);

    await user.click(within(screen.getByTestId(`clinical-photo-${afterId}`)).getByRole("button", { name: "Rename photo" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename clinical photograph" });
    await user.clear(within(dialog).getByLabelText("Display filename"));
    await user.type(within(dialog).getByLabelText("Display filename"), "After result.png");
    await user.click(within(dialog).getByRole("button", { name: "Save filename" }));

    expect(onRename).toHaveBeenCalledWith(photos[1], "After result.jpg");
    expect(screen.queryByRole("dialog", { name: "Rename clinical photograph" })).not.toBeInTheDocument();
  });
});
