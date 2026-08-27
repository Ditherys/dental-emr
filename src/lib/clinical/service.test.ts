import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { ClinicalServiceError, mapClinicalRpcError } from "./errors";
import {
  amendClinicalNote,
  createClinicalEncounter,
  createClinicalNote,
  createPatientMedicalRecord,
  createPrescription,
  finalizeClinicalEncounter,
  finalizeClinicalNote,
  finalizePrescription,
  getClinicalEncounterDetail,
  listClinicalEncounters,
  listPatientMedicalRecords,
  updateClinicalNote,
  voidPatientMedicalRecord,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const encounterId = "c3000000-0000-0000-0000-000000000003";
const noteId = "c4000000-0000-0000-0000-000000000004";
const recordId = "c5000000-0000-0000-0000-000000000005";
const prescriptionId = "c6000000-0000-0000-0000-000000000006";
const providerId = "c7000000-0000-0000-0000-000000000007";
const parentNoteId = "c8000000-0000-0000-0000-000000000008";
const appointmentId = "c9000000-0000-0000-0000-000000000009";

const createdAt = "2026-08-27T09:00:00+00:00";

const encounterInput = {
  actingBranchId: branchId,
  patientId,
  treatingProviderId: providerId,
};

const noteInput = {
  actingBranchId: branchId,
  encounterId,
  noteType: "PROGRESS" as const,
  content: "Synthetic progress note.",
};

describe("clinical service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapClinicalRpcError({ code: "42501", message: "not authorized" })).toEqual(new ClinicalServiceError("NOT_AUTHORIZED"));
    expect(mapClinicalRpcError({ code: "22023", message: "invalid input" })).toEqual(new ClinicalServiceError("INVALID_INPUT"));
    expect(mapClinicalRpcError({ code: "P0001", message: "stale version" })).toEqual(new ClinicalServiceError("STALE_VERSION"));
    expect(mapClinicalRpcError({ code: "P0001", message: "invalid state" })).toEqual(new ClinicalServiceError("INVALID_STATE"));
    expect(mapClinicalRpcError({ code: "XX000", message: "unexpected" })).toEqual(new ClinicalServiceError("FAILED"));
    expect(mapClinicalRpcError("boom")).toEqual(new ClinicalServiceError("FAILED"));
  });
});

