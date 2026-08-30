import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { OdontogramServiceError, mapOdontogramRpcError } from "./errors";
import {
  amendCurrentBridge,
  amendPeriodontalExamination,
  amendToothClinicalEntry,
  completeTreatmentPlanItemWithCharge,
  correctTreatmentPlanItemExecution,
  createPeriodontalExamination,
  createPlanBridgeDesign,
  createPlanImplantDesign,
  createToothCondition,
  finalizePeriodontalExamination,
  getPatientOdontogram,
  listToothConditions,
  recordCurrentBridge,
  recordCurrentImplantComponent,
  recordToothClinicalEntry,
  resolveLegacyOdontogramEntry,
  savePeriodontalMeasurements,
  transitionTreatmentPlanItemExecution,
  updateDraftPlanBridgeDesign,
  updateDraftPlanImplantDesign,
  voidCurrentBridge,
  voidCurrentImplantComponent,
  voidToothClinicalEntry,
  voidToothCondition,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const conditionId = "c3000000-0000-0000-0000-000000000003";
const recordedBy = "d1000000-0000-0000-0000-000000000001";
const recordedAt = "2026-08-27T09:00:00+00:00";
const entryId = "c4000000-0000-0000-0000-000000000004";
const bridgeId = "c5000000-0000-0000-0000-000000000005";
const componentId = "c6000000-0000-0000-0000-000000000006";
const encounterId = "c7000000-0000-0000-0000-000000000007";
const providerId = "d2000000-0000-0000-0000-000000000002";
const chargeId = "c8000000-0000-0000-0000-000000000008";
const planId = "c9000000-0000-0000-0000-000000000009";
const itemId = "ca000000-0000-0000-0000-00000000000a";
const examinationId = "cb000000-0000-0000-0000-00000000000b";

describe("odontogram service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapOdontogramRpcError({ code: "42501", message: "not authorized" })).toEqual(new OdontogramServiceError("NOT_AUTHORIZED"));
    expect(mapOdontogramRpcError({ code: "22023", message: "invalid input" })).toEqual(new OdontogramServiceError("INVALID_INPUT"));
    expect(mapOdontogramRpcError({ code: "P0001", message: "stale version" })).toEqual(new OdontogramServiceError("STALE_VERSION"));
    expect(mapOdontogramRpcError({ code: "P0001", message: "invalid state" })).toEqual(new OdontogramServiceError("INVALID_STATE"));
    expect(mapOdontogramRpcError({ code: "XX000", message: "unexpected" })).toEqual(new OdontogramServiceError("FAILED"));
    expect(mapOdontogramRpcError("boom")).toEqual(new OdontogramServiceError("FAILED"));
  });
});

