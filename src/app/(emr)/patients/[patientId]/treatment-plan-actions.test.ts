import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  TreatmentPlanServiceError,
  acknowledgeTreatmentPlan,
  addTreatmentPlanAlternative,
  addTreatmentPlanDiscussion,
  addTreatmentPlanItem,
  createTreatmentPlan,
  completeTreatment,
  generateTreatmentPlanDocument,
  getTreatmentPlanCompletionContext,
  getTreatmentPlanDetail,
  presentTreatmentPlan,
  removeTreatmentPlanItem,
  revalidatePath,
  requirePermission,
  updateTreatmentPlan,
  updateTreatmentPlanItem,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  TreatmentPlanServiceError: class TreatmentPlanServiceError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
  acknowledgeTreatmentPlan: vi.fn(),
  addTreatmentPlanAlternative: vi.fn(),
  addTreatmentPlanDiscussion: vi.fn(),
  addTreatmentPlanItem: vi.fn(),
  createTreatmentPlan: vi.fn(),
  completeTreatment: vi.fn(),
  generateTreatmentPlanDocument: vi.fn(),
  getTreatmentPlanCompletionContext: vi.fn(),
  getTreatmentPlanDetail: vi.fn(),
  presentTreatmentPlan: vi.fn(),
  removeTreatmentPlanItem: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  updateTreatmentPlan: vi.fn(),
  updateTreatmentPlanItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/treatment-plan/service", () => ({
  TreatmentPlanServiceError,
  acknowledgeTreatmentPlan,
  addTreatmentPlanAlternative,
  addTreatmentPlanDiscussion,
  addTreatmentPlanItem,
  createTreatmentPlan,
  completeTreatment,
  generateTreatmentPlanDocument,
  getTreatmentPlanCompletionContext,
  getTreatmentPlanDetail,
  presentTreatmentPlan,
  removeTreatmentPlanItem,
  updateTreatmentPlan,
  updateTreatmentPlanItem,
}));

import {
  acknowledgeTreatmentPlanAction,
  addTreatmentPlanAlternativeAction,
  addTreatmentPlanDiscussionAction,
  addTreatmentPlanItemAction,
  createTreatmentPlanAction,
  completeTreatmentAction,
  getTreatmentPlanCompletionContextAction,
  getTreatmentPlanDetailAction,
  presentTreatmentPlanAction,
  printTreatmentPlanAction,
  removeTreatmentPlanItemAction,
  updateTreatmentPlanAction,
  updateTreatmentPlanItemAction,
} from "./treatment-plan-actions";

const branchId = "d7100000-0000-0000-0000-000000000001";
const patientId = "d7500000-0000-0000-0000-000000000001";
const planId = "d7a00000-0000-0000-0000-000000000001";
const itemId = "d7a00000-0000-0000-0000-000000000002";
const providerId = "d9200000-0000-0000-0000-000000000001";

const detail = {
  plan: { planId, patientId, title: "Full mouth restoration", status: "DRAFT", version: 1, createdAt: "2026-08-27T09:00:00+00:00", updatedAt: "2026-08-27T09:00:00+00:00", createdBy: "d7100000-0000-0000-0000-000000000002" },
  items: [],
  alternatives: [],
  discussions: [],
};

const createInput = { actingBranchId: branchId, patientId, title: "Full mouth restoration" };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  createTreatmentPlan.mockResolvedValue({ planId, version: 1 });
  completeTreatment.mockResolvedValue({ caseId: planId, chargeId: itemId, clinicalEntryId: itemId, bridgeId: null, implantComponentId: null });
  updateTreatmentPlan.mockResolvedValue({ planId, version: 2 });
  presentTreatmentPlan.mockResolvedValue({ planId, version: 2 });
  acknowledgeTreatmentPlan.mockResolvedValue({ planId, version: 3 });
  addTreatmentPlanItem.mockResolvedValue({ itemId, lineNo: 1 });
  updateTreatmentPlanItem.mockResolvedValue({ itemId, lineNo: 1 });
  removeTreatmentPlanItem.mockResolvedValue({ itemId });
  addTreatmentPlanAlternative.mockResolvedValue({ alternativeId: "d7a00000-0000-0000-0000-000000000003", alternativeNo: 1 });
  addTreatmentPlanDiscussion.mockResolvedValue({ discussionId: "d7a00000-0000-0000-0000-000000000004", discussedAt: "2026-08-27T09:30:00+00:00" });
  getTreatmentPlanDetail.mockResolvedValue(detail);
  getTreatmentPlanCompletionContext.mockResolvedValue({ patientName: "Synthetic Patient", signedInDentist: "Dr. Synthetic Dentist", serviceDate: "2026-08-30", findingChoices: [], cases: [] });
  generateTreatmentPlanDocument.mockResolvedValue({ documentId: "d7f00000-0000-0000-0000-00000000000f", version: 1 });
});

