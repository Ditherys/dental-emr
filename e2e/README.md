# Foundation end-to-end tests

These Playwright tests run only against a dedicated Supabase Cloud TEST project
containing synthetic identities and data. They must not target the interactive
DEV project or any production project.

The TEST project must be reconstructed from committed migrations and the
synthetic seed before the run. Provision separate synthetic login identities
through a controlled administrator workflow and attach them to the matching
synthetic memberships. Do not add passwords or TOTP secrets to `seed.sql`, Git,
shell history, screenshots, or test output.

## Loading credentials in PowerShell

Per `docs/deployment/CLOUD_TEST_PROVISIONING.md`, TEST credentials live outside
the repository in a bash-format `export NAME=value` file (by convention,
`$HOME\.dental-emr\test.env`). PowerShell has no native `source` for that
format. Load it into the current window with:

```powershell
. .\scripts\load-test-env.ps1
```

This must be re-run in **every new PowerShell window** — environment variables
do not carry over between windows. It only reports which variable *names*
loaded, never their values.

Required process environment:

```text
APP_ENVIRONMENT=test
SUPABASE_PROJECT_ID=<test-project-ref>
SUPABASE_TEST_PROJECT_ID=<same-test-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test-publishable-key>
SUPABASE_SECRET_KEY=<test-secret-key>
SUPABASE_DEV_PROJECT_ID=<dev-project-ref>
APP_URL=http://127.0.0.1:3000
E2E_TARGET_CONFIRMATION=I_UNDERSTAND_THIS_IS_SYNTHETIC_CLOUD_TEST_DATA
E2E_RUN_ID=<unique-4-to-12-character-id>

E2E_ORG_A_ID=<synthetic-org-a-uuid>
E2E_ORG_A_NAME=<synthetic-org-a-name>
E2E_ORG_B_ID=<synthetic-org-b-uuid>
E2E_ORG_B_NAME=<synthetic-org-b-name>
E2E_BRANCH_A1_ID=<synthetic-branch-a1-uuid>
E2E_BRANCH_A1_NAME=<synthetic-branch-a1-name>
E2E_BRANCH_A2_ID=<synthetic-branch-a2-uuid>
E2E_BRANCH_A2_NAME=<synthetic-branch-a2-name>
E2E_BRANCH_B1_ID=<synthetic-branch-b1-uuid>

E2E_OWNER_EMAIL=<synthetic-owner-email>
E2E_OWNER_PASSWORD=<secret-store-value>
E2E_OWNER_TOTP_SECRET=<secret-store-value>
E2E_ADMIN_EMAIL=<synthetic-admin-email>
E2E_ADMIN_PASSWORD=<secret-store-value>
E2E_ADMIN_TOTP_SECRET=<secret-store-value>
E2E_DENTIST_EMAIL=<synthetic-dentist-email>
E2E_DENTIST_PASSWORD=<secret-store-value>
E2E_DENTIST_TOTP_SECRET=<secret-store-value>
E2E_BRANCH_USER_EMAIL=<synthetic-branch-user-email>
E2E_BRANCH_USER_PASSWORD=<secret-store-value>
E2E_SUSPENDED_EMAIL=<synthetic-suspended-user-email>
E2E_SUSPENDED_PASSWORD=<secret-store-value>
```

The owner fixture must have a verified TOTP factor and organization-wide
`branch.manage`; the branch user must have access only to Branch A1 and no
`branch.manage`; the suspended identity must have no active organization
membership. `E2E_RUN_ID` makes the Branch A3 creation unique in a disposable
test run.

The admin fixture must have a verified TOTP factor and organization-wide
`branch.manage`, same as the owner, but must be a **different identity** from
`E2E_OWNER_EMAIL`. `session-boundaries.spec.ts` suspends this identity
mid-test to prove a mutation submitted after mid-session suspension is refused;
using a dedicated identity keeps that suspension from touching the shared owner
every other spec file signs in as. `npm run e2e:provision` provisions it from
the seed's existing `org-a-admin` row, which already carries an
organization-wide ADMIN assignment.

The dentist fixture must be a different synthetic user with active Branch A1
access, the DENTIST role, and a verified TOTP factor. The O14 odontogram
specification creates each patient through the receptionist UI, then signs in
independently as this dentist to prove that the clinical write happens through
the normal browser/server/RPC path. It does not use service-role patient setup.

## Mid-session withdrawal flows (R5)

`session-boundaries.spec.ts` covers authorization withdrawn *while a browser
session stays open*: branch access revoked mid-session, a membership suspended
mid-session, a mutation submitted between filling a form and losing authority, an
unchallenged MFA session attacking the step-up-gated surface, and invitation
issuance denied to a branch-scoped user.

Phase 1 has no user-management UI, so the withdrawal cannot be driven from a
second browser. `support/admin.ts` performs it directly against the TEST project
using `SUPABASE_SECRET_KEY`, which stays in the Node process and is never passed
to a browser context, written to a fixture, or logged. Those writes deliberately
bypass the AAL2-gated administrative RPCs — those are revoked from `service_role`
and only callable in a user context. The *authorization path* for the same
withdrawals is proven at the database boundary by
`supabase/tests/session_authorization_boundaries.test.sql`; these flows prove the
other half, that an already-open session stops being trusted.

Each flow restores its fixture in a `finally` block and the file restores every
fixture again in `afterAll`, so a mid-test failure cannot leave the shared TEST
project degraded.

Use `E2E_BASE_URL` only to target an already-running TEST deployment. Otherwise
Playwright starts the local Next.js process, which must still be configured to
use Cloud TEST. The desktop project runs every foundation flow. The iPad project
reruns the authenticated shell and branch-control flow.

```powershell
npm run test:e2e:list
npm run test:e2e
```

Missing, mismatched, development, local-Supabase, or production-identical target
metadata fails before a browser test starts.
