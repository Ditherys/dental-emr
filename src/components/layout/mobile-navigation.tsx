"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { AppBrand } from "@/components/layout/app-brand";
import { BranchSelector } from "@/components/layout/branch-selector";
import {
  groupedNavigationItems,
  type NavigationHref,
  type NavigationIcon,
} from "@/components/layout/navigation-items";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function isActiveItem(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

export function MobileNavigation({
  organizationName,
  visibleHrefs,
}: {
  organizationName: string;
  visibleHrefs: readonly NavigationHref[];
}) {
  const pathname = usePathname();
  const { ungrouped, groups } = groupedNavigationItems(visibleHrefs);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          aria-label="Open primary navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(20rem,88vw)] gap-0 rounded-none bg-sidebar p-0"
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between the available application screens.
          </SheetDescription>
          <AppBrand href="/dashboard" />
        </SheetHeader>
        <div className="shrink-0 space-y-2 border-b px-3 py-3">
          <div className="min-w-0 px-1">
            <p className="text-xs text-muted-foreground">Current organization</p>
            <p className="truncate text-sm font-medium">{organizationName}</p>
          </div>
          <BranchSelector presentation="sidebar" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <nav aria-label="Primary navigation" className="space-y-1">
            {ungrouped.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveItem(pathname, item.href)}
              />
            ))}
            {groups.map(({ group, items }) => (
              <div key={group} className="pt-3 first:pt-0">
                <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                  {group}
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActiveItem(pathname, item.href)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <UserMenu presentation="sidebar" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: NavigationIcon;
  active: boolean;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-background",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </SheetClose>
  );
}
