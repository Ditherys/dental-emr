"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import {
  allocatePayment,
  postCharge,
  postChargeAdjustment,
  recordPayment,
  recordPostdatedCheque,
} from "@/lib/billing/service";

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
