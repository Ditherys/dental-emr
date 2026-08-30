# Task 6 — responsive shell and paired-summary review evidence

Date: 2026-08-30

Commit: `017468d` (`test: cover responsive shell and paired summaries`)

## Scope completed

- Added the `@responsive @shell` Playwright contract that checks branch context
  and account-menu placement in the persistent desktop sidebar, including its
  collapsed state, and in compact navigation's drawer.
- Added the bounded paired-summary geometry contract for Dashboard
  (`Appointments`) and Finance (`Production`), including overflow checks.
- Updated `docs/AI_HANDOFF.md` with the Task 1–6 checkpoint sequence, local
  evidence, source-audit conclusion, and outstanding Cloud TEST gate.

## Commands and outcomes

| Command | Outcome |
| --- | --- |
| `npm run test:e2e:list` | Initial unconfigured invocation refused before discovery: `APP_ENVIRONMENT` is absent. This was an expected target guard, with no browser or remote contact. |
| `npm run test:e2e:list` with process-local synthetic discovery values | PASS — 80 tests in five files, including both new contracts across their intended matrix projects. No browser was launched and no hosted service was contacted. |
| `rg -n "justify-between|text-right|lg:grid-cols-4|data-kpi-grid|<dl" "src/app/(emr)" "src/components"` | Reviewed every result. Dashboard/finance short-fact violations are absent; remaining results are local fact groups, tables/ledgers/schedules, headings/actions, public/out-of-scope UI, or unaccepted odontogram/periodontal work. No new in-scope violation found. |
| Focused six-file Vitest command from Task 6 | PASS — 6 files, 23 tests. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run test:unit` | PASS. |
| `npm run build` | PASS. The first invocation began compilation but did not return a terminal result and briefly left Next's build lock; after the lock cleared, a fresh invocation completed successfully. |
| `git diff --check` | PASS. |

## Scope/privacy review

- Implementation diff is limited to `e2e/responsive-accessibility.spec.ts` and
  `docs/AI_HANDOFF.md`.
- No server action, database, authorization, RLS, branch-model, financial-formula,
  analytics-formula, dependency, or current odontogram change was made.
- No secret, patient content, presigned URL, token, or production identifier
  appears in the Task 6 diff.

## Concerns and remaining gates

- Authenticated Cloud TEST E2E execution was not authorized and was not run;
  visual/runtime browser verification for the responsive matrix remains
  mandatory before release.
- The E2E discovery command needs valid test-target variables even though
  `--list` itself does not execute tests. Its target validation was satisfied
  only with process-local synthetic placeholders; no configuration file or
  credential was changed.
- The shell contract should receive independent review for duplicate landmark/
  control exposure, keyboard reachability across expanded/collapsed/drawer
  compositions, long branch/account labels, and the exact 1280px breakpoint.

## 2026-08-30 review-fix patch — RED/GREEN evidence

### Scope

- Fixed the mobile drawer/account interaction so activating `Account & security`
  closes the open sheet instead of leaving the drawer focus trap behind.
- Added local component keyboard coverage for branch/account controls in the
  expanded sidebar, collapsed rail, and compact drawer.
- Added long-name discoverability for expanded shell/drawer organization
  context and branch-menu options without changing branch derivation,
  authorization, or tenant semantics.
- Authored responsive Playwright assertions for those keyboard shell contracts
  and listed them locally only; Cloud TEST browser execution remains unrun.

### RED

| Command | Outcome |
| --- | --- |
| `npx vitest run "src/components/layout/mobile-navigation.test.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx" "src/components/layout/shell-layout.test.tsx"` | Initial failing regression run behaved as expected after selector cleanup: 4 failures proving the missing fixes. The drawer stayed open after `Account & security`, the expanded shell/drawer organization text still used `truncate`, and long branch names had no discoverable title/wrapping. |

### GREEN

| Command | Outcome |
| --- | --- |
| `npx vitest run "src/components/layout/mobile-navigation.test.tsx" "src/components/layout/branch-context.test.tsx" "src/components/layout/user-menu.test.tsx" "src/components/layout/shell-layout.test.tsx"` | PASS — 4 files, 24 tests. Covers keyboard open/visible menu/Escape/focus return for sidebar, rail, and drawer controls; verifies drawer close on account navigation; verifies long-name discoverability in shell/drawer/menu contexts. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run test:e2e:list` with process-local synthetic TEST placeholders only | First rerun still refused until `SUPABASE_SECRET_KEY` was also supplied, proving the admin-harness guard fires at import time before any browser work. Second rerun PASSed and listed 80 tests in 5 files, including the updated `@responsive @shell branch and account follow the active shell composition` contract across the intended desktop/iPad/phone matrix. No Cloud TEST browser session was started. |
| `git diff --check` | PASS. Git reported only local LF→CRLF working-tree warnings; no whitespace or patch-format errors. |

