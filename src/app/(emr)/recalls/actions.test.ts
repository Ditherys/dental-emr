import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  RecallServiceError,
  cancelRecall,
  completeRecall,
  createRecall,
  createRecallRule,
  enqueueRecallReminder,
  getRecallRetentionSummary,
  linkRecallAppointment,
  listRecallRules,
  listRecalls,
  markRecallOptedOut,
  revalidatePath,
  requirePermission,
  setPatientRecallOptOut,
  updateRecallRule,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  RecallServiceError: class RecallServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  cancelRecall: vi.fn(),
  completeRecall: vi.fn(),
  createRecall: vi.fn(),
  createRecallRule: vi.fn(),
  enqueueRecallReminder: vi.fn(),
  getRecallRetentionSummary: vi.fn(),
  linkRecallAppointment: vi.fn(),
  listRecallRules: vi.fn(),
  listRecalls: vi.fn(),
  markRecallOptedOut: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  setPatientRecallOptOut: vi.fn(),
  updateRecallRule: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/recall/service", () => ({
  RecallServiceError,
  cancelRecall,
  completeRecall,
  createRecall,
  createRecallRule,
  enqueueRecallReminder,
  getRecallRetentionSummary,
  linkRecallAppointment,
  listRecallRules,
  listRecalls,
  markRecallOptedOut,
  setPatientRecallOptOut,
  updateRecallRule,
}));

