# Supabase Cloud development workflow

This directory is the Git source of truth for the database. The runtime database must be a dedicated, disposable Supabase Cloud development project containing synthetic data only.

The local-service sections in `config.toml` are generated Supabase CLI metadata. They do not change [ADR-016](../docs/decisions/ADR-016-supabase-cloud-first-development.md): do not run `supabase start`, do not require Docker, and do not store persistent application data on the workstation.

## One-time project setup

1. Create or designate a non-production Supabase Cloud project named `dental-emr-dev` or equivalent. Use the approved Southeast Asia / Singapore region when available.
2. Authenticate interactively. Never paste an access token, database password, secret key, or recovery code into Git, documentation, an agent prompt, or shell history.
3. Link only after verifying that the target is the intended non-production project:

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref <DEV_PROJECT_REF>
npx supabase migration list --linked
```

Supabase CLI link state is stored under the ignored `supabase/.temp/` directory and must not be committed.

## Migration freeze is currently ACTIVE

**Read [`MIGRATION_FREEZE.md`](MIGRATION_FREEZE.md) before running any database
command.** R6-A replaced the thirteen superseded Phase 1 migration files with an
eight-file grant-last secure baseline, so the Git baseline intentionally
disagrees with the linked DEV project's recorded migration history until R6-F
reconciliation. DEV's schema is correct and unchanged.

Until the freeze lifts, `db push`, `migration up`, `migration repair`,
`db reset`, and any schema-changing SQL are frozen against DEV. The guarded
`npm run db:push:*` / `db:seed:*` scripts refuse to run while the freeze file
exists unless `MIGRATION_FREEZE_ACK` is set for the approved Cloud TEST steps.

## Phase 1 secure baseline

`migrations/` contains eight baseline files that build the complete Phase 1
foundation from zero. They are **production-shaped**: they create no extension,
and reconstructing the application schema never requires installing testing
infrastructure. Database test tooling (pgTAP) is provisioned separately into
non-production projects only — see "Non-production test tooling" below and
[ADR-018](../docs/decisions/ADR-018-nonproduction-database-test-tooling.md).

The security-critical property, recorded in
[ADR-017](../docs/decisions/ADR-017-phase1-secure-migration-baseline.md), is:

> Files 1 through 7 grant nothing to `PUBLIC`, `anon`, or `authenticated`.
> `20260813020700_baseline_final_grants.sql` is the only file that grants.

Every object revokes its inherited and default privileges in the same statement
sequence that creates it, so every migration boundary is strictly more
restrictive than the final state without depending on any assumption about
migration transaction atomicity. When adding Phase 2 migrations, preserve this
rule: grant only in the final file of a set, and never broaden then narrow.

### The rule is enforced, not just documented

```powershell
npm run security:migrations
```

`scripts/run-migration-privilege-lint.mjs` parses every active migration and
fails the build if the invariant breaks. It is part of `npm run verify` and of
the CI application job, is entirely offline, and contacts no database.

In practice this means:

- a migration outside a registered grant-terminal file may contain **no** `GRANT`
  at all;
- every table, function, schema, and sequence must revoke `PUBLIC`, `anon`, and
  `authenticated` before the next privilege-bearing `CREATE` in the same file;
- every `public`-schema table must enable RLS in the file that creates it;
- every function must declare `set search_path = ''`;
- the grant-terminal migration's privileges must equal the approved set in
  `scripts/approved-final-grants.mjs` exactly, column lists included.

To add a privilege in a future phase, register the new terminal migration and its
exact grants in `scripts/approved-final-grants.mjs` with a reason for each. That
registration is the review gate — see `docs/decisions/ADR-017-phase1-secure-migration-baseline.md`.

`supabase/verification/r6d/` holds the dynamic counterpart, which verifies
effective privileges against a live database. It is authored but **not yet
executed**; see its README.

## Non-production test tooling

`provisioning/nonproduction/001_database_test_tooling.sql` installs pgTAP. It is
**not a migration** and lives outside `migrations/` on purpose, so `db push`
cannot apply it and a production replay can never pick it up.

```powershell
npm run db:provision:test
```

That command routes through the same guarded runner as every other remote write:
the linked project must be the designated disposable Cloud TEST project, and while
the R6 freeze is active it also requires the scoped acknowledgement. It asserts a
`P1_PROVISION_PASS` sentinel read from the live catalog, so a skipped run cannot
pass silently.

The pgTAP suites in `tests/` require this step. DEV already carries pgTAP from the
superseded chain and is deliberately left unchanged. The complete order for
building a disposable TEST project is in
[`docs/deployment/CLOUD_TEST_PROVISIONING.md`](../docs/deployment/CLOUD_TEST_PROVISIONING.md).

## Migration workflow

Create schema changes as reviewable migration files under `migrations/`. Do not create application tables in the Supabase Dashboard and leave them untracked.

Before applying any migration:

```powershell
npx supabase db push --dry-run
npx supabase migration list --linked
```

After the dry run and target project have been reviewed:

```powershell
npx supabase db push
```

Never run `npx supabase db reset --linked` without first verifying the exact target is disposable and non-production and obtaining explicit human approval. It destroys remote data.

## Synthetic foundation seed

`seed.sql` contains the deterministic P1-12 two-tenant security graph. Every
name, address, and email is synthetic; the nine `auth.users` rows are non-login
database placeholders with no password, confirmed email, identity, session, or
MFA factor. Create real E2E login identities later only through a controlled
test setup against a designated non-production project.

To load or refresh these idempotent fixtures without resetting the database,
first verify the linked target, then execute the seed explicitly:

```powershell
npx supabase projects list
npx supabase migration list --linked
npx supabase db query --linked --file supabase/seed.sql
npx supabase db query --linked --file supabase/tests/seed_security_fixtures.test.sql
```

Do not load this seed into staging or production. A full reconstruction test via
`db reset --linked` remains destructive and requires the separate approval and
target checks described above.

## Generated TypeScript types

After reviewed migrations have been applied to the linked development project,
regenerate the committed public-schema types:

```powershell
npm run db:types
```

The generator writes `src/types/database.generated.ts`. Do not edit that file by
hand. Change the schema through a migration, apply the migration to the designated
development project, and regenerate instead.

Use the drift check locally or in CI:

```powershell
npm run db:types:check
```

## Workforce invitation email template

P1-08 uses the Supabase admin invitation API from a server-only client. Configure
the hosted project's **Invite user** email template so the token hash is verified
by the application SSR callback:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
```

