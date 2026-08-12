# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-16 — Environment Separation

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and self-reviewed; ready for independent review. P1-17 was not started.

## What Changed

- Added a centralized environment-separation validator required by `next.config.ts` before a build can complete.
- Bound `APP_ENVIRONMENT` to Vercel's `VERCEL_ENV` / `VERCEL_TARGET_ENV`: Development maps to Cloud DEV, Preview/custom targets map to Cloud TEST, and Production maps only to Cloud PRODUCTION.
- Required `SUPABASE_PROJECT_ID` and verified that `NEXT_PUBLIC_SUPABASE_URL` is the exact HTTPS Supabase Cloud origin for that project reference.
- Repeated validation before the server-only admin client can use the RLS-bypassing secret.
- Hardened the controlled first-owner bootstrap to bind its URL to the explicit project reference and refuse production provisioning during the current Phase 1 workflow.
- Expanded `.env.example` with empty/synthetic-safe environment metadata and explicit publishable-key/RLS and secret-key/browser warnings.
- Added a Vercel environment-scope matrix, configuration steps, fail-closed behavior, and safe verification procedure in `docs/deployment/ENVIRONMENT_SEPARATION.md`; updated the root and Supabase workflow READMEs.
- Added nine unit tests covering DEV, TEST/Preview, Production, custom staging, cross-environment mismatches, project-ref/URL mismatch, non-Vercel production refusal, and missing Vercel target metadata.

## Database / Remote State

- No migration, schema change, seed, persistent row, Supabase Dashboard change, Vercel Dashboard change, MCP call, remote reset, destructive database operation, or production infrastructure was created for P1-16.
- Migration files remain authoritative; the project remains cloud-first with no local Supabase runtime.
- `db:types:check` performed a read-only generated-type comparison against the existing linked non-production Cloud project and passed; no remote write was made.
- No real staff/patient data, usable credentials, secrets, project references, or production access was printed, committed, or used.

## Verification Performed

- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 83 tests across 10 files.
- `npm run build` — passed using transient DEV identity metadata derived without printing values. Public `/` remained static and current auth/private routes remained dynamic. The pre-existing ignored parent-directory lockfile warning remains.
- Intentional Preview negative build — `APP_ENVIRONMENT=production` with Vercel Preview target metadata failed at configuration validation with the expected TEST-target refusal.
- Intentional bootstrap negative check — a fully synthetic production-labeled invocation was refused before client construction/network access.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run db:types:check` — passed; no generated type drift.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed a normal Preview/custom staging target accepts only `APP_ENVIRONMENT=test`, Production accepts only `APP_ENVIRONMENT=production`, and production configuration cannot run outside verified Vercel Production.
- Confirmed the application accepts only standard HTTPS Supabase Cloud origins whose host matches the separately supplied project reference; local Supabase URLs, credentialed URLs, paths, queries, fragments, and mismatched project refs are rejected.
- Confirmed the secret key remains server-only and absent from validation errors, tests, logs, and browser configuration. A production secret must still be excluded from Preview by Vercel project-scoped variables; the runbook records this primary operational control.
- Actual Vercel variables were not configured or inspected because no deployment/project access was required or supplied. Before deployment, an operator must enable Vercel system environment variables and apply the documented project-level Development/Preview/Production scopes.
- No RLS policy, tenant authorization rule, database object, dependency, UI, clinical domain, file/media implementation, CI/testing-foundation work, or later Phase 1 checkpoint was changed. P1-17 remains untouched.
