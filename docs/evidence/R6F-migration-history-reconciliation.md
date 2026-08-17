# Evidence — R6-F DEV migration-history reconciliation

**Date:** 2026-08-18
**Project:** `dental-emr-dev`, ref `hjcmnmigvzufhvamlnmy`, region `ap-southeast-1`
**Authority:** [ADR-017](../decisions/ADR-017-phase1-secure-migration-baseline.md) §"R6-F reconciliation requirement", [`supabase/MIGRATION_FREEZE.md`](../../supabase/MIGRATION_FREEZE.md)

Project references and connection details are deliberately absent from the
substantive record below beyond the ref itself (not a secret). No database
password, API key, or token was used for this reconciliation — `supabase
link`/`migration repair` operated via the authenticated CLI session's access
token, not a direct Postgres connection.

## Pre-reconciliation snapshot (read-only)

`npx supabase migration list --linked --output-format json`, run before any
repair command, against the ref above:

**Remote-only (13 rows — the superseded chain, about to be marked `reverted`):**

| Version | Superseded file (historical, deleted at R6-A) |
|---|---|
| `20260812050000` | `extensions_and_private_schema.sql` |
| `20260812050100` | `organizations_and_branches.sql` |
| `20260812050200` | `profiles_and_organization_members.sql` |
| `20260812050300` | `roles_and_permissions.sql` |
| `20260812050400` | `branch_memberships_and_member_roles.sql` |
| `20260812050500` | `audit_events.sql` |
| `20260812050600` | `workforce_invitations.sql` |
| `20260812050700` | `require_organization_scope_for_invitations.sql` |
| `20260812050800` | `foundation_rls_policies.sql` |
| `20260812050900` | `consolidate_foundation_rls_select_policies.sql` |
| `20260812051000` | `harden_foundation_admin_mutations.sql` |
| `20260812051100` | `enforce_authorization_delegation.sql` |
| `20260813010000` | `harden_audit_foundation.sql` |

**Local-only (8 rows — the baseline, about to be marked `applied`):**

`20260813020000`, `20260813020100`, `20260813020200`, `20260813020300`,
`20260813020400`, `20260813020500`, `20260813020600`, `20260813020700`
(`supabase/migrations/` — unchanged since R6-A).

This is an exact match against ADR-017's documented superseded-version table
(§ "History" / the 13-row table) and the 8-file baseline table — no
unexpected row, no missing row, on either side.

## Why no separate full-database backup

DEV is on Supabase's free plan: `npx supabase backups list --project-ref
hjcmnmigvzufhvamlnmy` reports `pitr_enabled: false, backups: []` — no
managed physical backup is available to fall back on. `migration repair`
touches only the `supabase_migrations.schema_migrations` bookkeeping table
(per ADR-017: "performs no schema or data change and is reversible by
restoring the recorded rows"), so the snapshot above **is** the safety net —
restoring DEV's migration history, if ever needed, means re-running
`migration repair` with the rows above marked `applied` and the 8 baseline
rows marked `reverted`. The project owner was asked and explicitly accepted
this in place of a full manual `pg_dump` backup, given `migration repair`'s
own scope.

## Reconciliation

Executed:

```
npx supabase migration repair --status reverted 20260812050000 20260812050100 20260812050200 20260812050300 20260812050400 20260812050500 20260812050600 20260812050700 20260812050800 20260812050900 20260812051000 20260812051100 20260813010000 --linked
npx supabase migration repair --status applied 20260813020000 20260813020100 20260813020200 20260813020300 20260813020400 20260813020500 20260813020600 20260813020700 --linked
```

## Post-reconciliation verification

Both repair commands reported success:

```
Repaired migration history: [20260812050000 ... 20260813010000] => reverted
Repaired migration history: [20260813020000 ... 20260813020700] => applied
```

`npx supabase migration list --linked --output-format json` immediately
after, against the same DEV project:

```json
{"migrations":[
  {"local":"20260813020000","remote":"20260813020000", ...},
  {"local":"20260813020100","remote":"20260813020100", ...},
  {"local":"20260813020200","remote":"20260813020200", ...},
  {"local":"20260813020300","remote":"20260813020300", ...},
  {"local":"20260813020400","remote":"20260813020400", ...},
  {"local":"20260813020500","remote":"20260813020500", ...},
  {"local":"20260813020600","remote":"20260813020600", ...},
  {"local":"20260813020700","remote":"20260813020700", ...}
]}
```

**DEV's migration history is now clean: exactly the 8 baseline versions,
`local === remote` on every row, no superseded version remaining, no drift.**
This satisfies `MIGRATION_FREEZE.md`'s lift condition 5 ("R6-F reconciliation
completed and `supabase migration list --linked` is clean"). No schema or
data on DEV was read, written, or modified by this reconciliation — only the
`supabase_migrations.schema_migrations` bookkeeping table, as designed.
`supabase/MIGRATION_FREEZE.md` is deleted in the same commit as this file, per
its own instructions.
