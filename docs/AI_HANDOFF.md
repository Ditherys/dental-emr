# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-19 — Audit Foundation

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and security self-reviewed; ready for independent review. P1-20 was not started.

## What Changed

- Added `20260813010000_harden_audit_foundation.sql`: bounded audit field formats, generated opaque correlation IDs for new events, actor consistency, and a 1 KiB metadata allowlist limited to UUID/permission/role/scope values already used by foundation writers.
- Added `record_mfa_enrollment(uuid)`, an idempotent authenticated projection that derives `auth.uid()`, requires AAL2, proves the factor is the caller's verified TOTP factor, derives active organizations server-side, and inserts one minimal organization event per active tenant. It accepts no tenant, branch, actor, result, metadata, token, code, setup key, or secret input.
- Updated the MFA enrollment UI to project the event only after Supabase verification succeeds, clear the setup key/code state before projection, and offer a bounded idempotent retry when the cross-service audit write cannot be confirmed.
- Added five application tests for the server action and a 15-case pgTAP audit suite covering privileges/search path, metadata rejection, AAL2, factor ownership, active-tenant derivation, idempotency, direct forgery, and tamper denial. Added the suite to the guarded runner and corrected two pre-existing `no_plan()` sentinels that counted a successful `1..N` plan line as failure.
- Regenerated public database types and documented the audit boundary in `docs/security/AUDIT_FOUNDATION.md` and the Supabase workflow README.

## Security / Tenancy Design

- Normal users still have no audit INSERT/UPDATE/DELETE privilege. Existing `audit.read` RLS remains the tenant/branch read boundary; organization-level MFA events are not visible through a branch-only permission.
- Audit metadata has no free-form key. Unknown keys, oversized payloads, malformed safe values, URL-shaped request/correlation values, and inconsistent USER actor rows fail database constraints.
- `record_mfa_enrollment` is `SECURITY DEFINER` with an empty search path, exact authenticated-only EXECUTE grant, live factor ownership/status/type checks in `auth.mfa_factors`, AAL2 enforcement, and active organization joins. A unique partial index makes retries race-safe.
- Supabase Auth remains the MFA system of record. The Auth verification and application projection cannot share one transaction, so the UI does not report completion until projection succeeds and preserves only the opaque factor ID for retry—not enrollment secrets or codes.

## Database / Remote State

- Verified the linked target through CLI project membership, application URL equality, and an explicit development/test name check without printing its project reference. The target was the designated non-production `dental-emr-dev` project.
- Migration history matched Git through `20260812051100`; the target-verified dry run listed only `20260813010000_harden_audit_foundation.sql`, then that committed migration was applied successfully. No reset, reseed, destructive command, Dashboard-only change, production access, local Supabase runtime, or Docker database was used.
- Type generation was performed from the applied migration. Database tests used only synthetic, non-login identities and null-secret synthetic factor rows inside transactions that rolled back.
- No real staff/patient data, PHI, usable credential, project reference, access/refresh token, database password, MFA setup key/code, presigned URL, or production secret was printed, committed, logged, or placed in audit metadata.

## Verification Performed

- `npm run verify` with the verified non-production DEV environment pairing — passed: ESLint, strict TypeScript, 103 Vitest tests across 15 files, Next.js 16.3 production build, Secretlint, and `npm audit --audit-level=high` (0 vulnerabilities).
- All five hosted transactional database suites passed against the verified non-production DEV project: schema, foundation RLS, workforce invitations, P1-19 audit foundation, and seed security fixtures.
- `supabase db lint --linked --schema public,private --level error --fail-on error` — passed with no schema errors.
- Security advisors completed without errors. Expected warnings remain for the intentionally authenticated, authorization-checking `SECURITY DEFINER` RPCs (including the new MFA projection) and for hosted leaked-password protection being disabled; the latter remains an environment/production gate.
- `npm run db:types:check` — passed after regeneration.
- `npm run test:e2e:list` with the documented non-secret synthetic placeholder contract — passed; 7 tests discovered without a browser launch or placeholder network contact.
- `git diff --check` and sensitive-sink review — passed.

## Self-Review / Scope Boundaries

- Confirmed actor and tenant context cannot be supplied by the browser, another user's factor cannot be projected, suspended/no-membership organizations receive no event, retries cannot duplicate a factor event, and direct audit forgery/history mutation remains denied.
- Confirmed current branch, invitation, membership, and role administrative writers still produce their existing atomic sanitized events; all prior database suites pass under the new constraints.
- No audit viewer, generalized client audit endpoint, factor-removal workflow, retention/archive automation, security alerting, dependency change, patient/clinical domain, or P1-20 authorization UX was added.
- A live browser enrollment was not run because this workspace has no authorized synthetic login/TOTP fixture for the DEV target. The database ownership/AAL/tenant projection is covered transactionally; the existing protected Cloud TEST E2E job remains the hosted lifecycle check.
