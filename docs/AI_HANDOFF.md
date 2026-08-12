# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-15 — Security Headers and Browser Baseline

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and self-reviewed; ready for independent review. P1-16 was not started.

## What Changed

- Added centralized, typed browser policy construction and wired it through the installed Next.js 16.3 `headers()` configuration for all application responses.
- Added an enforcing CSP with exact configured Supabase HTTP/WebSocket origins, no wildcard sources, production exclusion of `unsafe-eval`, denied framing/objects/inline event handlers, self-only forms/base/manifest/workers, and HTTPS request upgrades only for a validated production HTTPS deployment.
- Added `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a Permissions Policy that disables unused Phase 1 browser capabilities.
- Added HSTS only when both `NODE_ENV=production` and the validated `APP_URL` origin uses HTTPS. Deliberately omitted `includeSubDomains` and `preload` until every deployment hostname is verified HTTPS-only.
- Added reusable private/no-store headers and applied them to current invitation, auth callback, login, MFA, dashboard, and settings routes. Public pages remain outside the no-store route list.
- Added fail-closed URL validation for policy inputs: origins may not contain credentials, paths, queries, or fragments, and production Supabase browser connectivity must use HTTPS.
- Added seven negative/positive policy tests and a documented browser-security baseline/change checklist.
- Updated `supabase/README.md` to record that P1-15 is application-only and requires no migration.

## Database / Remote State

- No migration, schema change, seed, persistent row, Dashboard change, MCP call, remote reset, or destructive database operation was performed for P1-15.
- Generated database types remain aligned. The pgTAP/RLS suite and linked database lint were not rerun because this checkpoint does not touch database behavior.
- No real staff/patient data, usable credentials, secrets, or production access was used.

## Verification Performed

- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 74 tests across 9 files.
- `npm run build` — passed. Public `/` remained static; all current auth/private routes remained dynamic. The pre-existing warning about the ignored parent-directory lockfile remains.
- Production response smoke using the built app — `/` and `/login` returned 200; all five environment-independent security headers were present; CSP had no wildcard or production `unsafe-eval`; clickjacking was denied; public `/` was not marked no-store; `/login` was private/no-store with legacy cache prevention headers. HTTPS-only header consistency also passed for the configured HTTP deployment mode.
- HTTPS deployment unit coverage — verified HSTS plus `upgrade-insecure-requests` for production HTTPS, and their absence for production HTTP or development.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run db:types:check` — passed; no generated type drift.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed CSP connectivity is limited to `self` and the exact configured Supabase origins; no wildcard CSP or permissive CORS header was introduced.
- Confirmed production excludes `unsafe-eval`. `unsafe-inline` remains for framework scripts/styles so static public rendering and current React/Radix behavior remain functional; this is documented compatibility debt and must be replaced by a tested nonce/hash strategy before production patient use.
- Confirmed HSTS cannot be emitted solely because a local `next start` uses production mode; the validated application origin must also be HTTPS. The one-year policy does not yet claim unverified subdomains or preload eligibility.
- Confirmed current identity/private routes are explicitly private/no-store while public pages retain framework-managed caching. Every later protected route must join the centralized no-store patterns or apply the reusable headers directly.
- Confirmed malformed policy origins fail the build/configuration path rather than weakening the policy, production Supabase HTTP is rejected, and no service-role secret or tenant data enters a response header.
- No UI, authorization rule, RLS policy, database object, dependency, or later Phase 1 checkpoint was changed. P1-16 and all later domains remain untouched.
