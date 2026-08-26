import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  DocumentServiceError,
  generateDocument,
  getDocumentSnapshot,
  listDocuments,
  revalidatePath,
  requirePermission,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  DocumentServiceError: class DocumentServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  generateDocument: vi.fn(),
  getDocumentSnapshot: vi.fn(),
  listDocuments: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/documents/service", () => ({
  DocumentServiceError,
  generateDocument,
  getDocumentSnapshot,
  listDocuments,
}));

import {
  generateDocumentAction,
  getSnapshotAction,
  loadDocumentsAction,
  type GenerateDocumentActionInput,
  type GetSnapshotActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const documentId = "cd000000-0000-0000-0000-00000000000d";

const generatedAt = "2026-08-27T09:00:00+00:00";

const listRow = {
  documentId,
  documentType: "APPOINTMENT_SLIP" as const,
  templateVersion: "v1",
  includeSet: { demographics: true, appointments: true },
  generatedBy: null,
  generatedAt,
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("documents server actions", () => {
  it("rechecks document.view against the submitted branch before loading documents", async () => {
    requirePermission.mockResolvedValueOnce({});
    listDocuments.mockResolvedValueOnce([listRow]);

    await expect(loadDocumentsAction({ actingBranchId: branchId, patientId })).resolves.toEqual({ ok: true, rows: [listRow] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "document.view", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listDocuments.mock.invocationCallOrder[0]);
    expect(listDocuments).toHaveBeenCalledWith({ actingBranchId: branchId, patientId });
    expect(revalidatePath).toHaveBeenCalledWith("/documents");
  });

  it("rejects forged org identifiers and invalid input before any authorization", async () => {
    await expect(loadDocumentsAction({ actingBranchId: branchId, patientId, organizationId: "foreign" } as never)).resolves.toEqual({ ok: false, message: "The documents could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses document view access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadDocumentsAction({ actingBranchId: branchId, patientId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it("rechecks document.generate against the submitted branch before generating", async () => {
    requirePermission.mockResolvedValueOnce({});
    generateDocument.mockResolvedValueOnce({ documentId, version: 1 });

    await expect(generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "REFERRAL_LETTER",
      includeSet: { demographics: true, referrals: true },
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "document.generate", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(generateDocument.mock.invocationCallOrder[0]);
    expect(generateDocument).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      documentType: "REFERRAL_LETTER",
      includeSet: { demographics: true, referrals: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/documents");
  });

  it("rejects include-set sections that the document type does not allow", async () => {
    const result = await generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "APPOINTMENT_SLIP",
      includeSet: { demographics: true, referrals: true },
    } as GenerateDocumentActionInput);
    expect(result).toEqual({ ok: false, message: "Review the selected sections and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it("rejects forged tenant keys on generate via the schema boundary", async () => {
    const result = await generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true },
      organizationId: "foreign",
    } as GenerateDocumentActionInput);
    expect(result).toEqual({ ok: false, message: "Review the selected sections and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it("maps a denied generate to a safe message", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true },
    });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it("maps audit-mapped document errors to safe messages", async () => {
    requirePermission.mockResolvedValueOnce({});
    generateDocument.mockRejectedValueOnce(new DocumentServiceError("NOT_AUTHORIZED"));
    await expect(generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true },
    })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });

    requirePermission.mockResolvedValueOnce({});
    generateDocument.mockRejectedValueOnce(new DocumentServiceError("INVALID_INPUT"));
    await expect(generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true },
    })).resolves.toEqual({ ok: false, message: "Review the selected sections and try again." });

    requirePermission.mockResolvedValueOnce({});
    generateDocument.mockRejectedValueOnce(new DocumentServiceError("FAILED"));
    await expect(generateDocumentAction({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true },
    })).resolves.toEqual({ ok: false, message: "The document could not be generated. Try again." });
  });

  it("rechecks document.view before returning a snapshot for print navigation", async () => {
    requirePermission.mockResolvedValueOnce({});
    getDocumentSnapshot.mockResolvedValueOnce({
      documentId,
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: { demographics: { patientId, patientNumber: "P-0001" } },
      version: 1,
    });

    const result = await getSnapshotAction({ actingBranchId: branchId, documentId });
    expect(result.ok).toBe(true);
    expect(requirePermission).toHaveBeenCalledWith({ permission: "document.view", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(getDocumentSnapshot.mock.invocationCallOrder[0]);
    expect(getDocumentSnapshot).toHaveBeenCalledWith({ actingBranchId: branchId, documentId });
  });

  it("rejects forged tenant keys on snapshot and denies revoked view access", async () => {
    const result = await getSnapshotAction({
      actingBranchId: branchId,
      documentId,
      organizationId: "foreign",
    } as GetSnapshotActionInput);
    expect(result).toEqual({ ok: false, message: "That document could not be opened." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(getDocumentSnapshot).not.toHaveBeenCalled();

    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(getSnapshotAction({ actingBranchId: branchId, documentId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(getDocumentSnapshot).not.toHaveBeenCalled();
  });
});