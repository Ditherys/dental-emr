import {
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  CalendarSync,
  ClipboardList,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  MessageSquareText,
  Package,
  ShieldCheck,
  Stethoscope,
  Tags,
  UserCog,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";

import type { PermissionCode } from "@/lib/authorization/policy";

export const navigationGroups = [
  "CLINICAL",
  "ENGAGEMENT",
  "OPERATIONS",
  "CONFIGURATION",
  "REPORTING",
  "ADMINISTRATION",
] as const;

export const navigationItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Patients",
    href: "/patients",
    icon: UsersRound,
    group: "CLINICAL",
    requiredPermission: "patient.demographics.read",
  },
  {
    label: "Providers",
    href: "/providers",
    icon: Stethoscope,
    group: "CLINICAL",
    requiredPermission: "provider.read",
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: CalendarDays,
    group: "CLINICAL",
    requiredPermission: "appointment.read",
  },
  {
    label: "Queue",
    href: "/queue",
    icon: ListOrdered,
    group: "CLINICAL",
    requiredPermission: "queue.read",
  },
  {
    label: "Communications",
    href: "/communications",
    icon: MessageSquareText,
    group: "ENGAGEMENT",
    requiredPermission: "communication.view",
  },
  {
    label: "Specialists",
    href: "/specialists",
    icon: UserCog,
    group: "ENGAGEMENT",
    requiredPermission: "specialist.request",
  },
  {
    label: "Recalls",
    href: "/recalls",
    icon: BellRing,
    group: "ENGAGEMENT",
    requiredPermission: "recall.read",
  },
  {
    label: "Booking requests",
    href: "/booking-requests",
    icon: Inbox,
    group: "ENGAGEMENT",
    requiredPermission: "booking.review",
  },
  {
    label: "Branches",
    href: "/settings/branches",
    icon: Building2,
    group: "OPERATIONS",
    requiredPermission: "branch.manage",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    group: "OPERATIONS",
    requiredPermission: "inventory.view",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    group: "OPERATIONS",
    requiredPermission: "document.view",
  },
  {
    label: "Specialties",
    href: "/settings/specialties",
    icon: Tags,
    group: "CONFIGURATION",
    requiredPermission: "provider.read",
  },
  {
    label: "Procedures",
    href: "/settings/procedures",
    icon: ClipboardList,
    group: "CONFIGURATION",
    requiredPermission: "provider.read",
  },
  {
    label: "Website",
    href: "/settings/site",
    icon: Globe,
    group: "CONFIGURATION",
    requiredPermission: "site.manage",
  },
  {
    label: "Calendar sync",
    href: "/settings/calendar",
    icon: CalendarSync,
    group: "CONFIGURATION",
    requiredPermission: "calendar.manage",
  },
  {
    label: "Acquisition report",
    href: "/reports/acquisition",
    icon: BarChart3,
    group: "REPORTING",
    requiredPermission: "analytics.view",
  },
  {
    label: "Finance report",
    href: "/reports/finance",
    icon: BarChart3,
    group: "REPORTING",
    requiredPermission: "financial.analytics.read",
  },
  {
    label: "My earnings",
    href: "/earnings",
    icon: BarChart3,
    group: "REPORTING",
    requiredPermission: "compensation.own.read",
  },
  {
    label: "Account & security",
    href: "/settings/account",
    icon: ShieldCheck,
    group: "ADMINISTRATION",
  },
  {
    label: "Staff",
    href: "/settings/users/invite",
    icon: UserRoundPlus,
    group: "ADMINISTRATION",
    requiredPermission: "user.invite",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  group?: (typeof navigationGroups)[number];
  requiredPermission?: PermissionCode;
}>;

export type NavigationHref = (typeof navigationItems)[number]["href"];
export type NavigationIcon = (typeof navigationItems)[number]["icon"];

export function visibleNavigationItems(
  visibleHrefs: readonly NavigationHref[],
) {
  const visibleHrefSet = new Set(visibleHrefs);
  return navigationItems.filter(({ href }) => visibleHrefSet.has(href));
}

export function groupedNavigationItems(
  visibleHrefs: readonly NavigationHref[],
) {
  const visible = visibleNavigationItems(visibleHrefs);
  return {
    ungrouped: visible.filter((item) => !("group" in item)),
    groups: navigationGroups
      .map((group) => ({
        group,
        items: visible.filter(
          (item) => "group" in item && item.group === group,
        ),
      }))
      .filter(({ items }) => items.length > 0),
  };
}