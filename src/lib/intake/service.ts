import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { IntakeServiceError, mapIntakeRpcError } from "./errors";
import {
  consentTemplateRowSchema,
  createIntakeFormInputSchema,
  createIntakeFormResultSchema,
  getIntakeFormInputSchema,
  intakeFormDetailSchema,
  listConsentTemplatesInputSchema,
  listIntakeFormsInputSchema,
  listIntakeFormsRowSchema,
  markIntakeFormPaperInputSchema,
  markIntakeFormPaperRowSchema,
  submitIntakeFormInputSchema,
  submitIntakeFormResultSchema,
} from "./schema";
import type {
  ConsentTemplateOption,
  IntakeFormDetail,
  IntakeFormLink,
  IntakeFormSummary,
  IntakeSubmitResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapIntakeRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createIntakeForm(input: unknown): Promise<IntakeFormLink> {
  const value = createIntakeFormInputSchema.parse(input);
  const parsed = createIntakeFormResultSchema.parse(await callRpc("create_intake_form", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_form_type: value.formType,
    p_consent_template_id: value.consentTemplateId ?? null,
  }));
  return {
    formId: parsed.formId,
    version: parsed.version,
    token: parsed.token,
    expiresAt: parsed.expiresAt,
  };
}

// Wrong, expired, revoked, and foreign-organization tokens are an
// indistinguishable NULL from public_get_intake_form, so this resolves to null
// exactly when the link does not resolve -- never an error that reveals why.
export async function getIntakeForm(orgSlug: string, token: string): Promise<IntakeFormDetail | null> {
  const value = getIntakeFormInputSchema.parse({ orgSlug, token });
  const data = await callRpc("public_get_intake_form", {
    p_org_slug: value.orgSlug,
    p_token: value.token,
  });
  if (data == null) return null;
  const parsed = intakeFormDetailSchema.parse(data);
  return {
    formId: parsed.formId,
    formType: parsed.formType,
    templateVersion: parsed.templateVersion,
    consentBody: parsed.consentBody,
    privacyNotice: parsed.privacyNotice,
    expiresAt: parsed.expiresAt,
    status: parsed.status,
  };
}

// A NULL result means the token does not resolve (unknown/expired/revoked/
// foreign), which the anonymous surface must treat as NOT_FOUND so the route
// handler answers the same "link is invalid or has expired" without revealing
// why or which patient.
export async function submitIntakeForm(
  orgSlug: string,
  token: string,
  answers: Record<string, string | boolean>,
  privacyAcknowledged: boolean,
): Promise<IntakeSubmitResult> {
  const value = submitIntakeFormInputSchema.parse({ orgSlug, token, answers, privacyAcknowledged });
  const data = await callRpc("public_submit_intake_form", {
    p_org_slug: value.orgSlug,
    p_token: value.token,
    p_answers: value.answers,
    p_privacy_acknowledged: value.privacyAcknowledged,
  });
  if (data == null) throw new IntakeServiceError("NOT_FOUND");
  const parsed = submitIntakeFormResultSchema.parse(data);
  return { formId: parsed.formId, status: parsed.status, submittedAt: parsed.submittedAt };
}

export async function markIntakeFormPaper(input: unknown): Promise<{ formId: string; version: number }> {
  const value = markIntakeFormPaperInputSchema.parse(input);
  const parsed = markIntakeFormPaperRowSchema.parse(firstRow(await callRpc("mark_intake_form_paper", {
    p_acting_branch_id: value.actingBranchId,
    p_form_id: value.formId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason ?? null,
  })));
  return { formId: parsed.form_id, version: parsed.version };
}

export async function listIntakeForms(input: unknown): Promise<IntakeFormSummary[]> {
  const value = listIntakeFormsInputSchema.parse(input);
  return z
    .array(listIntakeFormsRowSchema)
    .parse(await callRpc("list_intake_forms", {
      p_acting_branch_id: value.actingBranchId,
      p_patient_id: value.patientId,
    }))
    .map((row) => ({
      formId: row.form_id,
      formType: row.form_type,
      templateVersion: row.template_version,
      status: row.status,
      submittedVia: row.submitted_via,
      submittedAt: row.submitted_at,
      signedAt: row.signed_at,
      createdAt: row.created_at,
      version: row.version,
    }));
}

// Staff catalog read for the create-link dialog's CONSENT template select. The
// intake.manage-gated list_consent_templates RPC derives the acting branch's
// organization and returns only active global (org null) or same-organization
// templates. Any authorization or database failure fails closed (throws) rather
// than returning unscoped or cross-organization rows.
export async function listConsentTemplates(input: unknown): Promise<ConsentTemplateOption[]> {
  const value = listConsentTemplatesInputSchema.parse(input);
  return z
    .array(consentTemplateRowSchema)
    .parse(await callRpc("list_consent_templates", {
      p_acting_branch_id: value.actingBranchId,
    }))
    .map((row) => ({ templateId: row.template_id, code: row.code, name: row.name, version: row.version }));
}

export { IntakeServiceError };