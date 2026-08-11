import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Branches",
};

export default function BranchesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Branches"
        description="Organization branches will be managed here after the tenancy and authorization foundations are available."
      />
      <Separator className="my-6" />
      <EmptyState
        icon={Building2}
        title="Branch data is not connected"
        description="Branch records and authorized management actions are introduced in later Phase 1 checkpoints."
      />
    </div>
  );
}
