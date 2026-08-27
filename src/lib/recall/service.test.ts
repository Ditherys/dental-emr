import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { RecallServiceError, mapRecallRpcError } from "./errors";
import {
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
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const ruleId = "c3000000-0000-0000-0000-000000000003";
const recallId = "c4000000-0000-0000-0000-000000000004";
const appointmentId = "c5000000-0000-0000-0000-000000000005";

const dueDate = "2026-10-01T09:00:00+00:00";
const reminderSentAt = "2026-08-27T09:00:00+00:00";

const createRecallRuleInput = {
  actingBranchId: branchId,
  name: "Six-month checkup",
  intervalMonths: 6,
  channel: "EMAIL" as const,
};

const recallListRow = {
  recall_id: recallId,
  patient_id: patientId,
  patient_display_name: "Juana Dela Cruz",
  recall_rule_id: ruleId,
  recall_rule_name: "Six-month checkup",
  due_date: dueDate,
  status: "SCHEDULED",
  reminders_sent: 1,
  reminder_sent_at: reminderSentAt,
  appointment_id: null,
  version: 2,
};

describe("recall service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapRecallRpcError({ code: "42501", message: "not authorized" })).toEqual(new RecallServiceError("NOT_AUTHORIZED"));
    expect(mapRecallRpcError({ code: "22023", message: "invalid input" })).toEqual(new RecallServiceError("INVALID_INPUT"));
    expect(mapRecallRpcError({ code: "P0001", message: "stale version" })).toEqual(new RecallServiceError("STALE_VERSION"));
    expect(mapRecallRpcError({ code: "P0001", message: "invalid state" })).toEqual(new RecallServiceError("INVALID_STATE"));
    expect(mapRecallRpcError({ code: "XX000", message: "unexpected" })).toEqual(new RecallServiceError("FAILED"));
    expect(mapRecallRpcError("boom")).toEqual(new RecallServiceError("FAILED"));
  });
});

