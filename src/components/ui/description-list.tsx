import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </dl>
  );
}

export function DescriptionItem({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}