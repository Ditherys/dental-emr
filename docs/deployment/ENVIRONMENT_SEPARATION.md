# Environment Separation Runbook

This runbook implements P1-16 and ADR-020. It preserves distinct hosted data
boundaries while requiring a disposable local Supabase verification environment
for P2-01 through P2-11:

```text
developer workstation + local Supabase + local MinIO object storage
Supabase Cloud DEV
Vercel Preview/test target + Supabase Cloud TEST
future separately approved staging + separate Supabase staging project
Vercel Production + Supabase Cloud PRODUCTION + Cloudflare R2 (created later)
```

Local Supabase and Cloud TEST contain deterministic synthetic data only. Never
load production-derived or de-identified patient, clinical, financial, or
workforce data into either target. Cloud DEV also uses synthetic data only. A
future staging environment may use formally de-identified data only in a
separate project after documented approval and validation of the anonymization
controls; it must not share Cloud TEST data or credentials. Production may
contain real patient data only after the production gates in
`docs/SECURITY_ARCHITECTURE.md` are satisfied. Local object storage uses MinIO
under ADR-022; Cloudflare R2 is deferred to deployment readiness.

## Required application variables

| Variable | Browser-visible | Development | Preview / Cloud TEST | Production |
| --- | --- | --- | --- | --- |
| `APP_ENVIRONMENT` | No | `development` | `test` | `production` |
| `SUPABASE_PROJECT_ID` | No | `local` for the local stack, otherwise Cloud DEV project ref | Cloud TEST project ref | Cloud PRODUCTION project ref |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | local API origin, otherwise Cloud DEV URL | Cloud TEST URL | Cloud PRODUCTION URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | local key, otherwise Cloud DEV key | Cloud TEST key | Cloud PRODUCTION key |
| `APP_URL` | No | local origin | stable test origin | production origin |
| `SUPABASE_SECRET_KEY` | No | local secret for the local stack, otherwise Cloud DEV secret when required | Cloud TEST secret, only when required | production-only secret, configured later |
| `STORAGE_PROVIDER` | No | `s3` | `s3` | `s3` |
| `STORAGE_ENDPOINT` | No | `http://localhost:9000` (MinIO) | N/A (deferred to deployment readiness) | R2 endpoint, configured later |
| `STORAGE_BUCKET` | No | `dental-emr-local` | N/A (deferred) | production bucket, configured later |
| `STORAGE_ACCESS_KEY` | No | local MinIO key | N/A (deferred) | R2 access key, configured later |
| `STORAGE_SECRET_KEY` | No | local MinIO secret | N/A (deferred) | R2 secret key, configured later |

For hosted targets, `SUPABASE_PROJECT_ID` must match the project reference in
`NEXT_PUBLIC_SUPABASE_URL`. A local developer workstation uses the literal
project ID `local` and the exact loopback API origin. The publishable key is not
an authorization system; normal user access still requires server authorization
and RLS. The secret key bypasses RLS and must remain server-only.

## Vercel configuration

1. Enable **Automatically expose System Environment Variables** so builds and
   functions receive `VERCEL_ENV` and `VERCEL_TARGET_ENV`.
2. Create each variable at project scope for exactly one Vercel environment at
   a time. Do not select both Preview and Production for any Supabase credential
   or project identifier.
3. Assign only Cloud TEST values to Preview or a custom test environment.
   Custom Vercel targets are treated as `test` by the application guard.
4. A future staging deployment that is approved to use formally de-identified
   data must use its own Vercel target, Supabase project, credentials, and
   documented anonymization controls. It must not reuse Cloud TEST.
5. Mark `SUPABASE_SECRET_KEY` sensitive in Preview and Production. Omit it from
   Preview unless a server-only workflow that needs it is being validated.
6. Do not create or configure production Supabase/R2 credentials during Phase 1.
   When production hardening begins, add them to Vercel Production only. Cloudflare R2 is deferred to deployment readiness under ADR-022.
7. Redeploy after changing variables; existing deployments retain their prior
   environment values.

Vercel documents environment-specific variables and the system target values in
its [environment variable guide](https://vercel.com/docs/environment-variables)
and [system environment variable reference](https://vercel.com/docs/environment-variables/system-environment-variables).

## Build-time guard

`next.config.ts` validates the environment before a Next.js build can complete:

- local/development configuration must identify itself as `development`;
- a Vercel Preview or custom test target must use `APP_ENVIRONMENT=test`;
- Vercel Production must use `APP_ENVIRONMENT=production`;
- production configuration is rejected outside verified Vercel Production;
- a non-Vercel development workstation may use only the exact local Supabase
  loopback API origin with `SUPABASE_PROJECT_ID=local`; all hosted targets must
  use the exact HTTPS Cloud origin for `SUPABASE_PROJECT_ID`; and
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
