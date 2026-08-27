import "server-only";

import { z } from "zod";

import { generateDocument } from "@/lib/documents/service";
import { createClient } from "@/lib/supabase/server";

import { TreatmentPlanServiceError, mapTreatmentPlanRpcError } from "./errors";
import {
  acknowledgeTreatmentPlanInputSchema,
  addTreatmentPlanAlternativeInputSchema,
  addTreatmentPlanDiscussionInputSchema,
  addTreatmentPlanItemInputSchema,
  createTreatmentPlanInputSchema,
  generateTreatmentPlanDocumentInputSchema,
  getTreatmentPlanDetailInputSchema,
  listTreatmentPlansInputSchema,
  presentTreatmentPlanInputSchema,
  removeTreatmentPlanItemInputSchema,
  saveTreatmentPlanDrawingInputSchema,
  treatmentPlanAlternativeMutationRowSchema,
  treatmentPlanDetailJsonSchema,
  treatmentPlanDiscussionMutationRowSchema,
  treatmentPlanDrawingMutationRowSchema,
  treatmentPlanItemMutationRowSchema,
  treatmentPlanItemRemovalRowSchema,
  treatmentPlanListRowSchema,
  treatmentPlanMutationRowSchema,
  updateTreatmentPlanInputSchema,
  updateTreatmentPlanItemInputSchema,
} from "./schema";
import type {
  TreatmentPlan,
  TreatmentPlanAlternativeMutationResult,
  TreatmentPlanDetail,
  TreatmentPlanDiscussionMutationResult,
  TreatmentPlanDrawingMutationResult,
  TreatmentPlanItemMutationResult,
  TreatmentPlanMutationResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapTreatmentPlanRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createTreatmentPlan(input: unknown): Promise<TreatmentPlanMutationResult> {
  const value = createTreatmentPlanInputSchema.parse(input);
  const row = treatmentPlanMutationRowSchema.parse(firstRow(await callRpc("create_treatment_plan", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_title: value.title,
  })));
  return { planId: row.plan_id, version: row.version };
}

export async function updateTreatmentPlan(input: unknown): Promise<TreatmentPlanMutationResult> {
  const value = updateTreatmentPlanInputSchema.parse(input);
  const row = treatmentPlanMutationRowSchema.parse(firstRow(await callRpc("update_treatment_plan", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
    p_title: value.title,
  })));
  return { planId: row.plan_id, version: row.version };
}

export async function presentTreatmentPlan(input: unknown): Promise<TreatmentPlanMutationResult> {
  const value = presentTreatmentPlanInputSchema.parse(input);
  const row = treatmentPlanMutationRowSchema.parse(firstRow(await callRpc("present_treatment_plan", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
  })));
  return { planId: row.plan_id, version: row.version };
}

export async function acknowledgeTreatmentPlan(input: unknown): Promise<TreatmentPlanMutationResult> {
  const value = acknowledgeTreatmentPlanInputSchema.parse(input);
  const row = treatmentPlanMutationRowSchema.parse(firstRow(await callRpc("acknowledge_treatment_plan", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
  })));
  return { planId: row.plan_id, version: row.version };
}

export async function addTreatmentPlanItem(input: unknown): Promise<TreatmentPlanItemMutationResult> {
  const value = addTreatmentPlanItemInputSchema.parse(input);
  const row = treatmentPlanItemMutationRowSchema.parse(firstRow(await callRpc("add_treatment_plan_item", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
    p_procedure_id: value.procedureId ?? null,
    p_tooth_code: value.toothCode ?? null,
    p_description: value.description,
    p_estimated_fee: value.estimatedFee ?? null,
  })));
  return { itemId: row.item_id, lineNo: row.line_no };
}

export async function updateTreatmentPlanItem(input: unknown): Promise<TreatmentPlanItemMutationResult> {
  const value = updateTreatmentPlanItemInputSchema.parse(input);
  const row = treatmentPlanItemMutationRowSchema.parse(firstRow(await callRpc("update_treatment_plan_item", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_item_id: value.itemId,
    p_expected_version: value.expectedVersion,
    p_procedure_id: value.procedureId ?? null,
    p_tooth_code: value.toothCode ?? null,
    p_description: value.description,
    p_estimated_fee: value.estimatedFee ?? null,
  })));
  return { itemId: row.item_id, lineNo: row.line_no };
}

export async function removeTreatmentPlanItem(input: unknown): Promise<{ itemId: string }> {
  const value = removeTreatmentPlanItemInputSchema.parse(input);
  const row = treatmentPlanItemRemovalRowSchema.parse(firstRow(await callRpc("remove_treatment_plan_item", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_item_id: value.itemId,
    p_expected_version: value.expectedVersion,
  })));
  return { itemId: row.item_id };
}

export async function addTreatmentPlanAlternative(input: unknown): Promise<TreatmentPlanAlternativeMutationResult> {
  const value = addTreatmentPlanAlternativeInputSchema.parse(input);
  const row = treatmentPlanAlternativeMutationRowSchema.parse(firstRow(await callRpc("add_treatment_plan_alternative", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
    p_summary: value.summary,
  })));
  return { alternativeId: row.alternative_id, alternativeNo: row.alternative_no };
}

export async function addTreatmentPlanDiscussion(input: unknown): Promise<TreatmentPlanDiscussionMutationResult> {
  const value = addTreatmentPlanDiscussionInputSchema.parse(input);
  const row = treatmentPlanDiscussionMutationRowSchema.parse(firstRow(await callRpc("add_treatment_plan_discussion", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_treating_provider_id: value.treatingProviderId ?? null,
    p_context: value.context,
    p_notes: value.notes ?? null,
  })));
  return { discussionId: row.discussion_id, discussedAt: row.discussed_at };
}

export async function saveTreatmentPlanDrawing(input: unknown): Promise<TreatmentPlanDrawingMutationResult> {
  const value = saveTreatmentPlanDrawingInputSchema.parse(input);
  const row = treatmentPlanDrawingMutationRowSchema.parse(firstRow(await callRpc("save_treatment_plan_drawing", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
    p_expected_version: value.expectedVersion,
    p_drawing: value.drawing,
  })));
  return { drawingId: row.drawing_id, version: row.version };
}

export async function listTreatmentPlans(input: unknown): Promise<TreatmentPlan[]> {
  const value = listTreatmentPlansInputSchema.parse(input);
  return z.array(treatmentPlanListRowSchema).parse(await callRpc("list_treatment_plans", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
  })).map((row) => ({
    planId: row.plan_id,
    title: row.title,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    itemCount: row.item_count,
    hasDrawing: row.has_drawing,
  }));
}

export async function getTreatmentPlanDetail(input: unknown): Promise<TreatmentPlanDetail> {
  const value = getTreatmentPlanDetailInputSchema.parse(input);
  return treatmentPlanDetailJsonSchema.parse(await callRpc("get_treatment_plan_detail", {
    p_acting_branch_id: value.actingBranchId,
    p_plan_id: value.planId,
  }));
}

export async function generateTreatmentPlanDocument(input: unknown): Promise<{ documentId: string; version: number }> {
  const value = generateTreatmentPlanDocumentInputSchema.parse(input);
  return generateDocument({
    actingBranchId: value.actingBranchId,
    patientId: value.patientId,
    documentType: "TREATMENT_PLAN",
    planId: value.planId,
    includeSet: {
      items: value.includeSet.items === true,
      alternatives: value.includeSet.alternatives === true,
      discussions: value.includeSet.discussions === true,
      drawing: value.includeSet.drawing === true,
    },
  });
}

export { TreatmentPlanServiceError };