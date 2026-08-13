# Evidence — R6-C reconstruction and R6-E verification on TEST-01

**Date:** 2026-08-14
**Project:** `dental-emr-test-01`, region `ap-southeast-1`, Postgres `17.6.1.155`
**Comparison target:** `dental-emr-dev`, region `ap-southeast-1`, Postgres `17.6.1.155` — **same region and same Postgres version**, which removes a class of false differences from the equivalence comparison.
**Operator:** project owner created and linked the project and applied the baseline; Claude Code ran the verification steps below.
**Linked-target confirmation:** `dental-emr-dev` reported `linked: false` throughout; the linked reference matched `SUPABASE_TEST_PROJECT_ID` and differed from `SUPABASE_DEV_PROJECT_ID` on every guarded command.

Project references, keys, passwords, and tokens are deliberately absent from this
file. It records what was proven, not how to connect.

## R6-C — reconstruction from the baseline alone

| Step | Result |
|---|---|
| `supabase migration list --linked` | All eight baseline versions `20260813020000`…`20260813020700` present, local == remote. No superseded version present. |
| `npm run ci:test-target` | Cloud TEST environment metadata internally consistent. |
| `npm run db:provision:test` | `PASS db-provision-test-tooling (P1_PROVISION_PASS)`. **This step had been missed**; pgTAP was absent, so every database suite would have failed at its first `extensions.no_plan()` call. The catalog-read sentinel is what surfaced it rather than a confusing downstream error. |
| `npm run db:seed:test` | Idempotent synthetic two-tenant graph loaded. |

The eight-file baseline builds the complete Phase 1 schema on an empty project
with no manual step and no superseded migration. That is the R6-C claim, and it
now holds.

## R6-E — verification

| Check | Result |
|---|---|
| `npm run test:db` | **6/6 suites PASS**: `schema`, `foundation_rls`, `workforce_invitations`, `audit_foundation`, `session_authorization_boundaries`, `seed_security_fixtures`. |
| `npm run db:types:check:test` | "Generated database types are current" — **no drift** between the committed `src/types/database.generated.ts` and a project built from the baseline. |
| `npm run db:lint:test` | "No schema errors found". |
| `npm run db:advisors:test` | **0 ERROR, 7 WARN.** Exit 0 under `--fail-on error`. See the disposition below. |

### The four pre-existing suites are the load-bearing result

`foundation_rls`, `workforce_invitations`, `audit_foundation`, and `schema` were
written against the *superseded thirteen-migration chain*. They pass unmodified
against a project built only from the R6-A baseline. That is meaningful behavioural
evidence that the consolidation preserved the accepted schema's semantics — RLS
policies, tenant isolation, invitation delegation, AAL2 gating, audit integrity,
and the object inventory.

It is **not** a full equivalence proof. It proves the baseline satisfies every
property the existing suites assert; it does not prove no unasserted difference
exists between the baseline and DEV. The catalog-level DEV-versus-TEST comparison
remains outstanding — see "Still open".

### R5-A: one real defect, found by executing it

`session_authorization_boundaries.test.sql` failed on first execution:

```
42501: permission denied for schema private
LINE 240: (select private.has_branch_access('83000000-…'))
```

**The defect was in the test, not in the system.** The suite probed the RLS
helper functions while acting as `authenticated`, and the `private` schema and
every helper in it are revoked from that role — correctly. PostgreSQL does not
require the querying role to hold `EXECUTE` on functions referenced inside a
policy expression, which is why the policies work while a direct call does not.

Fixed by dropping the role for the helper probes while leaving the victim's JWT
claims untouched, so `auth.uid()` still resolves to the victim and the helper
still answers "what may *this* user do". The RLS-observable assertions stay under
`authenticated`. All 40 assertions then passed.

Worth stating plainly: had the suite been shipped unrun, it would have looked like
coverage and delivered none.

### Advisor disposition — 7 WARN, all reviewed

