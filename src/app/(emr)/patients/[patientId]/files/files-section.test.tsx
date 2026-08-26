// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileListItem } from "@/lib/files/types";
import { MAX_FILE_SIZE_BYTES } from "@/lib/files/schema";

const actions = vi.hoisted(() => ({
  archiveFileAction: vi.fn(),
  confirmFileUploadAction: vi.fn(),
  createFileUploadAction: vi.fn(),
  downloadUrlAction: vi.fn(),
}));
const router = { refresh: vi.fn() };
const fetchMock = vi.fn();

vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { FilesSection } from "./files-section";

const branchId = "32000000-0000-0000-0000-000000000001";
const patientId = "22000000-0000-0000-0000-000000000001";
const available: FileListItem = { fileId: "62000000-0000-0000-0000-000000000001", mimeType: "application/pdf", sizeBytes: 1536, status: "available", version: 3, createdAt: "2026-08-20T09:30:00Z", uploadedBy: "72000000-0000-0000-0000-000000000001" };
const pending: FileListItem = { fileId: "62000000-0000-0000-0000-000000000002", mimeType: "image/png", sizeBytes: null, status: "pending", version: 1, createdAt: "2026-08-21T10:00:00Z", uploadedBy: "72000000-0000-0000-0000-000000000001" };
const archived: FileListItem = { fileId: "62000000-0000-0000-0000-000000000003", mimeType: "application/msword", sizeBytes: 8192, status: "archived", version: 2, createdAt: "2026-08-22T11:00:00Z", uploadedBy: "72000000-0000-0000-0000-000000000001" };

