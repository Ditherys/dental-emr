# AI_HANDOFF.md

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Phase 1 Foundation is formally accepted.** Codex independently reviewed the
security-sensitive R6-D tooling and H-5 branch lifecycle implementation through
code checkpoint `00077b0`. The review found no Critical/High issue, one Medium
R6-D composed-state verifier defect, and one Low stale-documentation issue. Both
were resolved in `79f9a43` before acceptance.

GitHub Actions run
[`32154009458`](https://github.com/Ditherys/dental-emr/actions/runs/32154009458)
passed both required jobs on `00077b0`:

- Application verification: migration privilege lint, ESLint, strict
  TypeScript, 293 unit tests, production build, secret scan, and dependency
  audit.
- Cloud TEST database and E2E: TEST/DEV separation guards, 9/9 migration
  reconciliation, pgTAP authorization suites, generated types, schema lint,
  hosted Auth posture, security advisors, and Playwright **55/55** across
  Chromium and WebKit.

The formal decision and residual risks are recorded in
`docs/PHASE1_ACCEPTANCE_REVIEW.md`.

## Acceptance Remediations

- `79f9a43` — R6-D now handles multiple grant-terminal migrations at the
  correct composed-state boundary and checks terminal files in statement mode.
- `d4e5af3` — Cloud CI accepts the exact Linux or Windows Supabase one-row query
  shape without weakening fail-closed validation.
- `199aa55`, `dcbf8c3`, `00077b0` — hosted pgTAP assertions are isolated from
  persistent E2E rows and support the intentional provisioned-admin state.
- `b391a0c` — repeat seeding preserves TEST-only provisioned credentials,
  WebKit is installed for iPad projects, and hosted branch-creation retries use
  independent fixture IDs and a realistic action timeout.

Cloud TEST uses project `plkjajlfnhsklmdloaut`; DEV remains
`hjcmnmigvzufhvamlnmy`. Git migrations are authoritative, TEST contains only
synthetic data, and the local Supabase link is restored to DEV.

## Remaining Non-Blocking / Production Gates

- M-5: leaked-password protection requires the planned Supabase tier upgrade
  before production patient use.
- M-6: CodeQL/dependency-review enforcement for this private repository requires
  GitHub Advanced Security.
- GitHub required reviewers for the `cloud-test` environment are unavailable on
  the current repository plan; the environment is restricted to `main`.
- H-5 update/archive has pgTAP and unit coverage but no dedicated Playwright UI
  scenario.
- Production use remains blocked by `docs/SECURITY_ARCHITECTURE.md`; Phase 1
  acceptance is not production approval.

## Next Checkpoint

**Phase 2 planning has been authored; Phase 2 implementation has not begun.**
The proposed implementation authority is
`docs/plans/002-patient-foundation.md`, covering only organization-level patient
identity/demographics, contacts/guardian relationships, duplicate warning,
list/search/workspace, patient authorization/RLS/audit, synthetic fixtures, and
concurrency-safe mutations.

The plan reconciles the old master-roadmap labels with the accepted detailed
Phase 1 plan: authentication, clinic/branch tenancy, authorization, invitations,
audit, and basic administration are already complete in Phase 1, while
`docs/plans/001-foundation.md` §48 explicitly selects patient foundation as the
next bounded plan.

The first independent review did not approve the plan. It found one High
authorization blocker: the Phase 1 permission-superset rule would prevent an
owner-only organization from provisioning its first `DENTIST` or
`RECEPTIONIST` after those roles receive patient permissions. It also found
Medium gaps in duplicate-update serialization, auditable detail-read enforcement,
and preferred-branch PATCH semantics, plus trailing whitespace in the untracked
plan.

The current documentation revision proposes ADR-019 and updates the plan to:

- allow an AAL2, `security.manage` actor to delegate only the fixed global
  `DENTIST`/`RECEPTIONIST` roles when the only missing permissions are exactly
  `patient.demographics.read/write`, without granting the actor patient access;
- preserve full-superset delegation for custom roles and fail closed if either
  fixed role later gains another permission the actor lacks;
- use one organization duplicate lock and fixed lock order for create, name/DOB
  updates, and active mobile/email mutations, with exact signals and bounded
  candidate fields;
- revoke all browser base-table patient reads and expose bounded search plus
  atomic detail-and-view-audit RPCs; and
- treat omitted preferred branch as preserve, explicit `null` as clear, and a
  supplied UUID as a new access-validated preference.

While preparing the mandatory re-review, Codex found and corrected four further
planning defects: all affected Phase 1 functions must lose their preserved ACLs
as one opening block *before* any helper/body replacement; the security
architecture's general delegation paragraph must acknowledge ADR-019's exact
exception; and the P2-11 edit UI must handle and test duplicate-review/cancel/
confirm states from P2-06/P2-07. The plan also now revokes Supabase's default
patient table/RPC privileges from `service_role`, because Phase 2 defines no
elevated service patient workflow.

A fresh-context read-only reviewer then reported no Critical or High finding and
returned **APPROVED WITH NON-BLOCKING NOTES**. Its two Low notes requested an
explicit tenant-scoped active-relationship index and one unambiguous email case-
normalization operation. The plan now requires the relationship index/catalog
and query-plan tests, and defines deterministic ASCII-only email validation and
case normalization with shared PostgreSQL/TypeScript vectors.

The project owner explicitly approved the complete Phase 2 plan and ADR-019 on
2026-08-19. ADR-019 is accepted and `P2-00` is complete. `P2-01 — Patient
permission contract` is the only authorized implementation task; implementation
has not yet reached a code checkpoint. Do not advance to P2-02 until P2-01 is
independently reviewed and accepted. Providers, scheduling, clinical history,
files, odontogram, treatment planning, billing, inventory, communications,
integrations, analytics, and AI/MCP remain deferred.
