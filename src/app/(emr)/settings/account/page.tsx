import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";

export const metadata: Metadata = {
  title: "Account and security",
};

export default async function AccountPage() {
  await requireVerifiedIdentity();

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Account and security"
        description="Manage your individual identity and security settings. Session and multi-factor controls will appear here as the remaining security foundation is implemented."
      />
      <Separator className="my-6" />
      <EmptyState
        icon={ShieldCheck}
        title="Additional account controls are not connected"
        description="Workforce invitations are available to authorized administrators. Multi-factor enrollment and session controls remain in their approved Phase 1 checkpoints."
      />
    </div>
  );
}
