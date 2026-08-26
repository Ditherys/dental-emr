import { BarChart3, Building2, ClipboardList, LayoutDashboard, ShieldCheck, Stethoscope, Tags, UsersRound } from "lucide-react";

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
    label: "Providers",
    href: "/providers",
    icon: Stethoscope,
    requiredPermission: "provider.read",
  },
  {
    label: "Specialties",
    href: "/settings/specialties",
    icon: Tags,
    requiredPermission: "provider.read",
  },
  {
    label: "Procedures",
    href: "/settings/procedures",
    icon: ClipboardList,
    requiredPermission: "provider.read",
  },
  {
    label: "Acquisition report",
    href: "/reports/acquisition",
    icon: BarChart3,
    requiredPermission: "analytics.view",
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