describe("clinical service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects forbidden org identifiers and forged tenant keys before any RPC", async () => {
    await expect(createClinicalEncounter({ ...encounterInput, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalEncounter({ ...encounterInput, branchId: "foreign-branch" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, branchId: "foreign-branch" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPrescription({ actingBranchId: branchId, encounterId, organizationId: "foreign-org", items: [{ medicationName: "Amoxicillin" }] })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers, versions, and note inputs", async () => {
    await expect(createClinicalEncounter({ ...encounterInput, patientId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalEncounter({ ...encounterInput, treatingProviderId: undefined })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, noteType: "AMENDMENT" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, noteType: "SOAP" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, content: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, content: "   " })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createClinicalNote({ ...noteInput, content: "x".repeat(20001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 0, content: "Update" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(finalizeClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1, noteType: "PROGRESS" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(amendClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1, content: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(finalizeClinicalEncounter({ actingBranchId: branchId, encounterId, expectedVersion: -1 })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects out-of-contract medical record payload keys per record type", async () => {
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "CONDITION",
      payload: { conditionName: "Hypertension", patientId, recordedBy: "u-1" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "CONDITION",
      payload: { conditionName: "Hypertension", version: 1 },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "ALLERGY",
      payload: { allergen: "Penicillin", dose: "250mg" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "MEDICATION",
      payload: { medicationName: "Amoxicillin", severity: "SEVERE" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "CONDITION",
      payload: { conditionName: "Hypertension", status: "cured" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "ALLERGY",
      payload: { allergen: "Penicillin", severity: "CRITICAL" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "MEDICATION",
      payload: { medicationName: "Amoxicillin", startDate: "not-a-date" },
    })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized medical record and prescription fields", async () => {
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "ALLERGY", payload: { allergen: " ".repeat(3) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "C".repeat(201) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "ALLERGY", payload: { allergen: "Penicillin", reaction: "R".repeat(501) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "MEDICATION", payload: { medicationName: "Amoxicillin", notes: "N".repeat(2001) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientMedicalRecord({
      actingBranchId: branchId, patientId, recordType: "OTHER" as never, payload: {},
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items: [] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items: [{ medicationName: "" }] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items: [{ medicationName: "M".repeat(201) }] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items: [{ medicationName: "Amoxicillin", plan: "x" }] })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidPatientMedicalRecord({ actingBranchId: branchId, recordId: "forged", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(finalizePrescription({ actingBranchId: branchId, prescriptionId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects read inputs with unknown keys or malformed ids", async () => {
    await expect(listClinicalEncounters({ actingBranchId: branchId, patientId, organizationId: "x" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getClinicalEncounterDetail({ actingBranchId: branchId, encounterId: "nope" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listPatientMedicalRecords({ actingBranchId: branchId, patientId, recordType: "PRESCRIPTION" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("clinical service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds encounter create to its exact contract and defaults the nullable appointment", async () => {
    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId, version: 1 }], error: null });
    await expect(createClinicalEncounter(encounterInput)).resolves.toEqual({ encounterId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_clinical_encounter", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_appointment_id: null,
      p_treating_provider_id: providerId,
    });

    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId, version: 1 }], error: null });
    await createClinicalEncounter({ ...encounterInput, appointmentId });
    expect(rpc).toHaveBeenLastCalledWith("create_clinical_encounter", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_appointment_id: appointmentId,
      p_treating_provider_id: providerId,
    });
  });

  it("binds note create, update, finalize, and amend to their exact contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ note_id: noteId, version: 1 }], error: null });
    await expect(createClinicalNote(noteInput)).resolves.toEqual({ noteId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_clinical_note", {
      p_acting_branch_id: branchId, p_encounter_id: encounterId, p_note_type: "PROGRESS", p_content: "Synthetic progress note.",
    });

    rpc.mockResolvedValueOnce({ data: [{ note_id: noteId, version: 2 }], error: null });
    await expect(updateClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1, content: "Updated draft." })).resolves.toEqual({ noteId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("update_clinical_note", {
      p_acting_branch_id: branchId, p_note_id: noteId, p_expected_version: 1, p_content: "Updated draft.",
    });

    rpc.mockResolvedValueOnce({ data: [{ note_id: noteId, version: 2 }], error: null });
    await expect(finalizeClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1 })).resolves.toEqual({ noteId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("finalize_clinical_note", {
      p_acting_branch_id: branchId, p_note_id: noteId, p_expected_version: 1,
    });

    rpc.mockResolvedValueOnce({ data: [{ note_id: parentNoteId, version: 1 }], error: null });
    await expect(amendClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 2, content: "Amendment text." })).resolves.toEqual({ noteId: parentNoteId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("amend_clinical_note", {
      p_acting_branch_id: branchId, p_note_id: noteId, p_expected_version: 2, p_content: "Amendment text.",
    });
  });

  it("binds encounter finalize to its exact contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId, version: 2 }], error: null });
    await expect(finalizeClinicalEncounter({ actingBranchId: branchId, encounterId, expectedVersion: 1 })).resolves.toEqual({ encounterId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("finalize_clinical_encounter", {
      p_acting_branch_id: branchId, p_encounter_id: encounterId, p_expected_version: 1,
    });
  });

  it("binds medical record create to its exact contract and passes the typed payload", async () => {
    rpc.mockResolvedValueOnce({ data: [{ record_id: recordId, version: 1 }], error: null });
    const input = {
      actingBranchId: branchId, patientId, recordType: "CONDITION" as const,
      payload: { conditionName: "Hypertension", status: "active" as const, onsetDate: "2024-01-01", notes: "Monitored" },
    };
    await expect(createPatientMedicalRecord(input)).resolves.toEqual({ recordId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_patient_medical_record", {
      p_acting_branch_id: branchId, p_patient_id: patientId, p_record_type: "CONDITION",
      p_payload: { conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", notes: "Monitored" },
    });
  });

  it("binds medical record void to its exact contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ record_id: recordId, version: 2 }], error: null });
    await expect(voidPatientMedicalRecord({ actingBranchId: branchId, recordId, expectedVersion: 1 })).resolves.toEqual({ recordId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("void_patient_medical_record", {
      p_acting_branch_id: branchId, p_record_id: recordId, p_expected_version: 1,
    });
  });

  it("lists encounters with the full projection and no notes bodies", async () => {
    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId, status: "OPEN", appointment_id: null, treating_provider_id: providerId, created_at: createdAt, finalized_at: null, version: 1 }], error: null });
    await expect(listClinicalEncounters({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      encounterId, status: "OPEN", appointmentId: null, treatingProviderId: providerId, createdAt, finalizedAt: null, version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_clinical_encounters", {
      p_acting_branch_id: branchId, p_patient_id: patientId,
    });
  });

  it("returns encounter detail jsonb in the bounded DTO shape", async () => {
    const detail = {
      encounter: {
        encounterId, branchId, patientId, appointmentId: null, treatingProviderId: providerId,
        status: "OPEN", createdAt, finalizedAt: null, version: 1,
      },
      notes: [{ noteId, parentNoteId: null, noteType: "PROGRESS", content: "Synthetic progress note.", status: "DRAFT", finalizedAt: null, createdBy: "d1000000-0000-0000-0000-000000000001", createdAt, version: 1 }],
      prescriptions: [],
    };
    rpc.mockResolvedValueOnce({ data: detail, error: null });
    await expect(getClinicalEncounterDetail({ actingBranchId: branchId, encounterId })).resolves.toEqual(detail);
    expect(rpc).toHaveBeenLastCalledWith("get_clinical_encounter_detail", {
      p_acting_branch_id: branchId, p_encounter_id: encounterId,
    });
  });

  it("lists medical records across types and passes the optional type filter as null", async () => {
    rpc.mockResolvedValueOnce({ data: [
      { record_type: "CONDITION", record: { recordId, conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", resolvedDate: null, notes: null, recordedAt: createdAt, voidedAt: null, version: 1 } },
    ], error: null });
    await expect(listPatientMedicalRecords({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      recordType: "CONDITION", recordId, conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", resolvedDate: null, notes: null, recordedAt: createdAt, voidedAt: null, version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_patient_medical_records", {
      p_acting_branch_id: branchId, p_patient_id: patientId, p_record_type: null,
    });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listPatientMedicalRecords({ actingBranchId: branchId, patientId, recordType: "ALLERGY" });
    expect(rpc).toHaveBeenLastCalledWith("list_patient_medical_records", {
      p_acting_branch_id: branchId, p_patient_id: patientId, p_record_type: "ALLERGY",
    });
  });

  it("binds prescription create and finalize to their exact contracts", async () => {
    const items = [{ medicationName: "Amoxicillin", dosage: "500mg", frequency: "3x daily" }];
    rpc.mockResolvedValueOnce({ data: [{ prescription_id: prescriptionId, version: 1 }], error: null });
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items })).resolves.toEqual({ prescriptionId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_prescription", {
      p_acting_branch_id: branchId, p_encounter_id: encounterId, p_items: items,
    });

    rpc.mockResolvedValueOnce({ data: [{ prescription_id: prescriptionId, version: 2 }], error: null });
    await expect(finalizePrescription({ actingBranchId: branchId, prescriptionId, expectedVersion: 1 })).resolves.toEqual({ prescriptionId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("finalize_prescription", {
      p_acting_branch_id: branchId, p_prescription_id: prescriptionId, p_expected_version: 1,
    });
  });

  it("rejects malformed mutation and projection rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId }], error: null });
    await expect(createClinicalEncounter(encounterInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ note_id: "not-a-uuid", version: 1 }], error: null });
    await expect(createClinicalNote(noteInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ encounter_id: encounterId, status: "ARCHIVED", appointment_id: null, treating_provider_id: providerId, created_at: createdAt, finalized_at: null, version: 1 }], error: null });
    await expect(listClinicalEncounters({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: { encounter: { encounterId, branchId, patientId, appointmentId: null, treatingProviderId: providerId, status: "OPEN", createdAt, finalizedAt: null, version: 1 }, notes: [{ noteId, parentNoteId: null, noteType: "NOTE", content: "x", status: "DRAFT", finalizedAt: null, createdBy: "d1000000-0000-0000-0000-000000000001", createdAt, version: 1 }], prescriptions: [] }, error: null });
    await expect(getClinicalEncounterDetail({ actingBranchId: branchId, encounterId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ record_type: "CONDITION", record: { recordId, conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", resolvedDate: null, notes: null, recordedAt: createdAt, voidedAt: null } }], error: null });
    await expect(listPatientMedicalRecords({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ prescription_id: prescriptionId }], error: null });
    await expect(createPrescription({ actingBranchId: branchId, encounterId, items: [{ medicationName: "Amoxicillin" }] })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createClinicalEncounter(encounterInput)).rejects.toEqual(new ClinicalServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(createClinicalNote(noteInput)).rejects.toEqual(new ClinicalServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(updateClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1, content: "Update" })).rejects.toEqual(new ClinicalServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(finalizeClinicalNote({ actingBranchId: branchId, noteId, expectedVersion: 1 })).rejects.toEqual(new ClinicalServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listClinicalEncounters({ actingBranchId: branchId, patientId })).rejects.toEqual(new ClinicalServiceError("FAILED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createPatientMedicalRecord({ actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "Hypertension" } })).rejects.toEqual(new ClinicalServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(voidPatientMedicalRecord({ actingBranchId: branchId, recordId, expectedVersion: 1 })).rejects.toEqual(new ClinicalServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(finalizePrescription({ actingBranchId: branchId, prescriptionId, expectedVersion: 1 })).rejects.toEqual(new ClinicalServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(getClinicalEncounterDetail({ actingBranchId: branchId, encounterId })).rejects.toEqual(new ClinicalServiceError("NOT_AUTHORIZED"));
  });
});