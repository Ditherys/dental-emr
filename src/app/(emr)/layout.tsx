import type { ReactNode } from "react";

import { EmrShell } from "@/components/layout/emr-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "sonner";

export default function EmrLayout({ children }: { children: ReactNode }) {
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
