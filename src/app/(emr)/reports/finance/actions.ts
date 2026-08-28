"use server";

import { requirePermission } from "@/lib/authorization";
import { getFinancialSummary, listPendingPdc } from "@/lib/billing/service";
import type { FinancialSummaryRow, PendingPdcRow } from "@/lib/billing/types";

export type FinancialReportActionState =
  | { ok: true; rows: FinancialSummaryRow[]; fromDate: string | null; toDate: string | null; branchId: string | null; message?: undefined }
  | { ok: false; message: string; rows: FinancialSummaryRow[]; fromDate: string | null; toDate: string | null; branchId: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultWindow(): { fromDate: string; toDate: string } {
  const today = new Date();
  const start = new Date(today.getTime() - 30 * DAY_MS);
  return { fromDate: isoDate(start), toDate: isoDate(today) };
}

export async function loadFinancialReportAction(input: unknown): Promise<FinancialReportActionState> {
  const empty: FinancialReportActionState = { ok: true, rows: [], fromDate: null, toDate: null, branchId: null };
  try {
    const value = (input ?? {}) as { actingBranchId?: string; branchId?: string | null };
    if (!value.actingBranchId) return { ...empty, ok: false, message: "An acting branch is required." };
    await requirePermission({ permission: "financial.analytics.read", branchId: value.actingBranchId });
    const window = defaultWindow();
    const rows = await getFinancialSummary({
      branchId: value.actingBranchId,
      filterBranchId: value.branchId ?? null,
      from: window.fromDate,
      to: window.toDate,
    });
    return { ok: true, rows, fromDate: window.fromDate, toDate: window.toDate, branchId: value.branchId ?? null };
  } catch {
    return { ...empty, ok: false, message: "The finance report could not be loaded." };
  }
}

export type PendingPdcActionState = { ok: true; rows: PendingPdcRow[]; message?: undefined } | { ok: false; message: string; rows: PendingPdcRow[] };

export async function loadPendingPdcAction(input: unknown): Promise<PendingPdcActionState> {
  try {
    const value = (input ?? {}) as { actingBranchId?: string; branchId?: string | null };
    if (!value.actingBranchId) return { ok: false, message: "An acting branch is required.", rows: [] };
    await requirePermission({ permission: "billing.read", branchId: value.actingBranchId });
    const rows = await listPendingPdc({ branchId: value.actingBranchId, filterBranchId: value.branchId ?? null });
    return { ok: true, rows };
  } catch {
    return { ok: false, message: "The pending cheque report could not be loaded.", rows: [] };
  }
}