describe("treatment plan plan-level actions", () => {
  it("rechecks clinical-write at the submitted branch before creating a plan", async () => {
    await expect(createTreatmentPlanAction(createInput)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createTreatmentPlan.mock.invocationCallOrder[0]);
    expect(createTreatmentPlan).toHaveBeenCalledWith(createInput);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("rejects malformed input without reaching authorization or the RPC", async () => {
    await expect(createTreatmentPlanAction({ ...createInput, patientId: "forged" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(createTreatmentPlanAction({ ...createInput, organizationId: "foreign-org" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createTreatmentPlan).not.toHaveBeenCalled();
  });

  it("rechecks clinical-write for update, present, and acknowledge", async () => {
    await expect(updateTreatmentPlanAction({ actingBranchId: branchId, planId, expectedVersion: 1, title: "Restoration v2" })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(updateTreatmentPlan).toHaveBeenCalledWith({ actingBranchId: branchId, planId, expectedVersion: 1, title: "Restoration v2" });

    await expect(presentTreatmentPlanAction({ actingBranchId: branchId, planId, expectedVersion: 1 })).resolves.toEqual({ ok: true });
    await expect(acknowledgeTreatmentPlanAction({ actingBranchId: branchId, planId, expectedVersion: 2 })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledTimes(3);
  });

  it("maps authorization and service failures to safe codes", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createTreatmentPlanAction(createInput)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    createTreatmentPlan.mockRejectedValueOnce(new TreatmentPlanServiceError("INVALID_STATE"));
    await expect(createTreatmentPlanAction(createInput)).resolves.toEqual({ ok: false, code: "INVALID_STATE" });
    createTreatmentPlan.mockRejectedValueOnce(new Error("unexpected"));
    await expect(createTreatmentPlanAction(createInput)).resolves.toEqual({ ok: false, code: "FAILED" });
  });

  it("maps stale-version failures on present/acknowledge to safe codes", async () => {
    acknowledgeTreatmentPlan.mockRejectedValueOnce(new TreatmentPlanServiceError("STALE_VERSION"));
    await expect(acknowledgeTreatmentPlanAction({ actingBranchId: branchId, planId, expectedVersion: 2 })).resolves.toEqual({ ok: false, code: "STALE_VERSION" });
    presentTreatmentPlan.mockRejectedValueOnce(new TreatmentPlanServiceError("INVALID_STATE"));
    await expect(presentTreatmentPlanAction({ actingBranchId: branchId, planId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "INVALID_STATE" });
  });
});

describe("completeTreatmentAction", () => {
  it("requires clinical and billing authority before the atomic case completion", async () => {
    const input = { actingBranchId: branchId, caseId: planId, expectedVersion: 1, resolvedFindingIds: [], amountCentavos: "5000000", completion: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false }, idempotencyKey: "complete-1" };
    await expect(completeTreatmentAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenNthCalledWith(1, { permission: "patient.clinical.write", branchId });
    expect(requirePermission).toHaveBeenNthCalledWith(2, { permission: "billing.charge", branchId });
    expect(completeTreatment).toHaveBeenCalledWith(input);
  });
});

describe("treatment plan item and alternative actions", () => {
  it("recheck clinical-write at the submitted branch", async () => {
    const addItem = { actingBranchId: branchId, planId, expectedVersion: 1, description: "Composite filling on 26.", toothCode: "26", estimatedFeeCentavos: "250000" };
    await expect(addTreatmentPlanItemAction(addItem)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(addTreatmentPlanItem).toHaveBeenCalledWith(addItem);

    const updateItem = { actingBranchId: branchId, planId, itemId, expectedVersion: 1, description: "Updated.", toothCode: "27" };
    await expect(updateTreatmentPlanItemAction(updateItem)).resolves.toEqual({ ok: true });
    expect(updateTreatmentPlanItem).toHaveBeenCalledWith(updateItem);

    await expect(removeTreatmentPlanItemAction({ actingBranchId: branchId, planId, itemId, expectedVersion: 1 })).resolves.toEqual({ ok: true });
    expect(removeTreatmentPlanItem).toHaveBeenCalledWith({ actingBranchId: branchId, planId, itemId, expectedVersion: 1 });

    const addAlternative = { actingBranchId: branchId, planId, expectedVersion: 1, summary: "Extraction and implant alternative." };
    await expect(addTreatmentPlanAlternativeAction(addAlternative)).resolves.toEqual({ ok: true });
    expect(addTreatmentPlanAlternative).toHaveBeenCalledWith(addAlternative);
    expect(requirePermission).toHaveBeenCalledTimes(4);
  });

  it("rejects invalid items and alternatives before authorization", async () => {
    await expect(addTreatmentPlanItemAction({ actingBranchId: branchId, planId, expectedVersion: 1, description: "" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(addTreatmentPlanItemAction({ actingBranchId: branchId, planId, expectedVersion: 1, description: "Item", toothCode: "49" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(addTreatmentPlanAlternativeAction({ actingBranchId: branchId, planId, expectedVersion: 1, summary: "" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(addTreatmentPlanItem).not.toHaveBeenCalled();
    expect(addTreatmentPlanAlternative).not.toHaveBeenCalled();
  });
});

describe("treatment plan discussion actions", () => {
  it("recheck clinical-write and forward the bounded inputs", async () => {
    const discussion = { actingBranchId: branchId, planId, treatingProviderId: providerId, context: "Case discussion" };
    await expect(addTreatmentPlanDiscussionAction(discussion)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(addTreatmentPlanDiscussion).toHaveBeenCalledWith(discussion);

  });

  it("rejects malformed discussion context before authorization", async () => {
    await expect(addTreatmentPlanDiscussionAction({ actingBranchId: branchId, planId, context: "   " })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(addTreatmentPlanDiscussion).not.toHaveBeenCalled();
  });
});

describe("getTreatmentPlanDetailAction", () => {
  it("requires only live clinical-read at the submitted branch", async () => {
    const input = { actingBranchId: branchId, planId };
    await expect(getTreatmentPlanDetailAction(input)).resolves.toEqual({ ok: true, detail });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.read", branchId });
    expect(getTreatmentPlanDetail).toHaveBeenCalledWith(input);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps read failures to safe codes", async () => {
    getTreatmentPlanDetail.mockRejectedValueOnce(new TreatmentPlanServiceError("NOT_AUTHORIZED"));
    await expect(getTreatmentPlanDetailAction({ actingBranchId: branchId, planId })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });
});

describe("getTreatmentPlanCompletionContextAction", () => {
  it("requires live clinical-write and charge authority before returning completion data", async () => {
    const input = { actingBranchId: branchId, planId };
    await expect(getTreatmentPlanCompletionContextAction(input)).resolves.toMatchObject({ ok: true });
    expect(requirePermission).toHaveBeenNthCalledWith(1, { permission: "patient.clinical.write", branchId });
    expect(requirePermission).toHaveBeenNthCalledWith(2, { permission: "billing.charge", branchId });
    expect(getTreatmentPlanCompletionContext).toHaveBeenCalledWith(input);
  });
});

describe("printTreatmentPlanAction", () => {
  it("rechecks clinical-read and document.generate before generating the document", async () => {
    const input = { actingBranchId: branchId, patientId, planId, includeSet: { items: true, alternatives: true, discussions: true } };
    await expect(printTreatmentPlanAction(input)).resolves.toEqual({ ok: true, documentId: "d7f00000-0000-0000-0000-00000000000f" });
    expect(requirePermission).toHaveBeenNthCalledWith(1, { permission: "patient.clinical.read", branchId });
    expect(requirePermission).toHaveBeenNthCalledWith(2, { permission: "document.generate", branchId });
    expect(generateTreatmentPlanDocument).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("rejects malformed input before authorization", async () => {
    const result = await printTreatmentPlanAction({ actingBranchId: branchId, patientId, planId, includeSet: { billing: true } });
    expect(result).toEqual({ ok: false, message: "The treatment plan could not be printed." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(generateTreatmentPlanDocument).not.toHaveBeenCalled();
  });

  it("maps authorization and service failures to safe messages", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(printTreatmentPlanAction({ actingBranchId: branchId, patientId, planId, includeSet: { items: true } })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow printing this plan." });

    requirePermission.mockResolvedValueOnce({});
    generateTreatmentPlanDocument.mockRejectedValueOnce(new TreatmentPlanServiceError("NOT_AUTHORIZED"));
    await expect(printTreatmentPlanAction({ actingBranchId: branchId, patientId, planId, includeSet: { items: true } })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow printing this plan." });

    requirePermission.mockResolvedValueOnce({});
    generateTreatmentPlanDocument.mockRejectedValueOnce(new Error("unexpected"));
    await expect(printTreatmentPlanAction({ actingBranchId: branchId, patientId, planId, includeSet: { items: true } })).resolves.toEqual({ ok: false, message: "The treatment plan could not be printed. Try again." });
  });
});