describe("odontogram service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects forbidden org identifiers and forged tenant keys before any RPC", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId, organizationId: "foreign-org", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, branchId: "foreign-branch", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listToothConditions({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers, tooth codes, surfaces, statuses, and finding types", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId: "not-a-uuid", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "09" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "50" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", surface: "X" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", status: "HEALED" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", findingType: "IMPLANT" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId: "forged", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects oversized notes and reason fields", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", notes: "N".repeat(2001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1, reason: "R".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects read inputs with unknown keys or malformed ids", async () => {
    await expect(listToothConditions({ actingBranchId: branchId, patientId, includeHistory: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("odontogram O5 input validation boundary — forged tenant keys", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects forged tenant keys across all O5 clinical entry RPCs before any RPC", async () => {
    await expect(getPatientOdontogram({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: ["O"], kind: "FINDING", clinicalCode: "CARIES", status: "EXISTING", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(amendToothClinicalEntry({ actingBranchId: branchId, entryId, expectedVersion: 1, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothClinicalEntry({ actingBranchId: branchId, entryId, expectedVersion: 1, reason: "x", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "NO_CURRENT_STATE", reason: "synthetic reason", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects forged keys for bridge and implant RPCs", async () => {
    const units = [{ tooth_fdi: "16", ordinal: 1, role: "ABUTMENT" as const, support_kind: "NATURAL_TOOTH" as const, support_component_id: null }, { tooth_fdi: "15", ordinal: 2, role: "PONTIC" as const, support_kind: "NONE" as const, support_component_id: null }];
    await expect(createPlanBridgeDesign({ actingBranchId: branchId, patientId, parentPlanItemId: itemId, units, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateDraftPlanBridgeDesign({ actingBranchId: branchId, bridgeId, expectedVersion: 1, units, branchId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordCurrentBridge({ actingBranchId: branchId, patientId, units, treatingProviderId: providerId, executedAt: recordedAt, chargeId, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(amendCurrentBridge({ actingBranchId: branchId, bridgeId, expectedVersion: 1, units, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidCurrentBridge({ actingBranchId: branchId, bridgeId, expectedVersion: 1, reason: "synthetic", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    const components = { tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" as const };
    await expect(createPlanImplantDesign({ actingBranchId: branchId, patientId, parentPlanItemId: itemId, components, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateDraftPlanImplantDesign({ actingBranchId: branchId, componentId, expectedVersion: 1, components, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordCurrentImplantComponent({ actingBranchId: branchId, patientId, components, treatingProviderId: providerId, executedAt: recordedAt, chargeId, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidCurrentImplantComponent({ actingBranchId: branchId, componentId, expectedVersion: 1, reason: "synthetic", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects forged keys for perio and execution RPCs", async () => {
    await expect(createPeriodontalExamination({ actingBranchId: branchId, patientId, encounterId, examinationKind: "INITIAL", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(savePeriodontalMeasurements({ actingBranchId: branchId, examinationId, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(finalizePeriodontalExamination({ actingBranchId: branchId, examinationId, expectedVersion: 1, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(amendPeriodontalExamination({ actingBranchId: branchId, predecessorExaminationId: examinationId, encounterId, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(transitionTreatmentPlanItemExecution({ actingBranchId: branchId, itemId, expectedVersion: 1, targetState: "ACCEPTED", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(completeTreatmentPlanItemWithCharge({ actingBranchId: branchId, itemId, expectedVersion: 1, providerId, amountCentavos: 1000, serviceDate: "2026-08-28", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(correctTreatmentPlanItemExecution({ actingBranchId: branchId, itemId, expectedVersion: 1, targetState: "PROPOSED", reason: "synthetic", organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid tooth codes, surfaces, kinds, and statuses for clinical entries", async () => {
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "99", surfaces: ["O"], kind: "FINDING", clinicalCode: "CARIES", status: "EXISTING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: [] as never[], kind: "FINDING", clinicalCode: "CARIES", status: "EXISTING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: ["X" as never], kind: "FINDING", clinicalCode: "CARIES", status: "EXISTING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: ["O"], kind: "UNKNOWN" as never, clinicalCode: "CARIES", status: "EXISTING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothClinicalEntry({ actingBranchId: branchId, entryId, expectedVersion: 0, reason: "x" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid bridge/implant/perio/execution enums and bounds", async () => {
    await expect(resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "INVALID" as never, reason: "r" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "LINK_CANONICAL", reason: "r" })).rejects.toBeInstanceOf(z.ZodError); // missing resolved id
    await expect(resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "LINK_CANONICAL", resolvedClinicalEntryId: conditionId, resolvedBridgeId: bridgeId, reason: "r" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "NO_CURRENT_STATE", resolvedTreatmentPlanItemId: itemId, reason: "r" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPeriodontalExamination({ actingBranchId: branchId, patientId, encounterId, examinationKind: "UNKNOWN" as never })).rejects.toBeInstanceOf(z.ZodError);
    await expect(transitionTreatmentPlanItemExecution({ actingBranchId: branchId, itemId, expectedVersion: 1, targetState: "COMPLETED" as never })).rejects.toBeInstanceOf(z.ZodError);
    await expect(transitionTreatmentPlanItemExecution({ actingBranchId: branchId, itemId, expectedVersion: 1, targetState: "CANCELLED" })).rejects.toBeInstanceOf(z.ZodError); // missing reason
    await expect(completeTreatmentPlanItemWithCharge({ actingBranchId: branchId, itemId, expectedVersion: 1, providerId, amountCentavos: -1, serviceDate: "2026-08-28" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("odontogram provider identity boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects caller-selected providers and accepts provider-free current bridge input", async () => {
    const units = [
      { tooth_fdi: "16", ordinal: 1, role: "ABUTMENT" as const, support_kind: "NATURAL_TOOTH" as const, support_component_id: null },
      { tooth_fdi: "15", ordinal: 2, role: "PONTIC" as const, support_kind: "NONE" as const, support_component_id: null },
    ];
    const { recordCurrentBridgeInputSchema } = await import("./schema");
    expect(recordCurrentBridgeInputSchema.safeParse({ actingBranchId: branchId, patientId, units, treatingProviderId: providerId, executedAt: recordedAt, chargeId }).success).toBe(false);
  });
});

describe("odontogram service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds each legacy resolution target alternative explicitly", async () => {
    const alternatives = [
      { input: { resolvedClinicalEntryId: conditionId }, rpc: { clinical: conditionId, bridge: null, item: null } },
      { input: { resolvedBridgeId: bridgeId }, rpc: { clinical: null, bridge: bridgeId, item: null } },
      { input: { resolvedTreatmentPlanItemId: itemId }, rpc: { clinical: null, bridge: null, item: itemId } },
    ] as const;

    for (const alternative of alternatives) {
      rpc.mockResolvedValueOnce({ data: [{ resolution_id: conditionId, legacy_entry_id: entryId, patient_id: patientId, resolution_kind: "LINK_CANONICAL" }], error: null });
      rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });
      await resolveLegacyOdontogramEntry({
        actingBranchId: branchId,
        legacyEntryId: entryId,
        resolutionKind: "LINK_CANONICAL",
        ...alternative.input,
        reason: "Synthetic reconciliation",
      });
      expect(rpc).toHaveBeenCalledWith("resolve_legacy_odontogram_entry", {
        p_acting_branch_id: branchId,
        p_legacy_entry_id: entryId,
        p_resolution_kind: "LINK_CANONICAL",
        p_resolved_clinical_entry_id: alternative.rpc.clinical,
        p_resolved_bridge_id: alternative.rpc.bridge,
        p_resolved_treatment_plan_item_id: alternative.rpc.item,
        p_reason: "Synthetic reconciliation",
      });
    }

    rpc.mockResolvedValueOnce({ data: [{ resolution_id: conditionId, legacy_entry_id: entryId, patient_id: patientId, resolution_kind: "NO_CURRENT_STATE" }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });
    await resolveLegacyOdontogramEntry({ actingBranchId: branchId, legacyEntryId: entryId, resolutionKind: "NO_CURRENT_STATE", reason: "Synthetic no current state" });
    expect(rpc).toHaveBeenCalledWith("resolve_legacy_odontogram_entry", {
      p_acting_branch_id: branchId,
      p_legacy_entry_id: entryId,
      p_resolution_kind: "NO_CURRENT_STATE",
      p_resolved_clinical_entry_id: null,
      p_resolved_bridge_id: null,
      p_resolved_treatment_plan_item_id: null,
      p_reason: "Synthetic no current state",
    });
  });

  it("binds condition create to its exact contract with defaults", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1 }], error: null });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).resolves.toEqual({ conditionId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_tooth_condition", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_tooth_code: "16",
      p_surface: "FULL",
      p_status: "ACTIVE",
      p_finding_type: "OTHER",
      p_notes: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1 }], error: null });
    await createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", surface: "O", status: "PLANNED", findingType: "CARIES", notes: "Synthetic caries" });
    expect(rpc).toHaveBeenLastCalledWith("create_tooth_condition", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_tooth_code: "16",
      p_surface: "O",
      p_status: "PLANNED",
      p_finding_type: "CARIES",
      p_notes: "Synthetic caries",
    });
  });

  it("binds condition void to its exact contract with the optimistic version", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 2 }], error: null });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1, reason: "Synthetic correction" })).resolves.toEqual({ conditionId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("void_tooth_condition", {
      p_acting_branch_id: branchId,
      p_condition_id: conditionId,
      p_expected_version: 1,
      p_reason: "Synthetic correction",
    });

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 2 }], error: null });
    await voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("void_tooth_condition", {
      p_acting_branch_id: branchId,
      p_condition_id: conditionId,
      p_expected_version: 1,
      p_reason: null,
    });
  });

  it("lists conditions with the full projection and defaults history to false", async () => {
    const row = {
      condition_id: conditionId,
      tooth_code: "16",
      surface: "FULL",
      status: "ACTIVE",
      finding_type: "CARIES",
      notes: null,
      recorded_by: recordedBy,
      recorded_at: recordedAt,
      voided_at: null,
      version: 1,
    };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      conditionId, toothCode: "16", surface: "FULL", status: "ACTIVE", findingType: "CARIES", notes: null, recordedBy, recordedAt, voidedAt: null, version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_tooth_conditions", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_history: false,
    });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listToothConditions({ actingBranchId: branchId, patientId, includeHistory: true });
    expect(rpc).toHaveBeenLastCalledWith("list_tooth_conditions", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_history: true,
    });
  });

  it("rejects malformed mutation and projection rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId }], error: null });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1, tooth_code: "99", surface: "FULL", status: "ACTIVE", finding_type: "CARIES", notes: null, recorded_by: recordedBy, recorded_at: recordedAt, voided_at: null }], error: null });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each service", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toEqual(new OdontogramServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toEqual(new OdontogramServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 })).rejects.toEqual(new OdontogramServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 })).rejects.toEqual(new OdontogramServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).rejects.toEqual(new OdontogramServiceError("FAILED"));
  });

  it("binds O5 getPatientOdontogram to its exact contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ entry_id: null, data: { patientId, entries: [], bridges: [], implantChains: [], periodontalExaminations: [], legacyReconciliationFlags: [], treatmentExecutions: [] } }], error: null });
    await expect(getPatientOdontogram({ actingBranchId: branchId, patientId })).resolves.toEqual({ patientId, entries: [], bridges: [], implantChains: [], periodontalExaminations: [], legacyReconciliationFlags: [], treatmentExecutions: [] });
    expect(rpc).toHaveBeenLastCalledWith("get_patient_odontogram_v3", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
    });
  });

  it("binds the provider-free charge-linked implant v3 contract exactly", async () => {
    const components = [{ tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" as const }];
    rpc.mockResolvedValueOnce({ data: [{ component_id: componentId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });

    await expect(recordCurrentImplantComponent({
      actingBranchId: branchId, patientId, components, chargeId, occurredAt: recordedAt, idempotencyKey: "implant-v3-contract",
    })).resolves.toEqual({ componentId, patientId, version: 1 });

    expect(rpc).toHaveBeenCalledWith("record_current_implant_component_v3", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_components: components,
      p_occurred_at: recordedAt,
      p_charge_id: chargeId,
      p_idempotency_key: "implant-v3-contract",
    });
  });

  it("binds O5 clinical entry mutations to their exact contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ entry_id: entryId, patient_id: patientId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: ["O"], kind: "FINDING", status: "EXISTING", detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null }, idempotencyKey: "odontogram-entry-0001" })).resolves.toEqual({ entryId, patientId, version: 1 });
    expect(rpc).toHaveBeenCalledWith("record_tooth_clinical_entry_v3", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_tooth_code: "16",
      p_surfaces: ["O"],
      p_kind: "FINDING",
      p_clinical_code: "CARIES",
      p_status: "EXISTING",
      p_detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null },
      p_notes: null,
      p_occurred_at: null,
      p_idempotency_key: "odontogram-entry-0001",
    });

    rpc.mockResolvedValueOnce({ data: [{ entry_id: entryId, patient_id: patientId, version: 2 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });
    await expect(voidToothClinicalEntry({ actingBranchId: branchId, entryId, expectedVersion: 1, reason: "synthetic void" })).resolves.toEqual({ entryId, patientId, version: 2 });
    expect(rpc).toHaveBeenCalledWith("void_tooth_clinical_entry", {
      p_acting_branch_id: branchId,
      p_entry_id: entryId,
      p_expected_version: 1,
      p_reason: "synthetic void",
    });
  });

  it("requires a complete renderer-independent clinical feature detail when recording an entry", async () => {
    rpc.mockResolvedValueOnce({ data: [{ entry_id: entryId, patient_id: patientId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });
    await expect(recordToothClinicalEntry({
      actingBranchId: branchId,
      patientId,
      toothCode: "16",
      surfaces: ["O"],
      kind: "FINDING",
      status: "EXISTING",
      detail: { code: "CARIES", depth: "DENTIN", icdas: 3, cars: null, radiographicDepth: null },
      idempotencyKey: "odontogram-detail-0001",
    })).resolves.toEqual({ entryId, patientId, version: 1 });

    await expect(recordToothClinicalEntry({
      actingBranchId: branchId,
      patientId,
      toothCode: "16",
      surfaces: ["O"],
      kind: "FINDING",
      status: "EXISTING",
      detail: { code: "CARIES", depth: "DENTIN", icdas: 7, cars: null, radiographicDepth: null },
      idempotencyKey: "odontogram-detail-0002",
    })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("resolves the authoritative patient when a legacy mutation row omits it", async () => {
    rpc.mockResolvedValueOnce({ data: [{ entry_id: entryId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });

    await expect(recordToothClinicalEntry({
      actingBranchId: branchId,
      patientId,
      toothCode: "16",
      surfaces: ["O"],
      kind: "FINDING",
      status: "EXISTING",
      detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null },
      idempotencyKey: "odontogram-entry-0003",
    })).resolves.toEqual({ entryId, patientId, version: 1 });

    expect(rpc).toHaveBeenLastCalledWith("resolve_odontogram_entity_patient", {
      p_acting_branch_id: branchId,
      p_entity_kind: "CLINICAL_ENTRY",
      p_entity_id: entryId,
    });
  });

  it("binds plan designs to the authoritative treatment plan item contract", async () => {
    const units = [
      { tooth_fdi: "16", ordinal: 1, role: "ABUTMENT" as const, support_kind: "NATURAL_TOOTH" as const, support_component_id: null },
      { tooth_fdi: "15", ordinal: 2, role: "PONTIC" as const, support_kind: "NONE" as const, support_component_id: null },
    ];
    rpc.mockResolvedValueOnce({ data: [{ bridge_id: bridgeId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });

    await expect(createPlanBridgeDesign({ actingBranchId: branchId, patientId, parentPlanItemId: itemId, units }))
      .resolves.toEqual({ bridgeId, patientId, version: 1 });
    expect(rpc).toHaveBeenCalledWith("create_plan_bridge_design", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_parent_plan_item_id: itemId,
      p_units: units,
    });

    const components = [{ tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" as const }];
    rpc.mockResolvedValueOnce({ data: [{ component_id: componentId, version: 1 }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId }], error: null });

    await expect(createPlanImplantDesign({ actingBranchId: branchId, patientId, parentPlanItemId: itemId, components }))
      .resolves.toEqual({ componentId, patientId, version: 1 });
    expect(rpc).toHaveBeenCalledWith("create_plan_implant_design", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_parent_plan_item_id: itemId,
      p_components: components,
    });
  });

  it("rejects unknown fields anywhere in the bounded odontogram DTO", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        data: {
          patientId,
          entries: [],
          bridges: [{
            id: bridgeId,
            patient_id: patientId,
            record_kind: "CURRENT",
            parent_plan_id: null,
            parent_plan_item_id: null,
            source_plan_design_id: null,
            support_kind: "NATURAL_TOOTH",
            treating_provider_id: providerId,
            executed_at: recordedAt,
            charge_id: chargeId,
            recorded_by: recordedBy,
            recorded_at: recordedAt,
            version: 1,
            sealed_at: recordedAt,
            voided_at: null,
            supersedes_bridge_id: null,
            event_state: "CURRENT",
            units: [],
            forged_tenant_field: "must-not-cross-boundary",
          }],
          implantChains: [],
          periodontalExaminations: [],
          legacyReconciliationFlags: [],
          treatmentExecutions: [],
        },
      }],
      error: null,
    });

    await expect(getPatientOdontogram({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("parses every bounded odontogram DTO family without open records", async () => {
    const data = {
      patientId,
      entries: [{
        id: entryId,
        patient_id: patientId,
        tooth_code: "16",
        kind: "FINDING",
        clinical_code: "CARIES",
        status: "ACTIVE",
        lifecycle: "OPEN",
        event_state: "CURRENT",
        provenance: "INTERNAL",
        notes: null,
        version: 1,
        recorded_at: recordedAt,
        recorded_by: recordedBy,
        treating_provider_id: null,
        encounter_id: null,
        treatment_plan_item_id: null,
        charge_id: null,
        effective_at: null,
        completed_at: null,
        voided_at: null,
        supersedes_entry_id: null,
        superseded_by_entry_id: null,
        surfaces: ["O"],
      }],
      bridges: [{
        id: bridgeId,
        patient_id: patientId,
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_id: null,
        support_kind: "NATURAL_TOOTH",
        treating_provider_id: providerId,
        executed_at: recordedAt,
        charge_id: chargeId,
        recorded_by: recordedBy,
        recorded_at: recordedAt,
        version: 1,
        sealed_at: recordedAt,
        voided_at: null,
        supersedes_bridge_id: null,
        event_state: "CURRENT",
        units: [{ tooth_fdi: "16", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null }],
      }],
      implantChains: [{
        root_component_id: componentId,
        tooth_fdi: "16",
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_component_id: null,
        treating_provider_id: providerId,
        executed_at: recordedAt,
        charge_id: chargeId,
        recorded_by: recordedBy,
        recorded_at: recordedAt,
        event_state: "CURRENT",
        components: [{
          id: componentId,
          ordinal: 1,
          component_kind: "FIXTURE",
          attachment_value: null,
          depends_on_component_id: null,
          supersedes_component_id: null,
          version: 1,
          sealed_at: recordedAt,
          event_state: "CURRENT",
        }],
      }],
      periodontalExaminations: [{
        id: examinationId,
        patient_id: patientId,
        encounter_id: encounterId,
        predecessor_examination_id: null,
        examination_kind: "INITIAL",
        status: "DRAFT",
        version: 1,
        examined_at: null,
        examined_provider_id: null,
        finalized_at: null,
        finalized_provider_id: null,
        finalized_by: null,
        sites: [{
          id: conditionId,
          tooth_fdi: "16",
          site: "B",
          probing_depth_mm: 3,
          gingival_margin_mm: 0,
          bleeding_on_probing: false,
          suppuration: false,
          tooth_present: true,
          implant_context: false,
          recorded_at: recordedAt,
          cal_mm: 3,
        }],
        plaque: [{ id: entryId, tooth_fdi: "16", surface: "BUCCAL", plaque_present: false, recorded_at: recordedAt }],
        tooth: [{ id: bridgeId, tooth_fdi: "16", mobility_miller: "M0", implant_context: false, notes: null, recorded_at: recordedAt, tooth_present: true, context_inferred: false }],
        furcation: [{ id: componentId, tooth_fdi: "16", entrance: "buccal", grade: 1, recorded_at: recordedAt }],
      }],
      legacyReconciliationFlags: [{
        legacy_entry_id: conditionId,
        tooth_code: "16",
        surface: "FULL",
        status: "ACTIVE",
        finding_type: "CARIES",
        resolution_kind: null,
        resolved_clinical_entry_id: null,
        resolved_bridge_id: null,
        resolved_treatment_plan_item_id: null,
      }],
      treatmentExecutions: [{
        item_id: itemId,
        patient_id: patientId,
        plan_id: planId,
        current_state: "ACCEPTED",
        version: 2,
        current_event_id: conditionId,
        completion_charge_id: null,
        completion_clinical_entry_id: null,
        completion_bridge_id: null,
        completion_implant_component_id: null,
        events: [{ id: conditionId, predecessor_event_id: null, from_state: "PROPOSED", to_state: "ACCEPTED", actor_user_id: recordedBy, reason: null, occurred_at: recordedAt }],
      }],
    };
    rpc.mockResolvedValueOnce({ data: [{ entry_id: null, data }], error: null });

    await expect(getPatientOdontogram({ actingBranchId: branchId, patientId })).resolves.toMatchObject({
      patientId,
      bridges: [{ bridgeId }],
      implantChains: [{ root_component_id: componentId }],
      periodontalExaminations: [{ id: examinationId }],
      treatmentExecutions: [{ item_id: itemId }],
    });
  });

  it("maps O5 RPC failures through new services", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(getPatientOdontogram({ actingBranchId: branchId, patientId })).rejects.toEqual(new OdontogramServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(recordToothClinicalEntry({ actingBranchId: branchId, patientId, toothCode: "16", surfaces: ["O"], kind: "FINDING", status: "EXISTING", detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null }, idempotencyKey: "odontogram-entry-0004" })).rejects.toEqual(new OdontogramServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(amendToothClinicalEntry({ actingBranchId: branchId, entryId, expectedVersion: 1 })).rejects.toEqual(new OdontogramServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(voidCurrentBridge({ actingBranchId: branchId, bridgeId, expectedVersion: 1, reason: "r" })).rejects.toEqual(new OdontogramServiceError("INVALID_STATE"));
  });
});
