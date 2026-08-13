# R6-D boundary invariant tooling — AUTHORED, NOT EXECUTED

**Nothing in this directory has been run against any database.** It was authored
during R6-B so that R6-D adds only the remote execution, not the design.

R6-C (create a disposable Cloud TEST project) and R6-D (run these probes against
it) both require separate human approval. See
[ADR-017](../../../docs/decisions/ADR-017-phase1-secure-migration-baseline.md).

## What this proves, and what it cannot

The static lint (`npm run security:migrations`) reads SQL text. It proves the
migration files *say* the right thing. It cannot prove what PostgreSQL *does*
with them — default privileges, role inheritance, `CREATE OR REPLACE` ACL
retention, and Supabase's own project defaults all live outside the text.

This tooling closes that gap in two independent ways.

### 1. `boundary-privilege-snapshot.sql` — effective privilege inspection

Read-only. Returns one JSON row describing what `PUBLIC`, `anon`, and
`authenticated` can actually do across tables, columns, functions, schemas, and
sequences at the current boundary.

It asks PostgreSQL rather than reading ACL text, because an absent ACL is not an
absence of privilege: a `NULL` `proacl` means "EXECUTE TO PUBLIC". The privilege
type lists come from `acldefault()` rather than being hard-coded, so a newer
PostgreSQL that adds a privilege is covered without editing the file.

### 2. `live-authorization-probe.sql` — a real session, not a catalog

A transactional pgTAP suite that ends in `ROLLBACK`. It builds a synthetic
tenant, becomes `authenticated`, and attempts the administrative mutations the
superseded chain allowed.

**The synthetic actor is deliberately privileged.** It holds the system `OWNER`
role, so it carries `role.manage`, `user.manage`, `branch.manage`,
`organization.manage`, and `security.manage`. Under the superseded chain at
boundaries 9 and 10, this exact actor *would* have been permitted every
prohibited operation in the file, because those policies were gated on
`private.has_org_permission(...)`.

Four controls run first, and the run is void if any fails:

| Control | Without it |
|---|---|
| 1a — RLS returns the actor's own rows | An unbound session fails everything, proving nothing |
| 1b — the actor holds each management permission | A powerless user fails everything, proving nothing |
| 1c — the approved AAL2 RPC path succeeds | A broken fixture fails everything, proving nothing |
| 1d — the same RPC is refused at AAL1 | 1c might have succeeded with the gate absent |

## Running it, when R6-D is approved

`scripts/run-boundary-privilege-invariant.mjs` orchestrates the run. It is gated
four ways and nothing in the repository satisfies those gates:

1. `--approved-r6d` on the command line;
2. `R6D_BOUNDARY_TEST_CONFIRMATION` set to the exact constant in the script;
3. the full pre-existing Cloud TEST target guard;
4. the R6 migration freeze acknowledgement, scoped to `db-push`.

It is not part of `npm run verify`, not part of `npm run test:db`, and not
referenced by any CI job.

```powershell
# R6-D only, against a genuinely disposable Cloud TEST project.
$env:R6D_BOUNDARY_TEST_CONFIRMATION='I_UNDERSTAND_THIS_APPLIES_THE_BASELINE_TO_A_DISPOSABLE_CLOUD_TEST_PROJECT'
$env:MIGRATION_FREEZE_ACK='I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE'
$env:MIGRATION_FREEZE_ACK_COMMAND='db-push'
node scripts/run-boundary-privilege-invariant.mjs --approved-r6d --mode=file
```

`--mode=statement` snapshots after every individual statement instead of every
file. That is the interrupted-replay proof: it covers an interruption *inside* a
migration, not only between migrations, and so does not rely on any assumption
about migration transaction atomicity.

## The comparison is relative to a measured baseline

A hosted Supabase project already holds privileges nobody here granted. Rather
than guess at that set, the runner snapshots the project **before** applying any
baseline migration and treats that as the platform baseline:

- before the grant-terminal migration → effective privileges **equal** the
  platform baseline;
- at the grant-terminal migration → effective privileges equal the platform
  baseline **plus exactly** the approved set in `scripts/approved-final-grants.mjs`.

The target project must therefore be empty of the baseline when the run starts.
Pointing this at a project that already holds the schema measures a meaningless
"baseline" and the assertions become vacuous.

## Vacuity guards

A probe that silently returns nothing looks exactly like a perfectly fail-closed
database. `scripts/boundary-privilege-invariant.mjs` refuses that outcome:

- the probe must find both browser-reachable roles (`anon`, `authenticated`) —
  if they are missing, every `has_*_privilege` result is empty;
- the platform baseline must observe at least one privilege;
- the probe must examine at least as many tables, functions, and
  `SECURITY DEFINER` functions as the applied migrations create;
- its view must not shrink between boundaries;
- a missing or malformed snapshot is an error, never a clean boundary.

These decisions are unit-tested offline in
`scripts/boundary-privilege-invariant.test.mjs`.

## Known limitations

- **The SQL in this directory has never been executed.** It is reviewed authored
  work. Syntax, catalog assumptions, and pgTAP assertions are unverified until
  R6-D runs. Expect to correct it on first run.
- `service_role` is not probed. ADR-017 §5 scopes the invariant to
  browser-reachable roles.
- Extension-owned objects are excluded from the snapshot and counted separately;
  they are governed by the approved-extension list, not by per-object revokes.
- R6-D proves boundary fail-closure. It does **not** prove the baseline is
  equivalent to the accepted DEV schema — that is R6-E, and it remains
  outstanding.
