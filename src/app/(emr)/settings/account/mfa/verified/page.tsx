import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireAal2 } from "@/lib/auth/mfa";

export const metadata: Metadata = {
  title: "Security check complete",
};

export default async function Aal2VerifiedPage() {
  await requireAal2("/settings/account/mfa/verified");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Security check complete"
        description="Your session was re-verified with your security factor before this page was shown."
      />
      <Separator className="my-4" />
      <section className="max-w-2xl" aria-labelledby="security-confirmed-heading">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-success-soft text-success">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="security-confirmed-heading" className="text-base font-semibold">
              Current session verified
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You are ready for security-sensitive actions such as archiving
              records or changing your account settings.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/settings/account/mfa">Back to MFA settings</Link>
        </Button>
      </section>
    </div>
  );
}