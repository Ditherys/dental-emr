"use server";

import { requirePermission } from "@/lib/authorization";
import { listProviderEarnings } from "@/lib/billing/service";
import { providerEarningRowSchema } from "@/lib/billing/schema";
import type { z } from "zod";

type ProviderEarningRow = z.infer<typeof providerEarningRowSchema>;

export type OwnEarningsActionState = { ok: true; rows: ProviderEarningRow[]; message?: undefined } | { ok: false; message: string; rows: ProviderEarningRow[] };

export async function loadOwnEarningsAction(input: unknown): Promise<OwnEarningsActionState> {
  try {
    const value = (input ?? {}) as { actingBranchId?: string };
    if (!value.actingBranchId) return { ok: false, message: "An acting branch is required.", rows: [] };
    await requirePermission({ permission: "compensation.own.read", branchId: value.actingBranchId });
    const rows = await listProviderEarnings({ branchId: value.actingBranchId, providerId: null, from: null, to: null });
    return { ok: true, rows };
  } catch {
    return { ok: false, message: "The earnings view could not be loaded.", rows: [] };
  }
}
