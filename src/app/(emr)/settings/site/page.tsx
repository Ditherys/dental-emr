import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";
import { getPublicSiteSettings, SiteServiceError } from "@/lib/site/service";
import type { PublicSiteSettings } from "@/lib/site/types";

import { SiteSettingsForm } from "./site-settings-form";

export const metadata: Metadata = { title: "Website" };

export default async function SiteSettingsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let settings: PublicSiteSettings | null = null;

  try {
    await requirePermission({ permission: "site.manage" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      actingBranchId = actingBranch.id;
      await requirePermission({ permission: "site.manage", branchId: actingBranch.id });
      settings = await getPublicSiteSettings(actingBranchId);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof SiteServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to manage the public website."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Website" description="The public website content for the acting organization." />
        <Separator className="my-6" />
        <PageError description="The website settings could not be loaded. Refresh to try again." />
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Website" description="The public website content for the acting organization." />
        <Separator className="my-6" />
        <PageError description="The website settings could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Website"
        description="Edit the public clinic website content: hero, about, contact details, operating hours, booking and Messenger links, and the privacy notice. Only website-safe fields are shown here and no patient or clinical content is ever exposed."
      />
      <Separator className="my-6" />
      <SiteSettingsForm actingBranchId={actingBranchId} initialSettings={settings} />
    </div>
  );
}