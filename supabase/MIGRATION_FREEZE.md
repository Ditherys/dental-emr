# MIGRATION FREEZE — ACTIVE

**Status:** ACTIVE
**In force since:** R6-A (Phase 1 secure migration baseline authored)
**Lifts at:** successful R6-F reconciliation
**Authority:** [ADR-017](../docs/decisions/ADR-017-phase1-secure-migration-baseline.md)

> While this file exists, migration-applying commands are frozen. Deleting this
> file lifts a security control. Do not delete it outside the approved R6-F
> procedure.

## Why the freeze exists

R6-A replaced the thirteen superseded Phase 1 migration files with an eight-file
grant-last secure baseline. Git now describes the schema differently from the way
the linked Supabase Cloud DEV project's `supabase_migrations.schema_migrations`
table records it.

**This divergence is intentional and temporary.** It is not drift, and it must
not be "fixed" by pushing.

- DEV holds the thirteen superseded versions and none of the eight baseline versions.
- DEV's **schema is correct and unchanged**. It already sits at the accepted hardened final state.
- R6-A contacted no database. No schema, data, or migration history was modified.

Running `supabase db push` against DEV in this state would attempt to apply the
eight baseline files onto a database that already contains every object they
create. That would fail partway through at best, and partially apply at worst.

## Frozen against DEV until R6-F

Do **not** run any of the following against the linked DEV project:

- `supabase db push` (including `--dry-run` as a prelude to pushing)
- `supabase migration up`
- `supabase migration repair`
- `supabase db reset`
- any schema-changing SQL
- any migration deployment

Only the explicitly approved R6-F reconciliation procedure may change DEV
migration history, and only after R6-C/D/E have proven the baseline equivalent to
the accepted schema on a disposable Cloud TEST project.

## What is still allowed

- All local and static work: lint, typecheck, unit tests, build, secret scanning.
- Reading and reviewing migration files.
- The approved R6-C/D/E work against a **disposable Cloud TEST project**, once
  that work has been approved. Those steps require `MIGRATION_FREEZE_ACK` (below)
  in addition to every pre-existing Cloud TEST target check.

## Mechanical fail-safe

`scripts/remote-database-test-guard.mjs` refuses the migration-applying commands
in the CI allowlist (`db-push`, `db-push-dry`, `db-seed`,
`db-provision-test-tooling`) while this file exists, unless the operator sets
**both** of the following:

```powershell
$env:MIGRATION_FREEZE_ACK='I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE'
$env:MIGRATION_FREEZE_ACK_COMMAND='db-push'   # the exact command being run
```

The acknowledgement is **scoped to one named command** (R6-B). A token left
exported after an approved `db-push-dry` does not authorize a later `db-push`;
the second variable must be changed deliberately for each step. Whenever the
bypass is used the guard prints a conspicuous banner naming the command, and
whenever a `MIGRATION_FREEZE_ACK` value is found in the environment for a command
that does not need one, the guard warns that a bypass token is persisting and
should be cleared:

```powershell
Remove-Item Env:\MIGRATION_FREEZE_ACK, Env:\MIGRATION_FREEZE_ACK_COMMAND
```

That acknowledgement does **not** weaken any existing control. The pre-existing
Cloud TEST target guard still applies in full: `APP_ENVIRONMENT` must be `test`,
`SUPABASE_PROJECT_ID` must equal `SUPABASE_TEST_PROJECT_ID`, the linked project
must match it, `SUPABASE_DEV_PROJECT_ID` must be **set** (R6-C1 — it is no longer
optional, so its absence can no longer make the next check pass vacuously), the
TEST project must differ from both `SUPABASE_DEV_PROJECT_ID` and
`SUPABASE_PRODUCTION_PROJECT_ID`, and `DATABASE_TEST_CONFIRMATION` must be set.
The acknowledgement is an additional gate layered on top, so an accidental
DEV-targeted push is refused twice.

The same scoped acknowledgement is required by the R6-D boundary invariant runner
(`scripts/run-boundary-privilege-invariant.mjs`), which additionally requires
`--approved-r6d` and `R6D_BOUNDARY_TEST_CONFIRMATION`. Nothing in the repository
satisfies those gates today.

### Known limitation

This guard covers the `npm run db:*` script paths. It **cannot** intercept a raw
`npx supabase db push` typed directly at a shell. No repository-level change can.

Recommended additional operator precaution for the duration of the freeze: remove
the local Supabase CLI link state so any migration command must be re-linked
deliberately first.

```powershell
Remove-Item -Recurse -Force supabase/.temp
```

`supabase/.temp/` is gitignored local state, not repository content. Removing it
changes nothing in Git and contacts no database; it only forces an explicit
`supabase link` before any command can target a project.

## Lifting the freeze

The freeze lifts only when all of the following are true:

1. R6-C created a disposable Cloud TEST project from the baseline alone.
2. R6-D proved that no baseline boundary grants `PUBLIC`/`anon`/`authenticated`
   any direct administrative table-write capability, including under a controlled
   interrupted replay.
3. R6-E proved schema equivalence between the baseline and DEV using cloud-safe
   mechanisms only, with no local Supabase runtime or Docker requirement.
4. DEV backups and a snapshot of the thirteen `schema_migrations` rows were taken.
5. R6-F reconciliation completed and `supabase migration list --linked` is clean.

Delete this file as the final step of R6-F, in the same commit that records the
reconciliation.
