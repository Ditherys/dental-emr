import type { ReactNode } from "react";

import { AppBrand } from "@/components/layout/app-brand";
import { BranchContextProvider } from "@/components/layout/branch-context";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DesktopNavigation } from "@/components/layout/desktop-navigation";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
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
      <div className="min-h-svh bg-background xl:grid xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden border-r bg-sidebar xl:flex xl:min-h-svh xl:flex-col print:hidden">
          <div className="flex h-16 items-center px-4">
            <AppBrand href="/dashboard" />
          </div>
          <Separator />
          <div className="px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              Current organization
            </p>
            <p className="mt-1 truncate text-sm font-medium text-sidebar-foreground">
              {branchContext.organization.name}
            </p>
          </div>
          <Separator />
          <div className="flex-1 p-3">
            <DesktopNavigation visibleHrefs={visibleNavigationHrefs} />
          </div>
          <div className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
            Foundation workspace
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b bg-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm print:hidden">
            <div className="flex min-h-16 items-center gap-2 px-3 sm:px-4 lg:px-6">
              <MobileNavigation visibleHrefs={visibleNavigationHrefs} />
              <div className="hidden min-w-0 sm:block xl:hidden">
                <p className="truncate text-xs text-muted-foreground">
                  Current organization
                </p>
                <p className="truncate text-sm font-medium">
                  {branchContext.organization.name}
                </p>
              </div>
              <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                <BranchSelector />
                <UserMenu />
              </div>
            </div>
          </header>

          <main className="min-h-[calc(100svh-4rem)] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 print:p-0">
            {children}
          </main>
        </div>
      </div>
    </BranchContextProvider>
  );
}
