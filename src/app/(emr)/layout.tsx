import type { ReactNode } from "react";

import { EmrShell } from "@/components/layout/emr-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { requireMfaChallengeIfEnrolled } from "@/lib/auth/mfa";
import { Toaster } from "sonner";

export default async function EmrLayout({ children }: { children: ReactNode }) {
  await requireMfaChallengeIfEnrolled();

  return (
    <QueryProvider>
      <EmrShell>{children}</EmrShell>
      <Toaster
        closeButton
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "rounded-md border-border bg-popover text-popover-foreground",
            description: "text-muted-foreground",
          },
        }}
      />
    </QueryProvider>
  );
}
