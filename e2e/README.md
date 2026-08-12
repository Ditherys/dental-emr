# Foundation end-to-end tests

These Playwright tests run only against a dedicated Supabase Cloud TEST project
containing synthetic identities and data. They must not target the interactive
DEV project or any production project.

The TEST project must be reconstructed from committed migrations and the
synthetic seed before the run. Provision separate synthetic login identities
through a controlled administrator workflow and attach them to the matching
synthetic memberships. Do not add passwords or TOTP secrets to `seed.sql`, Git,
shell history, screenshots, or test output.

Required process environment:

```text
APP_ENVIRONMENT=test
SUPABASE_PROJECT_ID=<test-project-ref>
SUPABASE_TEST_PROJECT_ID=<same-test-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test-publishable-key>
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
