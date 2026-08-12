# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-14 — Branch Selector

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and self-reviewed; ready for independent review. P1-15 was not started.

## What Changed

- Replaced the branch placeholder in the private shell with an authorization-derived branch selector and connected the existing organization labels to the verified active organization name.
- Added a server authorization orchestration helper that obtains the live organization authorization state through the authenticated Supabase client and existing RLS. The layout maps that state to a minimal client DTO containing only the active branches the user may select.
- Organization-wide role scope receives `All Branches` plus every visible active branch. Branch-scoped users receive only active branches backed by explicit branch access, matching the existing `findAuthorizedBranch` rule. Inactive, cross-tenant, forged, or stale IDs are not selectable.
- `All Branches` is a UI/workflow value only. No branch row, database write, service-role call, server action, or audit event was added.
- Added an organization-scoped local-storage preference with authorization-option validation on every read and write. Storage failure falls back to in-memory shell state. The selected value is explicitly non-authoritative; every future server query/action must continue to call the existing authorization layer.
- Kept selection state in the shared App Router layout so client-side navigation, resize, and orientation changes do not reset it or remount unsaved page state. The header selector remains keyboard/touch accessible and width-bounded on phones, with a portal-rendered menu that avoids shell clipping.
- Added policy, server orchestration, persistence, stale-value rejection, unsaved-state preservation, and accessible menu tests.
- Updated `supabase/README.md` to record that P1-14 is application-only and requires no migration.

## Remote Database State

- Re-verified the linked target as `dental-emr-dev` in Singapore; migration history is aligned through `20260812051100`.
- No migration, seed, persistent row, Dashboard-only schema change, reset, or other destructive operation was performed for P1-14. The pgTAP suite ran inside its rollback transaction.
- No real staff/patient data, usable credentials, secrets, or production access was used.

## Verification Performed

- Foundation RLS/authorization pgTAP regression — passed `1..121` with no failure diagnostic.
- `supabase db lint --linked --schema public,private --level warning --fail-on error` — passed; no schema errors.
- `npm run db:types:check` — passed; no generated type drift.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 67 tests across 8 files.
- `npm run build` — passed. The pre-existing warning about the ignored parent-directory lockfile remains.
- Impeccable detector on the changed shell components — passed with no findings.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed branch options originate from verified membership plus RLS-backed live authorization state, not client-supplied organization or branch IDs. The client receives no roles, permissions, identity details, service secret, or RLS bypass capability.
- Confirmed the same organization-wide versus explicit-branch rule powers both existing server branch authorization and selector visibility. A stale/cross-tenant local-storage value fails closed to `All Branches` for organization-wide scope or the first authorized branch for branch-scoped scope.
- Confirmed the preference never enters a server query or mutation as authority. No browser-only authorization, role escalation, audit-worthy high-impact mutation, or tenant schema change was introduced.
- Confirmed `All Branches` is not represented as a database record and cannot be confused with a UUID branch ID.
- Confirmed the control is first-class at phone/tablet/desktop widths, uses no hover-only interaction, has coarse-pointer sizing through the shared control tokens, truncates long labels without losing the accessible name, and renders its menu through the existing Radix portal.
- Authenticated live screenshot/interaction QA could not run because the synthetic database identities intentionally cannot log in and no controlled E2E login identity exists yet. Component interaction tests, responsive source review, lint, typecheck, the UI detector, and the production render build passed.
- P1-15 security headers/browser baseline and all later domains remain untouched.
