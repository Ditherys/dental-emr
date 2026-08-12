import type { ReactNode } from "react";

import { AccessRevoked } from "@/components/feedback/access-revoked";
import { EmrShell } from "@/components/layout/emr-shell";
import {
  navigationItems,
  type NavigationHref,
} from "@/components/layout/navigation-items";
import { QueryProvider } from "@/components/providers/query-provider";
import { requireMfaChallengeIfEnrolled } from "@/lib/auth/mfa";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
} from "@/lib/authorization";
import {
  createBranchContextModel,
  hasPermission,
} from "@/lib/authorization/policy";
import { Toaster } from "sonner";

export default async function EmrLayout({ children }: { children: ReactNode }) {
  let authorizationState;

  try {
    authorizationState = await requireOrganizationAuthorizationState();
  } catch (error) {
    if (
      error instanceof AuthorizationError &&
      error.code === "NO_ACTIVE_MEMBERSHIP"
    ) {
      return <AccessRevoked />;
    }

    throw error;
  }

  await requireMfaChallengeIfEnrolled();
  const branchContext = createBranchContextModel(authorizationState);
  const visibleNavigationHrefs = navigationItems.flatMap((item) =>
    !("requiredPermission" in item) ||
    hasPermission(authorizationState, item.requiredPermission)
      ? [item.href as NavigationHref]
      : [],
  );

  return (
    <QueryProvider>
      <EmrShell
        branchContext={branchContext}
        visibleNavigationHrefs={visibleNavigationHrefs}
      >
        {children}
      </EmrShell>
      <Toaster
        closeButton
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "rounded-md border-border bg-popover text-popover-foreground",
            description: "text-muted-foreground",
          },
        }}
      />
    </QueryProvider>
  );
}
