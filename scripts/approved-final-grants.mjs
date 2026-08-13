/**
 * THE APPROVED FINAL PRIVILEGE SET FOR THE PHASE 1 SECURE BASELINE.
 *
 * This file is the human-readable authority the R6-B static lint compares the
 * grant-terminal migration against. It is intentionally verbose: every entry
 * carries the reason it exists, so adding, widening, or removing a privilege
 * produces a review-visible diff that states what changed and why.
 *
 * RULES FOR EDITING THIS FILE
 *
 *   1. Do not add an entry to make a failing lint pass. The lint failing means a
 *      migration changed the effective privilege set; decide whether that change
 *      is approved before recording it here.
 *   2. Every entry needs a `reason` that answers "why may this role hold this
 *      privilege?", not "what does this privilege do?".
 *   3. Grants to `authenticated` / `anon` / PUBLIC are security decisions.
 *      Adding one requires the same review as a migration.
 *   4. The comparison is exact in both directions. An approved entry the
 *      migration no longer grants also fails, because a stale allowlist is a
 *      false record of the security boundary.
 *
 * See docs/decisions/ADR-017-phase1-secure-migration-baseline.md.
 */

const FOUNDATION_TABLES = Object.freeze([
  ["public.organizations", "Tenancy root. RLS restricts it to organizations the caller is an active member of."],
  ["public.branches", "Branch directory. RLS restricts it to branches the caller can access."],
  ["public.profiles", "Workforce profiles. RLS restricts it to the caller's own row plus rows an organization manager may see."],
  ["public.organization_members", "Membership edges, needed to render the caller's own organization context."],
  ["public.roles", "Role catalog, needed to render authorization state in the EMR shell."],
  ["public.permissions", "Permission catalog, needed to render authorization state in the EMR shell."],
  ["public.role_permissions", "Role-to-permission edges, needed to derive effective permissions client-side for UX only."],
  ["public.branch_memberships", "Branch access edges, needed for the branch selector."],
  ["public.member_roles", "Role assignments, needed to render authorization state."],
  ["public.audit_events", "Audit trail. RLS restricts it to events the caller is authorized to read."],
]);

const RLS_HELPERS = Object.freeze([
  "private.is_active_org_member(uuid)",
  "private.has_org_permission(uuid, text)",
  "private.has_branch_access(uuid)",
  "private.has_branch_permission(uuid, text)",
  "private.is_own_organization_member(uuid)",
]);

const ADMINISTRATIVE_RPCS = Object.freeze([
  "public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)",
  "public.set_role_permission(uuid, text, boolean)",
  "public.set_member_role(uuid, uuid, uuid, boolean)",
  "public.set_branch_membership(uuid, uuid, text)",
  "public.update_organization_member_status(uuid, text)",
  "public.record_mfa_enrollment(uuid)",
]);

const SERVER_ONLY_INVITATION_FUNCTIONS = Object.freeze([
  "public.list_workforce_invitation_options(uuid)",
  "public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)",
  "public.prepare_first_owner_invitation(uuid, uuid, text)",
  "public.finalize_workforce_invitation(uuid, uuid, uuid)",
  "public.fail_workforce_invitation(uuid)",
  "public.get_workforce_invitation_summary(uuid)",
  "public.accept_workforce_invitation(uuid, text, text)",
  "public.revoke_workforce_invitation(uuid, uuid)",
]);

/**
 * The only self-service write path any browser-reachable role holds anywhere in
 * the baseline. Constrained by the `profiles_update_self` policy to the caller's
 * own row. None of these columns carries authorization meaning.
 */
const SELF_SERVICE_PROFILE_COLUMNS = Object.freeze([
  "display_name",
  "first_name",
  "last_name",
  "mobile",
  "avatar_object_key",
]);

const FINAL_GRANTS_MIGRATION = "20260813020700_baseline_final_grants.sql";

const finalGrants = [
  ...FOUNDATION_TABLES.map(([object, why]) => ({
    grantee: "authenticated",
    objectClass: "table",
    object,
    privilege: "select",
    columns: [],
    reason: `Read-only, RLS-filtered. ${why} No INSERT, UPDATE, or DELETE is granted anywhere in the baseline.`,
  })),

  {
    grantee: "authenticated",
    objectClass: "table",
    object: "public.profiles",
    privilege: "update",
    columns: [...SELF_SERVICE_PROFILE_COLUMNS],
    reason:
      "The single self-service write path. Column-scoped to five non-authorization profile fields and row-scoped by the profiles_update_self policy, so it cannot alter organization, branch, role, permission, or status state.",
  },

  ...RLS_HELPERS.map((object) => ({
    grantee: "authenticated",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "Required only so the stored RLS policy expressions that call this helper can be evaluated in the caller's session. USAGE on the private schema is revoked, so it is not reachable as a Data API RPC.",
  })),

  ...ADMINISTRATIVE_RPCS.map((object) => ({
    grantee: "authenticated",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "The sole administrative mutation path. The function calls private.require_aal2() first, takes the organization-scoped advisory lock, re-derives authorization from the current user context, enforces anti-self-escalation and permission-superset checks, and emits an audit event in the same transaction.",
  })),

  ...SERVER_ONLY_INVITATION_FUNCTIONS.map((object) => ({
    grantee: "service_role",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "Server-only invitation boundary, called exclusively by the server-side service client. service_role's secret key must never reach browser code, so this is not a browser-reachable privilege.",
  })),
];

/**
 * Grant-terminal migrations, in migration order.
 *
 * Every other migration file must contain no GRANT at all. When a future phase
 * needs new privileges, register its final file here together with its exact
 * approved grant set — that registration is the review gate.
 */
export const TERMINAL_MIGRATIONS = Object.freeze([
  Object.freeze({
    file: FINAL_GRANTS_MIGRATION,
    grants: Object.freeze(finalGrants),
  }),
]);

/**
 * Extensions the canonical baseline is permitted to create.
 *
 * Deliberately EMPTY (R6-C1, ADR-018). Extension functions are created with
 * PUBLIC EXECUTE by default and cannot be revoked object-by-object by a static
 * checker, so every extension is an exception to the fail-closed creation rule
 * and needs an explicit, separately reasoned approval entry here.
 *
 * pgTAP was removed from the baseline and moved to
 * `supabase/provisioning/nonproduction/001_database_test_tooling.sql`, which is
 * applied only to DEV and disposable Cloud TEST projects. Reconstructing the
 * application schema — including in a future production project — must not
 * require installing testing infrastructure.
 *
 * An empty list means any `CREATE EXTENSION` in `supabase/migrations/` is a
 * violation. That is the intended review gate: adding one requires an entry
 * here stating why the extension belongs in every environment.
 */
export const APPROVED_EXTENSIONS = Object.freeze([]);

export const MIGRATIONS_DIRECTORY = "supabase/migrations";
