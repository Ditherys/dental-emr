import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/documents/service", () => ({
  generateDocument: vi.fn(async () => ({ documentId: "d7f00000-0000-0000-0000-00000000000f", version: 1 })),
}));

import { TreatmentPlanServiceError, mapTreatmentPlanRpcError } from "./errors";
import {
  acknowledgeTreatmentPlan,
  addTreatmentPlanAlternative,
  addTreatmentPlanDiscussion,
  addTreatmentPlanItem,
  createTreatmentPlan,
  completeTreatment,
  generateTreatmentPlanDocument,
  getTreatmentPlanCompletionContext,
  getTreatmentPlanDetail,
  listTreatmentPlans,
  presentTreatmentPlan,
  removeTreatmentPlanItem,
  updateTreatmentPlan,
  updateTreatmentPlanItem,
} from "./service";

const branchId = "d7100000-0000-0000-0000-000000000001";
const patientId = "d7500000-0000-0000-0000-000000000001";
const planId = "d7a00000-0000-0000-0000-000000000001";
const itemId = "d7a00000-0000-0000-0000-000000000002";
const alternativeId = "d7a00000-0000-0000-0000-000000000003";
const discussionId = "d7a00000-0000-0000-0000-000000000004";
const drawingId = "d7a00000-0000-0000-0000-000000000005";
const procedureId = "d9300000-0000-0000-0000-000000000001";
const providerId = "d9200000-0000-0000-0000-000000000001";
const createdBy = "d7100000-0000-0000-0000-000000000002";

const createdAt = "2026-08-27T09:00:00+00:00";

describe("treatment-plan service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapTreatmentPlanRpcError({ code: "42501", message: "not authorized" })).toEqual(new TreatmentPlanServiceError("NOT_AUTHORIZED"));
    expect(mapTreatmentPlanRpcError({ code: "22023", message: "invalid input" })).toEqual(new TreatmentPlanServiceError("INVALID_INPUT"));
    expect(mapTreatmentPlanRpcError({ code: "P0001", message: "stale version" })).toEqual(new TreatmentPlanServiceError("STALE_VERSION"));
    expect(mapTreatmentPlanRpcError({ code: "P0001", message: "invalid state" })).toEqual(new TreatmentPlanServiceError("INVALID_STATE"));
    expect(mapTreatmentPlanRpcError({ code: "XX000", message: "unexpected" })).toEqual(new TreatmentPlanServiceError("FAILED"));
    expect(mapTreatmentPlanRpcError("boom")).toEqual(new TreatmentPlanServiceError("FAILED"));
  });
});

