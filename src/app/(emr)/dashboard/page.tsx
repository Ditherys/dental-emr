import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  await requireVerifiedIdentity();

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Role-relevant operational work will appear here after authentication and tenant setup are connected."
      />
      <Separator className="my-6" />
      <EmptyState
        icon={ClipboardList}
        title="No workspace data yet"
        description="This foundation screen intentionally contains no fake appointments, patient records, metrics, or analytics."
      />
    </div>
  );
}
