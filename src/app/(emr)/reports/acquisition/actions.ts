"use server";

import { revalidatePath } from "next/cache";

import {
  AcquisitionServiceError,
  getAcquisitionSummary,
} from "@/lib/acquisition/service";
import { acquisitionSummaryInputSchema } from "@/lib/acquisition/schema";
import type {
  AcquisitionReportWindow,
  AcquisitionSummary,
} from "@/lib/acquisition/types";
import { AuthorizationError, requirePermission } from "@/lib/authorization";

export type AcquisitionReportActionState = {
  rows: AcquisitionSummary;
  windowDays: AcquisitionReportWindow;
  message?: string;
};

const fallbackWindow: AcquisitionReportWindow = 30;

export async function loadAcquisitionReportAction(
  _previous: AcquisitionReportActionState,
  formData: FormData,
): Promise<AcquisitionReportActionState> {
  const parsed = acquisitionSummaryInputSchema.safeParse({
    actingBranchId: formData.get("actingBranchId"),
    windowDays: Number(formData.get("windowDays")),
  });

  if (!parsed.success) {
    return { rows: [], windowDays: fallbackWindow, message: "The report window could not be read." };
  }

  const { windowDays } = parsed.data;

  try {
    await requirePermission({ permission: "analytics.view", branchId: parsed.data.actingBranchId });
    const rows = await getAcquisitionSummary(parsed.data);
    revalidatePath("/reports/acquisition");
    return { rows, windowDays };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof AcquisitionServiceError && error.code === "NOT_AUTHORIZED")
    ) {
      return { rows: [], windowDays, message: "Your current organization access does not allow this report." };
    }
    return { rows: [], windowDays, message: "The report could not be loaded. Refresh to try again." };
  }
}
