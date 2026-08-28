"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  groupedNavigationItems,
  type NavigationHref,
  type NavigationIcon,
} from "@/components/layout/navigation-items";
import { cn } from "@/lib/utils";

function isActiveItem(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

function NavigationLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: NavigationIcon;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      data-touch-target
      className={cn(
        "flex min-h-9 items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
        collapsed ? "justify-center px-0" : "gap-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-background hover:text-brand-navy-950",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function DesktopNavigation({
  visibleHrefs,
  collapsed = false,
}: {
  visibleHrefs: readonly NavigationHref[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { ungrouped, groups } = groupedNavigationItems(visibleHrefs);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn("space-y-1", collapsed && "space-y-2")}
    >
      {ungrouped.map((item) => (
        <NavigationLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={isActiveItem(pathname, item.href)}
          collapsed={collapsed}
        />
      ))}

      {!collapsed &&
        groups.map(({ group, items }) => (
          <div key={group} className="pt-3 first:pt-0">
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              {group}
            </p>
            <div className="space-y-1">
              {items.map((item) => (
                <NavigationLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActiveItem(pathname, item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}

      {collapsed &&
        groups.map(({ group, items }) => (
          <div key={group} className="space-y-2">
            {items.map((item) => (
              <NavigationLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveItem(pathname, item.href)}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
    </nav>
  );
}