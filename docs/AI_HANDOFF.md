# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-20 — Authorization UX

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and security self-reviewed; ready for independent review. No later phase or checkpoint was started.

## What Changed

- Added a reusable read-only `hasPermission` policy check and marked the Branches navigation destination as requiring organization-wide `branch.manage`. The server derives the visible navigation hrefs from current database-backed authorization state before the desktop/mobile shell receives them; a branch-scoped grant is not promoted to organization scope.
- Preserved defense in depth: direct navigation to `/settings/branches` renders the non-disclosing `You don't have access to this area.` state, while `createBranchAction` still performs AAL2 and a fresh server `branch.manage` check before the existing authorization-checking database RPC.
- Added a dedicated, responsive access-revoked screen for a verified Auth session with no active organization membership. It omits the tenant shell, organization/branch details, and protected child UI, and offers an explicit local sign-out path. Membership is checked before asking an offboarded user for an MFA challenge.
- Added unit/component coverage for permission scope, navigation filtering, generic denial content, revoked-access rendering, suspended-membership layout behavior, and crafted action denial. Strengthened the guarded Playwright expectations for hidden Branches navigation, direct-route denial, and the suspended-user state.

## Security / Tenancy Design

- Navigation filtering is UX only. Browser-visible href state grants no authority; the protected page/action authorization helpers and RLS/RPC controls remain the enforcement boundaries.
- Active membership and permission grants are loaded through the authenticated Supabase client under RLS. Auth metadata, local storage, query strings, and browser-supplied organization/branch identifiers are not used to grant access.
- Only `NO_ACTIVE_MEMBERSHIP` maps to the revoked state. Other authorization selection errors and infrastructure failures still fail closed rather than being mislabeled or swallowed.
- Denied/revoked copy exposes no organization name, branch name, resource UUID, patient/clinical content, or internal authorization detail.

## Database / Remote State

- P1-20 required no migration, schema, seed, database-type, dependency, or remote Supabase change.
- No direct SQL, MCP write, reset, reseed, local Supabase runtime, Docker database, production access, or credential output occurred.

## Verification Performed

- `npm run verify` with the safely reconstructed local/development environment pairing — passed: ESLint, strict TypeScript, 113 Vitest tests across 18 files, Next.js 16.3 production build, Secretlint, and `npm audit --audit-level=high` (0 vulnerabilities).
- `npm run test:e2e:list` with the documented non-secret placeholder contract — passed; 7 guarded tests discovered without a browser launch or placeholder network contact.
- `git diff --check` and a manual scope/security/sensitive-sink review — passed.
- The hosted Cloud TEST Playwright suite was not executed because this workspace did not provide an explicitly verified synthetic TEST credential set for a browser run. No database suite was rerun because the slice contains no database or migration change.

## Self-Review / Scope Boundaries

- Confirmed users without organization-wide `branch.manage` receive neither desktop nor mobile Branches navigation, cannot see an Add Branch control on direct access, and cannot mutate through a crafted server-action request.
- Confirmed a valid session with zero active memberships cannot retain the organization shell or protected route presentation on a fresh server render; active membership status takes precedence over MFA/shell UI state.
- Confirmed existing permission semantics are unchanged: organization-wide grants remain valid at branch scope, exact branch grants remain branch-bound, and authorization errors still default deny.
- The revoked-state design follows the existing restrained product system: semantic alert/heading, readable line length, touch-safe standard button, mobile-safe spacing, no decorative card grid, and no color-only meaning.
- No later domain, audit viewer, session-revocation backend, role-management UI, dependency, migration, patient/clinical feature, or post-Phase-1 work was added.
