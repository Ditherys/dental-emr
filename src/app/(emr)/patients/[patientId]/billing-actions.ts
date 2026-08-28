"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import {
  allocatePayment,
  postCharge,
  postChargeAdjustment,
  recordPayment,
  recordPostdatedCheque,
  summarizeProcedureCharges,
} from "@/lib/billing/service";
import type { ProcedurePaymentSummary } from "@/lib/billing/types";

type Result = { ok: true } | { ok: false; message: string };

function failed(): Result {
  return { ok: false, message: "The account change could not be completed." };
}

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
}

export async function postChargeAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string; patientId: string };
    await requirePermission({ permission: "billing.charge", branchId: value.branchId });
    await postCharge(input);
    refresh(value.patientId);
    return { ok: true };
  } catch { return failed(); }
}

export async function recordPaymentAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string; patientId: string };
    await requirePermission({ permission: "payment.record", branchId: value.branchId });
    await recordPayment(input);
    refresh(value.patientId);
    return { ok: true };
  } catch { return failed(); }
}

export async function allocatePaymentAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string; patientId: string };
    await requirePermission({ permission: "payment.record", branchId: value.branchId });
    await allocatePayment(input);
    refresh(value.patientId);
    return { ok: true };
  } catch { return failed(); }
}

export async function postAdjustmentAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string; patientId: string };
    await requirePermission({ permission: "billing.adjust", branchId: value.branchId });
    await postChargeAdjustment(input);
    refresh(value.patientId);
    return { ok: true };
  } catch { return failed(); }
}

export async function recordPostdatedChequeAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string; patientId: string };
    await requirePermission({ permission: "payment.record", branchId: value.branchId });
    await recordPostdatedCheque(input);
    refresh(value.patientId);
    return { ok: true };
  } catch { return failed(); }
}

type SummaryResult = { ok: true; summary: ProcedurePaymentSummary | null } | { ok: false; message: string };

export async function summarizeProcedureChargesAction(input: unknown): Promise<SummaryResult> {
  try {
    const value = input as { branchId: string; patientId: string; procedureId: string };
    await requirePermission({ permission: "billing.read", branchId: value.branchId });
    const summary = await summarizeProcedureCharges(input);
    return { ok: true, summary };
  } catch {
    return { ok: false, message: "The procedure summary could not be loaded." };
  }
}
