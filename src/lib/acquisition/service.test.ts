import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { AcquisitionServiceError, mapAcquisitionRpcError } from "./errors";
import {
  createPatientReferral,
  listAcquisitionSources,
  listBookingChannels,
  listPatientReferrals,
  updatePatientAttribution,
  updatePatientReferralStatus,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const sourceId = "c3000000-0000-0000-0000-000000000003";
const referralId = "c4000000-0000-0000-0000-000000000004";
const specialtyId = "c5000000-0000-0000-0000-000000000005";

const referralRow = {
  referral_id: referralId,
  direction: "IN",
  status: "RECEIVED",
  required_specialty_id: specialtyId,
  required_specialty_name: "Orthodontics",
  external_party_name: "Dr. Example",
  external_party_organization: "Example Clinic",
  external_party_contact: "09171234567",
  notes: "Administrative handoff",
  version: 1,
  created_at: "2026-08-26T10:00:00+00:00",
  updated_at: "2026-08-26T10:00:00+00:00",
};

describe("acquisition service boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("maps database failures to safe codes", () => {
    expect(mapAcquisitionRpcError({ code: "42501", message: "not authorized" })).toEqual(new AcquisitionServiceError("NOT_AUTHORIZED"));
    expect(mapAcquisitionRpcError({ code: "22023", message: "invalid input" })).toEqual(new AcquisitionServiceError("INVALID_INPUT"));
    expect(mapAcquisitionRpcError({ code: "P0001", message: "stale version" })).toEqual(new AcquisitionServiceError("STALE_VERSION"));
    expect(mapAcquisitionRpcError({ code: "P0001", message: "invalid state" })).toEqual(new AcquisitionServiceError("INVALID_STATE"));
    expect(mapAcquisitionRpcError({ code: "XX000", message: "unexpected" })).toEqual(new AcquisitionServiceError("FAILED"));
  });

  it("validates invalid and mass-assignment input before an RPC", async () => {
    await expect(listAcquisitionSources({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updatePatientAttribution({ actingBranchId: branchId, patientId, expectedVersion: 1, organizationId: sourceId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updatePatientAttribution({ actingBranchId: branchId, patientId, expectedVersion: 1, referrerPatientId: sourceId, externalReferrerName: "Dr. Example" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createPatientReferral({ actingBranchId: branchId, patientId, direction: "IN", status: "ACTIVE" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updatePatientReferralStatus({ actingBranchId: branchId, referralId, expectedVersion: 0, status: "ACTIVE" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listPatientReferrals({ actingBranchId: branchId, patientId, includeTerminal: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses only bounded catalog RPCs and validates their DTOs", async () => {
    rpc.mockResolvedValueOnce({ data: [{ source_id: sourceId, code: "FACEBOOK", name: "Facebook", category: "DIGITAL" }], error: null });
    await expect(listAcquisitionSources({ actingBranchId: branchId })).resolves.toEqual([{ sourceId, code: "FACEBOOK", name: "Facebook", category: "DIGITAL" }]);
    expect(rpc).toHaveBeenLastCalledWith("list_acquisition_sources", { p_acting_branch_id: branchId });

    rpc.mockResolvedValueOnce({ data: [{ code: "WALK_IN", name: "Walk-in" }], error: null });
    await expect(listBookingChannels({ actingBranchId: branchId })).resolves.toEqual([{ code: "WALK_IN", name: "Walk-in" }]);
    expect(rpc).toHaveBeenLastCalledWith("list_booking_channels", { p_acting_branch_id: branchId });
  });

  it("binds attribution and referral calls to their exact RPC contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId, version: 2 }], error: null });
    await expect(updatePatientAttribution({ actingBranchId: branchId, patientId, expectedVersion: 1, acquisitionSourceId: sourceId, initialBookingChannelCode: "FACEBOOK_MESSENGER" })).resolves.toEqual({ patientId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("update_patient_attribution", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_expected_version: 1,
      p_attribution: { acquisitionSourceId: sourceId, initialBookingChannelCode: "FACEBOOK_MESSENGER" },
    });

    rpc.mockResolvedValueOnce({ data: [{ referral_id: referralId, version: 1 }], error: null });
    await expect(createPatientReferral({ actingBranchId: branchId, patientId, direction: "IN", requiredSpecialtyId: specialtyId, notes: "  Administrative handoff  " })).resolves.toEqual({ referralId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_patient_referral", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_referral: { direction: "IN", requiredSpecialtyId: specialtyId, notes: "Administrative handoff" },
    });

    rpc.mockResolvedValueOnce({ data: [{ referral_id: referralId, version: 2 }], error: null });
    await updatePatientReferralStatus({ actingBranchId: branchId, referralId, expectedVersion: 1, status: "ACTIVE" });
    expect(rpc).toHaveBeenLastCalledWith("update_patient_referral_status", {
      p_acting_branch_id: branchId,
      p_referral_id: referralId,
      p_expected_version: 1,
      p_status: "ACTIVE",
    });
  });

  it("maps referral lists and safe RPC failures", async () => {
    rpc.mockResolvedValueOnce({ data: [referralRow], error: null });
    await expect(listPatientReferrals({ actingBranchId: branchId, patientId })).resolves.toMatchObject([{ referralId, requiredSpecialtyName: "Orthodontics" }]);
    expect(rpc).toHaveBeenLastCalledWith("list_patient_referrals", { p_acting_branch_id: branchId, p_patient_id: patientId, p_include_terminal: false });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listBookingChannels({ actingBranchId: branchId })).rejects.toEqual(new AcquisitionServiceError("NOT_AUTHORIZED"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(updatePatientReferralStatus({ actingBranchId: branchId, referralId, expectedVersion: 1, status: "ACTIVE" })).rejects.toEqual(new AcquisitionServiceError("STALE_VERSION"));
  });
});
