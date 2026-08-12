"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  visibleNavigationItems,
  type NavigationHref,
} from "@/components/layout/navigation-items";
import { cn } from "@/lib/utils";

export function DesktopNavigation({
  visibleHrefs,
}: {
  visibleHrefs: readonly NavigationHref[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {visibleNavigationItems(visibleHrefs).map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-touch-target
            className={cn(
              "flex min-h-9 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-background hover:text-brand-navy-950",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
