import type { ReactNode } from "react";

import { AppBrand } from "@/components/layout/app-brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-warm-surface">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <AppBrand href="/" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
