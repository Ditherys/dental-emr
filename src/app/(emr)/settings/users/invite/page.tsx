import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";
import { listInvitationOptions } from "@/lib/auth/workforce-invitations";

import { InviteWorkforceForm } from "./invite-workforce-form";

export const metadata: Metadata = {
  title: "Invite workforce member",
};

export default async function InviteWorkforcePage() {
  const identity = await requireVerifiedIdentity();
  const options = await listInvitationOptions(identity.userId);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Invite workforce member"
        description="Issue individual staff access with an intended organization role and optional branch scope. The recipient must verify and complete the invitation before membership becomes active."
      />
      <Separator className="my-4" />
      {options.length === 0 ? (
        <PermissionDenied description="An active membership with workforce invitation permission is required for this action." />
      ) : (
        <InviteWorkforceForm options={options} />
      )}
    </div>
  );
}
