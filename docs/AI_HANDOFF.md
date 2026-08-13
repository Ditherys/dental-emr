# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** R6-B — automated enforcement of the ADR-017 grant-last invariant: a static migration privilege lint (enforced), plus dynamic boundary-invariant tooling (authored only)

**Implementing agent:** Claude Code (Codex still unavailable)

**Status:** Implemented and locally verified. **No remote database was contacted. R6-A's baseline equivalence remains unproven. Independent Codex review of both R6-A and R6-B is REQUIRED and still pending.**

## Context

R6-A replaced the thirteen superseded Phase 1 migrations with an eight-file grant-last secure baseline, closing the H2 intermediate-weaker-authorization window structurally. That invariant lived only in prose and reviewer discipline. R6-B makes it mechanical, so it cannot erode silently as Phase 2 domains arrive.

Two deliverables, with deliberately different status:

1. **Static lint — enforced today.** Offline, wired into `npm run verify` and the CI application job.
2. **Dynamic boundary tooling — authored, never executed.** R6-C/D remain approval-gated; only remote execution is left to add.

## What Changed

**Static lint**
- `scripts/migration-privilege-lint.mjs` — SQL statement splitter (line/nested-block comments, string literals, quoted identifiers, dollar-quoted bodies), privilege-statement parser, and the rule engine.
- `scripts/approved-final-grants.mjs` — the approved final privilege set as reviewable data: 30 entries, each with a reason (22 `authenticated`, 8 `service_role`, zero `anon`/`PUBLIC`), plus the approved-extension list.
- `scripts/run-migration-privilege-lint.mjs` — CLI; `npm run security:migrations`.
- `scripts/migration-privilege-lint.test.mjs` — 40 tests.
- `scripts/fixtures/migration-privilege-lint/` — 13 synthetic unsafe migrations + README.

**Dynamic R6-D tooling (authored only)**
- `supabase/verification/r6d/boundary-privilege-snapshot.sql` — effective-privilege probe for PUBLIC/anon/authenticated across tables, columns, functions, schemas, sequences.
- `supabase/verification/r6d/live-authorization-probe.sql` — transactional pgTAP probe with a deliberately privileged synthetic actor and four meaningfulness controls.
- `scripts/boundary-privilege-invariant.mjs` — assertion logic (no I/O), unit-tested offline.
- `scripts/run-boundary-privilege-invariant.mjs` — four-way-gated runner; `--mode=file` and `--mode=statement` (interrupted replay).
- `scripts/boundary-privilege-invariant.test.mjs` — 23 tests.
- `supabase/verification/r6d/README.md`.

**Freeze guard, integration, docs**
- `scripts/remote-database-test-guard.mjs` — the freeze acknowledgement is now **scoped to one named command** via `MIGRATION_FREEZE_ACK_COMMAND`, prints a conspicuous banner when used, and warns when a bypass token persists in the environment. Bypass strength was narrowed, not widened.
- `package.json` — `security:migrations`, added as the first step of `verify`.
- `.github/workflows/ci.yml` — "Verify migration privilege invariant" step in the application job.
- `docs/decisions/ADR-017-…` §7 (enforcement), R6-B marked complete, six added Codex review questions; `supabase/MIGRATION_FREEZE.md`; `supabase/README.md`.

## Security / Tenancy Design

**What the static lint refuses.** Not a keyword search. Rules cover: grants outside a registered grant-terminal migration; tables/functions/schemas/sequences created without an adjacent `REVOKE ALL` from PUBLIC/anon/authenticated; `ALTER DEFAULT PRIVILEGES` (ADR-017 §4); role-membership grants; `ON ALL … IN SCHEMA` wildcards; `WITH GRANT OPTION`; unqualified grant targets; privilege statements built at run time inside function bodies or `DO` blocks; `public` tables without RLS; functions without `set search_path = ''`.

**Terminal-migration allowlist.** Exact in both directions and column-precise. An extra privilege fails; a privilege the approved list records but the migration no longer grants also fails, because a stale allowlist is a false record of the boundary.

**Fail-closed.** Malformed SQL, unmodelled object classes, unparseable `GRANT` forms, empty migrations, and a renamed/deleted terminal migration are all violations. The checker never passes because it failed to look. Deliberate conservatism is documented in ADR-017 §7.1.

**Proven to catch, not merely to agree.** The fixtures include `GRANT INSERT ON public.roles TO authenticated` and an unrevoked `SECURITY DEFINER` function. They live outside `supabase/migrations/`, carry `FIXTURE_NOT_A_MIGRATION`, and a test asserts no active migration contains that marker.