describe("recall service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden keys before an RPC", async () => {
    await expect(createRecallRule({
      ...createRecallRuleInput,
      organizationId: "foreign-org",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      name: "",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      name: "x".repeat(161),
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      intervalMonths: 0,
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      intervalMonths: 121,
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      channel: "PUSH",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecallRule({
      ...createRecallRuleInput,
      branchId: "not-a-uuid",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(updateRecallRule({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 0,
      name: "Six-month checkup",
      intervalMonths: 6,
      channel: "SMS",
      isActive: true,
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateRecallRule({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 1,
      name: "Six-month checkup",
      intervalMonths: 6,
      channel: "EMAIL",
      isActive: true,
      organizationId: "foreign-org",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(createRecall({ actingBranchId: branchId, patientId, ruleId, dueDate: "not-a-date" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createRecall({ actingBranchId: branchId, ruleId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(setPatientRecallOptOut({ actingBranchId: branchId, patientId, optOut: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(setPatientRecallOptOut({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(completeRecall({ actingBranchId: branchId, recallId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelRecall({ actingBranchId: branchId, recallId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(markRecallOptedOut({ actingBranchId: branchId, recallId, expectedVersion: 1, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(enqueueRecallReminder({ actingBranchId: branchId, recallId: "not-a-uuid", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(linkRecallAppointment({ actingBranchId: branchId, recallId, expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(linkRecallAppointment({ actingBranchId: branchId, recallId, expectedVersion: 1, appointmentId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listRecalls({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listRecalls({ actingBranchId: branchId, status: "QUEUED" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listRecalls({ actingBranchId: branchId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(getRecallRetentionSummary({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getRecallRetentionSummary({ actingBranchId: branchId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("recall service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds rule create to its exact RPC contract and defaults the branch", async () => {
    rpc.mockResolvedValueOnce({ data: [{ rule_id: ruleId, version: 1 }], error: null });
    await expect(createRecallRule(createRecallRuleInput)).resolves.toEqual({ ruleId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_recall_rule", {
      p_acting_branch_id: branchId,
      p_name: "Six-month checkup",
      p_interval_months: 6,
      p_channel: "EMAIL",
      p_branch_id: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ rule_id: ruleId, version: 1 }], error: null });
    await createRecallRule({ ...createRecallRuleInput, branchId });
    expect(rpc).toHaveBeenLastCalledWith("create_recall_rule", {
      p_acting_branch_id: branchId,
      p_name: "Six-month checkup",
      p_interval_months: 6,
      p_channel: "EMAIL",
      p_branch_id: branchId,
    });
  });

  it("binds rule update to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ rule_id: ruleId, version: 2 }], error: null });
    await expect(updateRecallRule({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 1,
      name: "Six-month checkup",
      intervalMonths: 6,
      channel: "SMS",
      isActive: false,
    })).resolves.toEqual({ ruleId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("update_recall_rule", {
      p_acting_branch_id: branchId,
      p_rule_id: ruleId,
      p_expected_version: 1,
      p_name: "Six-month checkup",
      p_interval_months: 6,
      p_channel: "SMS",
      p_is_active: false,
    });
  });

  it("lists rules with the full projection and an inactive default", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      rule_id: ruleId,
      name: "Six-month checkup",
      interval_months: 6,
      channel: "EMAIL",
      is_active: true,
      branch_id: null,
      version: 1,
    }], error: null });
    await expect(listRecallRules({ actingBranchId: branchId })).resolves.toEqual([{
      ruleId,
      name: "Six-month checkup",
      intervalMonths: 6,
      channel: "EMAIL",
      isActive: true,
      branchId: null,
      version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_recall_rules", {
      p_acting_branch_id: branchId,
      p_include_inactive: false,
    });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listRecallRules({ actingBranchId: branchId, includeInactive: true });
    expect(rpc).toHaveBeenLastCalledWith("list_recall_rules", {
      p_acting_branch_id: branchId,
      p_include_inactive: true,
    });
  });

  it("binds recall create to its exact RPC contract and defaults the due date", async () => {
    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, version: 1 }], error: null });
    await expect(createRecall({ actingBranchId: branchId, patientId, ruleId })).resolves.toEqual({ recallId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_recall", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_rule_id: ruleId,
      p_due_date: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, version: 1 }], error: null });
    await createRecall({ actingBranchId: branchId, patientId, ruleId, dueDate });
    expect(rpc).toHaveBeenLastCalledWith("create_recall", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_rule_id: ruleId,
      p_due_date: dueDate,
    });
  });

  it("binds the patient opt-out upsert to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ patient_id: patientId, recall_opt_out: true }], error: null });
    await expect(setPatientRecallOptOut({ actingBranchId: branchId, patientId, optOut: true })).resolves.toEqual({ patientId, recallOptOut: true });
    expect(rpc).toHaveBeenLastCalledWith("set_recall_opt_out", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_opt_out: true,
    });
  });

  it("binds complete, cancel, and opt-out transitions to their exact RPC contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, status: "COMPLETED", version: 2 }], error: null });
    await expect(completeRecall({ actingBranchId: branchId, recallId, expectedVersion: 1 })).resolves.toEqual({ recallId, status: "COMPLETED", version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("complete_recall", {
      p_acting_branch_id: branchId,
      p_recall_id: recallId,
      p_expected_version: 1,
    });

    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, status: "CANCELLED", version: 2 }], error: null });
    await cancelRecall({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("cancel_recall", {
      p_acting_branch_id: branchId,
      p_recall_id: recallId,
      p_expected_version: 1,
    });

    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, status: "OPTED_OUT", version: 2 }], error: null });
    await markRecallOptedOut({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("mark_recall_opted_out", {
      p_acting_branch_id: branchId,
      p_recall_id: recallId,
      p_expected_version: 1,
    });
  });

  it("binds the reminder enqueue and reports whether the reminder was actually enqueued", async () => {
    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, status: "SCHEDULED", version: 2 }], error: null });
    await expect(enqueueRecallReminder({ actingBranchId: branchId, recallId, expectedVersion: 1 })).resolves.toEqual({
      recallId,
      status: "SCHEDULED",
      version: 2,
      enqueued: true,
    });
    expect(rpc).toHaveBeenLastCalledWith("enqueue_recall_reminder", {
      p_acting_branch_id: branchId,
      p_recall_id: recallId,
      p_expected_version: 1,
    });

    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, status: "SCHEDULED", version: 1 }], error: null });
    const skipped = await enqueueRecallReminder({ actingBranchId: branchId, recallId, expectedVersion: 1 });
    expect(skipped.enqueued).toBe(false);
    expect(skipped.version).toBe(1);
  });

  it("binds the appointment link to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ recall_id: recallId, appointment_id: appointmentId, version: 2 }], error: null });
    await expect(linkRecallAppointment({ actingBranchId: branchId, recallId, expectedVersion: 1, appointmentId })).resolves.toEqual({
      recallId,
      appointmentId,
      version: 2,
    });
    expect(rpc).toHaveBeenLastCalledWith("link_recall_appointment", {
      p_acting_branch_id: branchId,
      p_recall_id: recallId,
      p_expected_version: 1,
      p_appointment_id: appointmentId,
    });
  });

  it("lists recalls with the full projection and no filters by default", async () => {
    rpc.mockResolvedValueOnce({ data: [recallListRow], error: null });
    await expect(listRecalls({ actingBranchId: branchId })).resolves.toEqual([{
      recallId,
      patientId,
      patientDisplayName: "Juana Dela Cruz",
      recallRuleId: ruleId,
      recallRuleName: "Six-month checkup",
      dueDate,
      status: "SCHEDULED",
      remindersSent: 1,
      reminderSentAt,
      appointmentId: null,
      version: 2,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_recalls", {
      p_acting_branch_id: branchId,
      p_patient_id: null,
      p_status: null,
    });
  });

  it("passes recall filters through and rejects malformed list rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listRecalls({ actingBranchId: branchId, patientId, status: "OVERDUE" });
    expect(rpc).toHaveBeenLastCalledWith("list_recalls", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_status: "OVERDUE",
    });

    rpc.mockResolvedValueOnce({ data: [{ ...recallListRow, status: "NOT_A_STATUS" }], error: null });
    await expect(listRecalls({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ ...recallListRow, due_date: "not-a-date" }], error: null });
    await expect(listRecalls({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ ...recallListRow, appointment_id: "not-a-uuid" }], error: null });
    await expect(listRecalls({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("returns the retention summary rows with bounded counts", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      recall_rule_name: "Six-month checkup",
      status: "SCHEDULED",
      recall_count: 4,
    }], error: null });
    await expect(getRecallRetentionSummary({ actingBranchId: branchId })).resolves.toEqual([{
      recallRuleName: "Six-month checkup",
      status: "SCHEDULED",
      recallCount: 4,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("get_recall_retention_summary", {
      p_acting_branch_id: branchId,
    });
  });

  it("rejects malformed mutation rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ rule_id: ruleId }], error: null });
    await expect(createRecallRule(createRecallRuleInput)).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ recall_id: "not-a-uuid", status: "COMPLETED", version: 2 }], error: null });
    await expect(completeRecall({ actingBranchId: branchId, recallId, expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createRecallRule(createRecallRuleInput)).rejects.toEqual(new RecallServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(createRecall({ actingBranchId: branchId, patientId, ruleId })).rejects.toEqual(new RecallServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(completeRecall({ actingBranchId: branchId, recallId, expectedVersion: 1 })).rejects.toEqual(new RecallServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(cancelRecall({ actingBranchId: branchId, recallId, expectedVersion: 1 })).rejects.toEqual(new RecallServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listRecalls({ actingBranchId: branchId })).rejects.toEqual(new RecallServiceError("FAILED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(enqueueRecallReminder({ actingBranchId: branchId, recallId, expectedVersion: 1 })).rejects.toEqual(new RecallServiceError("STALE_VERSION"));
  });
});