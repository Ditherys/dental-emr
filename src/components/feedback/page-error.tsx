import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

type PageErrorProps = {
  title?: string;
  description: string;
  action?: ReactNode;
};

export function PageError({
  title = "This page could not be loaded",
  description,
  action,
}: PageErrorProps) {
  return (
    <section
      role="alert"
      className="border-y border-destructive/25 bg-destructive/5 px-4 py-6 sm:px-6"
    >
      <div className="flex max-w-2xl gap-3">
        <CircleAlert
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </section>
  );
}
