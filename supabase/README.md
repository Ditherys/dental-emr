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

The script also requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and
`APP_URL` in the process environment. It never prints their values or the owner
email. Staging uses the same controlled procedure. Production tenant provisioning
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
cache rules only; it also requires no schema migration. P1-16 and every later
domain remain out of scope here.
