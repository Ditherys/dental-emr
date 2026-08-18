# Phase 1 acceptance review

**Reviewed code checkpoint:** `00077b0`
**Reviewer:** Codex, independently reviewing Claude's Phase 1 implementation
**Acceptance evidence:** GitHub Actions run
[`32154009458`](https://github.com/Ditherys/dental-emr/actions/runs/32154009458)
**Decision: PHASE 1 IS ACCEPTED.**

This review supersedes the conditional review at `e267c7c`. The two remaining
acceptance gates in that document are now closed: the accumulated Phase 1
history is published and verified by CI, and the security-sensitive R6-D/H-5
work has received a genuine independent Codex review.

## Method

The review used `docs/plans/001-foundation.md` as the scope authority and read
the relevant security, database, frontend, ADR-017, handoff, migration, test,
and implementation material. Handoff claims were checked against Git state and
the composed code rather than accepted as evidence. The review specifically
tested tenant derivation, RLS and grant boundaries, AAL2 enforcement,
`SECURITY DEFINER` search paths, role escalation, branch lifecycle races,
audit atomicity, migration replay safety, CI target separation, and negative
authorization coverage.

## Findings

### Critical / High

None.

### Medium — resolved

**R6-D composed-state verifier mishandled multiple grant-terminal migrations.**

- **Affected:** `scripts/run-boundary-privilege-invariant.mjs` and its tests.
- **Risk:** after H-5 added a second registered grant-terminal migration, the
  verifier treated only the original terminal as authoritative. That could
  compare a replay boundary against approvals from a migration not yet reached
  and skip statement-level checks inside later terminal files.
- **Fix:** `79f9a43` makes statement mode inspect terminal files and derives the
  approved privilege set only from terminals reached at each boundary.
- **Proof:** regression tests cover multiple terminals; the final local
  migration privilege lint reports 9 files, 2 terminals, and no violation.

### Low — resolved

**R6-D documentation retained stale migration-freeze instructions.** The stale
operator text was removed with the independent-review remediation so it no
longer conflicts with the completed R6-F reconciliation.

### CI findings discovered and resolved during acceptance execution

These were verification defects, not accepted exceptions:

- Linux Supabase query results use a bare row array, while the earlier parser
  expected the Windows envelope. `d4e5af3` accepts either exact one-row shape
  and remains fail-closed.
- Persistent TEST data contaminated fixture-wide pgTAP counts. `199aa55`,
  `dcbf8c3`, and `00077b0` scope assertions to their deterministic synthetic
  UUID namespaces and allow the deliberately provisioned TEST admin state.
- Re-running `supabase/seed.sql` erased the provisioned fixed admin password and
  confirmation. `b391a0c` preserves those credential fields and adds a static
  regression test.
- CI installed Chromium only although the approved iPad projects use WebKit.
  `b391a0c` installs both engines.
- The hosted branch-creation flow could commit just before the default
  five-second assertion timeout, leaving a retry to collide with the committed
  slug. `b391a0c` gives the action a hosted-safe bound and makes retry fixture
  IDs independent.

## Acceptance evidence

| Criterion | Result |
|---|---|
| Phase 1 scope | No later clinical, billing, scheduling, inventory, communications, analytics, or AI domain was implemented |
| Tenant boundary | Negative RLS/authorization suites pass for Organization A vs. Organization B and forged organization/branch input |
| Administrative mutations | Server authorization, AAL2, transactional audit events, direct-write revocation, and tenant derivation remain enforced |
| Branch lifecycle | Create, update, archive, last-branch protection, archived-row protection, and cross-tenant denial are covered by pgTAP/unit tests |
| Migration safety | DEV and TEST show the 9 committed migration versions; grant-last lint covers both registered terminals |
| Hosted Auth | 14 required checks pass; the TEST-only leaked-password advisory remains plan-gated |
| Application CI | Passed in 1m22s on `00077b0` |
| Cloud TEST database and E2E | Passed in 18m06s on `00077b0`; migrations, pgTAP, types, schema lint, Auth posture, advisors, and Playwright all passed |
| Browser matrix | 55/55 passed across desktop/phone Chromium and iPad WebKit projects |
| Independent review | Completed by Codex; the one Medium and one Low finding were remediated before acceptance |

## Residual risks and non-blocking gates

- H-5 update/archive behavior has direct pgTAP and unit coverage but no dedicated
  Playwright edit/archive scenario. This is a test-depth improvement, not a
  Phase 1 acceptance blocker.
- Supabase leaked-password protection requires the planned paid-tier upgrade
  before production patient use (M-5).
- CodeQL/dependency-review enforcement on this private repository remains gated
  by GitHub Advanced Security (M-6). The ordinary Application and Cloud TEST
  jobs are green.
- GitHub's current plan rejected required-reviewer protection for the
  `cloud-test` environment. The environment is restricted to `main`, contains
  TEST-only synthetic credentials, and never targets DEV or production; add the
  reviewer gate when the repository plan supports it.
- TEST project `plkjajlfnhsklmdloaut` is intentionally retained as the dedicated
  Cloud TEST target. The local Supabase link is restored to DEV.
- Production patient use remains prohibited until the production gates in
  `docs/SECURITY_ARCHITECTURE.md` are satisfied. Phase 1 acceptance is not a
  production go-live approval.

## Decision

**Phase 1 Foundation is formally accepted as of 2026-08-18.** The approved
Phase 1 scope is implemented, the independent security review is complete, all
material findings are resolved, and both required CI jobs pass on the same
published code checkpoint.

Phase 2 planning may now proceed. Implementation must remain planning-only
until a Phase 2 plan is authored, reviewed, and explicitly approved; Phase 1
acceptance does not authorize later patient/clinical domain work by itself.
