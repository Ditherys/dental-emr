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

Local runs use the verified linked project. CI can set `SUPABASE_PROJECT_ID` to
the non-production project reference and provide `SUPABASE_ACCESS_TOKEN` through
its secret store; neither value belongs in source control. The check exits with a
failure when regeneration would change the committed file.

## Checkpoint boundary

P1-06 only generates types for the applied foundation schema. Auth integration,
RLS policies, authorization helpers, fixtures, and database tests remain in their
later checkpoints.
