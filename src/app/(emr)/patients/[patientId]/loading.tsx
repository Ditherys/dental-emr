import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto w-full max-w-6xl space-y-5"><Skeleton className="h-20 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
