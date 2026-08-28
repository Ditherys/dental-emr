import type { Metadata } from "next";

import { PageError } from "@/components/feedback/page-error";
import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import {
  BranchManagementError,
  listManagedBranches,
} from "@/lib/branches";
import {
  AuthorizationError,
  requirePermission,
} from "@/lib/authorization";

import { BranchList } from "./branch-list";

export const metadata: Metadata = {
  title: "Branches",
};

export default async function BranchesPage() {
  let organizationName: string;
  let branches;

  try {
    const authorization = await requirePermission({
      permission: "branch.manage",
    });
    organizationName = authorization.organization.businessName;
    branches = await listManagedBranches(authorization.organization.id);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return (
        <div className="mx-auto w-full max-w-7xl">
          <PageHeader
            title="Branches"
            description="Review and add operating locations for the current organization."
          />
          <Separator className="my-4" />
          <PermissionDenied description="Your current access does not include branch settings. Contact an organization administrator if you believe this is a mistake." />
        </div>
      );
    }

    if (error instanceof BranchManagementError) {
      return (
        <div className="mx-auto w-full max-w-7xl">
          <PageHeader
            title="Branches"
            description="Review and add operating locations for the current organization."
          />
          <Separator className="my-4" />
          <PageError description="Branch settings could not be loaded. Refresh the page to try again." />
        </div>
      );
    }

    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Branches"
        description={`Review and add operating locations for ${organizationName}. New locations begin without copied staff access or later-phase operational setup.`}
      />
      <Separator className="my-4" />
      <BranchList branches={branches} />
    </div>
  );
}
