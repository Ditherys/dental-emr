import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  DocumentServiceError,
  getDocumentSnapshot,
  renderDocumentHtml,
  requireOrganizationAuthorizationState,
  requirePermission,
  requireVerifiedIdentity,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  DocumentServiceError: class DocumentServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  getDocumentSnapshot: vi.fn(),
  renderDocumentHtml: vi.fn(),
  requireOrganizationAuthorizationState: vi.fn(),
  requirePermission: vi.fn(),
  requireVerifiedIdentity: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({ requireVerifiedIdentity }));
vi.mock("@/lib/authorization", () => ({
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
}));
vi.mock("@/lib/documents/service", () => ({ DocumentServiceError, getDocumentSnapshot }));
vi.mock("@/lib/documents/render", () => ({ renderDocumentHtml }));

import { resolvePrintDocument } from "./print-document";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const documentId = "cd000000-0000-0000-0000-00000000000d";

const snapshot = {
  documentId,
  documentType: "PATIENT_RECORD_SUMMARY" as const,
  templateVersion: "v1",
  dataSnapshot: {
    demographics: {
      patientId,
      patientNumber: "P-0001",
      firstName: "Juana",
      middleName: null,
      lastName: "Dela Cruz",
      suffix: null,
      preferredName: null,
      birthDate: "1990-01-01",
      sexAtRegistration: "female",
      addressLine1: null,
      addressLine2: null,
      city: "Manila",
      province: null,
      postalCode: null,
      status: "active",
      contacts: [],
    },
  },
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireVerifiedIdentity.mockResolvedValue({ userId: "u-test" });
  requirePermission.mockResolvedValue({});
  requireOrganizationAuthorizationState.mockResolvedValue({
    organization: { id: "org-a", businessName: "SmileCare Dental Clinic", slug: "smilecare" },
    activeBranches: [{ id: branchId, name: "Makati Branch", slug: "makati" }],
    explicitBranchIds: [branchId],
    roleScopes: [null],
    permissionGrants: [],
  });
  getDocumentSnapshot.mockResolvedValue(snapshot);
  renderDocumentHtml.mockReturnValue('<div class="print-document">SmileCare Dental Clinic · Makati Branch</div>');
});

describe("resolvePrintDocument", () => {
  it("rechecks document.view against the acting branch and returns the branded A4 print HTML", async () => {
    const result = await resolvePrintDocument(documentId);

    expect(result).toEqual({ status: "ready", html: '<div class="print-document">SmileCare Dental Clinic · Makati Branch</div>' });
    expect(requireVerifiedIdentity).toHaveBeenCalled();
    expect(requirePermission).toHaveBeenCalledWith({ permission: "document.view" });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "document.view", branchId });
    expect(getDocumentSnapshot).toHaveBeenCalledWith({ actingBranchId: branchId, documentId });
    expect(renderDocumentHtml).toHaveBeenCalledWith({
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: snapshot.dataSnapshot,
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });
  });

  it("never renders when document view access is missing", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await resolvePrintDocument(documentId);

    expect(result).toEqual({ status: "denied" });
    expect(getDocumentSnapshot).not.toHaveBeenCalled();
    expect(renderDocumentHtml).not.toHaveBeenCalled();
  });

  it("never renders when no active branch is available", async () => {
    requireOrganizationAuthorizationState.mockResolvedValueOnce({
      organization: { id: "org-a", businessName: "SmileCare Dental Clinic", slug: "smilecare" },
      activeBranches: [],
      explicitBranchIds: [],
      roleScopes: [null],
      permissionGrants: [],
    });
    const result = await resolvePrintDocument(documentId);

    expect(result).toEqual({ status: "denied" });
    expect(getDocumentSnapshot).not.toHaveBeenCalled();
  });

  it("fails safe when the snapshot is foreign, missing, or the service fails", async () => {
    getDocumentSnapshot.mockRejectedValueOnce(new DocumentServiceError("NOT_AUTHORIZED"));
    expect(await resolvePrintDocument(documentId)).toEqual({ status: "failed" });

    getDocumentSnapshot.mockRejectedValueOnce(new DocumentServiceError("FAILED"));
    expect(await resolvePrintDocument(documentId)).toEqual({ status: "failed" });

    expect(renderDocumentHtml).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors instead of masking them", async () => {
    getDocumentSnapshot.mockRejectedValueOnce(new Error("boom"));
    await expect(resolvePrintDocument(documentId)).rejects.toThrow("boom");
  });
});