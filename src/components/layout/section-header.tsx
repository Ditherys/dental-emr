import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  action,
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}