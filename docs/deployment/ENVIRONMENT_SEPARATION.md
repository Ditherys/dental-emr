# Environment Separation Runbook

This runbook implements P1-16. It preserves three distinct cloud data
boundaries and does not authorize a local Supabase runtime:

```text
developer workstation + Supabase Cloud DEV
Vercel Preview/Staging + Supabase Cloud TEST
Vercel Production + Supabase Cloud PRODUCTION (created later)
```

Development and test/staging contain synthetic or formally de-identified data
only. Production may contain real patient data only after the production gates
in `docs/SECURITY_ARCHITECTURE.md` are satisfied. File/media work must later use
separate non-production and production R2 boundaries under ADR-005.

## Required application variables

| Variable | Browser-visible | Development | Preview / staging | Production |
| --- | --- | --- | --- | --- |
| `APP_ENVIRONMENT` | No | `development` | `test` | `production` |
| `SUPABASE_PROJECT_ID` | No | Cloud DEV project ref | Cloud TEST project ref | Cloud PRODUCTION project ref |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Cloud DEV URL | Cloud TEST URL | Cloud PRODUCTION URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Cloud DEV key | Cloud TEST key | Cloud PRODUCTION key |
| `APP_URL` | No | local origin | stable test/staging origin | production origin |
| `SUPABASE_SECRET_KEY` | No | Cloud DEV secret, only when required | Cloud TEST secret, only when required | production-only secret, configured later |

`SUPABASE_PROJECT_ID` must match the project reference in
`NEXT_PUBLIC_SUPABASE_URL`. The publishable key is not an authorization system;
normal user access still requires server authorization and RLS. The secret key
bypasses RLS and must remain server-only.

## Vercel configuration

1. Enable **Automatically expose System Environment Variables** so builds and
   functions receive `VERCEL_ENV` and `VERCEL_TARGET_ENV`.
2. Create each variable at project scope for exactly one Vercel environment at
   a time. Do not select both Preview and Production for any Supabase credential
   or project identifier.
3. Assign only Cloud TEST values to Preview or a custom staging environment.
   Custom Vercel targets are treated as `test` by the application guard.
4. Mark `SUPABASE_SECRET_KEY` sensitive in Preview and Production. Omit it from
   Preview unless a server-only workflow that needs it is being validated.
5. Do not create or configure production Supabase/R2 credentials during Phase 1.
   When production hardening begins, add them to Vercel Production only.
6. Redeploy after changing variables; existing deployments retain their prior
   environment values.

Vercel documents environment-specific variables and the system target values in
its [environment variable guide](https://vercel.com/docs/environment-variables)
and [system environment variable reference](https://vercel.com/docs/environment-variables/system-environment-variables).

## Build-time guard

`next.config.ts` validates the environment before a Next.js build can complete:

- local/development configuration must identify itself as `development`;
- a Vercel Preview or custom target must use `APP_ENVIRONMENT=test`;
- Vercel Production must use `APP_ENVIRONMENT=production`;
- production configuration is rejected outside verified Vercel Production;
- the Supabase URL must be the exact HTTPS Cloud origin for
  `SUPABASE_PROJECT_ID`; and
- a Vercel deployment that exposes `VERCEL=1` but omits its target variables is
  rejected.

The server-only admin client repeats this validation at runtime before using the
RLS-bypassing secret. The controlled first-owner bootstrap also binds the URL to
the explicit project reference and refuses production during Phase 1.

This guard reduces accidental cross-environment wiring. It does not make a
production credential safe to share: Vercel scopes and access controls remain
the primary secret boundary.

## Safe verification

Before a Preview deployment, inspect variable names and scopes without printing
their values:

```powershell
vercel env ls preview
vercel env ls production
```

Confirm that Preview has the five baseline configuration names with TEST values,
and add only a TEST `SUPABASE_SECRET_KEY` if the controlled server workflow is
needed there. Confirm that no production credential is assigned to Preview and
that a fresh Preview build passes. A deliberate `APP_ENVIRONMENT=production`
Preview build must fail before deployment. Do not pull production secrets onto a
developer workstation merely to test this guard.
