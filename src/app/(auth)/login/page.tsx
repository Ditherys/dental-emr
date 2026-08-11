import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getVerifiedIdentity } from "@/lib/auth/identity";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{
    authError?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [identity, params] = await Promise.all([
    getVerifiedIdentity(),
    searchParams,
  ]);

  if (identity) {
    redirect("/dashboard");
  }

  const confirmationFailed = params.authError === "confirmation";

  return (
    <section aria-labelledby="login-title" className="w-full">
      <p className="text-sm font-medium text-brand-navy-800">
        Workforce access
      </p>
      <h1
        id="login-title"
        className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950"
      >
        Sign in to Dental EMR
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Use the individual account issued by your clinic administrator.
      </p>

      {confirmationFailed && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          This authentication link is invalid or has expired. Request a new
          link from your clinic administrator.
        </p>
      )}

      <LoginForm />

      <p className="mt-6 border-t pt-5 text-xs leading-5 text-muted-foreground">
        Staff accounts are invitation-only. This page does not create new
        workforce accounts.
      </p>
    </section>
  );
}
