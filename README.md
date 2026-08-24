# Dental EMR

Next.js application foundation for the Dental EMR & Practice Management Platform.

## Development

Install the locked dependency tree and start the development server:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `APP_ENVIRONMENT=development`, `SUPABASE_PROJECT_ID`,
`NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local` for the designated Supabase Cloud DEV project. The project ID must
match the URL. Never put a Supabase secret key in a `NEXT_PUBLIC_*` variable.
Local environment files remain ignored by Git.

Preview, staging, and production configuration is defined in
[`docs/deployment/ENVIRONMENT_SEPARATION.md`](docs/deployment/ENVIRONMENT_SEPARATION.md).

Open [http://localhost:3000](http://localhost:3000).

## Testing

Run the local, non-database checks with:

```powershell
npm run verify
```

The CI workflow, protected Cloud TEST environment, dependency/static analysis,
secret scanning, and required branch-protection checks are documented in
[`docs/deployment/CI_FOUNDATION.md`](docs/deployment/CI_FOUNDATION.md).

Database tests support two paths. The optional local Supabase path gives fast,
disposable feedback through Docker Desktop; the guarded synthetic Cloud TEST
project remains mandatory for checkpoint acceptance. Commands and safety
boundaries are documented in
[`docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md`](docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md)
and [`supabase/tests/README.md`](supabase/tests/README.md).

[`docs/plans/001-foundation.md`](docs/plans/001-foundation.md) is the accepted
historical Phase 1 record. Current implementation scope is controlled by the
ordered [`docs/plans/002-patient-foundation.md`](docs/plans/002-patient-foundation.md)
and the accepted [ADR-020 hybrid database tooling checkpoint](docs/decisions/ADR-020-local-supabase-hybrid-development.md).
