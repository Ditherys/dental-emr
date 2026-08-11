import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppBrand } from "@/components/layout/app-brand";
import { Button } from "@/components/ui/button";

export default function PublicHome() {
  return (
    <div className="min-h-svh bg-warm-surface">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <AppBrand href="/" />
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
        <section className="max-w-2xl" aria-labelledby="foundation-title">
          <p className="text-sm font-medium text-brand-navy-800">
            Application foundation
          </p>
          <h1
            id="foundation-title"
            className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950 sm:text-4xl"
          >
            A focused workspace for dental practice operations.
          </h1>
          <p className="mt-5 max-w-[68ch] text-base leading-7 text-muted-foreground">
            The public website and authenticated EMR share one restrained visual
            system while remaining separate application boundaries.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/dashboard">
              View application shell
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
