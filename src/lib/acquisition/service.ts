import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { AcquisitionServiceError, mapAcquisitionRpcError } from "./errors";
import {
  acquisitionSourceRowSchema,
  bookingChannelRowSchema,
  catalogReadInputSchema,
  createPatientReferralInputSchema,
  listPatientReferralsInputSchema,
  patientIdVersionRowSchema,
  patientReferralRowSchema,
  referralIdVersionRowSchema,
  updatePatientAttributionInputSchema,
  updatePatientReferralStatusInputSchema,
} from "./schema";
import type {
  AcquisitionSource,
  BookingChannel,
  PatientAttributionMutationResult,
  PatientReferral,
  PatientReferralMutationResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapAcquisitionRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function listAcquisitionSources(input: unknown): Promise<AcquisitionSource[]> {
  const value = catalogReadInputSchema.parse(input);
  return z.array(acquisitionSourceRowSchema).parse(await callRpc("list_acquisition_sources", {
    p_acting_branch_id: value.actingBranchId,
  })).map((row) => ({ sourceId: row.source_id, code: row.code, name: row.name, category: row.category }));
}

export async function listBookingChannels(input: unknown): Promise<BookingChannel[]> {
  const value = catalogReadInputSchema.parse(input);
  return z.array(bookingChannelRowSchema).parse(await callRpc("list_booking_channels", {
    p_acting_branch_id: value.actingBranchId,
  }));
}

export async function updatePatientAttribution(input: unknown): Promise<PatientAttributionMutationResult> {
  const value = updatePatientAttributionInputSchema.parse(input);
  const { actingBranchId, patientId, expectedVersion, ...attribution } = value;
  const row = patientIdVersionRowSchema.parse(firstRow(await callRpc("update_patient_attribution", {
    p_acting_branch_id: actingBranchId,
    p_patient_id: patientId,
    p_expected_version: expectedVersion,
    p_attribution: attribution,
  })));
  return { patientId: row.patient_id, version: row.version };
}

export async function createPatientReferral(input: unknown): Promise<PatientReferralMutationResult> {
  const value = createPatientReferralInputSchema.parse(input);
  const { actingBranchId, patientId, ...referral } = value;
  const row = referralIdVersionRowSchema.parse(firstRow(await callRpc("create_patient_referral", {
    p_acting_branch_id: actingBranchId,
    p_patient_id: patientId,
    p_referral: referral,
  })));
  return { referralId: row.referral_id, version: row.version };
}

export async function updatePatientReferralStatus(input: unknown): Promise<PatientReferralMutationResult> {
  const value = updatePatientReferralStatusInputSchema.parse(input);
  const row = referralIdVersionRowSchema.parse(firstRow(await callRpc("update_patient_referral_status", {
    p_acting_branch_id: value.actingBranchId,
    p_referral_id: value.referralId,
    p_expected_version: value.expectedVersion,
    p_status: value.status,
  })));
  return { referralId: row.referral_id, version: row.version };
}

export async function listPatientReferrals(input: unknown): Promise<PatientReferral[]> {
  const value = listPatientReferralsInputSchema.parse(input);
  return z.array(patientReferralRowSchema).parse(await callRpc("list_patient_referrals", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_include_terminal: value.includeTerminal,
  })).map((row) => ({
    referralId: row.referral_id,
    direction: row.direction,
    status: row.status,
    requiredSpecialtyId: row.required_specialty_id,
    requiredSpecialtyName: row.required_specialty_name,
    externalPartyName: row.external_party_name,
    externalPartyOrganization: row.external_party_organization,
    externalPartyContact: row.external_party_contact,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export { AcquisitionServiceError };
