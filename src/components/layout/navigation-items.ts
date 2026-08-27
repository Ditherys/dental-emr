import { BarChart3, BellRing, Building2, CalendarDays, CalendarSync, ClipboardList, FileText, Globe, Inbox, LayoutDashboard, ListOrdered, MessageSquareText, Package, ShieldCheck, Stethoscope, Tags, UserCog, UsersRound } from "lucide-react";

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
    label: "Schedule",
    href: "/schedule",
    icon: CalendarDays,
    requiredPermission: "appointment.read",
  },
  {
    label: "Queue",
    href: "/queue",
    icon: ListOrdered,
    requiredPermission: "queue.read",
  },
  {
    label: "Communications",
    href: "/communications",
    icon: MessageSquareText,
    requiredPermission: "communication.view",
  },
  {
    label: "Specialists",
    href: "/specialists",
    icon: UserCog,
    requiredPermission: "specialist.request",
  },
  {
    label: "Recalls",
    href: "/recalls",
    icon: BellRing,
    requiredPermission: "recall.read",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    requiredPermission: "inventory.view",
  },
  {
    label: "Booking requests",
    href: "/booking-requests",
    icon: Inbox,
    requiredPermission: "booking.review",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    requiredPermission: "document.view",
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
  {
    label: "Calendar sync",
    href: "/settings/calendar",
    icon: CalendarSync,
    requiredPermission: "calendar.manage",
  },
  {
    label: "Website",
    href: "/settings/site",
    icon: Globe,
    requiredPermission: "site.manage",
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
