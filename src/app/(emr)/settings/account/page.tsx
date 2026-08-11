import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
        description="Manage security controls for your individual workforce identity. Clinic roles and branch access are administered separately."
      />
      <Separator className="my-6" />
      <section className="max-w-2xl" aria-labelledby="mfa-heading">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-navy-50 text-brand-navy-800">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="mfa-heading" className="text-base font-semibold">
              Multi-factor authentication
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Enroll and manage authenticator apps, review factor status, and verify
              the server-side AAL2 security gate.
            </p>
            <Button asChild className="mt-4">
              <Link href="/settings/account/mfa">Manage MFA</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
