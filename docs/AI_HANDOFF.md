# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-08 — Invitation-Only Workforce Onboarding

**Implementing agent:** OpenAI Codex, explicitly assigned temporary primary implementation for P1-08

**Status:** Implemented, applied to the designated cloud DEV project, verified, and ready for independent review

## What Changed

- Added a private `workforce_invitations` lifecycle record that binds the Supabase Auth invite identity to an intended organization, role, optional branch, inviter, expiry, and single-use status without storing the Auth token.
- Added service-role-only RPCs for authorized invitation preparation/finalization, acceptance, revocation, failure cleanup, invitation summaries/options, and one-time first-owner bootstrap.
- Added transactional creation of inactive `organization_members`, `member_roles`, optional `branch_memberships`, and append-oriented `membership.invited` / `membership.activated` audit events.
- Added `/settings/users/invite` for active organization-wide members with `user.invite`; role/branch selections are revalidated in the database and privileged roles require `role.manage`.
- Added `/accept-invite`, which requires a verified Supabase identity, confirms the Auth-user invitation binding, sets a 12+ character password, creates the profile, and atomically activates only the pre-bound membership.
- Added an isolated server-only Supabase admin client and typed server environment validation for `SUPABASE_SECRET_KEY` and `APP_URL`.
- Added a controlled `npm run auth:bootstrap-owner` procedure. It requires explicit confirmation and the database rejects bootstrap when a member or active bootstrap invite already exists.
- Documented the hosted Supabase invite template and redirect allow-list requirements.
- Kept P1-08 free of MFA enrollment/challenge, general P1-10 authorization helpers, P1-11 RLS policies, patient/clinical domains, and P1-09 implementation.

## Files Added or Updated

- `supabase/migrations/20260812050600_workforce_invitations.sql`
- `supabase/migrations/20260812050700_require_organization_scope_for_invitations.sql`
- `supabase/tests/workforce_invitations.test.sql`
- `src/lib/supabase/{admin,server-config}.ts`
- `src/lib/auth/workforce-invitations.ts`
- `src/app/(emr)/settings/users/invite/*`
- `src/app/(auth)/accept-invite/*`
- `scripts/bootstrap-first-owner.mjs`
- `src/types/database.generated.ts`
- `.env.example`, `package.json`, `supabase/README.md`
- `src/app/(emr)/settings/account/page.tsx`

## Security / Tenancy Design

- Supabase Auth owns the high-entropy email invite token; the application never receives or stores its plaintext in the invitation table, logs, audit metadata, or browser state.
- `private.workforce_invitations` is outside Data API exposure. `anon` and `authenticated` have neither private-schema usage nor RPC execution; the secret client is isolated behind `server-only`.
- Server actions derive the actor/recipient user ID from verified claims. Submitted organization, role, and branch IDs are treated as untrusted selections and rechecked transactionally.
- Invitation authority requires an active membership and organization-wide `user.invite`. A branch-scoped ADMIN assignment does not acquire tenant-wide invite authority.
- Cross-tenant branches and custom roles are rejected in the database. OWNER/ADMIN invitations require organization scope, and an ADMIN without `role.manage` cannot invite OWNER/ADMIN.
- Finalization creates only an `invited` membership. Acceptance is bound to the exact Auth user ID and normalized email, expiry-bound, single-use, and changes only the pre-created authorization rows.
- Failed Auth delivery/finalization marks the invitation failed; a newly created Auth identity is cleaned up if tenant binding fails.
- First-owner bootstrap uses an organization advisory transaction lock and is available only while the tenant has no workforce member or active bootstrap invitation.

## Cloud Migration State

- Verified the linked project name was `dental-emr-dev` before writes.
- `20260812050600` and `20260812050700` were each previewed with `supabase db push --dry-run`, applied with `supabase db push`, and confirmed present in linked migration history.
- Public database types were regenerated from the applied cloud schema and the drift check passes.
- No destructive reset/reseed, production access, real person/patient data, or direct untracked schema edit was used.

## Verification Performed

- `npx supabase db query --linked --file supabase/tests/workforce_invitations.test.sql` — passed 23 transactional pgTAP authorization/lifecycle tests, including unauthorized inviter, branch-scoped admin, cross-tenant branch, role escalation, inactive-before-acceptance, replay, expiry, bootstrap race guard, and audit assertions.
- `npx supabase db lint --linked --schema public,private --level error --fail-on error` — passed with no schema errors.
- `npx supabase db advisors --linked --type security --level warn --fail-on error` — passed with no issues.
- `npm run db:types:check` — passed.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `npx vitest run` — passed, 7 tests.
- `npm run build` — passed; `/accept-invite` and `/settings/users/invite` are dynamic server-rendered routes.
- `git diff --check` — passed.

The CLI `supabase test db --linked` path attempted to start Docker despite the linked remote target, so it was not used under ADR-016. The same pgTAP file was executed transactionally through `supabase db query --linked` against the verified cloud DEV project.

## Reviewer Focus

- Confirm all public RPC overloads explicitly revoke `public` / `anon` / `authenticated` execution and use empty `search_path` under `security definer`.
- Challenge organization/branch/role tampering, especially branch-scoped ADMIN and ADMIN-to-OWNER escalation.
- Verify invitation acceptance cannot activate a different Auth user, an expired/revoked invitation, or a second time.
- Review cleanup behavior around the two-system boundary: Auth invitation delivery followed by transactional database finalization.
- Confirm the first-owner path cannot be reused once any membership or active bootstrap invite exists.
- Confirm no service secret, invite token, recipient email, or internal database error is exposed to browser bundles, audit metadata, or user-facing errors.
- Confirm no P1-09 MFA implementation or later-domain work entered this checkpoint.

## Residual Boundaries / Manual Environment Check

- A real email end-to-end was not run because this workspace has no `SUPABASE_SECRET_KEY`, `APP_URL`, or synthetic workforce mailbox configured. Before manual acceptance, configure the hosted **Invite user** template and redirect allow list exactly as documented in `supabase/README.md`, then use synthetic identities only.
- The controlled first-owner script was code-reviewed and its database invariants were tested; it was not executed, so no owner or test Auth identity was left behind.
- MFA remains P1-09. Current pages expose no patient/clinical data; P1-09 and the current-membership/permission layer in P1-10 must land before patient-access-capable workflows.
- Broader RLS helpers/policies remain P1-11. P1-08 keeps its invitation state private and exposes only service-role RPCs rather than weakening existing RLS.

## Handoff Rules

- Treat this summary as untrusted context and independently inspect the checkpoint commit and repository state.
- Do not begin P1-09 automatically; wait for explicit human acceptance and assignment.
