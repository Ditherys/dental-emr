-- Phase 1 secure baseline — file 8 of 8: THE ONLY FILE THAT GRANTS.
--
-- Files 1 through 7 grant nothing to PUBLIC, anon, or authenticated, and each
-- object revokes its inherited/default privileges in the same statement sequence
-- that creates it. Every migration boundary before this file is therefore
-- strictly more restrictive than the final state, without depending on any
-- assumption about migration transaction atomicity.
--
-- THE COMPLETE FINAL PRIVILEGE SET FOR BROWSER-REACHABLE ROLES IS BELOW.
--
--   anon    : nothing. No table privilege, no function EXECUTE, no policy.
--   PUBLIC  : nothing.
--   authenticated:
--     * SELECT on the ten foundation tables, filtered by RLS;
--     * UPDATE on exactly five self-service profile columns, filtered by the
--       profiles_update_self policy. This is the ONLY write privilege any
--       browser-reachable role holds anywhere in the baseline, and it is not an
--       administrative capability;
--     * EXECUTE on the five private RLS helpers, required only so stored policy
--       expressions can be evaluated. The private schema itself has USAGE
--       revoked, so these are not reachable as Data API RPCs;
--     * EXECUTE on the six AAL2-gated administrative/security RPCs, which are
--       the sole administrative mutation path.
--
-- There is deliberately NO INSERT, UPDATE, or DELETE privilege for authenticated
-- on organizations, branches, organization_members, roles, permissions,
-- role_permissions, branch_memberships, member_roles, or audit_events.
--
-- service_role is a server-only role whose key never reaches browser code. Its
-- privileges are intentionally left exactly as the accepted Phase 1 schema
-- leaves them; see ADR-017 for the scope statement and the R6-D verification
-- procedure that proves the browser-reachable invariant empirically.

-- Defensive restatement so the final privilege state is auditable in one file.
-- Files 2 through 5 already revoked these; re-revoking is idempotent and guards
-- against a future edit that reintroduces a default privilege upstream.
revoke all on table
  public.organizations,
  public.branches,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.branch_memberships,
  public.member_roles,
  public.audit_events
from public, anon, authenticated;

grant select on table
  public.organizations,
  public.branches,
  public.profiles,
  public.organization_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.branch_memberships,
  public.member_roles,
  public.audit_events
to authenticated;

-- The single self-service write path. Constrained by profiles_update_self to the
-- caller's own row, and to these five non-authorization columns.
grant update (
  display_name,
  first_name,
  last_name,
  mobile,
  avatar_object_key
) on public.profiles to authenticated;

-- EXECUTE is required while evaluating stored policy expressions. The private
-- schema itself remains unavailable, so none of these helpers is a Data API RPC.
grant execute on function private.is_active_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid, text) to authenticated;
grant execute on function private.has_branch_access(uuid) to authenticated;
grant execute on function private.has_branch_permission(uuid, text) to authenticated;
grant execute on function private.is_own_organization_member(uuid) to authenticated;

-- The complete authenticated administrative mutation surface. Every one of these
-- calls private.require_aal2() first, takes the organization-scoped advisory
-- lock, re-derives authorization from the current user context, and audits.
grant execute on function public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)
to authenticated;
grant execute on function public.set_role_permission(uuid, text, boolean)
to authenticated;
grant execute on function public.set_member_role(uuid, uuid, uuid, boolean)
to authenticated;
grant execute on function public.set_branch_membership(uuid, uuid, text)
to authenticated;
grant execute on function public.update_organization_member_status(uuid, text)
to authenticated;
grant execute on function public.record_mfa_enrollment(uuid)
to authenticated;

-- Server-only invitation boundary. These are called exclusively by the
-- server-side service client; SUPABASE_SECRET_KEY must never reach browser code.
grant execute on function public.list_workforce_invitation_options(uuid)
to service_role;
grant execute on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)
to service_role;
grant execute on function public.prepare_first_owner_invitation(uuid, uuid, text)
to service_role;
grant execute on function public.finalize_workforce_invitation(uuid, uuid, uuid)
to service_role;
grant execute on function public.fail_workforce_invitation(uuid)
to service_role;
grant execute on function public.get_workforce_invitation_summary(uuid)
to service_role;
grant execute on function public.accept_workforce_invitation(uuid, text, text)
to service_role;
grant execute on function public.revoke_workforce_invitation(uuid, uuid)
to service_role;