function renderSection(props: Partial<Parameters<typeof FilesSection>[0]> = {}) {
  return render(<FilesSection patientId={patientId} actingBranchId={branchId} canManage initialFiles={[available, pending, archived]} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.archiveFileAction.mockResolvedValue({ ok: true, objectDeleted: true });
  actions.confirmFileUploadAction.mockResolvedValue({ ok: true });
  actions.createFileUploadAction.mockResolvedValue({ ok: true, fileId: "62000000-0000-0000-0000-000000000004", uploadUrl: "http://127.0.0.1:9000/put?sig=1", version: 1 });
  actions.downloadUrlAction.mockResolvedValue({ ok: true, downloadUrl: "https://storage.example/get?sig=1" });
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FilesSection", () => {
  it("renders a dense metadata table on desktop and a compact list on phones without exposing URLs or ids", () => {
    const { container } = renderSection();

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("article")).toHaveLength(3);
    expect(screen.getAllByText("application/pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.5 KB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("127.0.0.1:9000");
    expect(document.body.textContent).not.toContain(available.fileId);
  });

  it("offers download only for available files and keeps 44px touch targets", () => {
    renderSection();

    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2);
    for (const button of [...screen.getAllByRole("button", { name: "Download" }), ...screen.getAllByRole("button", { name: "Archive" })]) {
      expect(button).toHaveClass("min-h-11");
    }
  });

  it("shows an empty state before any upload and an explicit failure alert when the list cannot be loaded", () => {
    const { unmount } = renderSection({ initialFiles: [] });
    expect(screen.getByText("No files have been added to this record.")).toBeVisible();
    unmount();

    renderSection({ loadFailed: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Files could not be loaded");
  });

  it("mints a presigned download through the server action without leaking the URL into the document", async () => {
    renderSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);
    await waitFor(() => expect(actions.downloadUrlAction).toHaveBeenCalledWith({ actingBranchId: branchId, fileId: available.fileId }));
    expect(actions.downloadUrlAction).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("storage.example");
  });

  it("surfaces a safe error when minting a download fails", async () => {
    actions.downloadUrlAction.mockResolvedValue({ ok: false, code: "INVALID_STATE" });
    renderSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer in a state that allows that action");
  });

  it("requires explicit confirmation before the AAL2-gated archive action", async () => {
    renderSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("requires your current AAL2 session");
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive file" }));

    await waitFor(() => expect(actions.archiveFileAction).toHaveBeenCalledWith({ actingBranchId: branchId, fileId: available.fileId, expectedVersion: 3 }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the archive dialog open with a safe message when archiving fails", async () => {
    actions.archiveFileAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    renderSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive file" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed while you were working");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("uploads through presign, browser PUT, and confirmation, then refreshes the bounded list", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const dialog = await screen.findByRole("dialog", { name: "Add file" });
    const file = new File(["synthetic"], "scan.pdf", { type: "application/pdf" });
    await user.upload(within(dialog).getByLabelText("File"), file);
    expect(within(dialog).getByText("Type: application/pdf")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));

    await waitFor(() => expect(actions.createFileUploadAction).toHaveBeenCalledWith({ patientId, actingBranchId: branchId, mimeType: "application/pdf", sizeBytes: 9 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9000/put?sig=1", { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" }, signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(actions.confirmFileUploadAction).toHaveBeenCalledWith({ actingBranchId: branchId, fileId: "62000000-0000-0000-0000-000000000004", expectedVersion: 1 }));
    const createOrder = actions.createFileUploadAction.mock.invocationCallOrder[0];
    const putOrder = fetchMock.mock.invocationCallOrder[0];
    const confirmOrder = actions.confirmFileUploadAction.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(putOrder);
    expect(putOrder).toBeLessThan(confirmOrder);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("abandons the upload pipeline without transferring or confirming when the dialog closes during presign", async () => {
    const user = userEvent.setup();
    let releaseCreate: (result: { ok: true; fileId: string; uploadUrl: string; version: number }) => void = () => undefined;
    actions.createFileUploadAction.mockImplementation(() => new Promise((resolve) => { releaseCreate = resolve; }));
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const dialog = await screen.findByRole("dialog", { name: "Add file" });
    await user.upload(within(dialog).getByLabelText("File"), new File(["synthetic"], "scan.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));
    await waitFor(() => expect(actions.createFileUploadAction).toHaveBeenCalledTimes(1));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    releaseCreate({ ok: true, fileId: "62000000-0000-0000-0000-000000000004", uploadUrl: "http://127.0.0.1:9000/put?sig=1", version: 1 });
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions.confirmFileUploadAction).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("does not surface a stale upload failure after the closed dialog is reopened", async () => {
    const user = userEvent.setup();
    let failCreate: (result: { ok: false; code: string }) => void = () => undefined;
    actions.createFileUploadAction.mockImplementation(() => new Promise((resolve) => { failCreate = resolve; }));
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const firstDialog = await screen.findByRole("dialog", { name: "Add file" });
    await user.upload(within(firstDialog).getByLabelText("File"), new File(["synthetic"], "scan.pdf", { type: "application/pdf" }));
    await user.click(within(firstDialog).getByRole("button", { name: "Upload file" }));
    await waitFor(() => expect(actions.createFileUploadAction).toHaveBeenCalledTimes(1));

    await user.keyboard("{Escape}");
    failCreate({ ok: false, code: "FAILED" });
    await act(async () => {});
    expect(actions.confirmFileUploadAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const reopened = await screen.findByRole("dialog", { name: "Add file" });
    expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a retryable transfer failure without confirming an unverified upload", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const dialog = await screen.findByRole("dialog", { name: "Add file" });
    await user.upload(within(dialog).getByLabelText("File"), new File(["synthetic"], "scan.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be transferred to storage");
    expect(actions.confirmFileUploadAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Add file" })).toBeInTheDocument();
  });

  it("rejects oversized files client-side before requesting an upload URL", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const dialog = await screen.findByRole("dialog", { name: "Add file" });
    const file = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE_BYTES + 1 });
    await user.upload(within(dialog).getByLabelText("File"), file);

    expect(within(dialog).getByRole("alert")).toHaveTextContent("100 MB limit");
    expect(within(dialog).getByRole("button", { name: "Upload file" })).toBeDisabled();
    expect(actions.createFileUploadAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a safe message when the upload request itself is denied or fails", async () => {
    const user = userEvent.setup();
    actions.createFileUploadAction.mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    const dialog = await screen.findByRole("dialog", { name: "Add file" });
    await user.upload(within(dialog).getByLabelText("File"), new File(["synthetic"], "scan.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("access or selected branch changed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions.confirmFileUploadAction).not.toHaveBeenCalled();
  });

  it("returns safely out of the add-file dialog on escape while idle", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Add file" }));
    expect(await screen.findByRole("dialog", { name: "Add file" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
