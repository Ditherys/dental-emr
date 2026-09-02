# AI Handoff - Sync CLAUDE.md's phase header to actual project state

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Docs-only: correct CLAUDE.md's stale "Current Phase" section

### Bounded slice implemented

`CLAUDE.md`'s "Read Before Working" list and "Current Phase" section still read
`Phase 2 Patient Foundation — P2-01` and listed odontogram/billing as out of
scope. That was stale: `AGENTS.md` already carried the correct, current state
(`Odontogram integration — Local completion authorized`, per ADR-029), and the
repository has 24 plan documents and 30 ADRs on disk, most recently
`docs/plans/odontogram-integration-plan.md` and
`docs/plans/billing-ledger-provider-compensation-plan.md`. `CLAUDE.md` was
rewritten to match `AGENTS.md`'s phase section verbatim in substance: Phase 1
and Phase 2 formally accepted; billing B0-B11 and odontogram O0-O4 accepted
2026-08-28; O0 re-accepted and O1-O14 local completion authorized 2026-08-29
(ADR-029); Cloud TEST deferred, not waived; `db:reset:local` prohibited; no
production or real patient/provider use authorized until the hosted
database/E2E/responsive/advisor/security gates pass. The reading list now
points at the odontogram and billing plans and at ADR-028/029/030 instead of
only `docs/plans/002-patient-foundation.md`.

### Why

A user asked about the odontogram UI and, while investigating, it surfaced
that `CLAUDE.md` had not been updated as the project moved through phases 3
onward, while `AGENTS.md` had. Two instruction files disagreeing about the
authorized phase is a governance risk on its own (a future Claude session
could wrongly refuse authorized odontogram/billing work, or wrongly treat
unfinished work as accepted) and was corrected directly rather than left for
a separate task.

### Files changed

- `CLAUDE.md` — "Read Before Working" reading list and "Current Phase" section
  rewritten to match `AGENTS.md`.

No code, migration, test, or architecture document was touched.

### Commands run

None applicable — documentation-only change, no build/test/migration surface
affected.

### Known limitations / residual risk

- `AGENTS.md`'s own "Authoritative Project Documents" numbered list (item 6)
  still names only `docs/plans/002-patient-foundation.md` even though its
  "Current Phase" prose is current; it was left untouched since only
  `CLAUDE.md` was in scope for this change. Worth a follow-up pass so both
  files' reading lists, not just their phase prose, agree.
- This does not change any actual authorization — it only makes the written
  record match the authorization that ADR-029 already granted.

### Areas Codex should scrutinize

- That the new `CLAUDE.md` phase section does not overstate authorization
  beyond what ADR-029 and `AGENTS.md` actually grant (i.e., still local-only,
  still no production/real-patient authorization).
- Whether `AGENTS.md`'s stale reading-list item (`docs/plans/002-patient-foundation.md`
  as the only named plan) should be corrected in the same pass rather than
  deferred.

### Next bounded task

None. Awaiting further direction, or continuation of the previously authorized
Cloud TEST window described in prior handoffs.
