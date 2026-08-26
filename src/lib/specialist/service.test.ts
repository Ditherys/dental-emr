import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { SpecialistServiceError, mapSpecialistRpcError } from "./errors";
import {
  cancelSpecialistRequest,
  createSpecialistRequest,
  listSpecialistRequests,
  respondSpecialistRequest,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const specialtyId = "c3000000-0000-0000-0000-000000000003";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c6000000-0000-0000-0000-000000000006";
const requestId = "c7000000-0000-0000-0000-000000000007";

const createdAt = "2026-08-27T09:00:00+00:00";
const requestedStartsAt = "2026-09-01T09:00:00+00:00";
const requestedEndsAt = "2026-09-01T10:00:00+00:00";
const alternateStartsAt = "2026-09-02T09:00:00+00:00";
const alternateEndsAt = "2026-09-02T10:00:00+00:00";

const createInput = {
  actingBranchId: branchId,
  patientId,
  payload: {
    requiredSpecialtyId: specialtyId,
    requestedProviderId: providerId,
    requestedStartsAt,
    requestedEndsAt,
    appointmentId,
    expiresAt: "2026-08-29T09:00:00+00:00",
    caseSummary: "Requesting an extraction assessment for a patient.",
    requestChannel: "EMAIL" as const,
  },
};

const listRow = {
  request_id: requestId,
  patient_id: patientId,
  patient_display_name: "Juana Dela Cruz",
  required_specialty_id: specialtyId,
  required_specialty_name: "Oral Surgery",
  requested_provider_id: providerId,
  requested_provider_display_name: "Dr. Jose Dela Cruz",
  requested_starts_at: requestedStartsAt,
  requested_ends_at: requestedEndsAt,
  case_summary: "Requesting an extraction assessment for a patient.",
  request_channel: "EMAIL",
  status: "SENT",
  response_message: null,
  expires_at: "2026-08-29T09:00:00+00:00",
  version: 1,
  created_at: createdAt,
};

describe("specialist service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapSpecialistRpcError({ code: "42501", message: "not authorized" })).toEqual(new SpecialistServiceError("NOT_AUTHORIZED"));
    expect(mapSpecialistRpcError({ code: "22023", message: "invalid input" })).toEqual(new SpecialistServiceError("INVALID_INPUT"));
    expect(mapSpecialistRpcError({ code: "P0001", message: "stale version" })).toEqual(new SpecialistServiceError("STALE_VERSION"));
    expect(mapSpecialistRpcError({ code: "P0001", message: "invalid state" })).toEqual(new SpecialistServiceError("INVALID_STATE"));
    expect(mapSpecialistRpcError({ code: "XX000", message: "unexpected" })).toEqual(new SpecialistServiceError("FAILED"));
    expect(mapSpecialistRpcError("boom")).toEqual(new SpecialistServiceError("FAILED"));
  });
});

