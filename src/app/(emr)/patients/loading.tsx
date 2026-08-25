import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto w-full max-w-7xl space-y-5"><Skeleton className="h-8 w-32" /><Skeleton className="h-10 w-full" /><Skeleton className="h-72 w-full" /></div>;
}
