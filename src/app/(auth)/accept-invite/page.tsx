import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireVerifiedIdentity } from "@/lib/auth/identity";
import { getInvitationSummary } from "@/lib/auth/workforce-invitations";

import { AcceptInvitationForm } from "./accept-invitation-form";

export const metadata: Metadata = {
  title: "Accept workforce invitation",
};

export default async function AcceptInvitationPage() {
  const identity = await requireVerifiedIdentity();
  const invitation = await getInvitationSummary(identity.userId);

  if (invitation?.status === "accepted") {
    redirect("/dashboard");
  }

  const isPending = invitation?.status === "pending";

  return (
    <section aria-labelledby="accept-invite-title" className="w-full">
      <p className="text-sm font-medium text-brand-navy-800">
        Workforce invitation
      </p>
      <h1
        id="accept-invite-title"
        className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950"
      >
        {isPending ? "Set up your account" : "Invitation unavailable"}
      </h1>

      {isPending ? (
        <>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You were invited to {invitation.organizationName} as {invitation.roleName}
            {invitation.branchName ? ` for ${invitation.branchName}` : ""}. Create
            your individual credentials to activate membership.
          </p>
          <AcceptInvitationForm />
          <p className="mt-6 border-t pt-5 text-xs leading-5 text-muted-foreground">
            This invitation is single-use and expires automatically. Multi-factor
            authentication is configured separately before patient access is enabled.
          </p>
        </>
      ) : (
        <p
          role="alert"
          className="mt-5 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm leading-6 text-destructive"
        >
          This invitation has expired, was revoked, or does not match the signed-in
          account. Ask your clinic administrator for a new invitation.
        </p>
      )}
    </section>
  );
}
