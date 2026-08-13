# Synthetic migration privilege lint fixtures

**These files are deliberately unsafe test input. They are NOT migrations.**

Every file here carries the marker `FIXTURE_NOT_A_MIGRATION`. They live outside
`supabase/migrations/`, are never read by the Supabase CLI, are never applied to
any database, and must never be copied into the active migration chain.
`migration-privilege-lint.test.mjs` asserts that no active migration file
contains the marker.

They exist so the R6-B static lint is proven to **catch** the H2 class of defect,
rather than merely proven to agree with today's migration files.

## Fixture world

`safe-objects.sql` and `safe-final-grants.sql` compose a minimal but complete
grant-last set: a private schema, one Data API table with RLS, one
`SECURITY DEFINER` helper, and a terminal migration that grants exactly one
table `SELECT`, one column-scoped `UPDATE`, and one function `EXECUTE`.

Each `violation-*.sql` file is a small middle migration inserted between the two.
Each `final-violation-*.sql` file replaces the terminal migration. Each is
written to trigger exactly one rule, so a test failure names the rule that broke.

| File | Rule it must trigger |
|---|---|
| `violation-pre-final-table-dml.sql` | `grant-outside-terminal-migration` |
| `violation-security-definer-public-execute.sql` | `security-definer-not-fail-closed` |
| `violation-missing-search-path.sql` | `function-search-path` |
| `violation-table-not-fail-closed.sql` | `creation-not-fail-closed` |
| `violation-missing-rls.sql` | `public-table-without-rls` |
| `violation-role-membership.sql` | `role-membership-grant` |
| `violation-default-privileges.sql` | `alter-default-privileges` |
| `violation-dynamic-grant.sql` | `dynamic-privilege-statement` |
| `violation-unterminated-body.sql` | `parse-error` |
| `final-violation-extra-grant.sql` | `unapproved-grant` |
| `final-violation-wildcard-grant.sql` | `unapproved-grant` (wildcard bypass) |
| `final-violation-widened-columns.sql` | `unapproved-grant` + `missing-approved-grant` |
| `final-violation-dropped-grant.sql` | `missing-approved-grant` |
