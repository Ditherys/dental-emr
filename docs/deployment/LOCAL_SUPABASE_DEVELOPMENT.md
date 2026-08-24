# Optional local Supabase development

**Authority:** [ADR-020](../decisions/ADR-020-local-supabase-hybrid-development.md)

This is a disposable, synthetic-only feedback environment. It is not DEV,
Cloud TEST, staging, production, or a backup. Git migrations are authoritative,
and Cloud TEST remains mandatory at Phase 2 closeout and before production.

## Prerequisites on Windows

- WSL2 installed; `wsl --status` reports default version 2.
- Docker Desktop installed and using the WSL2 engine.
- Docker Desktop opened and the engine running before a local stack command.
- Locked dependencies installed with `npm ci`; the repository CLI is 2.113.0.

The first Docker Desktop launch may show license/onboarding screens. Complete
those manually. Do not enable Kubernetes; this project does not require it.

## Start and reconstruct

Run from the active feature worktree in PowerShell:

```powershell
npm run db:start:local
npm run db:reset:local
npm run db:provision:local
npm run test:db:local
```

`db:reset:local` replays every committed migration and `supabase/seed.sql`.
Provisioning then installs pgTAP from the non-production provisioning file.
Reset removes pgTAP, so provision it again after every reset.

Only one local stack with project ID `dental-emr` and the committed fixed ports
can run at a time. Stop a stack before switching worktrees, then start and reset
from the worktree whose migration state you intend to test.

## Stop

```powershell
npm run db:stop:local
```

Stopping preserves the local Docker volume. The volume is never authoritative;
use `db:reset:local` whenever exact reconstruction matters. Do not use
`supabase stop --all` because it can affect unrelated local projects.

## Application environment

Use `npx supabase status -o env` to view local runtime variables. Copy only the
needed local URL and publishable key into the ignored `.env.local`; never commit
the output. Do not copy a hosted secret key, database password, or project
reference into the local workflow.

## Phase 2 closeout hosted acceptance

For P2-01 through P2-11, local verification plus dedicated review is the
checkpoint gate. At P2-12 closeout and before production, run the guarded
Cloud TEST workflow manually from GitHub Actions against the final branch
commit, then use the guarded commands documented in
[`supabase/tests/README.md`](../../supabase/tests/README.md):

```powershell
npm run ci:test-target
npm run test:db:cloud
npm run db:types:check:test
npm run db:lint:test
npm run db:advisors:test
```

## Stop conditions

Stop instead of improvising if a local command mentions `--linked`, requests a
hosted database password, targets a non-loopback URL, encounters real patient
data, or requires disabling RLS. Never run a linked reset/reseed from this
runbook.
