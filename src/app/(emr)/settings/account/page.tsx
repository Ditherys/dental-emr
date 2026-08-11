import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Account and security",
};

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Account and security"
        description="Session, identity, and security settings will appear here as the authentication foundation is implemented."
      />
      <Separator className="my-6" />
      <EmptyState
        icon={ShieldCheck}
        title="Account controls are not connected"
        description="Authentication, invitation, and MFA workflows remain in their approved later Phase 1 checkpoints."
      />
    </div>
  );
}
