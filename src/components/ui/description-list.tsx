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

export function CompactDescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      data-layout="paired"
      className={cn("w-full max-w-xl divide-y border-y text-sm", className)}
    >
      {children}
    </dl>
  );
}

export function CompactDescriptionItem({
  label,
  hint,
  children,
  className,
  valueClassName,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(7.5rem,12rem)_minmax(0,1fr)] items-start gap-x-4 px-3 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]",
        className,
      )}
    >
      <dt className="min-w-0 font-medium">
        <span className="break-words">{label}</span>
        {hint && (
          <span className="mt-0.5 block break-words text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-left",
          valueClassName,
        )}
      >
        {children}
      </dd>
    </div>
  );
}
