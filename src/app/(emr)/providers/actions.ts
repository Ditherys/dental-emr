"use server";

import { revalidatePath } from "next/cache";

import {
  archiveProvider,
  createProvider,
  createSpecialty,
  ProviderServiceError,
  setProviderBranches,
  setProviderSpecialties,
  updateProvider,
  updateSpecialty,
} from "@/lib/providers/service";
import {
  archiveProviderSchema,
  createProviderSchema,
  createSpecialtySchema,
  setProviderBranchesSchema,
  setProviderSpecialtiesSchema,
  updateProviderSchema,
  updateSpecialtySchema,
} from "@/lib/providers/schema";
import { AuthorizationError, requireAal2, requirePermission } from "@/lib/authorization";

export type ProviderActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const providerPath = "/providers";
const specialtyPath = "/settings/specialties";

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

function errorState(error: unknown, subject: string): ProviderActionState {
  if (error instanceof AuthorizationError || (error instanceof ProviderServiceError && error.code === "NOT_AUTHORIZED")) {
    return { message: `Your current organization access does not allow ${subject}.` };
  }
  if (error instanceof ProviderServiceError && error.code === "STALE") {
    return { message: "This record changed elsewhere. Refresh and try again." };
  }
  return { message: `The ${subject} could not be completed.` };
}

function providerValues(formData: FormData) {
  return {
    actingBranchId: text(formData, "actingBranchId"),
    firstName: text(formData, "firstName"),
    middleName: optionalText(formData, "middleName"),
    lastName: text(formData, "lastName"),
    suffix: optionalText(formData, "suffix"),
    professionalTitle: optionalText(formData, "professionalTitle"),
    licenseNumber: optionalText(formData, "licenseNumber"),
    contactPhone: optionalText(formData, "contactPhone"),
    contactEmail: optionalText(formData, "contactEmail"),
    providerType: text(formData, "providerType"),
    status: text(formData, "status"),
    websiteVisible: formData.get("websiteVisible") === "true",
    bio: optionalText(formData, "bio"),
  };
}

export async function createProviderAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const parsed = createProviderSchema.safeParse(providerValues(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await createProvider(parsed.data);
    revalidatePath(providerPath);
    return { success: true, message: "Provider added." };
  } catch (error) {
    return errorState(error, "provider creation");
  }
}

export async function updateProviderAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const parsed = updateProviderSchema.safeParse({ ...providerValues(formData), providerId: text(formData, "providerId"), expectedVersion: number(formData, "expectedVersion") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await updateProvider(parsed.data);
    revalidatePath(providerPath);
    return { success: true, message: "Provider updated." };
  } catch (error) {
    return errorState(error, "provider update");
  }
}

export async function archiveProviderAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const parsed = archiveProviderSchema.safeParse({ actingBranchId: text(formData, "actingBranchId"), providerId: text(formData, "providerId"), expectedVersion: number(formData, "expectedVersion") });
  if (!parsed.success) return { message: "The provider could not be archived." };
  try {
    await requireAal2(providerPath);
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await archiveProvider(parsed.data);
    revalidatePath(providerPath);
    return { success: true, message: "Provider archived." };
  } catch (error) {
    return errorState(error, "provider archive");
  }
}

export async function setProviderAssociationsAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const base = { actingBranchId: text(formData, "actingBranchId"), providerId: text(formData, "providerId"), expectedVersion: number(formData, "expectedVersion") };
  const branches = setProviderBranchesSchema.safeParse({ ...base, branchIds: formData.getAll("branchIds").filter((id): id is string => typeof id === "string") });
  const specialties = setProviderSpecialtiesSchema.safeParse({ ...base, specialties: formData.getAll("specialtyIds").filter((id): id is string => typeof id === "string").map((specialtyId) => ({ specialtyId, isPrimary: text(formData, "primarySpecialtyId") === specialtyId })) });
  if (!branches.success || !specialties.success) return { message: "Provider associations could not be saved." };
  try {
    await requirePermission({ permission: "provider.manage", branchId: base.actingBranchId });
    const branchResult = await setProviderBranches(branches.data);
    await setProviderSpecialties({ ...specialties.data, expectedVersion: branchResult.version });
    revalidatePath(providerPath);
    return { success: true, message: "Provider associations updated." };
  } catch (error) {
    return errorState(error, "provider association update");
  }
}

export async function createSpecialtyAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const parsed = createSpecialtySchema.safeParse({ actingBranchId: text(formData, "actingBranchId"), code: text(formData, "code").toUpperCase(), name: text(formData, "name") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await createSpecialty(parsed.data);
    revalidatePath(specialtyPath);
    revalidatePath(providerPath);
    return { success: true, message: "Custom specialty added." };
  } catch (error) {
    return errorState(error, "specialty creation");
  }
}

export async function updateSpecialtyAction(_previous: ProviderActionState, formData: FormData): Promise<ProviderActionState> {
  const parsed = updateSpecialtySchema.safeParse({ actingBranchId: text(formData, "actingBranchId"), specialtyId: text(formData, "specialtyId"), expectedVersion: number(formData, "expectedVersion"), code: text(formData, "code").toUpperCase(), name: text(formData, "name"), isActive: formData.get("isActive") === "true" });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission({ permission: "provider.manage", branchId: parsed.data.actingBranchId });
    await updateSpecialty(parsed.data);
    revalidatePath(specialtyPath);
    revalidatePath(providerPath);
    return { success: true, message: "Custom specialty updated." };
  } catch (error) {
    return errorState(error, "specialty update");
  }
}
