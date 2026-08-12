import type { ReactNode } from "react";
import { ShieldX } from "lucide-react";

type PermissionDeniedProps = {
  description?: string;
  action?: ReactNode;
};

export function PermissionDenied({
  description = "Your current organization, branch, or role does not include access to this area.",
  action,
}: PermissionDeniedProps) {
  return (
    <section
      aria-labelledby="permission-denied-title"
      className="border-y bg-subtle-surface/60 px-4 py-8 sm:px-6"
    >
      <div className="flex max-w-2xl gap-3">
        <ShieldX
          className="mt-0.5 size-5 shrink-0 text-brand-navy-800"
          aria-hidden="true"
        />
        <div>
          <h2 id="permission-denied-title" className="text-base font-semibold">
            You don&apos;t have access to this area.
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </section>
  );
}
