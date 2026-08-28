"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { setProviderCompensationAgreement, upsertPaymentMethod } from "@/lib/billing/service";

type Result = { ok: true } | { ok: false; message: string };

function failed(): Result { return { ok: false, message: "The billing configuration could not be saved." }; }

export async function savePaymentMethodAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string };
    await requirePermission({ permission: "billing.adjust", branchId: value.branchId });
    await upsertPaymentMethod(input);
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch { return failed(); }
}

export async function saveCompensationAgreementAction(input: unknown): Promise<Result> {
  try {
    const value = input as { branchId: string };
    await requirePermission({ permission: "compensation.manage", branchId: value.branchId });
    await setProviderCompensationAgreement(input);
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch { return failed(); }
}
