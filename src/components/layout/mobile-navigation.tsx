"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { AppBrand } from "@/components/layout/app-brand";
import { navigationItems } from "@/components/layout/navigation-items";
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

export function MobileNavigation() {
  const pathname = usePathname();

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
            Navigate between the available foundation screens.
          </SheetDescription>
          <AppBrand href="/dashboard" />
        </SheetHeader>
        <nav aria-label="Primary navigation" className="space-y-1 p-3">
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-background",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
