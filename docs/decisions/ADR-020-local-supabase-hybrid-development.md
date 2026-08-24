# ADR-020 — Optional local Supabase with mandatory Cloud TEST acceptance

**Status:** Accepted

**Date:** 2026-08-24

**Decision owner:** Project owner

**Supersedes in part:** [ADR-016](ADR-016-supabase-cloud-first-development.md)

**Related:** [ADR-017](ADR-017-phase1-secure-migration-baseline.md), [ADR-018](ADR-018-nonproduction-database-test-tooling.md), `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `SECURITY_ARCHITECTURE.md`, `plans/002-patient-foundation.md`

## Context

ADR-016 selected a cloud-only Supabase development workflow. That kept
persistent application data off developer workstations and exercised changes
against the managed platform, but every database and RLS feedback cycle now
depends on a remote project. The project owner has installed Docker Desktop,
WSL2, and the Supabase CLI and has explicitly requested a hybrid workflow after
acceptance of P2-02.

The objective is faster, isolated database feedback during P2-03 and later work
without making a developer laptop authoritative, weakening Cloud TEST gates, or
creating another source of schema truth.

The repository already contains `supabase/config.toml`, committed migrations,
non-production pgTAP provisioning, database tests, and an idempotent synthetic
seed. The change therefore does not require `supabase init` or a new schema
history.

## Options considered

### A. Keep the cloud-only workflow

This has the smallest architecture change and tests the managed platform on
every database cycle. It retains remote latency, internet dependence, shared
environment interference, and guarded-write setup for routine feedback.

### B. Make local Supabase the only development and acceptance database

This gives the fastest loop and strongest developer isolation. It does not prove
that migrations, RLS behavior, generated types, and platform configuration work
on the managed Supabase environment that will host the application. It would
also discard the existing Cloud TEST safety and evidence model.

### C. Use local Supabase for optional feedback and Cloud TEST for acceptance

This gives developers a disposable, isolated fast loop while retaining the
managed environment as the authoritative non-production acceptance gate. It
introduces two execution paths, so their responsibilities and drift checks must
be explicit.

## Decision

Adopt **option C**.

Local Supabase is an optional developer feedback environment. Cloud TEST remains
the mandatory database acceptance environment. A task may be developed without
the local stack, but it may not be accepted without the required guarded Cloud
TEST checks.

This decision supersedes only ADR-016's prohibition on a local Supabase runtime
and local Docker requirement. ADR-016's Git-authoritative migrations, hosted
environment separation, synthetic-data, credential, linked-project, MCP, and
production protections remain in force.

## Environment model

```text
Developer workstation (optional fast loop)
├── Next.js source/dev server
├── Docker Desktop + WSL2-backed local Supabase
├── disposable PostgreSQL/Auth services
├── committed migrations + non-production pgTAP provisioning
└── deterministic synthetic fixtures only
                 │
                 │ same Git checkpoint
                 ▼
Dedicated Supabase Cloud TEST (mandatory acceptance gate)
├── guarded migration preview/apply
├── non-production pgTAP provisioning
├── database/RLS/concurrency tests
├── hosted-schema type generation/check
└── synthetic test data only
                 │
                 ▼ after review and later production gates
Hosted DEV / staging / production
└── isolated projects; production receives no test tooling or fixtures

