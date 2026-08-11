# Dental EMR

Next.js application foundation for the Dental EMR & Practice Management Platform.

## Development

Install the locked dependency tree and start the development server:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the public values for
the designated non-production Supabase project. Never put a Supabase secret key
in a `NEXT_PUBLIC_*` variable. Local environment files remain ignored by Git.

Open [http://localhost:3000](http://localhost:3000).

The current implementation scope is controlled by [`docs/plans/001-foundation.md`](docs/plans/001-foundation.md).
