# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-07 — Supabase Auth for Next.js SSR

**Implementing agent:** OpenAI Codex, explicitly assigned temporary primary implementation for P1-07

**Status:** Implemented and self-reviewed; ready for independent review

## What Changed

- Added typed Supabase browser and server clients using `@supabase/ssr`, the public project URL, and the publishable key.
- Added the Next.js 16 request proxy pattern for session refresh, request-cookie propagation, response-cookie propagation, and refresh-response cache headers.
- Added a server-only verified-identity helper based on `auth.getClaims()`; every current EMR page performs this server-side check and redirects anonymous requests to `/login`.
- Added an invitation-only workforce login screen and server action using email/password authentication with generic credential errors and no public signup action.
- Added local-session sign-out to the application user menu.
- Added `/auth/confirm` OTP verification with an allowlist of supported email OTP types, token-free error redirects, and internal-only redirect validation.
- Added a committed `.env.example` and documented non-production public Auth configuration. No secret/service key variable or privileged client was added.
- Kept P1-07 free of invitation creation/acceptance, membership activation, MFA enrollment/challenge, RLS changes, migrations, and later-domain work.

## Files Added or Updated

- `.env.example`, `.gitignore`, `README.md`
- `src/lib/supabase/{config,client,server,proxy}.ts`
- `src/proxy.ts`
- `src/lib/auth/identity.ts`
- `src/lib/auth/safe-redirect.ts`
- `src/lib/auth/safe-redirect.test.ts`
- `src/app/(auth)/login/{page,login-form,actions}.tsx` / `.ts`
- `src/app/auth/confirm/route.ts`
- current EMR pages and `src/components/layout/user-menu.tsx`
- `docs/AI_HANDOFF.md`

## Security / Session Design

- The proxy refreshes and propagates tokens but does not grant application access. Protected pages independently verify signed claims server-side.
- No code uses `auth.getSession()` as identity proof.
- Current pages contain no tenant or patient data, so P1-07 performs identity verification only. Active membership, branch, permission, suspension, and AAL2 enforcement remain P1-10/P1-09 work and must precede sensitive data access.
- The confirmation handler rejects `signup` OTPs, does not expose detailed Auth errors, removes token parameters before redirecting, and prevents absolute, protocol-relative, backslash-normalized, and malformed destinations.
- Sign-out uses explicit `local` scope so the current browser session ends without silently revoking every other device session.

## Verification Performed

- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed under strict TypeScript settings.
- `npx vitest run src/lib/auth/safe-redirect.test.ts` — passed, 7 tests.
- `npm run build` — passed; Next.js reports `/login`, `/auth/confirm`, and all EMR routes as dynamic, with the request proxy present.
- `npm run db:types:check` — passed; P1-07 did not change the database schema.
- Local runtime smoke check — `/login` returned 200; anonymous `/dashboard` returned 307 to `/login`; malformed `/auth/confirm` returned 307 to the token-free login error route.
- Secret/scope scan — no service-role/secret key, public signup action, migration, or later-domain implementation introduced.
- `git diff --check` — passed; only existing Windows checkout line-ending notices were emitted.

## Reviewer Focus

- Confirm `setAll` updates both request and response cookies and preserves the cache headers supplied by `@supabase/ssr`.
- Confirm the proxy only refreshes sessions and that each current EMR entry page uses verified claims independently.
- Confirm login errors do not enumerate accounts and anonymous users cannot create workforce accounts through the UI.
- Confirm confirmation redirects cannot leave the application origin or retain `token_hash`/OTP details.
- Confirm no P1-08 invitation onboarding or P1-09 MFA behavior was started.

## Residual Boundaries

- No authenticated end-to-end login was created or run because workforce bootstrap/invitation is P1-08. Runtime coverage for this checkpoint is the anonymous/protected boundary plus unit/static/build verification.
- Membership suspension and current authorization state are intentionally not enforced by this identity-only slice; P1-10 must add current membership/permission checks before protected pages expose tenant data.
- Next.js continues to warn that it ignores an unrelated `C:\Users\D_Reyes\package-lock.json` outside this Git repository. The repository lockfile is used; no machine-specific workaround was committed.

## Handoff Rules

- Do not include private chain-of-thought or conversation transcripts.
- Do not include real patient data, PHI, passwords, tokens, API keys, OAuth secrets, or production credentials.
- Do not claim tests were run if they were not.
- This summary does not replace reviewing the actual Git diff.
