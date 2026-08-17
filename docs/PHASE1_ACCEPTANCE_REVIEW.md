# Phase 1 acceptance review

**Reviewed at:** `21694ec` (H-5 implementation, current `HEAD` as of this re-review)
**Reviewer:** Claude Code, acting as implementing agent. **This is still not an independent review** — see H-8 below, which is the one finding this re-review cannot resolve by itself.
**Decision: PHASE 1 IS SUBSTANTIALLY COMPLETE. One process gate (H-8) and one verification gap (CI has not run against this work) remain open, both requiring the project owner, not further implementation.**

This supersedes the prior review at `1c92e8a`, which found 8 High findings, almost
all "evidence has never been produced." Every one of those is now produced. What
remains is not a defect and not missing work — it is that this session's ~20
commits (R6-D completion, R6-F execution, H-5 implementation) are still local
only, and that the independent-review requirement was satisfied by a same-model
fresh-context agent rather than a genuinely independent reviewer, at the project
owner's explicit, recorded direction.

## Method

Same as the prior review: assessed against `docs/plans/001-foundation.md`,
`docs/SECURITY_ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`,
`docs/FRONTEND_ARCHITECTURE.md`, the ADRs, actual Git history, and actual test
evidence — a command that ran and whose output was read, not a file that exists.

## Findings, re-assessed

### Critical

None, unchanged from the prior review.

### High

**H-1 — [Still resolved, unchanged.]** Catalog-level equivalence (DEV vs. TEST-01,
byte-for-byte identical schema-only `pg_dump`) — `docs/evidence/R6E-catalog-comparison.md`.
The project owner decided 2026-08-18 that this proof still covers the current
baseline (no migration file changed since), so no fresh re-run against a later
TEST project was required.

**H-2 — [RESOLVED 2026-08-18.]** DEV's migration history is reconciled: the 13
superseded versions marked `reverted`, the 8 baseline versions marked `applied`
via `supabase migration repair`, `migration list --linked` against DEV clean
(`local === remote` on every row). The migration freeze
(`supabase/MIGRATION_FREEZE.md`) is deleted per its own instructions. See
`docs/evidence/R6F-migration-history-reconciliation.md`. Migration 9 (H-5) was
pushed to DEV afterward through the now-normal `db push` workflow, and DEV's
history remains clean at 9/9.

**H-3 — [Still resolved at the database layer; R6-D adds the interrupted-replay
proof this review previously listed as blocked.]** R6-D now proves both
`--mode=file` and `--mode=statement`: the full statement-by-statement replay of
all 8 baseline files against a fresh TEST-02 produced **zero boundary invariant
violations**, and the live-authorization-probe (26/26 pgTAP assertions)
independently confirms no browser-reachable role ever holds more than the
approved privilege set, including mid-migration. Two real tooling bugs were
found and fixed in the process (an IPv6 connectivity issue, a pooler
multi-statement protocol limitation) — see `docs/AI_HANDOFF.md`'s R6-D
checkpoints. The browser-half Playwright gap this review previously listed is
unchanged from before (still resolved per the 2026-08-15 checkpoint, 54/54).

**H-4 — CI evidence is now stale relative to this session's work, not absent.**
`CI / Application verification` was green on `main` as of the last pushed
commit, but **this session's ~20 commits (all of R6-D's completion, R6-F,
H-5) are still local only — `git status` shows `main` 20 commits ahead of
`origin/main`.** CI has not executed against any of them. This is not a defect
in the work; it is simply that nothing has been pushed yet. `CI / Cloud TEST
database and E2E` no longer fails on the migration freeze (H-2 resolved it),
but still fails on the unconfigured `cloud-test` GitHub environment
(credentials/variables) — unchanged, a human action, not blocked on Phase 1
work.

**H-5 — [RESOLVED 2026-08-18.]** `update_branch`/`archive_branch` implemented:
migration 9 live on DEV, full TypeScript/UI layer (schema, client functions,
server actions, edit/archive dialogs), and a new pgTAP suite
(`supabase/tests/branch_lifecycle.test.sql`, 18/18 assertions) proving the real
authorization and business-rule behavior — cross-organization denial, missing-
permission denial, AAL2 requirement, a successful update reflected in the row
and an audit event, archiving setting `archived_at` and emitting an audit
event, refusing to edit an archived branch, refusing to double-archive, and
refusing to archive an organization's only remaining branch. Both declared
audit actions (`branch.updated`, `branch.archived`) are now reachable. See
`docs/evidence/H5-branch-lifecycle-verification.md`. Residual, non-blocking gap:
no Playwright E2E coverage for the edit/archive UI flows yet.

**H-6 — [Still resolved, unchanged.]** Manual responsive/accessibility pass
complete, `docs/evidence/TEST-01-responsive-accessibility-manual-qa-2026-08-15.md`.

**H-7 — [Still resolved, unchanged.]** Hosted Auth posture verified on both
projects, 14/14 passed.

