# Task 7 report — O8 dentist payments and installment expectations

Implemented a forward-only local migration for tenant-scoped procedure installment schedules and append-only ordered expectation items. These rows contain no collected amount or balance; allocation/charge ledger projections remain authoritative.

The application/service boundary accepts only decimal centavo strings and calls the narrow schedule RPC. `record_payment` is redefined forward-only so an actor holding DENTIST also needs clinical read access at the active receiving branch; `received_by` remains derived from `auth.uid()`.

The dialog labels expectations separately from actual allocations and submits a centavo-string row for any procedure case. Terminal grants are registered in the privilege allowlist and the schedule pgTAP suite is registered with the local/remote guard.

Verification passed: focused billing/action/dialog Vitest (53 tests), guard registry Vitest (30 tests), TypeScript, lint, migration privilege lint, and `git diff --check`.

`npm run test:db:local` was attempted. It passed all suites through `treatment_plan_rpcs.test.sql` but stopped at the pre-existing `treatment_plans.test.sql` result check before reaching the newly registered schedule suite; this is a residual verification blocker, not a passing pgTAP claim.