Canonical clinical object storage remains Cloudflare R2 under ADR-005.
```

## Local workflow contract

1. Local services are disposable. The supported reconstruction path is the
   committed migration chain followed by explicit non-production provisioning
   and the committed synthetic seed.
2. `supabase/config.toml` is the repository's local CLI configuration. Do not run
   `supabase init` over the existing project.
3. Local database commands must be explicit, PowerShell-compatible npm scripts.
   The intended interface is:
   - `db:start:local` — start the repository-local stack;
   - `db:stop:local` — stop it without touching remote projects;
   - `db:reset:local` — rebuild only the local database from migrations/seed;
   - `db:provision:local` — apply non-production database test tooling locally;
   - `test:db:local` — run the database suites against the loopback database.
4. Local mutating and test commands must fail closed unless the resolved database
   target is loopback/local. They must not use `--linked`, a hosted project
   reference, Cloud TEST credentials, or a production credential.
5. Local tooling must obtain runtime values from the local Supabase CLI where
   practical. Repository scripts must not commit generated local secrets or copy
   them into shared environment files.
6. Only synthetic fixtures are permitted. Real patient, clinical, financial, or
   operational data must never be imported into the local stack.
7. Local pgTAP remains environment tooling, not canonical application schema.
   It is installed from
   `supabase/provisioning/nonproduction/001_database_test_tooling.sql`, outside
   `supabase/migrations/`, preserving ADR-018's production-shaped baseline.
8. Local success is feedback, not acceptance evidence. A local pass cannot
   replace guarded Cloud TEST verification.

## Cloud acceptance contract

1. Existing guarded Cloud TEST commands and their target checks remain intact.
   Local scripts must not weaken, bypass, or share permissive branches with the
   remote guard.
2. `test:db` remains the existing Cloud TEST runner for compatibility with CI.
   A `test:db:cloud` alias may be added for clarity, but it must invoke the same
   guarded path.
3. Every database-bearing checkpoint must run its required migration, pgTAP,
   RLS/authorization, concurrency, and schema checks against the dedicated Cloud
   TEST project before acceptance.
4. Committed generated database types are produced or checked against the
   accepted hosted schema. Local type generation may be used as preview only and
   must not be the sole evidence for committed type changes.
5. Remote writes remain subject to verified project identity, explicit
   environment markers, confirmation values, migration-freeze rules where
   applicable, and the prohibition on production targets.

## Schema and drift rules

- Git migration files remain the only authoritative application-schema history.
- Dashboard SQL, local-only migration edits, MCP-only changes, and direct remote
  SQL side effects must not become sources of truth.
- A change that passes locally but fails on Cloud TEST is not accepted; the
  discrepancy must be diagnosed rather than bypassed.
- Local and Cloud TEST run the same committed migrations and database suites.
  Expected non-production differences, such as pgTAP, remain explicit.
- Local reset is permitted because the target is disposable and guarded as
  local. Linked reset/reseed remains prohibited unless separately authorized for
  an explicitly verified disposable cloud project under ADR-016.

## Security and privacy boundaries

- Docker volumes and local database files are development artifacts containing
  synthetic data only. They are not backup, staging, or production systems.
- No service-role key, hosted database password, access token, recovery code, or
  real patient content may be copied into local seeds, logs, screenshots,
  prompts, shell history, or Git.
- Local Auth identities are synthetic and isolated from hosted environments.
- RLS and application authorization remain mandatory locally and in Cloud TEST;
  local development mode must never disable RLS to unblock a task.
- Supabase MCP remains limited to explicitly designated hosted DEV/TEST projects
  and does not target the local stack unless a later reviewed need is recorded.
- Production remains inaccessible to routine development and AI tooling.

## Operational boundary

Docker Desktop and its WSL2 backend are prerequisites only for developers who
choose the local loop. They are not required for application users, hosted
deployments, or the existing Cloud TEST CI job. The local workflow is expected to
be run from Windows PowerShell in the repository worktree.

The architecture does not require product data to remain running locally between
sessions. Developers may stop or reset the stack at any time because Git and the
hosted acceptance environment are authoritative.

## Consequences

### Benefits

- faster migration, pgTAP, RLS, and negative-authorization feedback;
- isolated developer state and fewer collisions in a shared hosted project;
- repeatable destructive/reset testing without risking a linked cloud target;
- continued verification against the managed Supabase platform before
  acceptance;
- no new schema source of truth.

### Tradeoffs and risks

- two database paths require explicit commands and documentation;
- local and hosted Supabase versions or configuration can drift;
- Docker Desktop consumes workstation resources and may require a reboot or
  troubleshooting after installation;
- developers may mistakenly treat a local pass as completion unless checkpoint
  gates remain explicit;
- local synthetic database artifacts still require normal workstation security
  and must never be populated with real records.

## Required follow-up before P2-03 implementation

1. Update the authoritative architecture, database, security, Phase 2, agent, and
   database-test documentation to reflect this decision without removing the
   mandatory Cloud TEST gate.
2. Replace the prohibition comment in `supabase/config.toml` with the local
   safety contract and verify its settings against the installed CLI version.
3. Implement the explicit local commands and fail-closed local-target guard with
   unit tests.
4. Reuse the existing non-production provisioning SQL and database suites.
5. Validate a fresh local start/reset/provision/test cycle using synthetic data.
6. Re-run the existing application verification and Cloud TEST workflow to prove
   the new path did not weaken remote safety.
7. Record exact verification evidence in `docs/AI_HANDOFF.md` and obtain
   independent review before accepting the architecture/tooling checkpoint.
8. Only after this checkpoint is accepted should the P2-03 plan be rebased or
   cherry-picked onto its own branch and executed.

## Acceptance criteria

- Local start/reset/provision/test commands cannot target a hosted database.
- Cloud TEST target guards and mandatory acceptance checks remain unchanged or
  stronger.
- A fresh local database reconstructs from committed migrations, explicit
  non-production provisioning, and synthetic seed data.
- The same database suites pass locally and against Cloud TEST at the same Git
  checkpoint.
- Production-shaped migrations remain free of pgTAP and other test-only schema.
- No real data, hosted secrets, or production identifiers are introduced.
- Authoritative documents agree on the hybrid boundary.

## Revisit triggers

Revisit if local and hosted behavior cannot be kept equivalent, the local stack
materially increases security risk or maintenance cost, CI adopts an isolated
ephemeral Supabase stack, or Supabase changes the supported local architecture.
Any replacement must preserve Git-authoritative migrations, tenant/RLS testing,
synthetic-only development data, and a managed-platform acceptance gate.
