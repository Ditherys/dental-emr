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

The current implementation scope is controlled by [`docs/plans/001-foundation.md`](docs/plans/001-foundation.md).
