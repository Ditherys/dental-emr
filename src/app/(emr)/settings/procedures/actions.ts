"use server";

import { revalidatePath } from "next/cache";

import { requireAal2, requirePermission } from "@/lib/authorization";
import {
  archiveProcedure,
  createProcedure,
  setProcedureEligibleProviders,
  setProcedureSpecialties,
  updateProcedure,
} from "@/lib/procedures/service";
import {
  archiveProcedureSchema,
  createProcedureSchema,
  setProcedureEligibleProvidersSchema,
  setProcedureSpecialtiesSchema,
  updateProcedureSchema,
} from "@/lib/procedures/schema";

export type ProcedureActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const procedurePath = "/settings/procedures";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalText(formData: FormData, name: string) {
  const value = text(formData, name).trim();
  return value || undefined;
}

function number(formData: FormData, name: string) {
  return Number(text(formData, name));
}

function duration(formData: FormData) {
  const value = text(formData, "defaultDurationMinutes").trim();
  return value ? Number(value) : null;
}

function errorState(): ProcedureActionState {
  return { message: "The procedure change could not be completed." };
}

function procedureValues(formData: FormData) {
  return {
    actingBranchId: text(formData, "actingBranchId"),
    code: text(formData, "code"),
    name: text(formData, "name"),
    description: optionalText(formData, "description"),
    defaultDurationMinutes: duration(formData),
    preBufferMinutes: number(formData, "preBufferMinutes"),
    postBufferMinutes: number(formData, "postBufferMinutes"),
    status: text(formData, "status"),
    websiteVisible: formData.get("websiteVisible") === "true",
    onlineBookingEnabled: formData.get("onlineBookingEnabled") === "true",
    bookingMode: text(formData, "bookingMode"),
  };
}

export async function createProcedureAction(_previous: ProcedureActionState, formData: FormData): Promise<ProcedureActionState> {
  const parsed = createProcedureSchema.safeParse(procedureValues(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await createProcedure(parsed.data);
    revalidatePath(procedurePath);
    return { success: true, message: "Procedure added." };
  } catch {
    return errorState();
  }
}

export async function updateProcedureAction(_previous: ProcedureActionState, formData: FormData): Promise<ProcedureActionState> {
  const parsed = updateProcedureSchema.safeParse({ ...procedureValues(formData), procedureId: text(formData, "procedureId"), expectedVersion: number(formData, "expectedVersion") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await updateProcedure(parsed.data);
    revalidatePath(procedurePath);
    return { success: true, message: "Procedure updated." };
  } catch {
    return errorState();
  }
}

export async function archiveProcedureAction(_previous: ProcedureActionState, formData: FormData): Promise<ProcedureActionState> {
  const parsed = archiveProcedureSchema.safeParse({ actingBranchId: text(formData, "actingBranchId"), procedureId: text(formData, "procedureId"), expectedVersion: number(formData, "expectedVersion") });
  if (!parsed.success) return { message: "The procedure change could not be completed." };
  try {
    await requireAal2(procedurePath);
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await archiveProcedure(parsed.data);
    revalidatePath(procedurePath);
    return { success: true, message: "Procedure archived." };
  } catch {
    return errorState();
  }
}

export async function setProcedureAssociationsAction(_previous: ProcedureActionState, formData: FormData): Promise<ProcedureActionState> {
  const base = { actingBranchId: text(formData, "actingBranchId"), procedureId: text(formData, "procedureId"), expectedVersion: number(formData, "expectedVersion") };
  const specialtyIds = formData.getAll("specialtyIds").filter((id): id is string => typeof id === "string");
  const specialties = setProcedureSpecialtiesSchema.safeParse({ ...base, specialties: specialtyIds.map((specialtyId) => ({ specialtyId, requirementLevel: text(formData, `requirementLevel-${specialtyId}`) })) });
  const providers = setProcedureEligibleProvidersSchema.safeParse({ ...base, providerIds: formData.getAll("providerIds").filter((id): id is string => typeof id === "string") });
  if (!specialties.success || !providers.success) return { message: "The procedure change could not be completed." };
  try {
    await requirePermission({ permission: "provider.manage", branchId: base.actingBranchId });
    const specialtyResult = await setProcedureSpecialties(specialties.data);
    await requirePermission({ permission: "provider.manage", branchId: base.actingBranchId });
    await setProcedureEligibleProviders({ ...providers.data, expectedVersion: specialtyResult.version });
    revalidatePath(procedurePath);
    return { success: true, message: "Procedure requirements updated." };
  } catch {
    return errorState();
  }
}
