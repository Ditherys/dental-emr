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

Database and authenticated browser tests require a dedicated synthetic
Supabase Cloud TEST project. Their strict target guards, fixture contract, and
commands are documented in [`supabase/tests/README.md`](supabase/tests/README.md)
and [`e2e/README.md`](e2e/README.md). Neither workflow starts Docker or a local
Supabase runtime.

The current implementation scope is controlled by [`docs/plans/001-foundation.md`](docs/plans/001-foundation.md).