describe("treatment-plan service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects forbidden org identifiers and forged tenant keys before any RPC", async () => {
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "Plan", organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "Plan", branchId: "foreign-branch" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 1, title: "Plan", organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", procedureId, toothCode: "26", organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers, versions, titles, items, and alternatives", async () => {
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "   " })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "P".repeat(201) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateTreatmentPlan({ actingBranchId: branchId, planId: "forged", expectedVersion: 1, title: "Plan" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 0, title: "Plan" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(presentTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: -1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(acknowledgeTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 1.5 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "   " })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "I".repeat(2001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", toothCode: "49" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", estimatedFeeCentavos: "100000000000" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", estimatedFeeCentavos: "-1" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", priority: "NOW" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", sequenceNo: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", surfaces: ["X"] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", notes: "N".repeat(4001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateTreatmentPlanItem({ actingBranchId: branchId, planId, itemId, expectedVersion: 1, description: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(removeTreatmentPlanItem({ actingBranchId: branchId, planId, itemId: "nope", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanAlternative({ actingBranchId: branchId, planId, expectedVersion: 1, summary: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanAlternative({ actingBranchId: branchId, planId, expectedVersion: 1, summary: "S".repeat(2001) })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds case completion to the atomic server boundary without provider identity", async () => {
    rpc.mockResolvedValueOnce({ data: [{ case_id: planId, charge_id: drawingId, clinical_entry_id: itemId, bridge_id: null, implant_component_id: null }], error: null });
    await expect(completeTreatment({
      actingBranchId: branchId,
      caseId: planId,
      expectedVersion: 1,
      resolvedFindingIds: [],
      amountCentavos: "5000000",
      completion: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
      idempotencyKey: "complete-1",
    })).resolves.toEqual({ caseId: planId, chargeId: drawingId, clinicalEntryId: itemId, bridgeId: null, implantComponentId: null });
    expect(rpc).toHaveBeenLastCalledWith("complete_treatment_case", {
      p_acting_branch_id: branchId,
      p_case_id: planId,
      p_plan_item_id: null,
      p_expected_version: 1,
      p_resolved_finding_ids: [],
      p_amount_centavos: "5000000",
      p_completion: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
      p_idempotency_key: "complete-1",
    });
  });

  it("accepts the immutable ordinal implant chain required by the completion RPC", async () => {
    rpc.mockResolvedValueOnce({ data: [{ case_id: planId, charge_id: drawingId, clinical_entry_id: null, bridge_id: null, implant_component_id: itemId }], error: null });
    await expect(completeTreatment({
      actingBranchId: branchId,
      caseId: planId,
      planItemId: itemId,
      expectedVersion: 1,
      resolvedFindingIds: [],
      amountCentavos: "5000000",
      completion: { kind: "IMPLANT", components: [
        { tooth_fdi: "26", ordinal: 1, component_kind: "FIXTURE", attachment_value: null },
        { tooth_fdi: "26", ordinal: 2, component_kind: "ABUTMENT", attachment_value: null, depends_on_ordinal: 1 },
        { tooth_fdi: "26", ordinal: 3, component_kind: "CROWN", attachment_value: null, depends_on_ordinal: 2 },
      ] },
      idempotencyKey: "complete-implant-1",
    })).resolves.toEqual({ caseId: planId, chargeId: drawingId, clinicalEntryId: null, bridgeId: null, implantComponentId: itemId });
  });

  it("rejects malformed discussion and read inputs", async () => {
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, context: "   " })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, context: "C".repeat(201) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, context: "Context", notes: "N".repeat(4001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, treatingProviderId: "forged", context: "Context" })).rejects.toBeInstanceOf(z.ZodError);
    // The treating provider is derived from the signed-in actor. A well-formed
    // provider identifier is refused exactly as a malformed one is, so the
    // browser can never choose whose clinical authorship a discussion carries.
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, treatingProviderId: providerId, context: "Context" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, context: "Context", createdBy: createdBy })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listTreatmentPlans({ actingBranchId: branchId, patientId: "forged" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listTreatmentPlans({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getTreatmentPlanDetail({ actingBranchId: branchId, planId: "forged" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getTreatmentPlanCompletionContext({ actingBranchId: branchId, planId: "forged" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(generateTreatmentPlanDocument({ actingBranchId: branchId, patientId, planId, includeSet: { items: true, billing: true } })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("treatment-plan service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds plan create, update, present, and acknowledge to their exact contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, version: 1 }], error: null });
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "Full mouth restoration" })).resolves.toEqual({ planId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_treatment_plan", {
      p_acting_branch_id: branchId, p_patient_id: patientId, p_title: "Full mouth restoration",
    });

    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, version: 2 }], error: null });
    await expect(updateTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 1, title: "Restoration v2" })).resolves.toEqual({ planId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("update_treatment_plan", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 1, p_title: "Restoration v2",
    });

    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, version: 3 }], error: null });
    await expect(presentTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 2 })).resolves.toEqual({ planId, version: 3 });
    expect(rpc).toHaveBeenLastCalledWith("present_treatment_plan", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 2,
    });

    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, version: 4 }], error: null });
    await expect(acknowledgeTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 3 })).resolves.toEqual({ planId, version: 4 });
    expect(rpc).toHaveBeenLastCalledWith("acknowledge_treatment_plan", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 3,
    });
  });

  it("binds item add, update, and remove to their exact contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, line_no: 1 }], error: null });
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, procedureId, toothCode: "26", description: "Composite filling on 26.", estimatedFeeCentavos: "250000" })).resolves.toEqual({ itemId, lineNo: 1 });
    expect(rpc).toHaveBeenLastCalledWith("add_treatment_plan_item_centavos", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 1, p_procedure_id: procedureId,
      p_tooth_code: "26", p_description: "Composite filling on 26.", p_estimated_fee_centavos: "250000",
    });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, line_no: 1 }], error: null });
    await addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "No extras" });
    expect(rpc).toHaveBeenLastCalledWith("add_treatment_plan_item_centavos", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 1, p_procedure_id: null,
      p_tooth_code: null, p_description: "No extras", p_estimated_fee_centavos: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, line_no: 2 }], error: null });
    await addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Detailed", priority: "HIGH", sequenceNo: 2, surfaces: ["O", "M"], notes: "Synthetic detail" });
    expect(rpc).toHaveBeenLastCalledWith("add_treatment_plan_item_centavos", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 1, p_procedure_id: null,
      p_tooth_code: null, p_description: "Detailed", p_estimated_fee_centavos: null,
      p_priority: "HIGH", p_sequence_no: 2, p_surfaces: ["O", "M"], p_notes: "Synthetic detail",
      p_has_priority: true, p_has_sequence_no: true, p_has_surfaces: true, p_has_notes: true,
    });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, line_no: 2 }], error: null });
    await updateTreatmentPlanItem({ actingBranchId: branchId, planId, itemId, expectedVersion: 2, description: "Partial", notes: null });
    expect(rpc).toHaveBeenLastCalledWith("update_treatment_plan_item_centavos", expect.objectContaining({
      p_has_priority: false, p_has_sequence_no: false, p_has_surfaces: false, p_has_notes: true, p_notes: null,
    }));

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, line_no: 1 }], error: null });
    await expect(updateTreatmentPlanItem({ actingBranchId: branchId, planId, itemId, expectedVersion: 2, description: "Updated", estimatedFeeCentavos: "300000" })).resolves.toEqual({ itemId, lineNo: 1 });
    expect(rpc).toHaveBeenLastCalledWith("update_treatment_plan_item_centavos", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_item_id: itemId, p_expected_version: 2,
      p_procedure_id: null, p_tooth_code: null, p_description: "Updated", p_estimated_fee_centavos: "300000",
    });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId }], error: null });
    await expect(removeTreatmentPlanItem({ actingBranchId: branchId, planId, itemId, expectedVersion: 3 })).resolves.toEqual({ itemId });
    expect(rpc).toHaveBeenLastCalledWith("remove_treatment_plan_item", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_item_id: itemId, p_expected_version: 3,
    });
  });

  it("binds alternative and discussion to their exact contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ alternative_id: alternativeId, alternative_no: 1 }], error: null });
    await expect(addTreatmentPlanAlternative({ actingBranchId: branchId, planId, expectedVersion: 1, summary: "Extraction and implant alternative." })).resolves.toEqual({ alternativeId, alternativeNo: 1 });
    expect(rpc).toHaveBeenLastCalledWith("add_treatment_plan_alternative", {
      p_acting_branch_id: branchId, p_plan_id: planId, p_expected_version: 1, p_summary: "Extraction and implant alternative.",
    });

    rpc.mockResolvedValueOnce({ data: [{ discussion_id: discussionId, discussed_at: createdAt }], error: null });
    await expect(addTreatmentPlanDiscussion({ actingBranchId: branchId, planId, context: "Case discussion", notes: "Patient prefers conservative care." })).resolves.toEqual({ discussionId, discussedAt: createdAt });
    expect(rpc).toHaveBeenLastCalledWith("add_treatment_plan_discussion_v2", {
      p_acting_branch_id: branchId, p_plan_id: planId,
      p_context: "Case discussion", p_notes: "Patient prefers conservative care.",
    });

  });

  it("lists plans with the bounded camelCase projection", async () => {
    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, title: "Full mouth restoration", status: "DRAFT", version: 1, created_at: createdAt, item_count: 2, has_drawing: false }], error: null });
    await expect(listTreatmentPlans({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      planId, title: "Full mouth restoration", status: "DRAFT", version: 1, createdAt, itemCount: 2,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_treatment_plans", {
      p_acting_branch_id: branchId, p_patient_id: patientId,
    });
  });

  it("returns the detail jsonb in the bounded DTO shape", async () => {
    const detail = {
      plan: { planId, patientId, title: "Full mouth restoration", status: "ACKNOWLEDGED", version: 3, createdAt, updatedAt: createdAt, createdBy },
      items: [{ itemId, lineNo: 1, procedureId, toothCode: "26", description: "Composite filling on 26.", estimatedFeeCentavos: "250000", priority: "HIGH", sequenceNo: 1, surfaces: ["O"], notes: "Synthetic detail", procedureCaseId: null, createdAt }],
      alternatives: [{ alternativeId, alternativeNo: 1, summary: "Extraction and implant alternative.", createdAt }],
      discussions: [{ discussionId, discussedBy: createdBy, treatingProviderId: providerId, discussedAt: createdAt, context: "Case discussion", notes: "Patient prefers conservative care.", createdAt }],
      drawing: null,
    };
    rpc.mockResolvedValueOnce({ data: detail, error: null });
    await expect(getTreatmentPlanDetail({ actingBranchId: branchId, planId })).resolves.toEqual(expect.objectContaining({ plan: detail.plan, items: detail.items, alternatives: detail.alternatives, discussions: detail.discussions }));
    expect(rpc).toHaveBeenLastCalledWith("get_treatment_plan_detail", {
      p_acting_branch_id: branchId, p_plan_id: planId,
    });
  });

  it("loads only the validated, server-authoritative completion context", async () => {
    const context = {
      patientName: "Synthetic Patient",
      signedInDentist: "Dr. Synthetic Dentist",
      serviceDate: "2026-08-30",
      findingChoices: [{ id: drawingId, label: "Tooth 26 — CARIES" }],
      cases: [{ caseId: planId, planItemId: itemId, expectedVersion: 2, procedureName: "Crown on 26", completion: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false } }],
    };
    rpc.mockResolvedValueOnce({ data: context, error: null });
    await expect(getTreatmentPlanCompletionContext({ actingBranchId: branchId, planId })).resolves.toEqual(context);
    expect(rpc).toHaveBeenLastCalledWith("get_treatment_plan_completion_context", {
      p_acting_branch_id: branchId,
      p_plan_id: planId,
    });
  });

  it("rejects malformed projection and detail rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId }], error: null });
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "Plan" })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ plan_id: planId, title: "Plan", status: "ARCHIVED", version: 1, created_at: createdAt, item_count: 0, has_drawing: false }], error: null });
    await expect(listTreatmentPlans({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: { plan: { planId, title: "Plan", status: "DRAFT", version: 1, createdAt, updatedAt: createdAt, createdBy }, items: [], alternatives: [], discussions: [], drawing: { drawingId, updatedBy: createdBy, updatedAt: createdAt, version: 1 } }, error: null });
    await expect(getTreatmentPlanDetail({ actingBranchId: branchId, planId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createTreatmentPlan({ actingBranchId: branchId, patientId, title: "Plan" })).rejects.toEqual(new TreatmentPlanServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(addTreatmentPlanItem({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item" })).rejects.toEqual(new TreatmentPlanServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(updateTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 1, title: "Plan" })).rejects.toEqual(new TreatmentPlanServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(acknowledgeTreatmentPlan({ actingBranchId: branchId, planId, expectedVersion: 1 })).rejects.toEqual(new TreatmentPlanServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listTreatmentPlans({ actingBranchId: branchId, patientId })).rejects.toEqual(new TreatmentPlanServiceError("FAILED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(getTreatmentPlanDetail({ actingBranchId: branchId, planId })).rejects.toEqual(new TreatmentPlanServiceError("NOT_AUTHORIZED"));
  });
});

describe("generateTreatmentPlanDocument", () => {
  it("forwards the plan selector and the selected sections to the document service", async () => {
    await expect(generateTreatmentPlanDocument({ actingBranchId: branchId, patientId, planId, includeSet: { items: true } })).resolves.toEqual({ documentId: "d7f00000-0000-0000-0000-00000000000f", version: 1 });
    const { generateDocument } = await import("@/lib/documents/service");
    expect(generateDocument).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      documentType: "TREATMENT_PLAN",
      planId,
      includeSet: { items: true, alternatives: false, discussions: false, drawing: false },
    });
  });
});