import {
  cancelRecallAction,
  completeRecallAction,
  createRecallAction,
  createRecallRuleAction,
  enqueueRecallReminderAction,
  linkRecallAppointmentAction,
  loadRecallRulesAction,
  loadRecallsAction,
  markRecallOptedOutAction,
  setPatientOptOutAction,
  updateRecallRuleAction,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const ruleId = "c3000000-0000-0000-0000-000000000003";
const recallId = "c4000000-0000-0000-0000-000000000004";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const dueDate = "2026-10-01T09:00:00+00:00";

function recallRow(overrides: Record<string, unknown> = {}) {
  return {
    recallId: recallId,
    patientId,
    patientDisplayName: "Juana Dela Cruz",
    recallRuleId: ruleId,
    recallRuleName: "Six-month checkup",
    dueDate,
    status: "SCHEDULED",
    remindersSent: 0,
    reminderSentAt: null,
    appointmentId: null,
    version: 1,
    ...overrides,
  };
}

const overdue = recallRow({ recallId: "c4000000-0000-0000-0000-000000000006", status: "OVERDUE", dueDate: "2026-08-01T09:00:00+00:00" });
const upcoming = recallRow({ recallId: "c4000000-0000-0000-0000-000000000007", status: "SCHEDULED", dueDate: "2026-12-01T09:00:00+00:00" });
const soon = recallRow({ recallId: "c4000000-0000-0000-0000-000000000008", status: "SCHEDULED", dueDate: "2026-11-01T09:00:00+00:00" });

beforeEach(() => vi.clearAllMocks());

describe("recalls server actions", () => {
  it("rechecks recall.read against the submitted branch and loads recalls with retention, overdue first", async () => {
    requirePermission.mockResolvedValueOnce({});
    listRecalls.mockResolvedValueOnce([upcoming, overdue, soon]);
    getRecallRetentionSummary.mockResolvedValueOnce([{ recallRuleName: "Six-month checkup", status: "SCHEDULED", recallCount: 3 }]);

    const result = await loadRecallsAction({ actingBranchId: branchId });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recalls.map((row) => row.recallId)).toEqual([overdue.recallId, soon.recallId, upcoming.recallId]);
      expect(result.retention).toEqual([{ recallRuleName: "Six-month checkup", status: "SCHEDULED", recallCount: 3 }]);
    }
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.read", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listRecalls.mock.invocationCallOrder[0]);
    expect(listRecalls).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(getRecallRetentionSummary).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("rejects forged org identifiers before any authorization on load", async () => {
    const result = await loadRecallsAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as Parameters<typeof loadRecallsAction>[0]);
    expect(result).toEqual({ ok: false, message: "The recalls could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listRecalls).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses recall read access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadRecallsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listRecalls).not.toHaveBeenCalled();
  });

  it("rechecks recall.manage and loads recall rules with inactive included", async () => {
    requirePermission.mockResolvedValueOnce({});
    listRecallRules.mockResolvedValueOnce([{ ruleId, name: "Six-month checkup", intervalMonths: 6, channel: "EMAIL", isActive: true, branchId: null, version: 1 }]);

    await expect(loadRecallRulesAction({ actingBranchId: branchId, includeInactive: true })).resolves.toEqual({
      ok: true,
      rules: [{ ruleId, name: "Six-month checkup", intervalMonths: 6, channel: "EMAIL", isActive: true, branchId: null, version: 1 }],
    });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(listRecallRules).toHaveBeenCalledWith({ actingBranchId: branchId, includeInactive: true });
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("rechecks recall.manage and schedules a recall with the bounded payload", async () => {
    requirePermission.mockResolvedValueOnce({});
    createRecall.mockResolvedValueOnce({ recallId, version: 1 });

    const result = await createRecallAction({ actingBranchId: branchId, patientId, ruleId, dueDate });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createRecall.mock.invocationCallOrder[0]);
    expect(createRecall).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, ruleId, dueDate });
    expect(createRecall).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("drops forged tenant identifiers before the create service call", async () => {
    requirePermission.mockResolvedValueOnce({});
    createRecall.mockResolvedValueOnce({ recallId, version: 1 });

    await createRecallAction({ actingBranchId: branchId, patientId, ruleId, organizationId: "foreign" } as unknown as Parameters<typeof createRecallAction>[0]);

    expect(createRecall).toHaveBeenCalledWith(expect.not.objectContaining({ organizationId: "foreign" }));
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
  });

  it("rejects an invalid create payload before any authorization", async () => {
    const result = await createRecallAction({ actingBranchId: branchId, patientId, ruleId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, message: "Review the highlighted fields and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createRecall).not.toHaveBeenCalled();
  });

  it("maps a denied create to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    createRecall.mockRejectedValueOnce(new RecallServiceError("NOT_AUTHORIZED"));
    const result = await createRecallAction({ actingBranchId: branchId, patientId, ruleId });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
  });

  it("rechecks recall.manage and completes a recall with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    completeRecall.mockResolvedValueOnce({ recallId, status: "COMPLETED", version: 2 });

    const result = await completeRecallAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(completeRecall.mock.invocationCallOrder[0]);
    expect(completeRecall).toHaveBeenCalledWith({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(completeRecall).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("cancels a recall with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelRecall.mockResolvedValueOnce({ recallId, status: "CANCELLED", version: 2 });

    await expect(cancelRecallAction({ actingBranchId: branchId, recallId, expectedVersion: 1 })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(cancelRecall).toHaveBeenCalledWith({ actingBranchId: branchId, recallId, expectedVersion: 1 });
  });

  it("maps a stale version on complete to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    completeRecall.mockRejectedValueOnce(new RecallServiceError("STALE_VERSION"));
    const result = await completeRecallAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "This recall changed elsewhere. Refresh and try again." });
  });

  it("maps an invalid complete state to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    completeRecall.mockRejectedValueOnce(new RecallServiceError("INVALID_STATE"));
    const result = await completeRecallAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "That recall is no longer available for this action." });
  });

  it("opts an individual recall out with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    markRecallOptedOut.mockResolvedValueOnce({ recallId, status: "OPTED_OUT", version: 2 });

    await expect(markRecallOptedOutAction({ actingBranchId: branchId, recallId, expectedVersion: 1 })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(markRecallOptedOut).toHaveBeenCalledWith({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("upserts the patient opt-out preference under recall.manage", async () => {
    requirePermission.mockResolvedValueOnce({});
    setPatientRecallOptOut.mockResolvedValueOnce({ patientId, recallOptOut: true });

    await expect(setPatientOptOutAction({ actingBranchId: branchId, patientId, optOut: true })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(setPatientRecallOptOut).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, optOut: true });
    expect(setPatientRecallOptOut).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
  });

  it("queues a reminder and reports it was enqueued", async () => {
    requirePermission.mockResolvedValueOnce({});
    enqueueRecallReminder.mockResolvedValueOnce({ recallId, status: "SCHEDULED", version: 2, enqueued: true });

    await expect(enqueueRecallReminderAction({ actingBranchId: branchId, recallId, expectedVersion: 1 })).resolves.toEqual({ ok: true, enqueued: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(enqueueRecallReminder).toHaveBeenCalledWith({ actingBranchId: branchId, recallId, expectedVersion: 1 });
  });

  it("reports an opted-out skip with a safe note instead of enqueuing", async () => {
    requirePermission.mockResolvedValueOnce({});
    enqueueRecallReminder.mockResolvedValueOnce({ recallId, status: "SCHEDULED", version: 1, enqueued: false });

    const result = await enqueueRecallReminderAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(result).toEqual({
      ok: true,
      enqueued: false,
      message: "Reminder skipped — this patient has opted out, the rule has no channel, or no contact is on file.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/recalls");
  });

  it("maps a stale reminder enqueue to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    enqueueRecallReminder.mockRejectedValueOnce(new RecallServiceError("STALE_VERSION"));
    const result = await enqueueRecallReminderAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "This recall changed elsewhere. Refresh and try again." });
  });

  it("links a recall to an appointment with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    linkRecallAppointment.mockResolvedValueOnce({ recallId, appointmentId, version: 2 });

    await expect(linkRecallAppointmentAction({ actingBranchId: branchId, recallId, expectedVersion: 1, appointmentId })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(linkRecallAppointment).toHaveBeenCalledWith({ actingBranchId: branchId, recallId, expectedVersion: 1, appointmentId });
    expect(linkRecallAppointment).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
  });

  it("rejects an invalid appointment link before any authorization", async () => {
    const result = await linkRecallAppointmentAction({ actingBranchId: branchId, recallId, expectedVersion: 1, appointmentId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, message: "That appointment link is not valid." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(linkRecallAppointment).not.toHaveBeenCalled();
  });

  it("denies an enqueue with a safe message when recall manage access was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await enqueueRecallReminderAction({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(enqueueRecallReminder).not.toHaveBeenCalled();
  });

  it("creates a recall rule with the bounded payload and no org identifiers", async () => {
    requirePermission.mockResolvedValueOnce({});
    createRecallRule.mockResolvedValueOnce({ ruleId, version: 1 });

    const result = await createRecallRuleAction({
      actingBranchId: branchId,
      name: "Six-month checkup",
      intervalMonths: 6,
      channel: "EMAIL",
      branchId: null,
      organizationId: "foreign",
    } as unknown as Parameters<typeof createRecallRuleAction>[0]);

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(createRecallRule).toHaveBeenCalledWith({ actingBranchId: branchId, name: "Six-month checkup", intervalMonths: 6, channel: "EMAIL", branchId: null });
    expect(createRecallRule).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
  });

  it("rejects an invalid rule before any authorization", async () => {
    const result = await createRecallRuleAction({ actingBranchId: branchId, name: "", intervalMonths: 6, channel: "EMAIL" });
    expect(result).toEqual({ ok: false, message: "Review the highlighted fields and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createRecallRule).not.toHaveBeenCalled();
  });

  it("updates a recall rule and maps a stale version to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateRecallRule.mockRejectedValueOnce(new RecallServiceError("STALE_VERSION"));

    const result = await updateRecallRuleAction({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 1,
      name: "Yearly checkup",
      intervalMonths: 12,
      channel: "SMS",
      isActive: false,
      organizationId: "foreign",
    } as unknown as Parameters<typeof updateRecallRuleAction>[0]);

    expect(result).toEqual({ ok: false, message: "This recall changed elsewhere. Refresh and try again." });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "recall.manage", branchId });
    expect(updateRecallRule).toHaveBeenCalledWith({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 1,
      name: "Yearly checkup",
      intervalMonths: 12,
      channel: "SMS",
      isActive: false,
    });
  });
});