describe("specialist service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden keys before an RPC", async () => {
    await expect(createSpecialistRequest({
      ...createInput,
      organizationId: "foreign-org",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, patientNumber: "P-0001" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, caseSummary: "" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, caseSummary: "x".repeat(1001) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, requestChannel: "PUSH" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, requestedStartsAt: null },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, requestedEndsAt: requestedStartsAt },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createSpecialistRequest({
      ...createInput,
      payload: { ...createInput.payload, requiredSpecialtyId: "not-a-uuid" },
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 0,
      response: { action: "ACCEPT" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "COUNTER" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ALTERNATE_TIME" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ALTERNATE_TIME", alternateStartsAt, alternateEndsAt: alternateStartsAt },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ACCEPT", alternateStartsAt },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ACCEPT", message: "m".repeat(1001) },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId: "not-a-uuid",
      expectedVersion: 1,
      response: { action: "ACCEPT" },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      organizationId: "foreign-org",
      response: { action: "ACCEPT" },
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, reason: "r".repeat(1001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listSpecialistRequests({ actingBranchId: branchId, status: "QUEUED" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listSpecialistRequests({ actingBranchId: branchId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listSpecialistRequests({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("specialist service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds create to its exact RPC contract and default nullable payload fields", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 1 }], error: null });
    await expect(createSpecialistRequest(createInput)).resolves.toEqual({ requestId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_specialist_request", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_payload: {
        requiredSpecialtyId: specialtyId,
        requestedProviderId: providerId,
        requestedStartsAt,
        requestedEndsAt,
        appointmentId,
        expiresAt: "2026-08-29T09:00:00+00:00",
        caseSummary: "Requesting an extraction assessment for a patient.",
        requestChannel: "EMAIL",
      },
    });

    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 1 }], error: null });
    await createSpecialistRequest({
      actingBranchId: branchId,
      patientId,
      payload: {
        caseSummary: "Requesting a fitting assessment.",
        requestChannel: "SMS",
      },
    });
    expect(rpc).toHaveBeenLastCalledWith("create_specialist_request", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_payload: {
        requiredSpecialtyId: null,
        requestedProviderId: null,
        requestedStartsAt: null,
        requestedEndsAt: null,
        appointmentId: null,
        expiresAt: null,
        caseSummary: "Requesting a fitting assessment.",
        requestChannel: "SMS",
      },
    });
  });

  it("binds respond to its exact RPC contract for accept and alternate-time", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 2 }], error: null });
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ACCEPT" },
    })).resolves.toEqual({ requestId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("respond_specialist_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_response: {
        action: "ACCEPT",
        message: null,
        alternateStartsAt: null,
        alternateEndsAt: null,
      },
    });

    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 2 }], error: null });
    await respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: {
        action: "ALTERNATE_TIME",
        message: "Free on the 2nd instead.",
        alternateStartsAt,
        alternateEndsAt,
      },
    });
    expect(rpc).toHaveBeenLastCalledWith("respond_specialist_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_response: {
        action: "ALTERNATE_TIME",
        message: "Free on the 2nd instead.",
        alternateStartsAt,
        alternateEndsAt,
      },
    });
  });

  it("binds cancel to its exact RPC contract and defaults the reason", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 2 }], error: null });
    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1 })).resolves.toEqual({ requestId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("cancel_specialist_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_reason: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, version: 2 }], error: null });
    await cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, reason: "Patient no longer needs it" });
    expect(rpc).toHaveBeenLastCalledWith("cancel_specialist_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_reason: "Patient no longer needs it",
    });
  });

  it("lists rows with the full projection and no status filter", async () => {
    rpc.mockResolvedValueOnce({ data: [listRow], error: null });
    await expect(listSpecialistRequests({ actingBranchId: branchId })).resolves.toEqual([{
      requestId,
      patientId,
      patientDisplayName: "Juana Dela Cruz",
      requiredSpecialtyId: specialtyId,
      requiredSpecialtyName: "Oral Surgery",
      requestedProviderId: providerId,
      requestedProviderDisplayName: "Dr. Jose Dela Cruz",
      requestedStartsAt,
      requestedEndsAt,
      caseSummary: "Requesting an extraction assessment for a patient.",
      requestChannel: "EMAIL",
      status: "SENT",
      responseMessage: null,
      expiresAt: "2026-08-29T09:00:00+00:00",
      version: 1,
      createdAt,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_specialist_requests", {
      p_acting_branch_id: branchId,
      p_status: null,
    });
  });

  it("passes the status filter through and rejects malformed list rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listSpecialistRequests({ actingBranchId: branchId, status: "SENT" });
    expect(rpc).toHaveBeenLastCalledWith("list_specialist_requests", {
      p_acting_branch_id: branchId,
      p_status: "SENT",
    });

    rpc.mockResolvedValueOnce({ data: [{ ...listRow, status: "NOT_A_STATUS" }], error: null });
    await expect(listSpecialistRequests({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ ...listRow, required_specialty_id: "not-a-uuid" }], error: null });
    await expect(listSpecialistRequests({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("rejects malformed mutation rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId }], error: null });
    await expect(createSpecialistRequest(createInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ request_id: "not-a-uuid", version: 1 }], error: null });
    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createSpecialistRequest(createInput)).rejects.toEqual(new SpecialistServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "ACCEPT" },
    })).rejects.toEqual(new SpecialistServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(respondSpecialistRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: { action: "DECLINE" },
    })).rejects.toEqual(new SpecialistServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(cancelSpecialistRequest({ actingBranchId: branchId, requestId, expectedVersion: 1 })).rejects.toEqual(new SpecialistServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listSpecialistRequests({ actingBranchId: branchId })).rejects.toEqual(new SpecialistServiceError("FAILED"));
  });
});