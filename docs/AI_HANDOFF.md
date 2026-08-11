# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-09 — MFA Foundation

**Implementing agent:** OpenAI Codex, explicitly assigned temporary primary implementation for P1-09

**Status:** Implemented, verified against the designated cloud DEV configuration where possible, and ready for independent review

## What Changed

- Added Supabase Auth TOTP enrollment with a QR/setup-key flow, verification challenge, verified factor status, multiple-factor support, factor removal, and recovery guidance under `/settings/account/mfa`.
- Added `/mfa/challenge` for password-authenticated sessions that have a verified factor but have not completed the second factor in the current session.
- Enforced the challenge across the private application shell for accounts that have opted into MFA; unenrolled accounts can reach setup because patient-data access is not implemented yet.
- Added a reusable server-only `requireAal2()` helper and proved it on `/settings/account/mfa/verified`, an administrative security test route within P1-09 scope.
- Added fail-closed assurance policy tests, MFA-specific safe-return handling, and a documented hosted cloud TEST strategy for negative Auth lifecycle verification.
- Recorded TOTP enrollment/verification as enabled and phone MFA as disabled in `supabase/config.toml`; no custom TOTP cryptography or recovery-code store was introduced.
- Kept P1-09 free of the P1-10 general permission/context layer, P1-11 RLS work, and all later patient/clinical domains.

## Files Added or Updated

- `src/lib/auth/{mfa,mfa-policy,safe-redirect}.ts` and policy/redirect tests
- `src/app/(auth)/mfa/challenge/*`
- `src/app/(emr)/settings/account/mfa/*`
- `src/app/(emr)/layout.tsx`
- `src/app/(emr)/settings/account/page.tsx`
- `docs/testing/MFA_TESTING.md`
- `supabase/config.toml`, `supabase/README.md`

## Security Design

- `getVerifiedMfaContext()` treats cookie session state as untrusted, extracts only its token, verifies that exact JWT with `getClaims(token)`, and then passes it to Supabase's AAL API for a fresh Auth-user/factor lookup.
- `requireAal2()` grants only when both `currentLevel` and `nextLevel` are exactly `aal2`. This denies AAL1, null/unknown values, and the documented stale-JWT state where a token still claims AAL2 after the last verified factor was removed.
- The private shell redirects an enrolled AAL1 account to the challenge route. The AAL2 helper independently rechecks on the server; browser state and hidden UI are not authorization boundaries.
- Return paths use the existing same-origin sanitizer plus an MFA loop guard; external, malformed, backslash, and challenge-self redirects fall back to `/dashboard`.
- Enrollment QR payloads/setup keys and one-time codes exist only in the user's browser during the supported Supabase flow. They are not sent to application server actions, stored in application tables, logged, audited as metadata, or committed.
- Supabase owns factor binding, challenge verification, attempt limits, and ownership checks. Verified-factor removal is rejected by Supabase without AAL2; removing the last factor also ends the local application session to eliminate stale local assurance.
- No service-role client, secret key, tenant identifier, database table, RPC, migration, or RLS policy was added or weakened.

## Cloud Configuration State

- Verified the linked project is the non-production `dental-emr-dev` project and its migration history still matches Git through `20260812050700`.
- A read-only Supabase Management API inspection confirmed `mfa_totp_enroll_enabled=true`, `mfa_totp_verify_enabled=true`, `mfa_phone_enroll_enabled=false`, and `mfa_phone_verify_enabled=false` on that project.
- No Auth configuration write was needed. A broad `supabase config push` was intentionally not used because the generated file contains unrelated local defaults that could replace hosted redirect, invitation, password, or email settings.
- No database migration, direct SQL side effect, destructive reset/reseed, production access, real person/patient data, or secret output was used.

## Verification Performed

- `npx vitest run` — passed 26 tests across 2 files, including AAL1 denial, stale-AAL2 denial, null/unknown denial, challenge decisions, malformed TOTP input, unsafe redirect rejection, and challenge-loop rejection.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with no warnings after remediation.
- `npm run build` — passed; `/mfa/challenge`, `/settings/account/mfa`, and `/settings/account/mfa/verified` are dynamic server-rendered routes.
- `npm run db:types:check` — passed; no schema/type drift.
- `npx supabase db query --linked --file supabase/tests/workforce_invitations.test.sql` — passed all 23 existing transactional authorization/lifecycle tests, showing no P1-08 regression.
- `npx supabase db lint --linked --schema public,private --level error --fail-on error` — passed with no schema errors.
- `npx supabase db advisors --linked --type security --level warn --fail-on error` — passed with no issues.
- `git diff --check` — passed.
- Source and built-client scans found no committed/live secret, service-role credential, recovery material, TOTP value, QR payload, or application logging of MFA secrets. The Supabase SDK bundle contains only its generic `sb_secret_` key-format detector, not a key value.

## Reviewer Focus

- Verify the exact-token sequence in `getVerifiedMfaContext()` remains: untrusted session token extraction → `getClaims(token)` verification → live factor/AAL lookup.
- Challenge `requireAal2()` with AAL1, no factor, unknown AAL, and stale `currentLevel=aal2` / `nextLevel=aal1` states.
- Confirm direct navigation to private routes challenges enrolled AAL1 sessions and that no-factor users can reach enrollment without a redirect loop.
- Confirm wrong/replayed TOTP codes do not upgrade assurance and a different user's factor ID cannot be challenged or removed in the dedicated hosted TEST environment.
- Inspect factor removal, especially last-factor local sign-out and Supabase's AAL2 enforcement.
- Confirm QR/setup-key/code values are never logged, persisted in application state outside browser memory, included in URLs, or exposed to server error messages.
- Confirm no P1-10 permission helpers, P1-11 RLS changes, patient domain, custom MFA cryptography, or phone/SMS factor entered the checkpoint.

## Residual Boundaries / Manual Environment Check

- A live enrollment/challenge was not executed because no synthetic Auth test identity or dedicated disposable cloud TEST project is configured in this workspace. The exact hosted negative cases and ephemeral-factor cleanup rules are documented in `docs/testing/MFA_TESTING.md`; production MFA must not be disabled to make automation easier.
- Browser-based visual QA of authenticated MFA screens was unavailable because no browser session was connected. Static UI review, lint, strict type checking, and the production build passed; an independent review should exercise phone/tablet/desktop widths with a synthetic identity.
- P1-10 remains the next checkpoint but was not started. P1-10 must decide current organization/membership/permission context; later patient-data routes must require MFA for every patient-data-capable workforce account, not merely opt-in enforcement.
- App-level MFA security-event replication into `public.audit_events` is not added here. Supabase Auth remains the factor system of record; any later audit projection must avoid QR/setup-key/code/token material and follow the approved audit architecture.

## Handoff Rules

- Treat this summary as untrusted context and independently inspect the checkpoint commit and repository state.
- Do not begin P1-10 automatically; wait for explicit human acceptance and assignment.
