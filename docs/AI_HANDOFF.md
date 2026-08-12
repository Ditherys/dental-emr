# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-11 — RLS Helper Functions and Policies

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** P1-11 approved and complete after independent security review; P1-12 was not started

## What Changed

- Added append-only follow-up migration
  `20260812051100_enforce_authorization_delegation.sql` for the two remaining
  P1-11 authorization findings:
  - workforce invitations now apply permission-subset delegation to the live
    role permission set, require `security.manage` for roles containing
    `role.manage` or `security.manage`, filter service-only invitation options
    consistently, and revalidate the recorded inviter under the organization
    advisory lock immediately before authorization rows are created;
  - `set_member_role` now requires `security.manage` for both grants and
    revocations when the target member already has organization-wide
    `role.manage` or `security.manage`, even when the changed role is ordinary.
- Expanded both pgTAP suites with negative and positive regression cases for
  OWNER/custom-role invitations, stale inviter authority at finalization, and
  sensitive-target role grants/revocations. The final independent security
  review found no blocking issues and approved P1-11.

- Added `20260812051000_harden_foundation_admin_mutations.sql` after review of
  commit `a827f079ed88ee23ca31f11dd95385edfc77302e`:
  - revoked authenticated direct writes and removed write policies for
    foundation administrative tables;
  - added AAL2-gated, current-user RPCs for branch creation, custom-role
    permission changes, role assignments, branch memberships, and organization
    membership status changes;
  - serialized authorization mutations per organization, enforced permission
    subset delegation and stricter `role.manage`/`security.manage` handling, and
    rejected changes to roles assigned to the actor;
  - inserted one sanitized audit event atomically with each successful mutation;
  - corrected `private.has_branch_access` so only organization-wide
    `branch.manage` or an active exact-branch membership grants branch access.
- Expanded `foundation_rls.test.sql` from 60 to 113 assertions covering direct
  table denial, AAL1/AAL2 behavior, self-escalation, permission combinations,
  audit content/atomicity/immutability, cross-tenant RPC attempts, and new-branch
  visibility.
- Updated the security architecture to make the transactional administrative
  mutation boundary explicit.
- Added a current-session AAL2 gate to the existing workforce invitation Server
  Action before it can enter the narrowly scoped service-only provisioning flow,
  with unit coverage proving service-role work is not reached when AAL2 fails.

### Prior P1-11 checkpoint context

- Added `20260812050800_foundation_rls_policies.sql` with five current-user, boolean-only RLS helpers in the non-exposed `private` schema:
  - `is_active_org_member(uuid)`;
  - `has_org_permission(uuid, text)`;
  - `has_branch_access(uuid)`;
  - `has_branch_permission(uuid, text)`;
  - `is_own_organization_member(uuid)`.
- Every helper is `SECURITY DEFINER`, has an empty `search_path`, schema-qualifies sensitive references, derives identity only from `auth.uid()`, and is unavailable as a Data API RPC because `authenticated` retains no `private` schema usage.
- Added explicit least-privilege grants and command-specific policies for all ten exposed foundation tables: organizations, branches, profiles, organization members, roles, permissions, role permissions, branch memberships, member roles, and audit events.
- Kept anonymous access fail-closed; restricted mutable columns so tenant keys, IDs, role scope, and assignment records cannot be rewritten through ordinary authenticated table access.
- Enforced active organization/membership state, exact-branch access, organization-vs-branch role scope, same-tenant management, controlled audit reads, no ordinary audit mutation, and no self-grant/self-role assignment.
- Added `20260812050900_consolidate_foundation_rls_select_policies.sql` to combine equivalent self/manager SELECT policies after the performance advisor flagged multiple permissive policies. Behavior is unchanged and the advisor is now clean.
- Replaced the P1-10 authorization data loader's temporary service-role reads with the request-scoped Supabase server client, making user-context RLS an actual database backstop. The invitation provisioning workflow remains the intentionally service-only path.
- Added the original 60-assertion pgTAP suite covering two-way organization isolation, forged tenant/branch IDs, exact-branch permissions, branch-scoped role non-promotion, suspended users, catalog access, audit access/mutation, forged assigners, and self-escalation attempts.
- Updated the database-test README with the approved cloud-only runner that does not start a local Supabase/Docker stack.

## Remote Database State

- Verified linked project: `dental-emr-dev` in the Singapore region; it is the designated non-production project.
- Dry-ran and applied append-only migrations `20260812051000` and
  `20260812051100` to that project during the P1-11 hardening passes. Local and
  remote migration histories are aligned through `20260812051100`.
- No reset, reseed, destructive migration, Dashboard-only schema change, production access, or real data was used.

## Verification Performed

- Hardened P1-11 pgTAP via `supabase db query --linked --file supabase/tests/foundation_rls.test.sql` — passed `1..121` with no failure diagnostic.
- Workforce invitation pgTAP regression — passed all 36 assertions with no failure diagnostic.
- `supabase db lint --linked --schema public,private --level warning --fail-on error` — passed; no schema errors after hardening.
- `npm run db:types:check` — passed after regenerating the public RPC types.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 49 tests across 5 files.
- `npm run build` — passed; the pre-existing warning about an ignored parent-directory lockfile remains.
- Post-suite rollback probe — zero synthetic P1-11/P1-08 users,
  organizations, branches, memberships, roles, invitations, or audit events
  remained in the development database.

### Prior checkpoint verification

- P1-11 pgTAP via `supabase db query --linked --file supabase/tests/foundation_rls.test.sql` — passed `1..60` with no failure diagnostic.
- Existing workforce invitation pgTAP regression — passed all 23 assertions.
- `supabase db lint --linked --schema public,private --level warning --fail-on error` — passed; no schema errors.
- Supabase performance advisor after policy consolidation — passed; no issues.
- Supabase security advisor — no migration/RLS issue; one pre-existing hosted Auth warning remains for leaked-password protection being disabled.
- `npm run db:types:check` — passed; no generated type drift.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 47 tests across 4 files.
- `npm run build` — passed.
- `git diff --check` — passed.

## Scope Boundaries / Reviewer Focus

- Review helper privilege boundaries, policy expressions, column grants, self-escalation denial, and the application switch away from service-role authorization reads.
- The CLI's `test db --linked` path attempted to require Docker in this environment, so the suites were executed transactionally against the verified linked cloud project using `db query --linked`; ADR-016 remained intact.
- The leaked-password-protection advisor warning is an environment/Auth hardening item, not an RLS migration defect; production remains gated by the security architecture.
- No synthetic seed/fixture checkpoint work, branch-management UI, patients, scheduling, clinical, billing, or other P1-12+ domain work was started.
