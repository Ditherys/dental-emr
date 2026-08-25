import { Building2, LayoutDashboard, ShieldCheck, UsersRound } from "lucide-react";

import type { PermissionCode } from "@/lib/authorization/policy";

export const navigationItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Branches",
    href: "/settings/branches",
    icon: Building2,
    requiredPermission: "branch.manage",
  },
  {
    label: "Patients",
    href: "/patients",
    icon: UsersRound,
    requiredPermission: "patient.demographics.read",
  },
  {
    label: "Account & security",
    href: "/settings/account",
    icon: ShieldCheck,
  },
] as const satisfies ReadonlyArray<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: PermissionCode;
}>;

export type NavigationHref = (typeof navigationItems)[number]["href"];

export function visibleNavigationItems(
  visibleHrefs: readonly NavigationHref[],
) {
  const visibleHrefSet = new Set(visibleHrefs);
  return navigationItems.filter(({ href }) => visibleHrefSet.has(href));
}
