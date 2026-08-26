import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getPublicSite } from "./service";
import type { PublicSite } from "./types";

const PUBLIC_ORG_SLUG_ENV_KEY = "NEXT_PUBLIC_CLINIC_ORG_SLUG";

export function configuredPublicOrgSlug(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return environment[PUBLIC_ORG_SLUG_ENV_KEY]?.trim() || null;
}

export async function firstActiveOrgSlug(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("slug")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data?.slug ?? null;
  } catch {
    return null;
  }
}

export async function resolvePublicOrgSlug(): Promise<string | null> {
  const configured = configuredPublicOrgSlug();
  if (configured) return configured;
  return firstActiveOrgSlug();
}

export async function loadPublicSite(): Promise<PublicSite | null> {
  const slug = await resolvePublicOrgSlug();
  if (!slug) return null;
  return getPublicSite(slug);
}