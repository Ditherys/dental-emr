import type { Metadata } from "next";

import { loadPublicSite } from "@/lib/site/public-resolver";

import { PublicHome } from "./public-home";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadPublicSite();

  return {
    title: { absolute: site?.organizationName ?? "Dental Clinic" },
    description: site?.heroSubtext ?? site?.aboutText ?? undefined,
  };
}

export default async function PublicHomePage() {
  const site = await loadPublicSite();

  return <PublicHome site={site} />;
}
