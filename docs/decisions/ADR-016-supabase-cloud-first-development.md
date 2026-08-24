# ADR-016 — Supabase Cloud-First Development; No Local Supabase Runtime

**Status:** Accepted historically; local-runtime prohibition superseded by [ADR-020](ADR-020-local-supabase-hybrid-development.md)
**Date:** 2026-08-12  
**Decision owner:** Project owner  
**Related:** `MASTER_PRODUCT_PLAN.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `SECURITY_ARCHITECTURE.md`, `plans/001-foundation.md`

> **Current rule:** ADR-020 requires a disposable, synthetic-only local Supabase
> verification loop for P2-01 through P2-11. This ADR remains authoritative for Git-managed
> migrations, hosted environment separation, guarded remote writes, MCP limits,
> and production protection.

## Context

The application uses Supabase for PostgreSQL and Auth. The project owner requires application data/storage infrastructure to be cloud-hosted and does not want a local Supabase/Docker database workflow.

The developer workstation is Windows + PowerShell. Next.js, source code, dependencies, build artifacts, and temporary tooling may live locally, but persistent application data must not.

Clinical/object files remain governed separately by ADR-005: Cloudflare R2 is canonical object storage, with Workers/Images used for derivatives.

## Decision

1. **Development uses a dedicated Supabase Cloud project**, initially named/described as `dental-emr-dev` or equivalent.
2. **No local Supabase runtime is part of the approved architecture.** Do not run `supabase start` or require Docker merely to host the project database/Auth stack.
3. **Git remains the schema source of truth.** All intentional application-schema changes are committed migration files.
4. Use the Supabase CLI in linked-project mode:
   - `supabase init`
   - `supabase login`
   - `supabase link --project-ref <DEV_PROJECT_REF>`
   - `supabase db push --dry-run`
   - `supabase db push`
   - migration-history/type-generation/lint commands against the linked/project-scoped remote environment where supported.
5. **Direct Dashboard schema edits are not the normal workflow** after migrations are established. Any diagnostic/manual remote change must be reconciled into migration history before continuing.
6. **Development data is synthetic only.** No real patient data is allowed in cloud development/test fixtures, screenshots, logs, prompts, or demos.
7. Automated destructive database/RLS tests should use a **dedicated disposable cloud test project/environment** when needed rather than the interactive development project or production.
8. `supabase db reset --linked` is allowed only for an explicitly verified disposable development/test project. It is destructive and must never target production.
9. Supabase MCP, if enabled, must be **project-scoped** to the designated development/test project. Prefer read-only access for inspection. MCP/direct SQL does not replace migration files.
10. Production receives its own Supabase Cloud project later, after security/privacy gates. Preview/staging/CI credentials must not point to production by default.
11. Supabase Storage is **not** the canonical clinical file store. Cloudflare R2 remains the project object-storage decision under ADR-005.

## Environment Model

```text
Developer workstation (Windows + PowerShell)
├── Next.js source/dev server
├── Git / npm / Codex / Claude
└── no persistent product database
          │
          ▼
Supabase Cloud DEV
├── PostgreSQL
├── Auth
└── synthetic data only

Dedicated Cloud TEST / Staging (when required)
├── migration/RLS/destructive test target
└── synthetic/de-identified data only

Production later
├── separate Supabase Cloud project
└── real patient data only after production gates

Object/file storage
└── Cloudflare R2 by environment (ADR-005)
```

## Consequences

### Benefits

- matches the owner's cloud-only infrastructure preference;
- removes the local Docker/Supabase runtime requirement;
- development behavior is exercised against the same managed platform class used later in staging/production;
- keeps persistent application data off the workstation;
- retains reproducible schema history through migrations in Git.

### Tradeoffs / risks

- development depends on internet connectivity and Supabase availability;
- remote operations have higher latency than a local database;
- destructive reset/testing requires stronger environment-target verification;
- shared cloud development databases can create test interference;
- some Supabase CLI testing workflows are primarily designed for a local stack, so remote database-test execution may require a dedicated test project plus application-level/RLS tests or a reviewed remote SQL test runner;
- cloud usage may incur plan/resource limits or cost.

## Guardrails

- Never paste database passwords, secret keys, personal access tokens, or production credentials into agent prompts or Git.
- Verify the linked Supabase project before any remote mutation.
- Use `db push --dry-run` before applying migrations.
- Keep production project references/credentials unavailable to routine development agents and preview environments.
- Never use real patient data in development/test projects.
- Do not silently reintroduce local Supabase/Docker. Reversing this decision requires an explicit architecture update/ADR.

## Revisit triggers

Revisit only if a concrete requirement shows cloud-only development is materially blocking security testing, CI isolation, cost, reliability, or offline development. Any change must preserve Git-managed migrations and environment isolation.
