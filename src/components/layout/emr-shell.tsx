import type { ReactNode } from "react";

import { BranchContextProvider } from "@/components/layout/branch-context";
import { ShellLayout } from "@/components/layout/shell-layout";
import type { BranchContextModel } from "@/lib/authorization/policy";
import type { NavigationHref } from "@/components/layout/navigation-items";

export function EmrShell({
  branchContext,
  visibleNavigationHrefs,
  children,
}: {
  branchContext: BranchContextModel;
  visibleNavigationHrefs: readonly NavigationHref[];
  children: ReactNode;
}) {
  return (
    <BranchContextProvider model={branchContext}>
      <ShellLayout
        organizationName={branchContext.organization.name}
        visibleNavigationHrefs={visibleNavigationHrefs}
      >
        {children}
      </ShellLayout>
    </BranchContextProvider>
  );
}
