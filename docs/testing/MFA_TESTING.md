# MFA testing strategy

P1-09 uses Supabase Auth TOTP factors and JWT Authenticator Assurance Level
claims. Tests must not replace or weaken the production MFA policy.

## Automated checks in this checkpoint

The unit tests in `src/lib/auth/mfa-policy.test.ts` exercise the fail-closed
decision layer independently of Supabase availability:

- only `currentLevel = aal2` and `nextLevel = aal2` satisfies `requireAal2()`;
- an enrolled factor at AAL1 requires a challenge;
- an account with no verified factor does not enter an impossible challenge loop;
- a stale AAL2 JWT after factor removal does not satisfy the AAL2 gate;
- null, unknown, and malformed assurance values are denied;
- only a six-digit numeric TOTP input reaches the Supabase verification API.

The server helper also verifies the JWT with `getClaims()` before reading its
assurance level, then asks Supabase Auth for current factor state using that exact
access token. This prevents a removed last factor from leaving a stale `aal2` JWT
usable for a protected server action.

## Hosted integration and E2E strategy

Run destructive Auth lifecycle tests only in the designated disposable cloud TEST
project described by ADR-016, never in production or a shared clinic environment.
Use synthetic workforce identities and a test-only TOTP factor created during the
test run.

The harness should keep the enrollment secret in process memory only, generate
the current TOTP code with a reviewed test dependency or Supabase-supported
fixture, and remove the factor and Auth identity during cleanup. Never commit,
snapshot, print, or upload the secret, QR payload, one-time code, refresh token, or
recovery material.

Required hosted cases:

1. unauthenticated access to private MFA settings redirects to sign-in;
2. an AAL1 account without a factor is redirected from the AAL2 test route to
   enrollment;
3. enrollment remains unverified after a wrong code and becomes verified only
   after a correct code;
4. an AAL1 session with a verified factor is redirected to the challenge page;
5. a wrong challenge code does not upgrade the session;
6. a correct challenge upgrades the session and permits the AAL2 test route;
7. a different user's factor ID cannot be challenged or removed;
8. removing a verified factor without AAL2 is rejected by Supabase Auth;
9. removing the last factor invalidates the application's AAL2 decision even if
   the prior JWT still claims `aal2`;
10. factor secrets, QR payloads, tokens, and one-time codes are absent from logs,
    screenshots, traces, and committed artifacts.

Until a dedicated cloud TEST project and secret store are connected to CI, these
hosted cases are a release-gate checklist rather than a reason to disable MFA.
Local unit, type, lint, and build checks remain mandatory on every checkpoint.
