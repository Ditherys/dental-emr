# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-13 — Basic Owner/Admin Branch Management

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and self-reviewed; ready for independent review. P1-14 was not started.

## What Changed

- Replaced the Settings → Branches placeholder with a permission-gated branch
  directory and add-branch workflow for the user's single active organization.
- The directory reads through the authenticated Supabase client and existing
  RLS, showing branch name, code/slug, city/province, contact, status, and public
  website visibility. Desktop uses a compact table; phone uses a stacked
  definition-list composition rather than a squeezed table.
- Added a React Hook Form + shared Zod form for the foundation-only fields:
  name, code, generated/editable slug, optional phone/email, address, timezone,
  and website visibility. It deliberately excludes schedules, resources,
  inventory, booking setup, and every later domain.
- Added an AAL2-gated server action that accepts no organization field. It
  obtains `branch.manage` authorization first and supplies the tenant ID only
  from the verified active membership context.
- Added a server-only branch data module that invokes the existing
  user-context `public.create_branch` RPC. The RPC remains the atomic database
  boundary for permission revalidation, insertion, and the minimal
  `branch.created` audit event; no service-role client is used.
- Added action tests for AAL2 ordering, malformed input, RBAC-before-mutation,
  and a forged `organizationId` form value being ignored in favor of the
  authorized tenant. Added schema/slug tests and minimal Vitest TypeScript-path
  resolution configuration.
- Updated `supabase/README.md` to record that P1-13 reuses the existing reviewed
  RPC and does not require a schema migration.

## Remote Database State

- Re-verified the linked target as `dental-emr-dev` in Singapore; migration
  history is aligned through `20260812051100`.
- No migration, seed, persistent row, Dashboard-only schema change, reset, or
  other destructive operation was performed for P1-13. The pgTAP suite ran in
  its rollback transaction.
- No real staff/patient data, usable credentials, secrets, or production access
  was used.

## Verification Performed

- Foundation RLS/authorization pgTAP regression — passed `1..121` with no
  failure diagnostic. This covers Org A branch creation, Org B isolation,
  branch-scoped non-inheritance, AAL2 enforcement, exact audit scoping, and
  atomic rollback when audit insertion fails.
- `supabase db lint --linked --schema public,private --level warning --fail-on error`
  — passed; no schema errors.
- `npm run db:types:check` — passed; no generated type drift.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 56 tests across 7 files.
- `npm run build` — passed. The pre-existing warning about the ignored
  parent-directory lockfile remains.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed neither the browser form nor the server action accepts an
  authoritative organization ID. The database RPC independently rechecks the
  authenticated user's live organization-wide `branch.manage` permission.
- Confirmed branch creation does not add branch memberships or copy staff
  access. Organization-wide owner/admin roles can see the new branch; existing
  exact-branch users do not gain access automatically.
- Confirmed branch listing remains user-context/RLS-scoped and the mutation
  remains AAL2-gated and atomically audited. No direct authenticated table-write
  path, RLS bypass, service secret, or client-side-only authorization was added.
- Confirmed duplicate code/slug errors are handled without exposing database
  details, and unknown failures do not claim that either the branch or audit
  event was saved.
- Live screenshot/interaction QA could not run because no in-app or extension
  browser was available. Responsive structure, accessible labels/error
  associations, touch targets, lint, type checking, and the production render
  build were checked. Authenticated browser E2E remains a later controlled-test
  concern because the synthetic seed identities intentionally cannot log in.
- P1-14 branch context selection and all later domains remain untouched.