**H-8 — Independent review is still not genuinely independent.** The prior
review named this "a process blocker that no amount of further implementation
resolves," and that remains literally true: R6-D's two tooling-fix commits
(`033754f`, `338c59c`) and their fixes (`afbb3a8`), and this session's H-5
implementation commit, have been reviewed only by a fresh-context Claude agent
(no shared conversation history with the implementing agent, but the same
underlying model) — **at the project owner's explicit direction, recorded
honestly in `docs/AI_HANDOFF.md`, as a deliberate substitute for the
originally-required Codex review, not as equivalent to it.** A single Codex
review did occur and pass cleanly on the *documentation* checkpoint `109646f`
(one Low finding, fixed) — but not on the security-relevant tooling code
itself, nor on the H-5 migration/RPC implementation. This finding stays open
as a matter of record. Whether it blocks Phase 2 in practice is the project
owner's call, already made once for R6-D/H-5; re-affirming it (or reversing it)
for future security-sensitive work is a standing decision, not a one-time
exception this review can retroactively grant.

### Medium

**M-1 through M-6 — unchanged from the prior review**, except:

**M-3 — Phase 1 now has one branch-scoped-adjacent write path.** `update_branch`/
`archive_branch` are organization-wide-permission gated, same as every other
Phase 1 mutation — this finding's underlying observation (no *branch-scoped*
write RPC exists yet) is unchanged, since H-5 didn't introduce one. Still
correct for what exists.

**M-4 — unchanged.** Local link state currently points at DEV (relinked after
H-5's TEST-02 work); `supabase/.temp/` was not removed as the documented
operator precaution suggests. Low practical risk now that the freeze itself no
longer exists to bypass.

### Low

**L-1 through L-4 — unchanged from the prior review.**

**L-5 (new) — TEST-02 (ref `plkjajlfnhsklmdloaut`) is still live.** Used for
both R6-D and H-5 verification; its evidence is fully captured in both cases.
Disposing it (or keeping it) is an open, low-stakes decision for the project
owner — see `docs/AI_HANDOFF.md`'s human actions list.

## Acceptance criteria — passed

All rows from the prior review, plus:

| Criterion | Evidence |
|---|---|
| Grant-last invariant holds under interrupted-replay (statement-level) | `docs/AI_HANDOFF.md` R6-D checkpoints — zero violations across the full 8-file statement-by-statement replay, two fresh TEST-02 cycles |
| DEV migration history reconciled with Git | `docs/evidence/R6F-migration-history-reconciliation.md` — 9/9 versions `local === remote` |
| Branch update/archive implemented and tested | `docs/evidence/H5-branch-lifecycle-verification.md` — 18/18 pgTAP assertions, full TS/UI layer, 290/290 unit tests |
| Migration privilege lint scales to a second grant-terminal migration | `npm run security:migrations`: 9 files, 2 grant-terminal migrations, 0 violations |

## Acceptance criteria — still open

| Criterion | Blocked by | Unblocked by |
|---|---|---|
| This session's work verified by CI | H-4 (stale, not absent) | Human: `git push` |
| `CI / Cloud TEST database and E2E` passes | Human action 1 in `docs/AI_HANDOFF.md` | Human: configure the `cloud-test` GitHub environment |
| Genuinely independent review of R6-D tooling and H-5 | H-8 | Human: run the CODEX REVIEW PROMPTs already printed in this session's transcript, or accept the fresh-agent review as sufficient (a decision, not a default) |
| M-5/M-6 production gates | Plan-gated, unchanged | Supabase plan upgrade / GitHub Advanced Security, at production time, not Phase 1 |
| TEST-02 disposition | L-5 | Human: dispose or keep, low stakes either way |

## Decision

**Phase 1's implementation and evidence are complete.** Every High finding from
the prior review that was "evidence has never been produced" now has that
evidence, produced and recorded. The two things left open are not
implementation gaps:

1. **This session's work has not been pushed**, so CI has not run against it.
   This is mechanical, not a defect — push, watch `CI / Application
   verification` pass, and this closes.
2. **H-8 (independent review) is satisfied only by a same-model fresh-context
   agent, not a genuinely independent reviewer**, for the R6-D tooling commits
   and the H-5 implementation. The project owner has already explicitly chosen
   this substitution once, in writing, with the limitation stated up front. It
   remains a standing choice to make consciously for future security-sensitive
   work, not a box this review can check on the project owner's behalf.

Whether that is sufficient to consider Phase 1 **accepted** — as opposed to
substantially complete pending those two items — is the project owner's call,
not this review's. This review's job is to state the facts precisely enough
that the call is an informed one: no cross-tenant exploit, no known defect, no
missing evidence anywhere else in the eight prior High findings; only the push
and the review-provenance question remain.

## Re-review trigger

Re-run this review after: this session's commits are pushed and
`CI / Application verification` has run against them; and, if the project
owner decides genuine independent review is still wanted for `033754f` /
`338c59c` / `afbb3a8` / the H-5 implementation commit, after that review
completes and any findings are addressed.
