# R6-D boundary invariant tooling — both modes executed and passing

**Both `--mode=file` and `--mode=statement` have passed cleanly against fresh,
empty Cloud TEST projects** (see `docs/AI_HANDOFF.md`'s current checkpoint for
the runs and the tooling bugs their first executions found and fixed —
two for file mode, two more for statement mode). It was originally authored
during R6-B, before any database contact.

**`--mode=statement`'s live-authorization-probe verification used a targeted
follow-up check, not one unbroken script invocation** — see the current
checkpoint in `docs/AI_HANDOFF.md` for exactly what ran and why (a tooling fix
was needed mid-run, and the script does not support resuming a partially
baselined project). The result is fully evidenced: zero boundary violations
across the entire statement-by-statement replay, and the live probe verified
passing (26/26 pgTAP assertions, `P1_TEST_PASS`, clean rollback).

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

### Step 0 — provision pgTAP first

`live-authorization-probe.sql` requires pgTAP. pgTAP is deliberately **not**
part of the canonical baseline (ADR-018), so it must be provisioned separately
against this exact disposable Cloud TEST project before the boundary invariant
run:

```powershell
npm run db:provision:test
```

`scripts/run-boundary-privilege-invariant.mjs` checks for pgTAP's presence
before applying any migration and fails closed with this same remedy if the
step above was skipped — but running it first avoids spending the time to
replay the whole baseline only to fail at the very end.

### Step 1 — the boundary invariant run

`scripts/run-boundary-privilege-invariant.mjs` orchestrates the run. It is gated
three ways and nothing in the repository satisfies those gates:

1. `--approved-r6d` on the command line;
2. `R6D_BOUNDARY_TEST_CONFIRMATION` set to the exact constant in the script;
3. the full pre-existing Cloud TEST target guard;
The historical R6 migration freeze was lifted at R6-F. The runner retains the
shared freeze guard so any future freeze file would still fail closed, but no
freeze acknowledgement is required now.

It is not part of `npm run verify`, not part of `npm run test:db`, and not
referenced by any CI job.

```powershell
# R6-D only, against a genuinely disposable Cloud TEST project.
$env:R6D_BOUNDARY_TEST_CONFIRMATION='I_UNDERSTAND_THIS_APPLIES_THE_BASELINE_TO_A_DISPOSABLE_CLOUD_TEST_PROJECT'
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

## If your network cannot complete `--linked` queries

`supabase db query --linked` can fail with `LegacyDbConfigIpv6Error` on a
network without IPv6 connectivity — observed in practice failing
mid-run (after a platform-baseline snapshot and an entire migration file's
worth of statement snapshots had already succeeded on the same network), so
the runner retries a few times automatically before giving up. Retry is only
attempted for read-only snapshots and the transactional (always-`ROLLBACK`)
live-authorization-probe; a schema-mutating migration statement or file never
auto-retries on this error — it fails closed on the first occurrence, since
the assumption that this specific error can only occur before a query reaches
Postgres is unverified against the Supabase CLI's own internals.

If it still cannot complete, set `R6D_DB_URL_OVERRIDE` to the disposable TEST
project's Session Pooler connection string (percent-encoded, IPv4-compatible)
before running the script. The runner refuses to use it unless its host and
username match the linked project's known connection shape (Session Pooler:
`postgres.<ref>@*.pooler.supabase.com`; direct: `postgres@db.<ref>.supabase.co`)
— not merely that the project ref appears somewhere in the string — so it
cannot silently redirect a boundary check, or a migration-applying statement,
at an unverified project. Never commit this value or paste it into chat/a
document; it is a live database credential.

### Multi-statement queries over the override: requires `psql`

`supabase db query --db-url` (the override's CLI path) cannot run a
multi-statement file at all — Postgres refuses a prepared statement
containing more than one command, and the CLI always issues `--db-url`
queries that way. Two call sites are inherently multi-statement: `--mode=file`'s
whole-migration-file replay, and the transactional `live-authorization-probe.sql`.
With an override set, both run via `psql` instead (its default script mode
uses the simple query protocol, which does support multiple statements) — so
using `R6D_DB_URL_OVERRIDE` requires `psql` on `PATH`. Without an override,
neither call site is affected; they run through `--linked` as usual.

## Known limitations

- **Both `--mode=file` and `--mode=statement` have run and passed** against
  fresh, empty Cloud TEST projects (see `docs/AI_HANDOFF.md`'s current
  checkpoint). Statement mode's catalog assumptions and pgTAP assertions have
  now been exercised for real, including the previously-unverified
  interrupted-mid-migration grace-window logic.
- **`--mode=statement` gives PostgreSQL's own default-privilege grants exactly
  one statement of grace.** ADR-017 §2 requires a revoke "adjacent to the
  CREATE" — the very next statement, since SQL has no atomic CREATE+REVOKE.
  PostgreSQL grants EXECUTE on every new function to PUBLIC at the instant of
  CREATE, so a snapshot taken right after that CREATE and before its own
  adjacent REVOKE always shows that grant; without the grace window, statement
  mode would report this expected transient on every function the baseline
  creates. `assertPreFinalStatementBoundary` in `scripts/boundary-privilege-
  invariant.mjs` accepts it for exactly one statement and reports a real
  violation if it is still present the statement after — i.e. it verifies
  "adjacent" rather than assuming it. Statement mode has executed against a
  real disposable database, and the multi-terminal behavior added with H-5 is
  covered by the independent review regression tests.
- `service_role` is not probed. ADR-017 §5 scopes the invariant to
  browser-reachable roles.
- Extension-owned objects are excluded from the snapshot and counted separately;
  they are governed by the approved-extension list, not by per-object revokes.
- R6-D proves boundary fail-closure. It does **not** prove the baseline is
  equivalent to the accepted DEV schema — that is R6-E, which completed
  separately before R6-F.
