import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  revalidatePath,
  createPeriodontalExamination,
  createPeriodontalDraft,
  savePeriodontalMeasurementsV2,
  finalizePeriodontalExaminationV2,
  amendPeriodontalExaminationV2,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  createPeriodontalExamination: vi.fn(),
  createPeriodontalDraft: vi.fn(),
  savePeriodontalMeasurementsV2: vi.fn(),
  finalizePeriodontalExaminationV2: vi.fn(),
  amendPeriodontalExaminationV2: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/errors", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  mapOdontogramRpcError: vi.fn(),
}));
vi.mock("@/lib/odontogram/service", () => ({
  createPeriodontalExamination,
  createPeriodontalDraft,
  savePeriodontalMeasurementsV2,
  finalizePeriodontalExaminationV2,
  amendPeriodontalExaminationV2,
}));

import { OdontogramServiceError } from "@/lib/odontogram/errors";

import {
  amendPeriodontalExaminationV2Action,
  createPeriodontalDraftAction,
  createPeriodontalExaminationAction,
  finalizePeriodontalExaminationV2Action,
  savePeriodontalMeasurementsV2Action,
} from "./perio-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const claimedPatientId = "c2000000-0000-0000-0000-000000000002";
const authoritativePatientId = "c3000000-0000-0000-0000-000000000003";
const encounterId = "c4000000-0000-0000-0000-000000000004";
const examinationId = "c5000000-0000-0000-0000-000000000005";

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  createPeriodontalExamination.mockResolvedValue({ examinationId, patientId: authoritativePatientId, version: 1 });
  createPeriodontalDraft.mockResolvedValue({ examinationId, patientId: authoritativePatientId, encounterId, version: 1, resumed: false });
  savePeriodontalMeasurementsV2.mockResolvedValue({ examinationId, patientId: authoritativePatientId, version: 2, savedSites: 1, savedPlaque: 0, savedTooth: 0, savedFurcation: 0 });
  finalizePeriodontalExaminationV2.mockResolvedValue({ examinationId, patientId: authoritativePatientId, version: 3, derivedDiagnosis: "GINGIVITIS", confirmedDiagnosis: "HEALTH", overridden: true });
  amendPeriodontalExaminationV2.mockResolvedValue({ examinationId, patientId: authoritativePatientId, encounterId, version: 4, adopted: true });
});

describe("periodontal mutation revalidation boundary", () => {
  it("revalidates the server-resolved encounter patient instead of the claimed patient", async () => {
    await expect(createPeriodontalExaminationAction({
      actingBranchId: branchId,
      patientId: claimedPatientId,
      encounterId,
      examinationKind: "INITIAL",
    })).resolves.toEqual({ ok: true, id: examinationId, version: 1 });

    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${claimedPatientId}`, "page");
  });
});

describe("versioned periodontal workflow action boundary", () => {
  const idempotencyKey = "c6000000-0000-0000-0000-000000000006";

  it("is the only periodontal mutation surface: the odontogram action module exports none", async () => {
    const odontogramActions = await import("./odontogram-actions");
    for (const name of Object.keys(odontogramActions)) {
      expect(name).not.toMatch(/Periodontal/);
    }
  });

  it("authorizes the acting branch and revalidates the server-resolved patient when opening a draft", async () => {
    await expect(createPeriodontalDraftAction({
      actingBranchId: branchId,
      patientId: claimedPatientId,
      examinationKind: "INITIAL",
      idempotencyKey,
    })).resolves.toEqual({
      ok: true,
      id: examinationId,
      version: 1,
      encounterId,
      resumed: false,
    });

    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${claimedPatientId}`, "page");
  });

  it("returns a typed conflict for a stale autosave and reveals no measurement content", async () => {
    savePeriodontalMeasurementsV2.mockRejectedValueOnce(new OdontogramServiceError("STALE_VERSION"));

    const result = await savePeriodontalMeasurementsV2Action({
      actingBranchId: branchId,
      examinationId,
      expectedVersion: 1,
      batch: { sites: [{ tooth_fdi: "16", site: "MB", probing_depth_mm: 4 }] },
      idempotencyKey,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/probing_depth|tooth_fdi|16/);
  });

  it("refuses an oversized batch at the action boundary without calling the service", async () => {
    const sites = Array.from({ length: 201 }, () => ({ tooth_fdi: "16", site: "MB", probing_depth_mm: 3 }));
    const result = await savePeriodontalMeasurementsV2Action({
      actingBranchId: branchId,
      examinationId,
      expectedVersion: 1,
      batch: { sites },
      idempotencyKey,
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(savePeriodontalMeasurementsV2).not.toHaveBeenCalled();
  });

  it("reports an override without echoing the reason back to the browser", async () => {
    const result = await finalizePeriodontalExaminationV2Action({
      actingBranchId: branchId,
      examinationId,
      expectedVersion: 2,
      confirmation: { diagnosis: "HEALTH", override_reason: "Radiographic bone loss contradicts the site chart." },
      idempotencyKey,
    });

    expect(result).toEqual({ ok: true, id: examinationId, version: 3, overridden: true });
    expect(JSON.stringify(result)).not.toMatch(/Radiographic/);
  });

  it("requires the correction permission as well as clinical write before amending", async () => {
    await expect(amendPeriodontalExaminationV2Action({
      actingBranchId: branchId,
      predecessorExaminationId: examinationId,
      reason: "The distal probing depths were transcribed from the wrong quadrant.",
      idempotencyKey,
    })).resolves.toMatchObject({ ok: true, adopted: true });

    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.correct", branchId });
  });

  it("refuses an empty amendment reason without calling the service", async () => {
    const result = await amendPeriodontalExaminationV2Action({
      actingBranchId: branchId,
      predecessorExaminationId: examinationId,
      reason: "   ",
      idempotencyKey,
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(amendPeriodontalExaminationV2).not.toHaveBeenCalled();
  });
});
