import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, revalidatePath, createClinicalEncounter, createClinicalNote, updateClinicalNote, finalizeClinicalNote, amendClinicalNote, finalizeClinicalEncounter, createPatientMedicalRecord, voidPatientMedicalRecord, createPrescription, finalizePrescription, getClinicalEncounterDetail } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  createClinicalEncounter: vi.fn(),
  createClinicalNote: vi.fn(),
  updateClinicalNote: vi.fn(),
  finalizeClinicalNote: vi.fn(),
  amendClinicalNote: vi.fn(),
  finalizeClinicalEncounter: vi.fn(),
  createPatientMedicalRecord: vi.fn(),
  voidPatientMedicalRecord: vi.fn(),
  createPrescription: vi.fn(),
  finalizePrescription: vi.fn(),
  getClinicalEncounterDetail: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/clinical/service", () => ({
  ClinicalServiceError: class ClinicalServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  createClinicalEncounter,
  createClinicalNote,
  updateClinicalNote,
  finalizeClinicalNote,
  amendClinicalNote,
  finalizeClinicalEncounter,
  createPatientMedicalRecord,
  voidPatientMedicalRecord,
  createPrescription,
  finalizePrescription,
  getClinicalEncounterDetail,
}));

import {
  amendClinicalNoteAction,
  createClinicalEncounterAction,
  createClinicalNoteAction,
  createPatientMedicalRecordAction,
  createPrescriptionAction,
  finalizeClinicalEncounterAction,
  finalizeClinicalNoteAction,
  finalizePrescriptionAction,
  getClinicalEncounterDetailAction,
  updateClinicalNoteAction,
  voidPatientMedicalRecordAction,
} from "./clinical-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const encounterId = "c3000000-0000-0000-0000-000000000003";
const noteId = "c4000000-0000-0000-0000-000000000004";
const recordId = "c5000000-0000-0000-0000-000000000005";
const prescriptionId = "c6000000-0000-0000-0000-000000000006";
const providerId = "c7000000-0000-0000-0000-000000000007";

const encounterInput = { actingBranchId: branchId, patientId, treatingProviderId: providerId };
const noteInput = { actingBranchId: branchId, encounterId, noteType: "PROGRESS", content: "Synthetic progress note." };
const detail = {
  encounter: { encounterId, branchId, patientId, appointmentId: null, treatingProviderId: providerId, status: "OPEN", createdAt: "2026-08-27T09:00:00+00:00", finalizedAt: null, version: 1 },
  notes: [],
  prescriptions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  createClinicalEncounter.mockResolvedValue({ encounterId, version: 1 });
  createClinicalNote.mockResolvedValue({ noteId, version: 1 });
  updateClinicalNote.mockResolvedValue({ noteId, version: 2 });
  finalizeClinicalNote.mockResolvedValue({ noteId, version: 2 });
  amendClinicalNote.mockResolvedValue({ noteId, version: 1 });
  finalizeClinicalEncounter.mockResolvedValue({ encounterId, version: 2 });
  createPatientMedicalRecord.mockResolvedValue({ recordId, version: 1 });
  voidPatientMedicalRecord.mockResolvedValue({ recordId, version: 2 });
  createPrescription.mockResolvedValue({ prescriptionId, version: 1 });
  finalizePrescription.mockResolvedValue({ prescriptionId, version: 2 });
  getClinicalEncounterDetail.mockResolvedValue(detail);
});

