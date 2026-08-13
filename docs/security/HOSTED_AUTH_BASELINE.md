# Hosted Supabase Auth baseline (R4)

**Authority:** `docs/SECURITY_ARCHITECTURE.md`, [ADR-003](../decisions/ADR-003-authorization-defense-in-depth.md), [ADR-016](../decisions/ADR-016-supabase-cloud-first-development.md)

Supabase Auth owns identity and session issuance. The database and the
application own tenancy, roles, and permissions. Everything on this page is the
first of those three — settings that live in the hosted project and cannot be
expressed in a migration.

## The posture is verified, never pushed

```powershell
npm run security:auth
```

`scripts/verify-hosted-auth-config.mjs` issues exactly one HTTP GET against the
Management API and compares the result to `scripts/hosted-auth-policy.mjs`. It
has no write path.

This is deliberate. `supabase config push` would apply the generated
`config.toml`, which also carries unrelated local defaults capable of replacing
hosted redirect, email, password, and invitation settings that nobody intended
to change. A verifier that reports drift is safer than a pusher that silently
resolves it.

**A setting the API does not report counts as a failure**, not a pass. A rule
carrying `requiredIn` is reported everywhere but only *fails* in the environments
that require it — visible, never dropped, and never a check that cannot pass on
the project it runs against. Supabase
renames and adds configuration keys; a checker that skipped absent keys would
report a posture it never inspected.

Required in the process environment: `APP_ENVIRONMENT`, `SUPABASE_PROJECT_ID`,
`SUPABASE_ACCESS_TOKEN`, plus `SUPABASE_TEST_PROJECT_ID` and
`SUPABASE_DEV_PROJECT_ID` when the environment is `test`. Never paste the token
value anywhere; set it in the shell for the run.

## The approved posture

| Setting | Required | Why |
|---|---|---|
| `disable_signup` | `true` | Workforce onboarding is invitation-only. Open signup lets anyone create an identity against a project holding health information. |
| `external_anonymous_users_enabled` | `false` | An anonymous identity has no membership and no accountable actor for audit events. |
| `mailer_autoconfirm` | `false` | Auto-confirmation would let an unverified address hold a session, breaking the invitation binding. |
| `mfa_totp_enroll_enabled` | `true` | Authenticator apps are the approved second factor; the AAL2 RPCs are unreachable without it. |
| `mfa_totp_verify_enabled` | `true` | Enrollment without verification cannot produce an AAL2 session. |
| `mfa_phone_enroll_enabled` | `false` | SMS is not the approved workforce factor. |
| `mfa_phone_verify_enabled` | `false` | Same. |
| `password_min_length` | `>= 12` | Supabase's default of 6 is below the project floor for accounts that reach clinical data. |
| `password_required_characters` | non-empty | Length alone permits trivially guessable secrets. |
| `password_hibp_enabled` | `true` in staging/production | Leaked-password protection (HaveIBeenPwned). Credential stuffing is the main route to taking over a workforce account, and a length policy does nothing against an already-public password. **Supabase gates this on Pro plan and above**, so a Free-tier disposable TEST project cannot enable it — the checker reports it as `ADVISORY` there and as `FAIL` in staging/production. Dashboard location: Auth settings → Email provider settings → "Prevent the use of leaked passwords". |
| `security_update_password_require_reauthentication` | `true` | Stops a hijacked session from locking out the legitimate owner. |
| `refresh_token_rotation_enabled` | `true` | Rotation makes a stolen refresh token detectable rather than indefinitely usable. |
| `security_refresh_token_reuse_interval` | `<= 10s` | The window exists for request races. A long window is a replay window. |
| `jwt_exp` | `<= 3600s` | Bounds how long a revoked authorization can still be presented before the next refresh. |
| `uri_allow_list` | approved origins only, no wildcard | This list is what stops an invitation or recovery link from delivering a session to an attacker-controlled origin. |

Approved redirect origins per environment live in `APPROVED_REDIRECT_ORIGINS`.
Adding a deployment origin means editing that list — a review-visible diff.

## Invitation email template