**Six × `authenticated_security_definer_function_executable`** — `create_branch`,
`set_role_permission`, `set_member_role`, `set_branch_membership`,
`update_organization_member_status`, `record_mfa_enrollment`.

**Accepted and intentional.** These six are the entire authenticated write surface
of Phase 1. They are `SECURITY DEFINER` precisely so that AAL2 step-up,
anti-self-escalation, permission-superset delegation checks, the organization-scoped
advisory lock, and audit emission all execute inside a boundary the caller cannot
skip — see ADR-003 and ADR-017. Direct table writes are revoked from
`authenticated` for exactly this reason, which `foundation_rls.test.sql` asserts.
Following the advisor's remediation literally would remove the only authorized
write path and leave nothing safer in its place.

**One × `auth_leaked_password_protection`** — **a real finding, and a gap in this
project's own R4 policy, which did not cover it.**

Leaked-password protection is disabled. Credential stuffing is the most common
route to taking over a workforce account that reaches health information, and a
length-and-character policy does nothing against a password that is already
public.

**It cannot be enabled on this project.** Supabase gates the feature on Pro plan
and above (Auth settings → Email provider settings → "Prevent the use of leaked
passwords"), and TEST-01 is below that tier — which is why the toggle is not
visible in the Dashboard at all.

The rule `password_hibp_enabled` was added to `scripts/hosted-auth-policy.mjs`
and then corrected: it is **required in staging and production** and reported as
**advisory** elsewhere. Requiring it everywhere would have made the check
permanently red on the only project it currently runs against, and a check that
can never pass teaches people to ignore it. The finding is still printed in every
environment, so it cannot be forgotten.

**Converted to a Phase 1 production gate:** the production project must be
provisioned on a plan that supports leaked-password protection. That is a
procurement decision, not a configuration one.

## Still open after this session

| Item | Why it is not closed |
|---|---|
| Catalog-level equivalence, TEST vs DEV | Requires a read-only connection to DEV. The CLI is linked to TEST, and re-linking mid-session would put a DEV-targeted command one mistake away. Needs a deliberate, separately approved step. |
| `npm run security:auth` | Needs `SUPABASE_ACCESS_TOKEN` in the process environment. The CLI's own session does not satisfy the script. |
| Playwright flows (R5-B, R9 matrix) | Need the three synthetic login identities and a verified owner TOTP factor. `npm run e2e:provision` now automates this; it needs `SUPABASE_SECRET_KEY`. `verified_mfa_factors` was 0 at the time of writing. |
| R6-D interrupted-boundary replay | Requires a second, genuinely fresh project (TEST-02) after TEST-01 is disposed. |
| R6-F DEV reconciliation | Gated on R6-D and R6-E both being complete. |

## Disposal

TEST-01 must not be deleted yet: R6-E's DEV comparison and the Playwright flows
still need it. Delete it only after those complete and this evidence file is
committed.

---

# Addendum — first execution of the browser suite (2026-08-14)

Provisioning the synthetic identities (`npm run e2e:provision`) and running
Playwright against TEST-01 for the first time found **four application defects**.
None were visible to any static check, unit test, or database suite. Each is
recorded here because the finding matters more than the fix.

## A-1 — the authorization layer rejected valid database UUIDs

**Symptom:** every request by a member of the seeded organization returned 500.

`z.uuid()` in Zod 4 enforces RFC 9562 *versioned* UUIDs — version nibble 1–8,
variant 8/9/a/b. PostgreSQL's `uuid` type enforces neither. The synthetic tenant
id `22000000-0000-0000-0000-000000000001` is a perfectly valid row that the
project's own seed creates, and the validator sitting between the database and
the authorization layer threw on it.

Fixed by introducing `src/lib/validation/database-uuid.ts` (`z.guid()`) and using
it for every identifier that comes from or goes to the database. Version tagging
is not a security property: nothing branches on it, and every identifier is still
authorized by RLS and by the administrative RPCs. A regression test asserts the
seeded ids parse and that junk still does not.

## A-2 — the dev server refused to serve its own client chunks

**Symptom:** `403` on `/_next/static/chunks/*`, HMR WebSocket handshake failure,
and **no hydration at all**. Every form fell back to native submission.

Next 16's dev server blocks `/_next/*` for origins it considers cross-origin, and
it treats `127.0.0.1` and `localhost` as different origins. Playwright and CI both
drive the app at `http://127.0.0.1:3000`.

This is why no Playwright flow requiring client-side interactivity could ever have
passed. Fixed with `allowedDevOrigins: ["127.0.0.1", "localhost"]` in
`next.config.ts`; development-only, no effect on a production build.

## A-3 — a one-time TOTP code could be written to the URL

**Symptom:** `GET /mfa/challenge?code=070171`.

Three forms are handled by `onSubmit` client handlers. Before hydration the
browser performs a *native* submission, and with no `method` that is a **GET** —
serialising every field into the query string. For the two MFA forms that put a
one-time authenticator code into the address bar, browser history, the `Referer`
header of the next request, and any access log in front of the app.

Surfaced by A-2 making the pre-hydration window permanent, but it is not
dev-only: any user on a slow connection who submits before hydration hits it.

Fixed on both axes: `method="post"` so an unexpected native submission carries
fields in the body, and a `useHydrated()` gate so the control cannot be operated
before it can work. Applied to both MFA forms and the branch form.

## A-4 — the seed broke Supabase's Admin API project-wide

**Symptom:** `Database error finding users` from `auth.admin.listUsers`.

`supabase/seed.sql` inserted `auth.users` rows leaving `confirmation_token`,
`recovery_token`, `email_change`, and `email_change_token_new` NULL. GoTrue scans
those into non-nullable Go strings, so a single NULL breaks user listing for the
**entire project** — not just the offending rows. It disabled the invitation admin
calls and E2E identity provisioning, silently, until something used the Admin API.

Fixed by seeding empty strings (what GoTrue itself writes), with an `on conflict`
clause that repairs an already-seeded project, plus a pgTAP assertion in
`seed_security_fixtures.test.sql` so it cannot return. A suite that only reads
through SQL would never have caught it.

## Browser suite status

Desktop project: **14–15 of 18 passing**, from 1 before this work.

Everything security-relevant that the suite asserts now passes: the unauthenticated
redirect, branch-scoped isolation, branch access revoked mid-session, suspension
mid-session, invitation issuance denied to a branch-scoped user, and the axe/
overflow/focus checks on the sign-in and dashboard surfaces.

The remaining failures are **test-harness sequencing, not application behaviour**:

- The mid-session suspension flow suspends the **owner** — the same identity every other test signs in with. When it fails inside its `try`, later tests race its restoration and fail at login. Choosing the shared owner instead of a dedicated identity was an authoring shortcut and is the correct next fix.
- Supabase enforces single use per TOTP code. `signInOwnerWithTotp` now waits out the window and retries once; a serial suite performing several owner logins still stresses this.

Independently verified, so the gap is bounded: a direct check confirmed an AAL1
session is redirected to the challenge from **all four** EMR routes
(`/dashboard`, `/settings/branches`, `/settings/account`, `/settings/users/invite`),
and the R5-A database suite proves the same boundaries at the RPC layer.

## Test-side corrections

The pre-existing `foundation.spec.ts` had never run either: it expected the
heading "Sign in to the clinic workspace" (the app says "Sign in to Dental EMR"),
`getByLabel("Code")` also matched "Postal code (optional)", the branch dropdown
was left open so Radix made the account control inert, and `getByRole("alert")`
matched Next's route announcer as well as the panel.

The target-size check was also wrong: it measured the input alone, reporting a
16×16 checkbox as a WCAG 2.2 failure when its associated `<label>` makes the real
activation area far larger. It now measures the union.