### Files changed for this patch

- `src/components/layout/mobile-navigation.tsx`
- `src/components/layout/mobile-navigation.test.tsx`
- `src/components/layout/user-menu.tsx`
- `src/components/layout/user-menu.test.tsx`
- `src/components/layout/branch-selector.tsx`
- `src/components/layout/branch-context.test.tsx`
- `src/components/layout/shell-layout.tsx`
- `src/components/layout/shell-layout.test.tsx`
- `e2e/responsive-accessibility.spec.ts`

### Bounded conclusion

- No database, RLS, branch authorization, tenant selection, sign-out, or
  odontogram behavior changed.
- No dependency changes were made.
- Cloud TEST execution, hosted responsive verification, and independent review
  remain required before release acceptance.

## 2026-08-30 topbar keyboard coverage follow-up

### Scope

- Added focused component regression coverage for `BranchSelector
  presentation="topbar"` and `UserMenu presentation="topbar"`.
- Each contract focuses the topbar trigger, opens with Enter, verifies the
  available menu items, closes with Escape, and verifies focus returns to the
  trigger.
- No production component, authorization, branch-selection, or sign-out
  semantics changed; no dependency was added.

### RED/GREEN evidence

The pre-change focused suite was already green (2 files / 16 tests), so a RED
failure could not be demonstrated: the existing Radix dropdown implementation
already satisfied the newly specified topbar keyboard behavior. The new tests
were then added as regression contracts.

| Command | Outcome |
| --- | --- |
| `npx vitest run src/components/layout/branch-context.test.tsx src/components/layout/user-menu.test.tsx` (pre-change) | PASS — 2 files, 16 tests; no RED because behavior already passed. |
| `npx vitest run src/components/layout/branch-context.test.tsx src/components/layout/user-menu.test.tsx` (post-change) | PASS — 2 files, 18 tests. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |

### Files changed

- `src/components/layout/branch-context.test.tsx`
- `src/components/layout/user-menu.test.tsx`
# Task 6 Report

Date: 2026-08-30

Implemented the O5 provider/idempotency boundary with forward-only local
migrations. Browser inputs no longer carry treating-provider IDs for current
bridge/implant recordings; the new `v3` RPCs derive an active linked provider
from `auth.uid()` and the active acting branch. New direct-treatment and
procedure-follow-up RPCs are SECURITY DEFINER with empty search paths, derive
tenant and actor server-side, preserve append-only procedure-case events, and
use actor-scoped idempotency rows. The terminal grant registry lists the exact
authenticated-only signatures; no service-role or base-table grants were added.

Verification:

- Focused odontogram service/action tests: 26 passed.
- Local pgTAP additions passed within `npm run test:db:local`.
- `npm run security:migrations` passed.
- `npm run typecheck` passed after extending the shared safe action-code union.
- `git diff --check` passed.

The full local database runner still stops at the pre-existing
`supabase/tests/treatment_plans.test.sql` sentinel failure after all Task 6
suites have passed; no Task 6 migration or test changes that suite.

Review repair: `20260830010302` adds persistent actor/organization-scoped
bridge/implant idempotency records and fingerprints; `20260830010303` revokes
all browser roles from the provider-accepting legacy bridge, implant, and
clinical-entry signatures and restores only the reviewed v3 grants.
