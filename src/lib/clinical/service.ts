import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { ClinicalServiceError, mapClinicalRpcError } from "./errors";
import {
  amendClinicalNoteInputSchema,
  clinicalEncounterDetailJsonSchema,
  clinicalEncounterListRowSchema,
  clinicalEncounterMutationRowSchema,
  clinicalNoteMutationRowSchema,
  clinicalPrescriptionMutationRowSchema,
  clinicalRecordMutationRowSchema,
  createClinicalEncounterInputSchema,
  createClinicalNoteInputSchema,
  createPatientMedicalRecordInputSchema,
  createPrescriptionInputSchema,
  finalizeClinicalEncounterInputSchema,
  finalizeClinicalNoteInputSchema,
  finalizePrescriptionInputSchema,
  getClinicalEncounterDetailInputSchema,
  listClinicalEncountersInputSchema,
  listPatientMedicalRecordsInputSchema,
  medicalRecordListRowSchema,
  updateClinicalNoteInputSchema,
  voidPatientMedicalRecordInputSchema,
} from "./schema";
import type {
  ClinicalEncounter,
  ClinicalEncounterDetail,
  ClinicalEncounterMutationResult,
  ClinicalNoteMutationResult,
  ClinicalRecordMutationResult,
  MedicalRecord,
  PrescriptionMutationResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapClinicalRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createClinicalEncounter(input: unknown): Promise<ClinicalEncounterMutationResult> {
  const value = createClinicalEncounterInputSchema.parse(input);
  const row = clinicalEncounterMutationRowSchema.parse(firstRow(await callRpc("create_clinical_encounter", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_appointment_id: value.appointmentId ?? null,
    p_treating_provider_id: value.treatingProviderId,
  })));
  return { encounterId: row.encounter_id, version: row.version };
}

export async function createClinicalNote(input: unknown): Promise<ClinicalNoteMutationResult> {
  const value = createClinicalNoteInputSchema.parse(input);
  const row = clinicalNoteMutationRowSchema.parse(firstRow(await callRpc("create_clinical_note", {
    p_acting_branch_id: value.actingBranchId,
    p_encounter_id: value.encounterId,
    p_note_type: value.noteType,
    p_content: value.content,
  })));
  return { noteId: row.note_id, version: row.version };
}

export async function updateClinicalNote(input: unknown): Promise<ClinicalNoteMutationResult> {
  const value = updateClinicalNoteInputSchema.parse(input);
  const row = clinicalNoteMutationRowSchema.parse(firstRow(await callRpc("update_clinical_note", {
    p_acting_branch_id: value.actingBranchId,
    p_note_id: value.noteId,
    p_expected_version: value.expectedVersion,
    p_content: value.content,
  })));
  return { noteId: row.note_id, version: row.version };
}

export async function finalizeClinicalNote(input: unknown): Promise<ClinicalNoteMutationResult> {
  const value = finalizeClinicalNoteInputSchema.parse(input);
  const row = clinicalNoteMutationRowSchema.parse(firstRow(await callRpc("finalize_clinical_note", {
    p_acting_branch_id: value.actingBranchId,
    p_note_id: value.noteId,
    p_expected_version: value.expectedVersion,
  })));
  return { noteId: row.note_id, version: row.version };
}

export async function amendClinicalNote(input: unknown): Promise<ClinicalNoteMutationResult> {
  const value = amendClinicalNoteInputSchema.parse(input);
  const row = clinicalNoteMutationRowSchema.parse(firstRow(await callRpc("amend_clinical_note", {
    p_acting_branch_id: value.actingBranchId,
    p_note_id: value.noteId,
    p_expected_version: value.expectedVersion,
    p_content: value.content,
  })));
  return { noteId: row.note_id, version: row.version };
}

export async function finalizeClinicalEncounter(input: unknown): Promise<ClinicalEncounterMutationResult> {
  const value = finalizeClinicalEncounterInputSchema.parse(input);
  const row = clinicalEncounterMutationRowSchema.parse(firstRow(await callRpc("finalize_clinical_encounter", {
    p_acting_branch_id: value.actingBranchId,
    p_encounter_id: value.encounterId,
    p_expected_version: value.expectedVersion,
  })));
  return { encounterId: row.encounter_id, version: row.version };
}

