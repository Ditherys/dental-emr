"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AppBrand } from "@/components/layout/app-brand";
import { BranchSelector } from "@/components/layout/branch-selector";
import { DesktopNavigation } from "@/components/layout/desktop-navigation";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavigationHref } from "@/components/layout/navigation-items";

export function ShellLayout({
  organizationName,
  visibleNavigationHrefs,
  children,
}: {
  organizationName: string;
  visibleNavigationHrefs: readonly NavigationHref[];
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((previous) => !previous);
  };

  return (
    <div
      className={cn(
        "min-h-svh bg-background xl:grid",
        collapsed
          ? "xl:grid-cols-[4.5rem_minmax(0,1fr)]"
          : "xl:grid-cols-[15rem_minmax(0,1fr)]",
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring/30"
      >
        Skip to content
      </a>

      <aside
        aria-label="Application sidebar"
        className={cn(
          "sticky top-0 hidden h-svh flex-col border-r bg-sidebar xl:flex print:hidden",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b",
            collapsed ? "justify-center px-2" : "px-3",
          )}
          title={collapsed ? organizationName : undefined}
        >
          <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
            <AppBrand href="/dashboard" />
          </div>
          <span className={cn("sr-only", !collapsed && "hidden")}>
            {organizationName}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("shrink-0", collapsed ? "mx-auto" : "ml-auto")}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </Button>
        </div>

        <div
          className={cn(
            "shrink-0 border-b",
            collapsed
              ? "grid place-items-center p-2"
              : "space-y-2 px-3 py-3",
          )}
        >
          {collapsed ? (
            <BranchSelector presentation="rail" />
          ) : (
            <>
              <div className="min-w-0 px-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Current organization
                </p>
                <p
                  className="mt-0.5 break-words text-sm font-medium text-sidebar-foreground"
                  title={organizationName}
                >
                  {organizationName}
                </p>
              </div>
              <BranchSelector presentation="sidebar" />
            </>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            collapsed ? "p-2" : "p-3",
          )}
        >
          <DesktopNavigation
            visibleHrefs={visibleNavigationHrefs}
            collapsed={collapsed}
          />
        </div>

        <div
          className={cn(
            "shrink-0 border-t",
            collapsed ? "grid place-items-center p-2" : "p-3",
          )}
        >
          <UserMenu presentation={collapsed ? "rail" : "sidebar"} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b bg-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm xl:hidden print:hidden">
          <div className="flex min-h-16 items-center gap-2 px-3 sm:px-4 lg:px-6">
            <MobileNavigation
              organizationName={organizationName}
              visibleHrefs={visibleNavigationHrefs}
            />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-xs text-muted-foreground">
                Current organization
              </p>
              <p className="truncate text-sm font-medium" title={organizationName}>
                {organizationName}
              </p>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
              <BranchSelector presentation="topbar" />
              <UserMenu presentation="topbar" />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="min-h-[calc(100svh-4rem)] scroll-mt-20 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 xl:min-h-svh xl:scroll-mt-0 print:p-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
