import { ShieldX } from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { AppBrand } from "@/components/layout/app-brand";
import { Button } from "@/components/ui/button";

export function AccessRevoked() {
  return (
    <div className="min-h-svh bg-warm-surface">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <AppBrand href="/" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl px-4 py-10 sm:px-6 sm:py-16">
        <section
          role="alert"
          aria-labelledby="access-revoked-title"
          className="w-full border-y bg-background px-4 py-8 sm:px-6"
        >
          <div className="flex gap-3">
            <ShieldX
              className="mt-0.5 size-5 shrink-0 text-brand-navy-800"
              aria-hidden="true"
            />
            <div>
              <h1
                id="access-revoked-title"
                className="text-lg font-semibold"
              >
                Your workspace access is no longer active.
              </h1>
              <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
                Sign out, then contact an organization administrator if you
                believe your access should be restored.
              </p>
              <form action={signOut} className="mt-5">
                <Button type="submit">Sign out</Button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