Add each environment's `APP_URL` origin and `/auth/confirm` path to the hosted
Auth redirect allow list. `APP_URL` and `SUPABASE_SECRET_KEY` are server-only;
the secret key must never use a `NEXT_PUBLIC_` prefix.

## Controlled first-owner bootstrap

The first tenant owner is the only invitation that does not have an existing
authorized inviter. Run this procedure only against a verified non-production
project with a newly created active organization that has no workforce members.
The database takes an organization-scoped transaction lock and rejects a second
bootstrap.

Set the required values in the current PowerShell process without writing secrets
to Git, then run:

```powershell
$env:BOOTSTRAP_ORGANIZATION_ID='<synthetic-organization-uuid>'
$env:BOOTSTRAP_OWNER_EMAIL='<synthetic-owner-email>'
$env:BOOTSTRAP_CONFIRMATION='I_UNDERSTAND_THIS_CREATES_FIRST_OWNER'
npm run auth:bootstrap-owner
```

The script also requires `APP_ENVIRONMENT`, `SUPABASE_PROJECT_ID`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `APP_URL` in the process
environment. The project ID must match the URL, and the Phase 1 script refuses a
production environment. It never prints credential values or the owner email.
Staging uses the same controlled procedure. Production tenant provisioning
remains a later, explicit workflow and must not reuse an unrestricted developer
credential.

Local runs use the verified linked project. CI can set `SUPABASE_PROJECT_ID` to
the non-production project reference and provide `SUPABASE_ACCESS_TOKEN` through
its secret store; neither value belongs in source control. The check exits with a
failure when regeneration would change the committed file.

## Workforce TOTP MFA

P1-09 records authenticator-app enrollment and verification as enabled in
`config.toml` and uses only the supported Supabase Auth MFA APIs. Before
exercising the UI, verify the linked target is the designated non-production
project, then confirm TOTP enrollment and verification are enabled in the hosted
project's Auth MFA settings or through a narrowly scoped Management API update.

Do not run a broad `supabase config push` solely to change MFA unless the complete
hosted Auth configuration diff has been reviewed. The generated file also contains
unrelated local defaults that could replace hosted redirect, email, password, or
invitation settings.

TOTP enrollment and verification must remain enabled in staging and production.
Do not enable phone/SMS MFA as the preferred workforce factor. The application
does not implement a custom TOTP algorithm or custom recovery-code store.

The hosted negative and lifecycle test strategy is documented in
`docs/testing/MFA_TESTING.md`. It requires synthetic identities and ephemeral test
factors in a dedicated cloud TEST project; it does not authorize real workforce
accounts, production factors, or secrets in Git and test output.

## Checkpoint boundary

The committed database foundation now includes P1-10 application authorization,
P1-11 RLS policies, and the P1-12 synthetic seed/security fixtures. P1-13 uses
the existing AAL2-gated, transactional `create_branch` RPC through an authorized
server action; it requires no additional schema migration. P1-14 derives the
branch selector from that existing user-context/RLS-backed authorization state
and stores only a validated browser preference; it also requires no schema
migration. P1-15 adds application/browser security headers and private response
cache rules only. P1-16 adds build/runtime environment-pairing guards and a
Vercel scoping runbook. Both are application/configuration-only and require no
schema migration. P1-17 adds the guarded remote Cloud TEST pgTAP runner and
application testing foundation without introducing a local runtime or a schema
migration. P1-18 reuses that strict target guard for serialized CI migration,
seed, lint, advisor, type, pgTAP, and E2E checks; see
`docs/deployment/CI_FOUNDATION.md`. P1-19 hardens the existing audit table,
adds the controlled verified-TOTP enrollment projection, and adds its dedicated
pgTAP suite; see `docs/security/AUDIT_FOUNDATION.md`. P1-20 and every later
domain remain out of scope here.

R6-A replaced the P1-05 through P1-19 migration chain with the eight-file secure
baseline described above. The committed schema behavior is unchanged; only the
migration path to it changed. See ADR-017 for the superseded version list, the
grant-last invariant, the intentional temporary DEV history divergence, and the
outstanding R6-B through R6-F work.
