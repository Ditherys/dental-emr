import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  userId: string;
  email: string | null;
};

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    return null;
  }

  return {
    userId: data.claims.sub,
    email: data.claims.email ?? null,
  };
}

export async function requireVerifiedIdentity() {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    redirect("/login");
  }

  return identity;
}
