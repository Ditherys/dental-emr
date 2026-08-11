import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="space-y-3 border-t pt-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-4/5" />
      </div>
    </div>
  );
}
