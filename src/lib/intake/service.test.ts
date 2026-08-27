import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { IntakeServiceError, mapIntakeRpcError } from "./errors";
import {
  createIntakeForm,
  getIntakeForm,
  listConsentTemplates,
  listIntakeForms,
  markIntakeFormPaper,
  submitIntakeForm,
} from "./service";

const orgSlug = "smilelab-demo-dental";
const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c3000000-0000-0000-0000-000000000003";
const templateId = "c5000000-0000-0000-0000-000000000001";
const formId = "c7000000-0000-0000-0000-000000000007";
const token = "11111111-2222-3333-4444-555555555555";
const expiresAt = "2026-09-03T09:00:00+00:00";
const submittedAt = "2026-08-27T09:30:00+00:00";

const createResult = { formId, version: 1, token, expiresAt };
const detailResult = {
  formId,
  formType: "MEDICAL_HISTORY",
  templateVersion: "v1",
  consentBody: null,
  privacyNotice: "Our clinic privacy notice.",
  expiresAt,
  status: "PENDING",
};
const submitResult = { formId, status: "SUBMITTED", submittedAt };

beforeEach(() => {
  rpc.mockReset();
});

describe("intake service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapIntakeRpcError({ code: "42501", message: "not authorized" })).toEqual(new IntakeServiceError("NOT_AUTHORIZED"));
    expect(mapIntakeRpcError({ code: "22023", message: "invalid input" })).toEqual(new IntakeServiceError("INVALID_INPUT"));
    expect(mapIntakeRpcError({ code: "P0001", message: "stale version" })).toEqual(new IntakeServiceError("STALE_VERSION"));
    expect(mapIntakeRpcError({ code: "P0001", message: "invalid state" })).toEqual(new IntakeServiceError("INVALID_STATE"));
    expect(mapIntakeRpcError({ code: "P0001", message: "boom" })).toEqual(new IntakeServiceError("FAILED"));
    expect(mapIntakeRpcError("boom")).toEqual(new IntakeServiceError("FAILED"));
  });
});

