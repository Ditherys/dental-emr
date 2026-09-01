import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  revalidatePath,
  transitionTreatmentPlanItemExecution,
  recordCurrentImplantComponent,
  recordVisitToothFindings,
  recordVisitClinicalNote,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  transitionTreatmentPlanItemExecution: vi.fn(),
  recordCurrentImplantComponent: vi.fn(),
  recordVisitToothFindings: vi.fn(),
  recordVisitClinicalNote: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/service", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  transitionTreatmentPlanItemExecution,
  recordCurrentImplantComponent,
  recordVisitToothFindings,
  recordVisitClinicalNote,
}));

import {
  recordCurrentImplantComponentAction,
  recordVisitClinicalNoteAction,
  recordVisitToothFindingsAction,
  transitionTreatmentPlanItemExecutionAction,
} from "./odontogram-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const authoritativePatientId = "c4000000-0000-0000-0000-000000000004";
const itemId = "c5000000-0000-0000-0000-000000000005";
const encounterId = "c7000000-0000-0000-0000-000000000007";
const noteId = "c8000000-0000-0000-0000-000000000008";
const idempotencyKey = "c9000000-0000-0000-0000-000000000009";

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  transitionTreatmentPlanItemExecution.mockResolvedValue({ itemId, patientId: authoritativePatientId, executionState: "ACCEPTED", version: 2 });
  recordCurrentImplantComponent.mockResolvedValue({ componentId: itemId, patientId: authoritativePatientId, version: 1 });
  recordVisitToothFindings.mockResolvedValue({ patientId: authoritativePatientId, encounterId, clinicalDate: "2026-09-01", recordedCount: 1 });
  recordVisitClinicalNote.mockResolvedValue({ patientId: authoritativePatientId, encounterId, noteId, version: 1 });
});

describe("provider-free implant action boundary", () => {
  const chargeId = "c6000000-0000-0000-0000-000000000006";
  const occurredAt = "2026-08-30T00:00:00.000Z";
  const input = { actingBranchId: branchId, patientId, chargeId, occurredAt, idempotencyKey: "implant-action-v3", components: [{ tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" }] };

  it("accepts the six-argument implant v3 browser input and revalidates the resolved patient", async () => {
    await expect(recordCurrentImplantComponentAction(input)).resolves.toEqual({ ok: true });
    expect(recordCurrentImplantComponent).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
  });

  it("rejects caller supplied provider identity and retired executedAt fields", async () => {
    await expect(recordCurrentImplantComponentAction({ ...input, treatingProviderId: itemId })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(recordCurrentImplantComponentAction({ ...input, executedAt: occurredAt })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(recordCurrentImplantComponent).not.toHaveBeenCalled();
  });
});

describe("odontogram mutation revalidation boundary", () => {
  it("revalidates the server-resolved item patient instead of the claimed patient", async () => {
    await expect(transitionTreatmentPlanItemExecutionAction({
      actingBranchId: branchId,
      patientId,
      itemId,
      expectedVersion: 1,
      targetState: "ACCEPTED",
      idempotencyKey: "synthetic-transition-1",
    })).resolves.toEqual({ ok: true });

    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });
});

describe("clinical record composer action boundary", () => {
  const findingInput = {
    patientId,
    branchId,
    toothCodes: ["16"],
    findingCode: "CARIES",
    surfaces: ["O"],
    status: "ACTIVE",
    clinicalDate: "2026-09-01",
    idempotencyKey,
  };
  const noteInput = {
    patientId,
    branchId,
    noteType: "PROGRESS",
    content: "Synthetic visit note",
    idempotencyKey,
  };

  it("requires clinical write at the route branch and revalidates the server-resolved patient", async () => {
    await expect(recordVisitToothFindingsAction(findingInput)).resolves.toEqual({ ok: true });

    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(recordVisitToothFindings).toHaveBeenCalledWith(findingInput);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("refuses browser-supplied organization, provider, encounter, and creator identity", async () => {
    for (const forged of [
      { organizationId: authoritativePatientId },
      { treatingProviderId: itemId },
      { createdBy: itemId },
      { encounterId },
      { providerDisplay: "Dr Synthetic" },
    ]) {
      await expect(recordVisitToothFindingsAction({ ...findingInput, ...forged })).resolves.toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
      });
    }
    expect(recordVisitToothFindings).not.toHaveBeenCalled();
  });

  it("rejects an anatomically impossible surface before any server call", async () => {
    await expect(
      recordVisitToothFindingsAction({ ...findingInput, toothCodes: ["11"], surfaces: ["O"] }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(recordVisitToothFindings).not.toHaveBeenCalled();
  });

  it("maps an authorization denial to a safe code without leaking the database message", async () => {
    const { AuthorizationError } = await import("@/lib/authorization");
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));

    await expect(recordVisitToothFindingsAction(findingInput)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    expect(recordVisitToothFindings).not.toHaveBeenCalled();
  });

  it("records a bounded visit note under the same permission and revalidation boundary", async () => {
    await expect(recordVisitClinicalNoteAction(noteInput)).resolves.toEqual({ ok: true });

    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(recordVisitClinicalNote).toHaveBeenCalledWith(noteInput);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
  });

  it("refuses a caller supplied encounter or amendment note type", async () => {
    await expect(recordVisitClinicalNoteAction({ ...noteInput, encounterId })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(recordVisitClinicalNoteAction({ ...noteInput, noteType: "AMENDMENT" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(recordVisitClinicalNote).not.toHaveBeenCalled();
  });
});
