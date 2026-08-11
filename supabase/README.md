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

## Checkpoint boundary

P1-08 adds invitation-only workforce onboarding. MFA, the general application
authorization layer, RLS policies, fixtures, and the broader database test
foundation remain in their later checkpoints.
