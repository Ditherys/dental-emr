import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireAal2 } from "@/lib/auth/mfa";

export const metadata: Metadata = {
  title: "AAL2 security check",
};

export default async function Aal2VerifiedPage() {
  await requireAal2("/settings/account/mfa/verified");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="AAL2 security check"
        description="This route is rendered only after the server verifies a current AAL2 session and confirms that a verified factor remains enrolled."
      />
      <Separator className="my-6" />
      <section className="max-w-2xl" aria-labelledby="aal2-confirmed-heading">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-success-soft text-success">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="aal2-confirmed-heading" className="text-base font-semibold">
              Current session verified at AAL2
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Future high-risk actions can call the same server helper before any
              protected mutation. This checkpoint does not add those later-domain
              operations.
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
