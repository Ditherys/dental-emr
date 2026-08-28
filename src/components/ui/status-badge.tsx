import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const statusBadgeVariants = {
  neutral: "border-border bg-subtle-surface text-muted-foreground",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info-soft text-info",
} as const;

type StatusBadgeProps = {
  variant?: keyof typeof statusBadgeVariants;
  children: ReactNode;
  className?: string;
};

export function StatusBadge({ variant = "neutral", children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        statusBadgeVariants[variant],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}