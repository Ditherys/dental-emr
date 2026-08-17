# Evidence — H-5 branch update/archive verification

**Date:** 2026-08-18
**Migration:** `supabase/migrations/20260818010000_branch_update_and_archive.sql`
**Pushed to DEV:** via `npx supabase db push` (normal ongoing-development workflow,
not the R6 disposable-project ritual — the migration freeze was already lifted
by R6-F). `npx supabase migration list --linked` against DEV shows all 9
migrations with `local === remote`.

## Static verification

`npm run security:migrations`: 9 files checked, 2 grant-terminal migrations
recognized (the original baseline plus this one), invariant holds — no file
outside a registered grant-terminal migration grants anything, every
privilege-bearing object revokes PUBLIC/anon/authenticated adjacent to
creation.

## Runtime verification against TEST-02 (ref `plkjajlfnhsklmdloaut`)

DEV is excluded from pgTAP suite execution by this project's own guard
(`SUPABASE_TEST_PROJECT_ID` must differ from `SUPABASE_DEV_PROJECT_ID`), so
the new `supabase/tests/branch_lifecycle.test.sql` suite was run against the
still-live TEST-02 project from the R6-D checkpoint instead. TEST-02's
`supabase_migrations.schema_migrations` history was never populated by R6-D
(that tooling replays SQL directly, not via `db push`, so it never writes
history rows) — migration 9 was therefore applied directly via `psql`
(the same multi-statement technique already proven in R6-D's `338c59c`),
not `db push`, to avoid TEST-02's own history/schema mismatch.

`branch_lifecycle.test.sql` — 18/18 assertions pass, `P1_TEST_PASS`,
transaction rolled back cleanly:

- **A** — an authorized org-wide OWNER updates a branch; the row and a
  `branch.updated` audit event both reflect it.
- **B** — a different organization's owner is refused updating or archiving
  a branch that isn't theirs (`42501`, `not authorized to ...`) — not-found
  and not-authorized share one message, and the refusal writes nothing.
- **C** — a DENTIST (no `branch.manage`) is refused updating or archiving a
  branch in their *own* organization.
- **D** — an AAL1 session is refused both operations (`AAL2 required`) even
  for an otherwise-authorized owner.
- **E** — archiving a branch sets `status = 'archived'` and `archived_at`,
  and records a `branch.archived` audit event.
- **F** — an archived branch cannot be updated (`22023`,
  `cannot update an archived branch`).
- **G** — an already-archived branch cannot be archived again (`22023`,
  `branch is already archived`).
- **H** — an organization's only remaining non-archived branch cannot be
  archived (`22023`, `cannot archive the organization's only remaining
  branch`), and the refused attempt leaves it active.

Also re-ran `supabase/tests/schema.test.sql` against the same project as a
regression check (migration 9 is purely additive — new functions only, no
altered table/policy) — passes cleanly, `P1_TEST_PASS`.

## TypeScript/UI layer

`src/lib/branches/schema.ts` (`branchUpdateFormSchema`), `src/lib/branches/index.ts`
(`updateBranch`, `archiveBranch`, extended `BranchManagementError` codes),
`src/app/(emr)/settings/branches/actions.ts` (`updateBranchAction`,
`archiveBranchAction`), and new UI (`branch-edit-dialog.tsx`,
`branch-archive-dialog.tsx`, wired into `branch-list.tsx`'s desktop table and
mobile card views, hidden for already-archived branches).

290/290 unit tests (up from 265 before this session's work), lint, typecheck,
build, secret scan, and `npm audit` all pass. Types regenerated from DEV's
live schema (`npm run db:types`) after the push.

## Known residual gaps

- No Playwright E2E coverage added for the edit/archive UI flows yet (the
  design doc's implementation spec named this as a follow-up).
- This checkpoint's commit(s) have not yet received independent review
  (Codex or otherwise) — flag for whenever the project owner wants it, per
  the same standing practice as the R6-D tooling commits.
