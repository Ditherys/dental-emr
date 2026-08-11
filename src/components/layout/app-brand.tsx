import Link from "next/link";

import { cn } from "@/lib/utils";

type AppBrandProps = {
  className?: string;
  href?: string;
  compact?: boolean;
};

export function AppBrand({ className, href, compact = false }: AppBrandProps) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-navy-900 text-sm font-semibold text-white"
      >
        D
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-brand-navy-950">
            Dental EMR
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Practice management
          </span>
        </span>
      )}
    </>
  );

  const classes = cn(
    "inline-flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
    className,
  );

  return href ? (
    <Link
      href={href}
      className={classes}
      aria-label="Dental EMR home"
      data-touch-target
    >
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  );
}
