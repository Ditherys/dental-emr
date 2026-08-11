import { Building2, ChevronDown } from "lucide-react";

export function BranchContextPlaceholder() {
  return (
    <div
      aria-label="Branch selector placeholder: no branch selected"
      className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground sm:min-w-44"
    >
      <Building2 className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">No branch selected</span>
      <ChevronDown className="ml-auto hidden size-4 shrink-0 sm:block" aria-hidden="true" />
    </div>
  );
}
