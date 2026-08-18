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

Phase 2 planning may begin. Do not implement patients, clinical records, files,
scheduling, billing, inventory, communications, analytics, or AI/MCP product
features until a Phase 2 plan is authored, reviewed against the authoritative
architecture/security/database documents, and explicitly approved.
