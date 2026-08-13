# CI Foundation

P1-18 adds reproducibility and security gates without changing the Phase 1
application schema. GitHub Actions run application verification, dependency
review, CodeQL, and a protected Cloud TEST workflow. Migration files in Git
remain authoritative.

## Pull-request gates

`CI / Application verification` runs from the locked dependency tree with no
protected credentials: ESLint, strict TypeScript, Vitest, a production Next.js
build using non-secret placeholder project metadata, Secretlint, and a
high-severity dependency audit.

`Dependency review / Review dependency changes` rejects newly introduced known
high- or critical-severity dependencies when GitHub dependency review is
available. `CodeQL / Analyze JavaScript and TypeScript` runs the extended
JavaScript/TypeScript security queries. Dependabot opens bounded weekly npm and
GitHub Actions updates; updates must be reviewed and tested, not auto-merged.

Secretlint is also available locally:

```powershell
npm run security:secrets
npm run security:audit
npm run verify
```

Repository administrators must enable GitHub secret scanning and push
protection when the repository/account plan supports them. The CI scan is a
complement, not a substitute. A real detected secret must be rotated or revoked;
deleting it from the latest file is not remediation by itself.

## Protected Cloud TEST environment

Create a GitHub environment named `cloud-test`. Require approval, restrict
deployment branches to trusted branches, and configure only a dedicated
disposable Supabase Cloud TEST project containing synthetic data. The Cloud TEST
job does not run for fork or Dependabot pull requests because Actions secrets
are unavailable and untrusted code must not receive them. Dependency-update PRs
still run the credential-free application and dependency-review gates; run the
Cloud TEST gate from a trusted branch before accepting an update. Review
workflow changes before approving any run that can access the environment.

Configure these environment variables:

```text
SUPABASE_TEST_PROJECT_ID
SUPABASE_TEST_URL
SUPABASE_DEV_PROJECT_ID
SUPABASE_PRODUCTION_PROJECT_ID (once production exists)
E2E_ORG_A_ID, E2E_ORG_A_NAME
E2E_ORG_B_ID, E2E_ORG_B_NAME
E2E_BRANCH_A1_ID, E2E_BRANCH_A1_NAME
E2E_BRANCH_A2_ID, E2E_BRANCH_A2_NAME
E2E_BRANCH_B1_ID
```

Configure these environment secrets:

```text
SUPABASE_TEST_ACCESS_TOKEN
SUPABASE_TEST_DB_PASSWORD
SUPABASE_TEST_PUBLISHABLE_KEY
SUPABASE_TEST_SECRET_KEY
E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_OWNER_TOTP_SECRET
E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_ADMIN_TOTP_SECRET
E2E_BRANCH_USER_EMAIL, E2E_BRANCH_USER_PASSWORD
E2E_SUSPENDED_EMAIL, E2E_SUSPENDED_PASSWORD
```

Use narrowly scoped synthetic test credentials. Do not configure a production
project reference, credential, patient record, or real workforce identity as a
TEST value.

The serialized Cloud TEST job links the declared project, then every database
operation invokes the same target guard as the pgTAP runner. The guard requires
`APP_ENVIRONMENT=test`, exact project/URL agreement before linking, exact
linked/project/URL agreement afterward, explicit disposable confirmation, and
separation from declared DEV/production project references.
It then dry-runs and applies pending migrations, provisions non-production
database test tooling ([ADR-018](../decisions/ADR-018-nonproduction-database-test-tooling.md) —
the canonical baseline installs no extension, so the pgTAP suites cannot run
without this step), loads the idempotent synthetic seed, runs rollback-bounded
pgTAP suites, checks generated database types, runs linked schema lint and
security advisors, verifies the hosted Auth posture read-only, and exercises the
Playwright flows across desktop, iPad, and the phone/tablet responsive matrix. It
never starts a local Supabase/Docker stack and never resets the remote database.

### While the R6 migration freeze is active

`supabase/MIGRATION_FREEZE.md` makes the guarded runner refuse every
migration-applying command, so the Cloud TEST job **cannot pass** until the
approved R6-F reconciliation removes the freeze. That is intended.

Do **not** add `MIGRATION_FREEZE_ACK` to the workflow. A CI-wide bypass would
convert a deliberate, per-command, human-acknowledged control into an automatic
one, which is the opposite of what the freeze is for. Until the freeze lifts,
treat `CI / Application verification` as the required check and add
`CI / Cloud TEST database and E2E` to branch protection the moment it can pass.

Protected credentials are step-scoped: package installation and target metadata
validation receive none; database credentials are exposed only to the relevant
Supabase command; synthetic login secrets are exposed only to Playwright.

The committed `supabase/seed.sql` provides the database security graph, but the
Cloud TEST environment must separately provision the documented synthetic login
identities and verified owner TOTP factor. See
[`../../e2e/README.md`](../../e2e/README.md) for that fixture contract.

## Branch protection

After the first successful runs, require these checks on `main`:

```text
CI / Application verification
CI / Cloud TEST database and E2E
Dependency review / Review dependency changes
CodeQL / Analyze JavaScript and TypeScript
```

### What can actually be required today

The first real runs (2026-08-14) established which of these the current plan can
satisfy. Requiring a check that cannot pass trains people to ignore red, so mark
each one required only when it can go green:

| Check | State | Gate |
|---|---|---|
| `CI / Application verification` | **passing** | none — require it now |
| `CI / Cloud TEST database and E2E` | fails at the first migration-applying step | the R6 migration freeze, by design. Require after R6-F. |
| `CodeQL / Analyze JavaScript and TypeScript` | fails: *"Code scanning is not enabled for this repository"* | code scanning on a **private** repository requires GitHub Advanced Security. Enable at Settings → Code security, if the plan permits. |
| `Dependency review / Review dependency changes` | fails: *"Dependency review is not supported on this repository"* | Dependency graph + GitHub Advanced Security, same gate. |

The workflow files are kept rather than deleted, and **`continue-on-error` is
deliberately not used** — a job that reports success while doing nothing is worse
than one that is honestly red. Until GHAS is available, the in-repository
substitutes carry the load: `npm run security:audit` (high-severity dependency
audit) and `npm run security:secrets` both run in the application job and both
pass. They are narrower than CodeQL and PR-diff dependency review, and that
narrowing is an accepted, recorded gap rather than an equivalent.

Require pull requests and the second review mandated for high-risk changes.
Do not make the Cloud TEST check optional merely because credentials or
synthetic identities have not been configured; finish the protected environment
setup instead.