describe("intake service input validation boundary", () => {
  it("rejects malformed create inputs before an RPC", async () => {
    await expect(createIntakeForm({ actingBranchId: "not-a-uuid", patientId, formType: "MEDICAL_HISTORY" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "LOCKED" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "CONSENT" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "MEDICAL_HISTORY", consentTemplateId: templateId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "CONSENT", consentTemplateId: templateId, forged: "x" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed public read/submit inputs before an RPC", async () => {
    await expect(getIntakeForm("NOT_A_SLUG", token)).rejects.toBeInstanceOf(z.ZodError);
    await expect(getIntakeForm(orgSlug, "short")).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitIntakeForm("NOT_A_SLUG", token, { a: "b" }, true)).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitIntakeForm(orgSlug, "short", { a: "b" }, true)).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitIntakeForm(orgSlug, token, Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, "v"])), true)).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitIntakeForm(orgSlug, token, { a: "x".repeat(2001) }, true)).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed staff inputs before an RPC", async () => {
    await expect(markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 1, reason: "x".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(markIntakeFormPaper({ actingBranchId: "not-a-uuid", formId, expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listIntakeForms({ actingBranchId: branchId, patientId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listConsentTemplates({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("intake service RPC contract", () => {
  it("creates a medical-history form link with the exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: createResult, error: null });
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "MEDICAL_HISTORY" })).resolves.toEqual({
      formId,
      version: 1,
      token,
      expiresAt,
    });
    expect(rpc).toHaveBeenLastCalledWith("create_intake_form", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_form_type: "MEDICAL_HISTORY",
      p_consent_template_id: null,
    });
  });

  it("creates a consent form with the chosen template id", async () => {
    rpc.mockResolvedValueOnce({ data: createResult, error: null });
    await createIntakeForm({ actingBranchId: branchId, patientId, formType: "CONSENT", consentTemplateId: templateId });
    expect(rpc).toHaveBeenLastCalledWith("create_intake_form", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_form_type: "CONSENT",
      p_consent_template_id: templateId,
    });
  });

  it("reads the bounded form projection for a valid token and null for an unknown one", async () => {
    rpc.mockResolvedValueOnce({ data: detailResult, error: null });
    await expect(getIntakeForm(orgSlug, token)).resolves.toEqual({
      formId,
      formType: "MEDICAL_HISTORY",
      templateVersion: "v1",
      consentBody: null,
      privacyNotice: "Our clinic privacy notice.",
      expiresAt,
      status: "PENDING",
    });
    expect(rpc).toHaveBeenLastCalledWith("public_get_intake_form", { p_org_slug: orgSlug, p_token: token });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getIntakeForm(orgSlug, token)).resolves.toBeNull();
  });

  it("submits answers and the privacy acknowledgement, mapping a null token to NOT_FOUND", async () => {
    rpc.mockResolvedValueOnce({ data: submitResult, error: null });
    await expect(submitIntakeForm(orgSlug, token, { consentGiven: "yes" }, true)).resolves.toEqual({
      formId,
      status: "SUBMITTED",
      submittedAt,
    });
    expect(rpc).toHaveBeenLastCalledWith("public_submit_intake_form", {
      p_org_slug: orgSlug,
      p_token: token,
      p_answers: { consentGiven: "yes" },
      p_privacy_acknowledged: true,
    });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(submitIntakeForm(orgSlug, token, { a: "b" }, true)).rejects.toEqual(new IntakeServiceError("NOT_FOUND"));
  });

  it("marks a form paper with the version-bound identity and optional reason", async () => {
    rpc.mockResolvedValueOnce({ data: [{ form_id: formId, version: 2 }], error: null });
    await expect(markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 1, reason: "Patient signed the paper form." })).resolves.toEqual({ formId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("mark_intake_form_paper", {
      p_acting_branch_id: branchId,
      p_form_id: formId,
      p_expected_version: 1,
      p_reason: "Patient signed the paper form.",
    });

    rpc.mockResolvedValueOnce({ data: [{ form_id: formId, version: 2 }], error: null });
    await markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("mark_intake_form_paper", {
      p_acting_branch_id: branchId,
      p_form_id: formId,
      p_expected_version: 1,
      p_reason: null,
    });
  });

  it("lists intake forms with the bounded projection and no answers", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        form_id: formId,
        form_type: "CONSENT",
        template_version: "v1",
        status: "SUBMITTED",
        submitted_via: "LINK",
        submitted_at: submittedAt,
        signed_at: null,
        created_at: "2026-08-27T09:00:00+00:00",
        version: 2,
      }],
      error: null,
    });
    await expect(listIntakeForms({ actingBranchId: branchId, patientId })).resolves.toEqual([
      {
        formId,
        formType: "CONSENT",
        templateVersion: "v1",
        status: "SUBMITTED",
        submittedVia: "LINK",
        submittedAt,
        signedAt: null,
        createdAt: "2026-08-27T09:00:00+00:00",
        version: 2,
      },
    ]);
    expect(rpc).toHaveBeenLastCalledWith("list_intake_forms", { p_acting_branch_id: branchId, p_patient_id: patientId });
  });

  it("lists active global and same-organization consent templates via the RPC for the acting branch", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { template_id: templateId, code: "GLOBAL_CONSENT", name: "Global Consent", version: 1, is_active: true },
        { template_id: "c5000000-0000-0000-0000-000000000002", code: "CUSTOM_A", name: "Custom A Consent", version: 2, is_active: true },
      ],
      error: null,
    });

    await expect(listConsentTemplates({ actingBranchId: branchId })).resolves.toEqual([
      { templateId, code: "GLOBAL_CONSENT", name: "Global Consent", version: 1 },
      { templateId: "c5000000-0000-0000-0000-000000000002", code: "CUSTOM_A", name: "Custom A Consent", version: 2 },
    ]);
    expect(rpc).toHaveBeenLastCalledWith("list_consent_templates", { p_acting_branch_id: branchId });
  });

  it("fails closed when the consent-template RPC cannot be read", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listConsentTemplates({ actingBranchId: branchId })).rejects.toEqual(new IntakeServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "boom" } });
    await expect(listConsentTemplates({ actingBranchId: branchId })).rejects.toEqual(new IntakeServiceError("FAILED"));
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createIntakeForm({ actingBranchId: branchId, patientId, formType: "MEDICAL_HISTORY" })).rejects.toEqual(new IntakeServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(submitIntakeForm(orgSlug, token, { a: "b" }, true)).rejects.toEqual(new IntakeServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listIntakeForms({ actingBranchId: branchId, patientId })).rejects.toEqual(new IntakeServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 1 })).rejects.toEqual(new IntakeServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(markIntakeFormPaper({ actingBranchId: branchId, formId, expectedVersion: 1 })).rejects.toEqual(new IntakeServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "boom" } });
    await expect(getIntakeForm(orgSlug, token)).rejects.toEqual(new IntakeServiceError("FAILED"));
  });
});