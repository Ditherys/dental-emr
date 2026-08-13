# Disposable Cloud TEST project — provisioning runbook

**Authority:** [ADR-016](../decisions/ADR-016-supabase-cloud-first-development.md), [ADR-017](../decisions/ADR-017-phase1-secure-migration-baseline.md), [ADR-018](../decisions/ADR-018-nonproduction-database-test-tooling.md), [`supabase/MIGRATION_FREEZE.md`](../../supabase/MIGRATION_FREEZE.md)

This runbook covers building a **disposable** Supabase Cloud TEST project from the
committed baseline and nothing else. It is the mechanism R6-C, R6-D, and R6-E use.

It never targets DEV. It never targets production. Every command below refuses to
run unless the linked project equals the explicitly designated TEST reference.

## One slot at a time

The project assumes **one disposable TEST project may exist at a time**. Nothing
in this runbook requires two to coexist.

| Slot | Purpose | Ends with |
|---|---|---|
| `TEST-01` | R6-C clean reconstruction, then R6-E full equivalence and hosted verification | evidence preserved under `docs/evidence/`, then deletion with approval |
| `TEST-02` | R6-D statement-level interrupted-boundary verification on a genuinely fresh project | evidence preserved, then deletion with approval |

Each slot is created fresh, used, evidenced, and deleted. Evidence lives in Git;
the project does not.

Deleting a Cloud project is a human action taken in the Supabase Dashboard after
explicit approval. No script in this repository deletes a project.

## Never in Git, never in chat

Obtain and set these in your own PowerShell session. Their **names** appear here;
their **values** must never be pasted into Git, a document, a ticket, or an agent
prompt.

| Variable | What it is |
|---|---|
| `SUPABASE_TEST_PROJECT_ID` | the disposable TEST project reference |
| `SUPABASE_DEV_PROJECT_ID` | the DEV project reference — **mandatory**, so the "TEST must differ from DEV" check cannot pass vacuously |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<TEST reference>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | TEST publishable key |
| `SUPABASE_SECRET_KEY` | TEST secret key — server-only, never `NEXT_PUBLIC_` |
| `SUPABASE_DB_PASSWORD` | TEST database password, set at project creation |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI token, when not using interactive `supabase login` |

`SUPABASE_PRODUCTION_PROJECT_ID` is set only if a production project exists.

## Step 1 — Create the project (Dashboard, human)

1. Supabase Dashboard → **New project**.
2. Name it for the slot, for example `dental-emr-test-01`.
3. Region: the approved Southeast Asia / Singapore region when available.
4. Postgres version: accept the current default unless DEV differs materially; record whichever you chose in the evidence file.
5. Generate a strong database password and store it in your password manager. Do not paste it anywhere else.
6. Wait for provisioning to finish.
7. Copy the project **reference** (not the URL) for the next step.

Record in the evidence file, later: project reference, region, Postgres version,
creation date, and the slot label. Those are not secrets.

## Step 2 — Set the session environment (human, PowerShell)

```powershell
$env:APP_ENVIRONMENT='test'
$env:SUPABASE_TEST_PROJECT_ID='<test-project-ref>'
$env:SUPABASE_PROJECT_ID=$env:SUPABASE_TEST_PROJECT_ID
$env:SUPABASE_DEV_PROJECT_ID='<dev-project-ref>'
$env:NEXT_PUBLIC_SUPABASE_URL="https://$($env:SUPABASE_TEST_PROJECT_ID).supabase.co"
$env:DATABASE_TEST_CONFIRMATION='I_UNDERSTAND_THIS_IS_A_DISPOSABLE_CLOUD_TEST_PROJECT'
```

Then verify separation before contacting anything:

```powershell
npm run ci:test-target
```

## Step 3 — Link the CLI to the TEST project (human)

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref $env:SUPABASE_TEST_PROJECT_ID
npx supabase migration list --linked
```

`migration list` on a fresh project must show **no applied versions**. If it shows
any, the target is not a fresh disposable project — stop.

## Step 4 — Apply the baseline

The R6 freeze is active, so each migration-applying step needs its own scoped
acknowledgement. Set it immediately before the step and clear it immediately
after; a token left exported does not authorize the next command.

```powershell
$env:MIGRATION_FREEZE_ACK='I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE'
$env:MIGRATION_FREEZE_ACK_COMMAND='db-push-dry'
npm run db:push:dry

$env:MIGRATION_FREEZE_ACK_COMMAND='db-push'
npm run db:push:test

Remove-Item Env:\MIGRATION_FREEZE_ACK, Env:\MIGRATION_FREEZE_ACK_COMMAND
```

The dry run must list exactly the eight baseline versions and nothing else.

## Step 5 — Provision non-production test tooling

The baseline is production-shaped and installs no extension (ADR-018). pgTAP is a
separate step, and the pgTAP suites cannot run without it.

```powershell
$env:MIGRATION_FREEZE_ACK='I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE'
$env:MIGRATION_FREEZE_ACK_COMMAND='db-provision-test-tooling'
npm run db:provision:test
Remove-Item Env:\MIGRATION_FREEZE_ACK, Env:\MIGRATION_FREEZE_ACK_COMMAND
```

It must print `PASS db-provision-test-tooling (P1_PROVISION_PASS)`. That sentinel
is read from the live catalog, so a skipped run cannot read as success.

## Step 6 — Synthetic fixtures

```powershell
$env:MIGRATION_FREEZE_ACK='I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE'
$env:MIGRATION_FREEZE_ACK_COMMAND='db-seed'
npm run db:seed:test
Remove-Item Env:\MIGRATION_FREEZE_ACK, Env:\MIGRATION_FREEZE_ACK_COMMAND
```

`supabase/seed.sql` is the deterministic two-tenant synthetic security graph.
**Synthetic data only.** No real patient, workforce, or clinic data may ever be
loaded into any environment created by this runbook.

## Step 7 — Verification suites

```powershell
npm run test:db              # pgTAP authorization suites
npm run db:types:check:test  # generated-type drift
npm run db:lint:test         # schema lint
npm run db:advisors:test     # Supabase security advisors
```

## Step 8 — Preserve evidence, then dispose

Write the run's evidence into `docs/evidence/` and commit it. Evidence outlives
the project; the project does not outlive the checkpoint.

Deletion is a Dashboard action requiring explicit approval. Before deleting,
confirm the evidence file is committed and that the slot's checkpoint is
complete.

## What this runbook must never do

- Target DEV or production. Every guarded command refuses a target that is not the designated TEST reference.
- Load real patient or workforce data.
- Print, log, or commit a key, password, or token.
- Remove the migration freeze. The freeze lifts only through the approved R6-F procedure.
