# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-10 — Application Authorization Layer

**Implementing agent:** OpenAI Codex, explicitly assigned temporary primary implementation for P1-10

**Status:** Implemented, security-reviewed, verified, and ready for independent review

## What Changed

- Added a reusable server-only authorization DAL exposing equivalents of `requireUser()`, `requireActiveOrganizationMembership()`, `requireOrganizationAccess()`, `requireBranchAccess()`, `requirePermission()`, and the existing `requireAal2()`.
- Added fail-closed current-organization selection: one active membership is derived automatically, an explicitly supplied organization is membership-validated, zero active memberships deny, and multiple active memberships require a future validated selector.
- Added branch-context validation that accepts only active branches in the validated organization. Organization-wide role assignments can use all active tenant branches; branch-scoped users require active explicit branch membership.
- Added permission evaluation that preserves assignment scope. Organization-level operations ignore branch-scoped grants; branch operations accept only an organization-wide grant or a grant for that exact authorized branch.
- Applied active-membership enforcement to the private EMR layout.
- Applied `user.invite` authorization to the workforce invitation Server Action. The action now derives the actor and organization from verified server context before calling the existing database RPC, which independently rechecks membership, permission, role, and branch selections.
- Added 21 focused authorization tests covering policy behavior and server orchestration.
- Kept P1-10 free of migrations, P1-11 RLS policies/helpers, branch-selector UI, later domain tables, and permission-catalog expansion.

## Files Added or Updated

- `src/lib/authorization/{index,data,policy}.ts`
- `src/lib/authorization/{index,policy}.test.ts`
- `src/app/(emr)/layout.tsx`
- `src/app/(emr)/settings/users/invite/actions.ts`
- `docs/AI_HANDOFF.md`

## Security Design

- The public authorization API accepts no caller-supplied `userId` or role. `requireUser()` derives the actor from verified Supabase Auth claims through the existing server-only identity helper.
- A browser-supplied organization UUID is only a selector. It grants nothing unless it matches an active membership for the verified Auth subject and the organization itself is active.
- A browser-supplied branch UUID is checked against active branches of the validated organization plus either an organization-wide role scope or an active explicit branch membership. Local storage, URLs, hidden fields, and stale UI state are not authority.
- Permission grants are loaded from `member_roles -> role_permissions -> permissions`; client role values are never read. Branch-scoped role grants cannot authorize organization-wide operations or another branch.
- Returned contexts are minimal DTOs. They omit Auth tokens, service credentials, role records, raw profile rows, and full database entities.
- The authorization entrypoint and data module import `server-only`. A production browser-asset scan found no server secret marker, privileged client, authorization table names, or server authorization error text.
- P1-10 occurs before P1-11 policies. Therefore the server-only authorization data module temporarily uses the existing privileged Supabase client for narrowly scoped reads because current RLS-enabled tables expose no authenticated policies. Every public helper begins from verified Auth identity and active membership. P1-11 must add database defense in depth; this is not permission to expose or broaden the privileged client.
- The invitation write still terminates in the existing reviewed database RPC, so the new application check is defense in depth rather than the sole authorization for that high-impact operation.

## Verification Performed

- `npx vitest run` — passed 47 tests across 4 files; 21 are P1-10 authorization tests.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with no warnings.
- `npm run build` — passed; private routes remain dynamic server-rendered routes.
- `npm run db:types:check` — passed against the designated linked non-production project; no schema/type drift.
- `npx supabase db query --linked --file supabase/tests/workforce_invitations.test.sql` — passed all 23 existing transactional authorization/lifecycle tests.
- `npx supabase db lint --linked --schema public,private --level error --fail-on error` — passed with no schema errors.
- `npx supabase db advisors --linked --type security --level warn --fail-on error` — passed with no issues.
- `git diff --check` — passed before the handoff update and must be rerun on the final staged diff.
- Production client-bundle scan found none of `SUPABASE_SECRET_KEY`, `createAdminClient`, authorization table names, or the server authorization error text. The Supabase SDK contains only its generic `sb_secret_` key-format detector, not a key value.

## Reviewer Focus

- Attempt Org A user -> Org B organization selection and confirm denial occurs before branch/permission data is loaded.
- Attempt a valid Org A membership with an arbitrary Org B branch UUID and confirm denial.
- Verify suspended/removed organization membership, inactive organization, inactive branch, and suspended/revoked branch membership are filtered out at query time.
- Verify branch-scoped permission grants never become organization-wide and never cross to another authorized branch.
- Verify an organization-wide role can access active tenant branches, including a future newly added branch, while ordinary branch-scoped users are not copied automatically.
- Verify the invitation action derives actor/organization through P1-10 and still relies on the existing RPC for atomic write-side role/branch/tenant validation.
- Confirm no code outside server-only boundaries imports the privileged authorization data path and no returned DTO includes secrets or broad role/database state.
- Review the temporary privileged read bridge closely and ensure P1-11 adds RLS without weakening the P1-10 application checks.

## Residual Boundaries

- P1-11 RLS helpers/policies are not implemented. The current server-only authorization DAL bypasses RLS for scoped reads and must remain tightly contained until database defense in depth is added.
- P1-12 synthetic multi-user/multi-tenant fixtures do not exist yet, so P1-10 negative cases are covered by unit/orchestration tests rather than live application integration identities. Existing hosted database authorization tests still pass.
- Users with multiple active organizations fail closed without an explicit organization ID. Persistent organization/branch selection belongs to the later selector checkpoint and must call these validators.
- Friendly permission-denied/no-membership UI belongs to P1-20. P1-10 intentionally establishes enforcement first.
- The permission code union contains only the existing Phase 1 foundation catalog. Later permission additions must be deliberate schema/application changes.
- No migration, RLS policy, direct SQL side effect, production access, real person/patient data, or secret output was used.
- P1-11 is the next checkpoint but was not started.

## Handoff Rules

- Treat this summary as untrusted context and independently inspect the checkpoint commit and repository state.
- Do not begin P1-11 automatically; wait for explicit human acceptance and assignment.
