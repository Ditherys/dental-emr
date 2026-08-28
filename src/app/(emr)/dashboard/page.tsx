import type { Metadata } from "next";
import Link from "next/link";

import { PageError } from "@/components/feedback/page-error";
import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import {
  AnalyticsServiceError,
  getOperationalAnalyticsSummary,
  listOperationalAnalyticsBreakdown,
} from "@/lib/analytics/service";
import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";

import { AnalyticsDashboard } from "./analytics-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

const workspaceLinks = [
  { href: "/schedule", label: "Open schedule", permissions: ["appointment.read"] },
  { href: "/queue", label: "Open queue", permissions: ["queue.read"] },
  { href: "/patients", label: "Open patients", permissions: ["patient.demographics.read", "patient.clinical.read"] },
  { href: "/recalls", label: "Open recalls", permissions: ["recall.read"] },
  { href: "/booking-requests", label: "Open booking requests", permissions: ["booking.review"] },
  { href: "/communications", label: "Open communications", permissions: ["communication.view"] },
  { href: "/inventory", label: "Open inventory", permissions: ["inventory.view"] },
  { href: "/specialists", label: "Open specialists", permissions: ["specialist.request"] },
] as const;

export default async function DashboardPage() {
  let denied = false;
  let failed = false;
  let canViewAnalytics = false;
  let actingBranchId = "";
  let branches: Array<{ id: string; name: string }> = [];
  let permissionCodes = new Set<string>();
  let summary: Awaited<ReturnType<typeof getOperationalAnalyticsSummary>> = [];
  let breakdown: Awaited<ReturnType<typeof listOperationalAnalyticsBreakdown>> = [];

  try {
    await requireVerifiedIdentity();
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      actingBranchId = actingBranch.id;
      branches = state.activeBranches.map(({ id, name }) => ({ id, name }));
      permissionCodes = new Set(state.permissionGrants.map(({ code }) => code));
      try {
        await requirePermission({
          permission: "analytics.view",
          branchId: actingBranchId,
        });
        canViewAnalytics = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }

      if (canViewAnalytics) {
        [summary, breakdown] = await Promise.all([
          getOperationalAnalyticsSummary({
            actingBranchId,
            branchId: null,
            windowDays: 30,
          }),
          listOperationalAnalyticsBreakdown({
            actingBranchId,
            branchId: null,
            windowDays: 30,
          }),
        ]);
      }
    }
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof AnalyticsServiceError && error.code === "NOT_AUTHORIZED")
    ) {
      denied = true;
    } else if (error instanceof AnalyticsServiceError) {
      failed = true;
    } else {
      throw error;
    }
  }

  if (denied) {
    return (
      <PermissionDenied description="An active organization branch is required to open the dashboard." />
    );
  }

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader
          title="Dashboard"
          description="Role-relevant clinic operations and aggregate analytics."
        />
        <Separator className="my-4" />
        <PageError description="Dashboard analytics could not be loaded. Refresh to try again." />
      </div>
    );
  }

  const visibleWorkspaceLinks = workspaceLinks.filter(({ permissions }) =>
    permissions.some((permission) => permissionCodes.has(permission)),
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={
          canViewAnalytics
            ? "Operational clinic analytics with traceable definitions and branch filters."
            : "Your authorized operational workspaces."
        }
      />
      <Separator className="my-4" />
      {canViewAnalytics ? (
        <AnalyticsDashboard
          actingBranchId={actingBranchId}
          branches={branches}
          initialSummary={summary}
          initialBreakdown={breakdown}
        />
      ) : (
        <section aria-labelledby="workspace-title">
          <h2 id="workspace-title" className="text-base font-semibold">
            Operational workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics are limited to owners and administrators. These links reflect your current live permissions.
          </p>
          {visibleWorkspaceLinks.length === 0 ? (
            <p className="mt-3 border-y px-3 py-5 text-sm text-muted-foreground">
              No operational workspace is available for this role.
            </p>
          ) : (
            <ul className="mt-3 divide-y border-y">
              {visibleWorkspaceLinks.map((link) => (
                <li key={link.href} className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="text-sm font-medium">{link.label.replace("Open ", "")}</span>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
