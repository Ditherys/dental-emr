import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { loadE2EEnvironment } from "./environment";

/**
 * Server-side administrative harness for mid-session withdrawal scenarios.
 *
 * WHY THIS EXISTS
 * ---------------
 * The scenarios in `session-boundaries.spec.ts` need an administrator to
 * withdraw someone's authorization *while their browser session stays open*.
 * Phase 1 has no user-management UI, so the withdrawal cannot be driven through
 * a second browser. It is therefore performed here, directly against the
 * disposable Cloud TEST project.
 *
 * WHAT THIS DOES NOT CLAIM
 * ------------------------
 * These writes deliberately bypass the AAL2-gated administrative RPCs, because
 * `set_branch_membership` / `update_organization_member_status` are revoked from
 * `service_role` and are only callable in a user context. The *authorization
 * path* for those withdrawals is proven separately, at the database boundary, by
 * `supabase/tests/session_authorization_boundaries.test.sql`. What this harness
 * proves is the other half: that the victim's already-open browser session stops
 * being trusted the moment the underlying state changes.
 *
 * SECRET HANDLING
 * ---------------
 * `SUPABASE_SECRET_KEY` lives only in this Node process. It is never passed to
 * the browser context, never written to a fixture, and never logged. The key
 * bypasses RLS, so this module refuses to construct a client for any target that
 * is not the explicitly designated disposable TEST project.
 */

type AdminClient = SupabaseClient<Database>;

export type BranchAccessStatus = "active" | "suspended" | "revoked";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

function requireSecretKey() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is required for the mid-session administrative harness.",
    );
  }

  if (secretKey.startsWith("sb_publishable_") || secretKey.startsWith("eyJ")) {
    throw new Error(
      "SUPABASE_SECRET_KEY must be a secret key, not a publishable or anon key.",
    );
  }

  return secretKey;
}

export function createAdminHarness() {
  // Re-runs every Cloud TEST target check: environment, project reference,
  // exact origin, DEV/production exclusion, explicit confirmation.
  const environment = loadE2EEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

  const client: AdminClient = createClient<Database>(url, requireSecretKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function resolveUserId(email: string) {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`The harness could not enumerate TEST identities: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalized,
    );

    if (!match) {
      // The email itself is synthetic, but keep it out of failure output anyway.
      throw new Error("No synthetic TEST identity matched the requested fixture.");
    }

    return match.id;
  }

  async function resolveMemberId(organizationId: string, email: string) {
    const userId = await resolveUserId(email);
    const { data, error } = await client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`The harness could not resolve a membership: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        "The synthetic identity has no membership in the requested organization.",
      );
    }

    return data.id;
  }

  async function setBranchAccess(
    organizationId: string,
    branchId: string,
    memberId: string,
    accessStatus: BranchAccessStatus,
  ) {
    const revokedAt = accessStatus === "revoked" ? new Date().toISOString() : null;
    const { data: existing, error: readError } = await client
      .from("branch_memberships")
      .select("id")
      .eq("branch_id", branchId)
      .eq("organization_member_id", memberId)
      .maybeSingle();

    if (readError) {
      throw new Error(`The harness could not read branch access: ${readError.message}`);
    }

    const { error } = existing
      ? await client
          .from("branch_memberships")
          .update({ access_status: accessStatus, revoked_at: revokedAt })
          .eq("id", existing.id)
      : await client.from("branch_memberships").insert({
          organization_id: organizationId,
          branch_id: branchId,
          organization_member_id: memberId,
          access_status: accessStatus,
          revoked_at: revokedAt,
        });

    if (error) {
      throw new Error(`The harness could not change branch access: ${error.message}`);
    }
  }

  async function setMembershipStatus(
    memberId: string,
    membershipStatus: MembershipStatus,
  ) {
    // The table constraint ties suspended_at to the suspended state exactly.
    const { error } = await client
      .from("organization_members")
      .update({
        membership_status: membershipStatus,
        suspended_at:
          membershipStatus === "suspended" ? new Date().toISOString() : null,
      })
      .eq("id", memberId);

    if (error) {
      throw new Error(
        `The harness could not change membership status: ${error.message}`,
      );
    }
  }

  async function branchExistsBySlug(organizationId: string, branchSlug: string) {
    const { data, error } = await client
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", branchSlug)
      .maybeSingle();

    if (error) {
      throw new Error(`The harness could not verify branch absence: ${error.message}`);
    }

    return data !== null;
  }

  return {
    branchExistsBySlug,
    environment,
    resolveMemberId,
    setBranchAccess,
    setMembershipStatus,
  } as const;
}

export type AdminHarness = ReturnType<typeof createAdminHarness>;
