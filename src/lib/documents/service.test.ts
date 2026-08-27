import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { DocumentServiceError, mapDocumentRpcError } from "./errors";
import {
  generateDocument,
  getDocumentSnapshot,
  listDocuments,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const documentId = "cd000000-0000-0000-0000-00000000000d";

const generatedAt = "2026-08-27T09:00:00+00:00";

const generateInput = {
  actingBranchId: branchId,
  patientId,
  documentType: "PATIENT_RECORD_SUMMARY" as const,
  includeSet: { demographics: true, referrals: false, appointments: true },
};

const listRow = {
  document_id: documentId,
  document_type: "APPOINTMENT_SLIP",
  template_version: "v1",
  include_set: { demographics: true, appointments: true },
  generated_by: null,
  generated_at: generatedAt,
  version: 1,
};

const planId = "c4000000-0000-0000-0000-000000000004";

const snapshotRow = {
  document_id: documentId,
  document_type: "PATIENT_RECORD_SUMMARY",
  template_version: "v1",
  data_snapshot: {
    demographics: {
      patientId,
      patientNumber: "P-0001",
      firstName: "Juana",
      middleName: "Santos",
      lastName: "Dela Cruz",
      suffix: null,
      preferredName: null,
      birthDate: "1990-01-01",
      sexAtRegistration: "female",
      addressLine1: "123 Rizal St",
      addressLine2: null,
      city: "Manila",
      province: null,
      postalCode: "1000",
      status: "active",
      contacts: [{ contactType: "MOBILE", label: null, value: "+639181234567", isPrimary: true }],
    },
  },
  version: 1,
};

describe("document service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapDocumentRpcError({ code: "42501", message: "not authorized" })).toEqual(new DocumentServiceError("NOT_AUTHORIZED"));
    expect(mapDocumentRpcError({ code: "22023", message: "invalid input" })).toEqual(new DocumentServiceError("INVALID_INPUT"));
    expect(mapDocumentRpcError({ code: "P0001", message: "boom" })).toEqual(new DocumentServiceError("FAILED"));
    expect(mapDocumentRpcError({ code: "XX000", message: "unexpected" })).toEqual(new DocumentServiceError("FAILED"));
    expect(mapDocumentRpcError("boom")).toEqual(new DocumentServiceError("FAILED"));
  });
});

