import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  BranchManagementError,
  archiveBranch,
  createBranch,
  updateBranch,
  revalidatePath,
  requireAal2,
  requirePermission,
} =
  vi.hoisted(() => ({
    AuthorizationError: class AuthorizationError extends Error {},
    BranchManagementError: class BranchManagementError extends Error {
      code: string;

      constructor(code: string) {
        super(code);
        this.code = code;
      }
    },
    archiveBranch: vi.fn(),
    createBranch: vi.fn(),
    updateBranch: vi.fn(),
    revalidatePath: vi.fn(),
    requireAal2: vi.fn(),
    requirePermission: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/branches", () => ({
  archiveBranch,
  createBranch,
  updateBranch,
  BranchManagementError,
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError,
  requireAal2,
  requirePermission,
}));

import { archiveBranchAction, createBranchAction, updateBranchAction } from "./actions";

function validBranchForm() {
  const formData = new FormData();
  formData.set("name", "Demo Third");
  formData.set("code", "a3");
  formData.set("slug", "demo-third");
  formData.set("phone", "+63 2 8555 0103");
  formData.set("email", "third@example.test");
  formData.set("addressLine1", "300 Synthetic Avenue");
  formData.set("addressLine2", "Suite 3");
  formData.set("city", "Quezon City");
  formData.set("province", "Metro Manila");
  formData.set("postalCode", "1100");
  formData.set("timezone", "Asia/Manila");
  formData.set("websiteVisible", "false");
  return formData;
}

describe("createBranchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before validation, authorization, or mutation when AAL2 is absent", async () => {
    const aal2Redirect = new Error("AAL2 challenge redirect");
    requireAal2.mockRejectedValueOnce(aal2Redirect);

    await expect(createBranchAction({}, validBranchForm())).rejects.toBe(
      aal2Redirect,
    );

    expect(requireAal2).toHaveBeenCalledWith("/settings/branches");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();
  });

  it("derives organization ownership from authorization and ignores a forged form tenant", async () => {
    const formData = validBranchForm();
    formData.set(
      "organizationId",
      "21000000-0000-4000-8000-000000000099",
    );
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({
      identity: { userId: "actor-a" },
      organization: {
        id: "21000000-0000-4000-8000-000000000001",
        businessName: "Org A",
      },
    });
    createBranch.mockResolvedValueOnce(
      "31000000-0000-4000-8000-000000000003",
    );

    await expect(createBranchAction({}, formData)).resolves.toEqual({
      branchId: "31000000-0000-4000-8000-000000000003",
      success: true,
      message:
        "Demo Third was added. Staff access was not copied to the new branch.",
    });

    expect(requirePermission).toHaveBeenCalledWith({
      permission: "branch.manage",
    });
    expect(createBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "21000000-0000-4000-8000-000000000001",
        name: "Demo Third",
        code: "A3",
      }),
    );
    expect(createBranch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "21000000-0000-4000-8000-000000000099",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings/branches");
  });

  it("returns field errors before permission lookup for malformed branch data", async () => {
    const formData = validBranchForm();
    formData.set("name", " ");
    formData.set("slug", "Not A Slug");
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });

    const result = await createBranchAction({}, formData);

    expect(result.fieldErrors?.name).toBeDefined();
    expect(result.fieldErrors?.slug).toBeDefined();
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();
  });

  it("performs RBAC before the branch mutation", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({
      organization: { id: "21000000-0000-4000-8000-000000000001" },
    });
    createBranch.mockResolvedValueOnce(
      "31000000-0000-4000-8000-000000000003",
    );

    await createBranchAction({}, validBranchForm());

    expect(requireAal2.mock.invocationCallOrder[0]).toBeLessThan(
      requirePermission.mock.invocationCallOrder[0],
    );
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      createBranch.mock.invocationCallOrder[0],
    );
  });

  it("denies a manually crafted branch request after a fresh server permission check", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "branch-user-a" });
    requirePermission.mockRejectedValueOnce(new AuthorizationError());

    await expect(createBranchAction({}, validBranchForm())).resolves.toEqual({
      message:
        "Your current organization access does not allow branch creation.",
    });

    expect(requirePermission).toHaveBeenCalledWith({
      permission: "branch.manage",
    });
    expect(createBranch).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

function validBranchUpdateForm() {
  const formData = new FormData();
  formData.set("branchId", "31000000-0000-4000-8000-000000000003");
  formData.set("name", "Demo Third Renamed");
  formData.set("phone", "+63 2 8555 0103");
  formData.set("email", "third@example.test");
  formData.set("addressLine1", "300 Synthetic Avenue");
  formData.set("addressLine2", "Suite 3");
  formData.set("city", "Quezon City");
  formData.set("province", "Metro Manila");
  formData.set("postalCode", "1100");
  formData.set("timezone", "Asia/Manila");
  formData.set("websiteVisible", "false");
  return formData;
}