export async function createPatientMedicalRecord(input: unknown): Promise<ClinicalRecordMutationResult> {
  const value = createPatientMedicalRecordInputSchema.parse(input);
  const row = clinicalRecordMutationRowSchema.parse(firstRow(await callRpc("create_patient_medical_record", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_record_type: value.recordType,
    p_payload: value.payload,
  })));
  return { recordId: row.record_id, version: row.version };
}

export async function voidPatientMedicalRecord(input: unknown): Promise<ClinicalRecordMutationResult> {
  const value = voidPatientMedicalRecordInputSchema.parse(input);
  const row = clinicalRecordMutationRowSchema.parse(firstRow(await callRpc("void_patient_medical_record", {
    p_acting_branch_id: value.actingBranchId,
    p_record_id: value.recordId,
    p_expected_version: value.expectedVersion,
  })));
  return { recordId: row.record_id, version: row.version };
}

export async function listClinicalEncounters(input: unknown): Promise<ClinicalEncounter[]> {
  const value = listClinicalEncountersInputSchema.parse(input);
  return z.array(clinicalEncounterListRowSchema).parse(await callRpc("list_clinical_encounters", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
  })).map((row) => ({
    encounterId: row.encounter_id,
    status: row.status,
    appointmentId: row.appointment_id,
    treatingProviderId: row.treating_provider_id,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    version: row.version,
  }));
}

export async function getClinicalEncounterDetail(input: unknown): Promise<ClinicalEncounterDetail> {
  const value = getClinicalEncounterDetailInputSchema.parse(input);
  return clinicalEncounterDetailJsonSchema.parse(await callRpc("get_clinical_encounter_detail", {
    p_acting_branch_id: value.actingBranchId,
    p_encounter_id: value.encounterId,
  }));
}

export async function listPatientMedicalRecords(input: unknown): Promise<MedicalRecord[]> {
  const value = listPatientMedicalRecordsInputSchema.parse(input);
  return z.array(medicalRecordListRowSchema).parse(await callRpc("list_patient_medical_records", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_record_type: value.recordType ?? null,
  })).map((row) => {
    if (row.record_type === "CONDITION") {
      const record = row.record;
      return {
        recordType: "CONDITION",
        recordId: record.recordId,
        conditionName: record.conditionName,
        status: record.status,
        onsetDate: record.onsetDate,
        resolvedDate: record.resolvedDate,
        notes: record.notes,
        recordedAt: record.recordedAt,
        voidedAt: record.voidedAt,
        version: record.version,
      };
    }
    if (row.record_type === "ALLERGY") {
      const record = row.record;
      return {
        recordType: "ALLERGY",
        recordId: record.recordId,
        allergen: record.allergen,
        reaction: record.reaction,
        severity: record.severity,
        status: record.status,
        recordedAt: record.recordedAt,
        voidedAt: record.voidedAt,
        version: record.version,
      };
    }
    const record = row.record;
    return {
      recordType: "MEDICATION",
      recordId: record.recordId,
      medicationName: record.medicationName,
      dose: record.dose,
      frequency: record.frequency,
      status: record.status,
      startDate: record.startDate,
      endDate: record.endDate,
      notes: record.notes,
      recordedAt: record.recordedAt,
      voidedAt: record.voidedAt,
      version: record.version,
    };
  });
}

export async function createPrescription(input: unknown): Promise<PrescriptionMutationResult> {
  const value = createPrescriptionInputSchema.parse(input);
  const row = clinicalPrescriptionMutationRowSchema.parse(firstRow(await callRpc("create_prescription", {
    p_acting_branch_id: value.actingBranchId,
    p_encounter_id: value.encounterId,
    p_items: value.items,
  })));
  return { prescriptionId: row.prescription_id, version: row.version };
}

export async function finalizePrescription(input: unknown): Promise<PrescriptionMutationResult> {
  const value = finalizePrescriptionInputSchema.parse(input);
  const row = clinicalPrescriptionMutationRowSchema.parse(firstRow(await callRpc("finalize_prescription", {
    p_acting_branch_id: value.actingBranchId,
    p_prescription_id: value.prescriptionId,
    p_expected_version: value.expectedVersion,
  })));
  return { prescriptionId: row.prescription_id, version: row.version };
}

export { ClinicalServiceError };