describe("document service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden include-set keys before an RPC", async () => {
    await expect(generateDocument({
      ...generateInput,
      organizationId: "foreign-org",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      includeSet: { demographics: true, referrals: true, appointments: true, billing: true },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      documentType: "APPOINTMENT_SLIP",
      includeSet: { demographics: true, referrals: true },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      documentType: "REFERRAL_LETTER",
      includeSet: { demographics: true, appointments: true },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      includeSet: { demographics: "yes" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      documentType: "BILLING_STATEMENT",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateDocument({
      ...generateInput,
      patientId: "not-a-uuid",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listDocuments({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listDocuments({ actingBranchId: branchId, patientId, documentType: "INVOICE" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listDocuments({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listDocuments({ actingBranchId: "not-a-uuid", patientId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(getDocumentSnapshot({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("document service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds generate to its exact RPC contract and forwards only truthy include-set sections", async () => {
    rpc.mockResolvedValueOnce({ data: [{ document_id: documentId, version: 1 }], error: null });
    await expect(generateDocument(generateInput)).resolves.toEqual({ documentId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("generate_document", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: "PATIENT_RECORD_SUMMARY",
      p_include_set: { demographics: true, appointments: true },
    });

    rpc.mockResolvedValueOnce({ data: [{ document_id: documentId, version: 1 }], error: null });
    await generateDocument({
      actingBranchId: branchId,
      patientId,
      documentType: "APPOINTMENT_SLIP",
      includeSet: { demographics: true },
    });
    expect(rpc).toHaveBeenLastCalledWith("generate_document", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: "APPOINTMENT_SLIP",
      p_include_set: { demographics: true },
    });

    rpc.mockResolvedValueOnce({ data: [{ document_id: documentId, version: 1 }], error: null });
    await generateDocument({
      actingBranchId: branchId,
      patientId,
      documentType: "REFERRAL_LETTER",
      includeSet: {},
    });
    expect(rpc).toHaveBeenLastCalledWith("generate_document", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: "REFERRAL_LETTER",
      p_include_set: {},
    });
  });

  it("forwards the plan selector and only the checked sections for TREATMENT_PLAN", async () => {
    rpc.mockResolvedValueOnce({ data: [{ document_id: documentId, version: 1 }], error: null });
    await expect(generateDocument({
      actingBranchId: branchId,
      patientId,
      documentType: "TREATMENT_PLAN",
      planId,
      includeSet: { items: true, alternatives: false, discussions: true, drawing: true },
    })).resolves.toEqual({ documentId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("generate_document", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: "TREATMENT_PLAN",
      p_include_set: { items: true, discussions: true, drawing: true, planId },
    });

    await expect(generateDocument({
      actingBranchId: branchId,
      patientId,
      documentType: "TREATMENT_PLAN",
      planId,
      includeSet: {},
    })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("lists a stored TREATMENT_PLAN row whose include set carries the plan selector", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...listRow, document_type: "TREATMENT_PLAN", include_set: { items: true, drawing: true, planId } }], error: null });
    await expect(listDocuments({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      documentId,
      documentType: "TREATMENT_PLAN",
      templateVersion: "v1",
      includeSet: { items: true, drawing: true, planId },
      generatedBy: null,
      generatedAt,
      version: 1,
    }]);
  });

  it("lists rows with the full bounded projection and no snapshot body", async () => {
    rpc.mockResolvedValueOnce({ data: [listRow], error: null });
    await expect(listDocuments({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      documentId,
      documentType: "APPOINTMENT_SLIP",
      templateVersion: "v1",
      includeSet: { demographics: true, appointments: true },
      generatedBy: null,
      generatedAt,
      version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_documents", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: null,
    });
  });

  it("passes the document-type filter through", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listDocuments({ actingBranchId: branchId, patientId, documentType: "REFERRAL_LETTER" });
    expect(rpc).toHaveBeenLastCalledWith("list_documents", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_document_type: "REFERRAL_LETTER",
    });
  });

  it("returns the parsed reproducible snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: [snapshotRow], error: null });
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId })).resolves.toEqual({
      documentId,
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: snapshotRow.data_snapshot,
      version: 1,
    });
    expect(rpc).toHaveBeenLastCalledWith("get_document_snapshot", {
      p_acting_branch_id: branchId,
      p_document_id: documentId,
    });
  });

  it("parses a TREATMENT_PLAN snapshot in the bounded document shape", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      document_id: documentId,
      document_type: "TREATMENT_PLAN",
      template_version: "v1",
      data_snapshot: {
        plan: { planId, patientId, title: "Full mouth restoration", status: "ACKNOWLEDGED", version: 3, createdAt: generatedAt, updatedAt: generatedAt, createdBy: "c3000000-0000-0000-0000-000000000003" },
        items: [{ itemId: "c6000000-0000-0000-0000-000000000006", lineNo: 1, procedureId: null, toothCode: "26", description: "Composite filling on 26.", estimatedFee: 2500, createdAt: generatedAt }],
        discussions: [{ discussionId: "c6000000-0000-0000-0000-000000000009", discussedBy: "c3000000-0000-0000-0000-000000000003", treatingProviderId: null, discussedAt: generatedAt, context: "Case discussion", createdAt: generatedAt }],
        drawing: { drawingId: "c6000000-0000-0000-0000-00000000000a", drawing: { strokes: [] }, updatedBy: "c3000000-0000-0000-0000-000000000003", updatedAt: generatedAt, version: 1 },
      },
      version: 1,
    }], error: null });
    const snapshot = await getDocumentSnapshot({ actingBranchId: branchId, documentId });
    expect(snapshot.dataSnapshot.plan?.status).toBe("ACKNOWLEDGED");
    expect(snapshot.dataSnapshot.items?.[0]?.description).toBe("Composite filling on 26.");
    expect(snapshot.dataSnapshot.drawing?.drawing).toEqual({ strokes: [] });
  });

  it("rejects malformed mutation, list, and snapshot rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ document_id: documentId }], error: null });
    await expect(generateDocument(generateInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ ...listRow, document_type: "NOT_A_TYPE" }], error: null });
    await expect(listDocuments({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ ...snapshotRow, data_snapshot: { billing: { total: 100 } } }], error: null });
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each read and mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(generateDocument(generateInput)).rejects.toEqual(new DocumentServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(listDocuments({ actingBranchId: branchId, patientId })).rejects.toEqual(new DocumentServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "boom" } });
    await expect(getDocumentSnapshot({ actingBranchId: branchId, documentId })).rejects.toEqual(new DocumentServiceError("FAILED"));
  });
});