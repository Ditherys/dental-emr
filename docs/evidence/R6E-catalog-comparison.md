# Evidence — R6-E catalog-level equivalence, DEV vs TEST-01

**Date:** 2026-08-14
**Method:** schema-only `pg_dump` (client v18.6, installed locally via `scoop install postgresql`, no Docker) against each project's Session Pooler connection, scoped to the `public`, `private`, and `extensions` schemas only. Supabase-managed schemas (`auth`, `storage`, `realtime`, `supabase_migrations`, `graphql`, etc.) were excluded — they are platform-managed, not part of the application's committed schema, and not what R6-E certifies.
**Operator:** project owner obtained fresh one-time database passwords for both projects via the Supabase Dashboard (Database settings → generate new password); Claude Code ran the dumps and diff.
**Projects compared:** `dental-emr-dev` vs `dental-emr-test-01` (TEST-01 provenance — built from the 8-file baseline alone — is recorded in `docs/evidence/R6C-R6E-test01.md`).

Project references, keys, passwords, and tokens are deliberately absent from this
file. It records what was proven, not how to connect.

## Method detail

```
pg_dump --schema-only --no-owner --schema=public --schema=private --schema=extensions \
  -h <session pooler host> -p 5432 -U postgres.<project-ref> -d postgres -f <output>.sql
```

Both connections went through Supabase's **Session Pooler** (port 5432) rather
than each project's direct-connection host — the direct hostnames did not
resolve from the operator's network (consistent with IPv6-only direct
connections on newer Supabase projects), while the pooler is dual-stack. `PGSSLMODE=require`
was set for both.

**`supabase link` was never issued against either project, at any point.** The
CLI's link state was untouched throughout, so the migration-applying command
surface (`db push`, `migration up`, `migration repair`, `db reset`) remained
structurally incapable of targeting DEV during this comparison — the primary
risk `supabase/MIGRATION_FREEZE.md` warns about does not apply to this method.

## Result

Both dumps: **128,294 bytes**, identical.

`git diff --no-index` between the two dumps shows exactly two differing lines,
both from pg_dump 18's `\restrict` / `\unrestrict` security-token pair — a
random nonce pg_dump embeds per invocation to stop a dump file from being piped
into `psql` unintentionally. It is generated fresh on every run and carries no
schema information.

```diff
-\restrict Ai4SCsABahFw9X6jCafDM5Sc6SuXJd7dKNHXbrqa8fSlO2MXldTSuSncC8qb4y4
+\restrict 1fLFpNakkTZcysNDfAPZFep6qJMWzKpfX3JMGgH63JN25dilp72nTIzVPRAnHem
...
-\unrestrict Ai4SCsABahFw9X6jCafDM5Sc6SuXJd7dKNHXbrqa8fSlO2MXldTSuSncC8qb4y4
+\unrestrict 1fLFpNakkTZcysNDfAPZFep6qJMWzKpfX3JMGgH63JN25dilp72nTIzVPRAnHem
```

No other differences. Every `CREATE TABLE`, `CREATE FUNCTION`, `CREATE POLICY`,
index, constraint, and `GRANT` statement is byte-for-byte identical between DEV
and TEST-01 — including the `extensions` schema. DEV already carries `pgtap`
from the superseded migration chain (ADR-018 §4), so its presence in TEST-01
(installed by the explicit non-production provisioning step) was expected to
match rather than differ, and it did.

## What this proves, and what it does not

**Proves:** the 8-file baseline (`supabase/migrations/`) reconstructs a
`public`/`private`/`extensions` catalog identical to the one DEV currently
runs. Combined with R6-E's earlier suite/lint/type/advisor results
(`docs/evidence/R6C-R6E-test01.md`), this closes **H-1** (equivalence) from
`docs/PHASE1_ACCEPTANCE_REVIEW.md`.

**Does not prove:** that DEV's *migration history* (`supabase_migrations.schema_migrations`)
matches Git. That is **H-2 / R6-F**, still gated on **R6-D** (a statement-level
interrupted-replay proof on a fresh, disposable TEST-02 — not started). This
comparison contacted DEV read-only; no schema, data, or migration-history row
on DEV was read, written, or modified. The only change made to DEV as part of
this work was rotating its database password, at the operator's explicit
direction, after the operator's own initial attempts to supply it in this
session were unsuccessful.

## A deviation from the planned procedure, recorded honestly

The original plan (see conversation leading to this file) called for the
project owner to run both `pg_dump` invocations personally, in separate
PowerShell windows, so DEV's password would only ever exist in a window Claude
Code could not see. During execution the owner instead asked Claude Code to run
both sides directly, after several of the owner's own attempts failed on a
DNS/hostname mismatch and, separately, on password-propagation timing after a
reset. The owner explicitly authorized this deviation in-session. Both DEV and
TEST-01 passwords were consequently visible to Claude Code for the duration of
this task; per the owner's decision, they were not rotated again afterward.
This is recorded here rather than omitted, per this project's rule against
silently resolving deviations.

## Disposal

Raw dumps (`dev-schema.sql`, `test-schema.sql`) and the full diff were written
to `C:\Users\D_Reyes\.dental-emr\catalog-check\`, **outside the repository**,
and are not committed. This file is the durable record.