The application's SSR callback verifies the token hash, so the hosted **Invite
user** template must pass it through:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
```

The Management API does not expose template bodies in a form this checker can
assert reliably, so template correctness stays a manual verification item. It is
recorded here rather than silently assumed.

## Fixing a violation

1. Change the setting in **Supabase Dashboard → Authentication**, on the reported project only.
2. Re-run `npm run security:auth` and confirm the row now passes.
3. If the *approved posture itself* should change, edit `scripts/hosted-auth-policy.mjs` with the new expectation and its reason, and update this table in the same commit.

Never resolve a violation by relaxing the policy file to match reality without
that reasoning. The policy is the intent; the hosted project is the observation.

## Known limitations

- **Not yet executed.** No hosted project has been read at the time of writing; the key names below come from the Management API's documented Auth configuration surface. Any key Supabase reports under a different name will surface as `UNVERIFIED` on first run rather than as a false pass, and the policy file is then corrected.
- Email template bodies, SMTP configuration, and rate-limit tuning are not asserted.
- **Production gate:** the production project must be provisioned on a plan that supports leaked-password protection. That is a procurement decision, not a configuration one, and it cannot be satisfied on a Free-tier project.
- The checker verifies configuration, not behaviour. The behavioural counterparts are the invitation and MFA flows in `supabase/tests/workforce_invitations.test.sql`, `supabase/tests/session_authorization_boundaries.test.sql`, and `e2e/`.

---

## First real run (2026-08-14)

Both hosted projects were read for the first time. **All 15 policy keys resolved
against the live Management API — 0 `UNVERIFIED`**, so the key names taken from
the documented surface were correct and the fail-closed design had nothing to
catch.

| Setting | TEST-01 | DEV |
|---|---|---|
| `disable_signup` | **FAIL** — `false` | **FAIL** — `false` |
| `password_min_length` | **FAIL** — `6` | **FAIL** — `6` |
| `password_required_characters` | **FAIL** — empty | **FAIL** — empty |
| `security_update_password_require_reauthentication` | **FAIL** — `false` | **FAIL** — `false` |
| `uri_allow_list` | **FAIL** — empty | PASS — `http://localhost:3000/auth/confirm` |
| `password_hibp_enabled` | ADVISORY — Pro-gated | ADVISORY — Pro-gated |
| the other nine | PASS | PASS |

**The finding that matters most: open signup is enabled on both projects.**
`disable_signup: false` means anyone who can reach the project can create an
identity. The architecture specifies invitation-only workforce onboarding, and
the application enforces it at every layer *after* identity — an account created
this way has no membership, no role, and reaches nothing. But it is still a
contradiction of the stated posture, on the project that holds the working data,
and it should be closed rather than argued away.

TEST-01's empty `uri_allow_list` is a different kind of problem: not a security
hole (Supabase then accepts only `SITE_URL`) but a functional one, because
`/auth/confirm` is not `SITE_URL`, so invitation acceptance cannot complete there.

### Resolved (2026-08-14, same day)

All four violations were closed on **both** projects, and TEST-01's redirect
allow list was configured, via a single targeted `PATCH` to
`/v1/projects/{ref}/config/auth` carrying exactly these fields:

```json
{
  "disable_signup": true,
  "password_min_length": 12,
  "password_required_characters": "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
  "security_update_password_require_reauthentication": true
}
```

The merge behaviour was **verified, not assumed**: the full configuration was read
before and after on each project, and of the 242 keys returned, only the four
intended ones changed — `unintended drift: none`. Existing fixture accounts were
then re-checked and all three still sign in, confirming the raised password floor
does not lock out accounts created before it.

Both projects now report **14 passed, 0 violations, 0 unverified, 1 advisory**.
The advisory is Pro-gated leaked-password protection, which remains a production
gate (M-5).

This was a deliberate operator action taken at the project owner's explicit
request. It does **not** change the standing rule that the *verification tooling*
never writes: `npm run security:auth` still issues one GET and has no write path.

### Remediation — Dashboard, per project (for future violations)

Authentication → **Sign In / Providers → Email**:

1. **Allow new users to sign up** → off (`disable_signup`)
2. **Minimum password length** → `12`
3. **Password requirements** → any non-empty character-class option
4. **Secure password change** → on (reauthentication before password change)

Authentication → **URL Configuration → Redirect URLs**, TEST-01 only:

5. add `http://127.0.0.1:3000/auth/confirm` (and `http://localhost:3000/auth/confirm` if you drive it that way)

Then re-run `npm run security:auth` for each project and record the result. Do
not relax the policy file to match the projects; the policy is the intent.
