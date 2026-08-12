import type { ReactNode } from "react";

import { EmrShell } from "@/components/layout/emr-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { requireMfaChallengeIfEnrolled } from "@/lib/auth/mfa";
import { requireOrganizationAuthorizationState } from "@/lib/authorization";
import { createBranchContextModel } from "@/lib/authorization/policy";
import { Toaster } from "sonner";

export default async function EmrLayout({ children }: { children: ReactNode }) {
  await requireMfaChallengeIfEnrolled();
  const authorizationState = await requireOrganizationAuthorizationState();
  const branchContext = createBranchContextModel(authorizationState);

  return (
    <QueryProvider>
      <EmrShell branchContext={branchContext}>{children}</EmrShell>
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