**R6-D design (unexecuted).** Effective privileges, not ACL text — `has_*_privilege` for named roles, `aclexplode(coalesce(acl, acldefault(...)))` for PUBLIC, so a `NULL` `proacl` is correctly read as "EXECUTE TO PUBLIC". Compared against a platform baseline measured on the target project before any baseline migration, so no guess at Supabase defaults is baked in. Vacuity guards refuse a snapshot that found neither browser role, examined fewer objects than the applied migrations create, shrank between boundaries, or is missing/malformed. The live probe's synthetic actor holds the system `OWNER` role — exactly the actor the superseded chain would have permitted every prohibited operation — and four controls (identity bound, permissions genuinely held, approved RPC succeeds, AAL1 refused) must pass before any refusal counts as evidence.

## Database / Remote State

- **No remote database was contacted.** No `db push`, `--dry-run`, `migration list`, `migration repair`, `db reset`, remote SQL, MCP call, TEST creation, or DEV modification.
- **The migration freeze remains ACTIVE.** `supabase/MIGRATION_FREEZE.md` is unchanged in force; only its documentation of the now-scoped acknowledgement changed.
- **DEV history remains intentionally unreconciled** (13 superseded versions recorded, 8 baseline versions not). DEV's schema is correct and unchanged.
- **R6-C, R6-D, R6-E, R6-F all remain outstanding and separately approval-gated.**

## Verification Performed

- `npm run security:migrations` ✓ — 8 files, 232 statements, 93 GRANT/REVOKE statements, 1 terminal migration, 30 approved privileges, 0 violations.
- Parser cross-check against the R6-A record: 11 tables, 27 functions (21 `SECURITY DEFINER`, 27/27 with `set search_path = ''`), 11 policies — exact match, so the lint is inspecting the baseline rather than skipping it.
- `npm run verify` ✓ — migration lint, lint, typecheck, unit tests **188/188 across 21 files** (was 121/19: +40 migration lint, +23 boundary invariant, +5 freeze-guard, −1 freeze-guard test replaced by the scoped-acknowledgement tests), build (CI placeholder env), secretlint 0 findings, `npm audit --audit-level=high` 0 vulnerabilities.
- `git diff --check` ✓ (CRLF warnings are pre-existing Windows Git behaviour).

## Known Limitations / Open Items

- **The R6-D SQL has never been executed.** Syntax, catalog assumptions, `acldefault` usage, and pgTAP assertions are unverified authored work; expect corrections on first run.
- **R6-A equivalence to the accepted DEV schema is still unproven.** The static lint proves an invariant about the migration *path*; it says nothing about equivalence. That is R6-E.
- **The static lint is intentionally conservative.** Non-terminal migrations may contain no `GRANT` at all; `ALTER DEFAULT PRIVILEGES` is refused everywhere; a covering `REVOKE` must be `REVOKE ALL` naming the object explicitly; an unnamed multi-word-typed function parameter may not resolve and requires naming. Each fails loudly.
- **Phase 2 will need an allowlist entry.** Adding privileges means registering a new grant-terminal migration and its exact grants in `scripts/approved-final-grants.mjs`. That is the intended review gate, not an obstacle to work around.
- **The freeze guard still covers only the `npm run db:*` paths.** It cannot intercept a raw `npx supabase db push` typed at a shell, and no repository-level change can. The recommended operator precaution (removing local `supabase/.temp/` link state) stands.
- **`service_role` is out of scope** for both layers, per ADR-017 §5.
- **pgTAP in the canonical baseline remains an open decision** requiring human approval (ADR-017).
- **No independent review has occurred.** ADR-017 lists twelve verification questions, six of them added for R6-B.

## What Codex Should Scrutinize

1. Whether the statement splitter can be defeated — nested comments, `''` escapes, quoted identifiers, `$tag$` bodies, `$1` parameters, statements without trailing semicolons.
2. Whether the rule set covers the H2 class or merely the current files; whether each negative fixture fails for the stated reason.
3. Whether `scripts/approved-final-grants.mjs` matches `20260813020700_baseline_final_grants.sql` privilege by privilege and column by column.
4. Whether the R6-D SQL is correct, and whether the vacuity guards genuinely prevent a blind probe from reading as a clean result.
5. Whether the scoped freeze acknowledgement narrowed the bypass rather than widening it.
6. Whether this handoff and ADR-017 §7 overstate what R6-B proves.