describe("updateBranchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before validation, authorization, or mutation when AAL2 is absent", async () => {
    const aal2Redirect = new Error("AAL2 challenge redirect");
    requireAal2.mockRejectedValueOnce(aal2Redirect);

    await expect(
      updateBranchAction({}, validBranchUpdateForm()),
    ).rejects.toBe(aal2Redirect);

    expect(requireAal2).toHaveBeenCalledWith("/settings/branches");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(updateBranch).not.toHaveBeenCalled();
  });

  it("returns field errors before permission lookup for malformed branch data", async () => {
    const formData = validBranchUpdateForm();
    formData.set("name", " ");
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });

    const result = await updateBranchAction({}, formData);

    expect(result.fieldErrors?.name).toBeDefined();
    expect(requirePermission).not.toHaveBeenCalled();
    expect(updateBranch).not.toHaveBeenCalled();
  });

  it("performs RBAC before the branch mutation", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({});
    updateBranch.mockResolvedValueOnce("31000000-0000-4000-8000-000000000003");

    await updateBranchAction({}, validBranchUpdateForm());

    expect(requireAal2.mock.invocationCallOrder[0]).toBeLessThan(
      requirePermission.mock.invocationCallOrder[0],
    );
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      updateBranch.mock.invocationCallOrder[0],
    );
    expect(updateBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: "31000000-0000-4000-8000-000000000003",
        name: "Demo Third Renamed",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings/branches");
  });

  it("denies a manually crafted update after a fresh server permission check", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "branch-user-a" });
    requirePermission.mockRejectedValueOnce(new AuthorizationError());

    await expect(
      updateBranchAction({}, validBranchUpdateForm()),
    ).resolves.toEqual({
      message: "Your current organization access does not allow updating this branch.",
    });

    expect(updateBranch).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps an archived-branch refusal to a specific message", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({});

    updateBranch.mockRejectedValueOnce(new BranchManagementError("ARCHIVED"));

    await expect(
      updateBranchAction({}, validBranchUpdateForm()),
    ).resolves.toEqual({
      message: "This branch is archived and cannot be edited.",
    });
  });
});

function validBranchArchiveForm() {
  const formData = new FormData();
  formData.set("branchId", "31000000-0000-4000-8000-000000000003");
  return formData;
}

describe("archiveBranchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before authorization or mutation when AAL2 is absent", async () => {
    const aal2Redirect = new Error("AAL2 challenge redirect");
    requireAal2.mockRejectedValueOnce(aal2Redirect);

    await expect(
      archiveBranchAction({}, validBranchArchiveForm()),
    ).rejects.toBe(aal2Redirect);

    expect(requirePermission).not.toHaveBeenCalled();
    expect(archiveBranch).not.toHaveBeenCalled();
  });

  it("performs RBAC before archiving and revalidates on success", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({});
    archiveBranch.mockResolvedValueOnce("31000000-0000-4000-8000-000000000003");

    const result = await archiveBranchAction({}, validBranchArchiveForm());

    expect(result).toEqual({
      success: true,
      message: "The branch was archived.",
    });
    expect(requireAal2.mock.invocationCallOrder[0]).toBeLessThan(
      requirePermission.mock.invocationCallOrder[0],
    );
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      archiveBranch.mock.invocationCallOrder[0],
    );
    expect(archiveBranch).toHaveBeenCalledWith(
      "31000000-0000-4000-8000-000000000003",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings/branches");
  });

  it("denies a manually crafted archive request after a fresh server permission check", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "branch-user-a" });
    requirePermission.mockRejectedValueOnce(new AuthorizationError());

    await expect(
      archiveBranchAction({}, validBranchArchiveForm()),
    ).resolves.toEqual({
      message: "Your current organization access does not allow archiving this branch.",
    });

    expect(archiveBranch).not.toHaveBeenCalled();
  });

  it("maps an already-archived refusal to a specific message", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({});

    archiveBranch.mockRejectedValueOnce(
      new BranchManagementError("ALREADY_ARCHIVED"),
    );

    await expect(
      archiveBranchAction({}, validBranchArchiveForm()),
    ).resolves.toEqual({
      message: "This branch is already archived.",
    });
  });

  it("maps a last-remaining-branch refusal to a specific message", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({});

    archiveBranch.mockRejectedValueOnce(new BranchManagementError("LAST_BRANCH"));

    await expect(
      archiveBranchAction({}, validBranchArchiveForm()),
    ).resolves.toEqual({
      message: "This is the organization's only remaining branch and cannot be archived.",
    });
  });
});
