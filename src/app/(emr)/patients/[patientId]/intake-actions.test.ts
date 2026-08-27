import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  IntakeServiceError,
  createIntakeForm,
  listIntakeForms,
  markIntakeFormPaper,
  revalidatePath,
  requirePermission,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  IntakeServiceError: class IntakeServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  createIntakeForm: vi.fn(),
  listIntakeForms: vi.fn(),
  markIntakeFormPaper: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/intake/service", () => ({
  IntakeServiceError,
  createIntakeForm,
  listIntakeForms,
  markIntakeFormPaper,
}));

import {
  createIntakeFormAction,
  listIntakeFormsAction,
  markIntakeFormPaperAction,
} from "./intake-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c3000000-0000-0000-0000-000000000003";
const formId = "c7000000-0000-0000-0000-000000000007";
const templateId = "c5000000-0000-0000-0000-000000000001";
const patientPath = `/patients/${patientId}`;

const link = { formId, version: 1, token: "11111111-2222-3333-4444-555555555555", expiresAt: "2026-09-03T09:00:00+00:00" };

beforeEach(() => vi.clearAllMocks());

describe("createIntakeFormAction", () => {
  it("rechecks intake.manage at the submitted branch before creating and revalidates the patient path", async () => {
    requirePermission.mockResolvedValueOnce({});
    createIntakeForm.mockResolvedValueOnce(link);

    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY" })).resolves.toEqual({ ok: true, link });

    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createIntakeForm.mock.invocationCallOrder[0]);
    expect(requirePermission).toHaveBeenCalledWith({ permission: "intake.manage", branchId });
    expect(createIntakeForm).toHaveBeenCalledWith({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY", consentTemplateId: undefined });
    expect(revalidatePath).toHaveBeenCalledWith(patientPath);
  });

  it("rejects forged or malformed input before any authorization or service call", async () => {
    await expect(createIntakeFormAction({ patientId, actingBranchId: "forged", formType: "MEDICAL_HISTORY" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "CONSENT" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY", consentTemplateId: templateId })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createIntakeForm).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps authorization and service failures to safe codes without throwing", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY" })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });

    createIntakeForm.mockRejectedValueOnce(new IntakeServiceError("INVALID_INPUT"));
    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });

    createIntakeForm.mockRejectedValueOnce(new Error("unexpected"));
    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY" })).resolves.toEqual({ ok: false, code: "FAILED" });
  });

  it("propagates the AAL2 redirect control-flow error instead of masking it", async () => {
    const redirectError = { digest: "NEXT_REDIRECT;replace;/mfa/challenge?next=%2Fpatients;307;" };
    requirePermission.mockRejectedValueOnce(redirectError);

    await expect(createIntakeFormAction({ patientId, actingBranchId: branchId, formType: "MEDICAL_HISTORY" })).rejects.toBe(redirectError);
    expect(createIntakeForm).not.toHaveBeenCalled();
  });
});

describe("markIntakeFormPaperAction", () => {
  it("rechecks intake.manage and passes the version-bound paper mark", async () => {
    requirePermission.mockResolvedValueOnce({});
    markIntakeFormPaper.mockResolvedValueOnce({ formId, version: 2 });

    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId, expectedVersion: 1, reason: "Patient signed the paper form." })).resolves.toEqual({ ok: true });

    expect(requirePermission).toHaveBeenCalledWith({ permission: "intake.manage", branchId });
    expect(markIntakeFormPaper).toHaveBeenCalledWith({ actingBranchId: branchId, formId, expectedVersion: 1, reason: "Patient signed the paper form." });
    expect(revalidatePath).toHaveBeenCalledWith(patientPath);
  });

  it("rejects malformed input and a missing patient before authorization", async () => {
    await expect(markIntakeFormPaperAction(null)).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId, expectedVersion: 0 })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId: "forged", expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(markIntakeFormPaperAction({ actingBranchId: branchId, formId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(markIntakeFormPaper).not.toHaveBeenCalled();
  });

  it("maps stale-version, invalid-state, and service failures to safe codes", async () => {
    markIntakeFormPaper.mockRejectedValueOnce(new IntakeServiceError("STALE_VERSION"));
    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "STALE_VERSION" });

    markIntakeFormPaper.mockRejectedValueOnce(new IntakeServiceError("INVALID_STATE"));
    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "INVALID_STATE" });

    markIntakeFormPaper.mockRejectedValueOnce(new IntakeServiceError("NOT_FOUND"));
    await expect(markIntakeFormPaperAction({ patientId, actingBranchId: branchId, formId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "FAILED" });
  });
});

describe("listIntakeFormsAction", () => {
  it("rechecks intake.manage and returns the bounded projection", async () => {
    requirePermission.mockResolvedValueOnce({});
    listIntakeForms.mockResolvedValueOnce([{
      formId,
      formType: "CONSENT",
      templateVersion: "v1",
      status: "SUBMITTED",
      submittedVia: "LINK",
      submittedAt: "2026-08-27T09:30:00+00:00",
      signedAt: null,
      createdAt: "2026-08-27T09:00:00+00:00",
      version: 2,
    }]);

    const result = await listIntakeFormsAction({ patientId, actingBranchId: branchId });

    expect(result).toEqual({ ok: true, rows: [expect.objectContaining({ formId, status: "SUBMITTED" })] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "intake.manage", branchId });
    expect(listIntakeForms).toHaveBeenCalledWith({ patientId, actingBranchId: branchId });
    expect(revalidatePath).toHaveBeenCalledWith(patientPath);
  });

  it("rejects malformed input before authorization and maps denials to NOT_AUTHORIZED", async () => {
    await expect(listIntakeFormsAction({ patientId, actingBranchId: "forged" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(listIntakeForms).not.toHaveBeenCalled();

    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(listIntakeFormsAction({ patientId, actingBranchId: branchId })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });
});