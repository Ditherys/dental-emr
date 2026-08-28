import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: EmptyStateProps) {
  return (
    <section
      aria-label={title}
      className="border-y bg-subtle-surface/60 px-4 py-6 text-center sm:px-6"
    >
      {Icon && (
        <span className="mx-auto grid size-9 place-items-center rounded-md border bg-background text-brand-navy-800">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      )}
      <h2 className="mt-3 text-base font-semibold">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
