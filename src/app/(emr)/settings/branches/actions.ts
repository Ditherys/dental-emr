"use server";

import { revalidatePath } from "next/cache";

import {
  archiveBranch,
  BranchManagementError,
  createBranch,
  updateBranch,
} from "@/lib/branches";
import { branchFormSchema, branchUpdateFormSchema } from "@/lib/branches/schema";
import {
  AuthorizationError,
  requireAal2,
  requirePermission,
} from "@/lib/authorization";

export type CreateBranchState = {
  branchId?: string;
  message?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<keyof typeof branchFormSchema.shape, string[]>
  >;
};

export async function createBranchAction(
  _previousState: CreateBranchState,
  formData: FormData,
): Promise<CreateBranchState> {
  await requireAal2("/settings/branches");

  const result = branchFormSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    slug: formData.get("slug"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city"),
    province: formData.get("province"),
    postalCode: formData.get("postalCode") ?? "",
    timezone: formData.get("timezone"),
    websiteVisible: formData.get("websiteVisible") === "true",
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    // No organization identifier is accepted from FormData. The only tenant ID
    // sent to the transactional RPC comes from the verified active membership.
    const authorization = await requirePermission({
      permission: "branch.manage",
    });
    const branchId = await createBranch({
      ...result.data,
      organizationId: authorization.organization.id,
    });

    revalidatePath("/settings/branches");

    return {
      branchId,
      success: true,
      message: `${result.data.name} was added. Staff access was not copied to the new branch.`,
    };
  } catch (error) {
    if (error instanceof BranchManagementError && error.code === "DUPLICATE") {
      return {
        message: "A branch with that code or slug already exists in this organization.",
      };
    }

    if (
      error instanceof AuthorizationError ||
      (error instanceof BranchManagementError &&
        error.code === "NOT_AUTHORIZED")
    ) {
      return {
        message: "Your current organization access does not allow branch creation.",
      };
    }

    return {
      message: "The branch could not be created. No branch or audit event was saved.",
    };
  }
}

export type UpdateBranchState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<keyof typeof branchUpdateFormSchema.shape, string[]>
  >;
};

export async function updateBranchAction(
  _previousState: UpdateBranchState,
  formData: FormData,
): Promise<UpdateBranchState> {
  await requireAal2("/settings/branches");

  const branchId = formData.get("branchId");

  if (typeof branchId !== "string" || branchId.length === 0) {
    return { message: "The branch could not be updated. No branch was specified." };
  }

  const result = branchUpdateFormSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city"),
    province: formData.get("province"),
    postalCode: formData.get("postalCode") ?? "",
    timezone: formData.get("timezone"),
    websiteVisible: formData.get("websiteVisible") === "true",
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    // No organization identifier is accepted from FormData. The target
    // branch's organization is derived server-side by the RPC itself.
    await requirePermission({ permission: "branch.manage" });
    await updateBranch({ branchId, ...result.data });

    revalidatePath("/settings/branches");

    return {
      success: true,
      message: `${result.data.name} was updated.`,
    };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof BranchManagementError && error.code === "NOT_AUTHORIZED")
    ) {
      return {
        message: "Your current organization access does not allow updating this branch.",
      };
    }

    if (error instanceof BranchManagementError && error.code === "ARCHIVED") {
      return { message: "This branch is archived and cannot be edited." };
    }

    return { message: "The branch could not be updated." };
  }
}

export type ArchiveBranchState = {
  message?: string;
  success?: boolean;
};

export async function archiveBranchAction(
  _previousState: ArchiveBranchState,
  formData: FormData,
): Promise<ArchiveBranchState> {
  await requireAal2("/settings/branches");

  const branchId = formData.get("branchId");

  if (typeof branchId !== "string" || branchId.length === 0) {
    return { message: "The branch could not be archived. No branch was specified." };
  }

  try {
    await requirePermission({ permission: "branch.manage" });
    await archiveBranch(branchId);

    revalidatePath("/settings/branches");

    return { success: true, message: "The branch was archived." };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof BranchManagementError && error.code === "NOT_AUTHORIZED")
    ) {
      return {
        message: "Your current organization access does not allow archiving this branch.",
      };
    }

    if (error instanceof BranchManagementError && error.code === "ALREADY_ARCHIVED") {
      return { message: "This branch is already archived." };
    }

    if (error instanceof BranchManagementError && error.code === "LAST_BRANCH") {
      return {
        message: "This is the organization's only remaining branch and cannot be archived.",
      };
    }

    return { message: "The branch could not be archived." };
  }
}