describe("createClinicalEncounterAction", () => {
  it("rechecks live clinical-write at the submitted branch before opening the encounter", async () => {
    await expect(createClinicalEncounterAction(encounterInput)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createClinicalEncounter).toHaveBeenCalledWith(encounterInput);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("rejects malformed input without reaching authorization or the RPC", async () => {
    await expect(createClinicalEncounterAction({ ...encounterInput, patientId: "forged" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(createClinicalEncounterAction({ ...encounterInput, organizationId: "foreign-org" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createClinicalEncounter).not.toHaveBeenCalled();
  });

  it("maps authorization and service failures to safe codes", async () => {
    const { AuthorizationError } = await import("@/lib/authorization");
    const { ClinicalServiceError } = await import("@/lib/clinical/service");
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createClinicalEncounterAction(encounterInput)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    createClinicalEncounter.mockRejectedValueOnce(new ClinicalServiceError("INVALID_STATE"));
    await expect(createClinicalEncounterAction(encounterInput)).resolves.toEqual({ ok: false, code: "INVALID_STATE" });
    createClinicalEncounter.mockRejectedValueOnce(new Error("unexpected"));
    await expect(createClinicalEncounterAction(encounterInput)).resolves.toEqual({ ok: false, code: "FAILED" });
  });
});

describe("clinical note actions", () => {
  it("require clinical-write at the submitted branch for create, update, finalize, and amend", async () => {
    await expect(createClinicalNoteAction(noteInput)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createClinicalNote).toHaveBeenCalledWith(noteInput);

    const update = { actingBranchId: branchId, noteId, expectedVersion: 1, content: "Updated draft." };
    await expect(updateClinicalNoteAction(update)).resolves.toEqual({ ok: true });
    expect(updateClinicalNote).toHaveBeenCalledWith(update);

    const finalize = { actingBranchId: branchId, noteId, expectedVersion: 1 };
    await expect(finalizeClinicalNoteAction(finalize)).resolves.toEqual({ ok: true });
    expect(finalizeClinicalNote).toHaveBeenCalledWith(finalize);

    const amend = { actingBranchId: branchId, noteId, expectedVersion: 2, content: "Amendment text." };
    await expect(amendClinicalNoteAction(amend)).resolves.toEqual({ ok: true });
    expect(amendClinicalNote).toHaveBeenCalledWith(amend);
    expect(requirePermission).toHaveBeenCalledTimes(4);
  });

  it("rejects stale-version service failures as safe codes", async () => {
    const { ClinicalServiceError } = await import("@/lib/clinical/service");
    finalizeClinicalNote.mockRejectedValueOnce(new ClinicalServiceError("STALE_VERSION"));
    await expect(finalizeClinicalNoteAction({ actingBranchId: branchId, noteId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "STALE_VERSION" });
    updateClinicalNote.mockRejectedValueOnce(new ClinicalServiceError("NOT_AUTHORIZED"));
    await expect(updateClinicalNoteAction({ actingBranchId: branchId, noteId, expectedVersion: 1, content: "x" })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });

  it("rejects malformed note input before authorization", async () => {
    await expect(createClinicalNoteAction({ ...noteInput, content: "" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(amendClinicalNoteAction({ actingBranchId: branchId, noteId, expectedVersion: 0, content: "x" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(createClinicalNote).not.toHaveBeenCalled();
  });
});

describe("finalizeClinicalEncounterAction", () => {
  it("requires clinical-write at the submitted branch", async () => {
    const input = { actingBranchId: branchId, encounterId, expectedVersion: 1 };
    await expect(finalizeClinicalEncounterAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(finalizeClinicalEncounter).toHaveBeenCalledWith(input);
  });
});

describe("clinical medical record actions", () => {
  it("require clinical-write and revalidate the patient page on create", async () => {
    const input = { actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "Hypertension" } };
    await expect(createPatientMedicalRecordAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createPatientMedicalRecord).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("rejects forbidden payload keys before authorization", async () => {
    await expect(createPatientMedicalRecordAction({ actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "Hypertension", organizationId: "foreign-org" } })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createPatientMedicalRecord).not.toHaveBeenCalled();
  });

  it("voids under clinical-write with the optimistic version", async () => {
    const input = { actingBranchId: branchId, recordId, expectedVersion: 1 };
    await expect(voidPatientMedicalRecordAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(voidPatientMedicalRecord).toHaveBeenCalledWith(input);
  });
});

describe("clinical prescription actions", () => {
  it("require clinical-write for create and finalize", async () => {
    const input = { actingBranchId: branchId, encounterId, items: [{ medicationName: "Amoxicillin", dosage: "500mg", frequency: "3x daily" }] };
    await expect(createPrescriptionAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createPrescription).toHaveBeenCalledWith(input);

    const finalize = { actingBranchId: branchId, prescriptionId, expectedVersion: 1 };
    await expect(finalizePrescriptionAction(finalize)).resolves.toEqual({ ok: true });
    expect(finalizePrescription).toHaveBeenCalledWith(finalize);
  });

  it("rejects empty item lists before authorization", async () => {
    await expect(createPrescriptionAction({ actingBranchId: branchId, encounterId, items: [] })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });
});

describe("getClinicalEncounterDetailAction", () => {
  it("requires only live clinical-read at the submitted branch", async () => {
    const input = { actingBranchId: branchId, encounterId };
    await expect(getClinicalEncounterDetailAction(input)).resolves.toEqual({ ok: true, detail });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.read", branchId });
    expect(getClinicalEncounterDetail).toHaveBeenCalledWith(input);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed input before authorization", async () => {
    await expect(getClinicalEncounterDetailAction({ actingBranchId: branchId, encounterId: "nope" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(getClinicalEncounterDetail).not.toHaveBeenCalled();
  });

  it("maps read failures to safe codes", async () => {
    const { ClinicalServiceError } = await import("@/lib/clinical/service");
    getClinicalEncounterDetail.mockRejectedValueOnce(new ClinicalServiceError("NOT_AUTHORIZED"));
    await expect(getClinicalEncounterDetailAction({ actingBranchId: branchId, encounterId })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });
});