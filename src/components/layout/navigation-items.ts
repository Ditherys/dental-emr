import { Building2, LayoutDashboard, ShieldCheck } from "lucide-react";

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
  },
  {
    label: "Account & security",
    href: "/settings/account",
    icon: ShieldCheck,
  },
] as const;
