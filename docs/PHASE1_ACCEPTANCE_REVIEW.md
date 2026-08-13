# Phase 1 acceptance review

**Reviewed at:** `1c92e8a` (plus the R8 preparation commit that carries this file)
**Reviewer:** Claude Code, acting as implementing agent. **This is not an independent review.** Codex was unavailable throughout; no second agent has examined any R5, R6, R9, or R4 checkpoint.
**Decision: PHASE 1 IS NOT ACCEPTED.**

Not because a defect was found in the design, and not because remediation stalled
— the remaining blockers are almost entirely *evidence that has never been
produced*, and producing it requires a hosted project and a Git remote that only
a human can create.

## Method

Assessed against `docs/plans/001-foundation.md`, `docs/SECURITY_ARCHITECTURE.md`,
`docs/DATABASE_DESIGN.md`, `docs/FRONTEND_ARCHITECTURE.md`, ADR-001 through
ADR-018, the actual Git history, and the actual test evidence — where "evidence"
means a command that ran and whose output was read, not a file that exists.

That distinction does most of the work below. A large amount of correct-looking
authorization SQL, E2E coverage, and hosted-configuration policy now exists in
this repository and **none of it has ever executed**.

## Findings

### Critical

None. No cross-tenant exploit is demonstrated, and none was found by this review.
The H2 intermediate-weaker-authorization window identified by the earlier exit
review is closed structurally by the ADR-017 grant-last baseline and mechanically
enforced by `npm run security:migrations`.

That statement is about the migration *path* and the static text of the schema.
It is not a claim about runtime behaviour on a real database — see H-1.

### High

**H-1 — The secure baseline's equivalence to the accepted schema is unproven.**
`supabase/migrations/` (8 files) claims to build the same schema DEV already
holds. Nothing has verified that. R6-E exists precisely to prove it and has not
run. Every future Phase 2 migration would rest on this unverified premise, and
R6-F would assert "applied" against a database never shown to match.
*Evidence needed:* R6-C reconstruction on a disposable Cloud TEST project, then
R6-E cloud-safe equivalence. *Blocked on:* human creation of TEST-01.

**H-2 — DEV migration history and Git intentionally disagree.**
DEV records the 13 superseded versions and none of the 8 baseline versions. The
freeze (`supabase/MIGRATION_FREEZE.md`) makes this safe but not resolved. Phase 1
cannot be accepted with a development database whose history is knowingly
inconsistent with source control. *Evidence needed:* R6-F reconciliation, gated
on R6-D and R6-E. *Blocked on:* the same TEST work.

**H-3 — [RESOLVED at the database layer 2026-08-14]** All six pgTAP suites now
pass against TEST-01 rebuilt from the baseline alone, including the R5-A
session-boundary suite. Generated types show no drift, schema lint is clean, and
the advisors report 0 errors. See `docs/evidence/R6C-R6E-test01.md`.

The browser half is partially evidenced: 14–15 of 18 desktop Playwright flows
pass, with the remainder failing on test-harness sequencing rather than
application behaviour (the suspension flow suspends the shared owner identity).
First execution found **four real application defects** — a UUID validator that
rejected the project's own valid rows, a dev server that refused to serve its own
client chunks over 127.0.0.1 so nothing hydrated, a one-time TOTP code reachable
in a URL on pre-hydration submit, and a seed that broke Supabase's Admin API
project-wide. All four are fixed with regression coverage.

**H-3 (original wording) — No authorization test has been executed against a
database at any checkpoint in this remediation.** The R5-A suite (40 assertions), the R6-D
boundary tooling, and the R6-C1 provisioning step are all authored and unrun.
The pre-existing suites were last exercised at earlier checkpoints against DEV;
this review does not treat that as current evidence for the current baseline,
because the baseline changed underneath them.
*Evidence needed:* `npm run test:db` green against a TEST project rebuilt from
the baseline. *Blocked on:* TEST-01. Expect first-run corrections; unrun SQL is
usually not correct SQL.

**H-4 — CI evidence is partial.** *(Updated 2026-08-14 — the remote now exists
and CI has run.)* `CI / Application verification` **passes on `main`**. Its first
run caught a real defect that local verification could not: `tsc --noEmit`
succeeded locally off a stale `.next/` directory and failed in CI, where
typecheck runs before the build — see `docs/evidence/CI-first-runs.md`. Fixed and
re-verified against a simulated clean checkout.

Still open: `CI / Cloud TEST database and E2E` cannot pass while the R6 freeze is
active (by design), and `CodeQL` and `Dependency review` cannot run at all on a
private repository without GitHub Advanced Security — see M-6.

**H-5 — Branch update and archive are not implemented.** `docs/plans/001-foundation.md`
§"Phase 1 audit framework should record at least" names *branch updated/archived*,
and the audit action catalog names `branch.updated` and `branch.archived`. No
migration defines an update or archive RPC, no server action calls one, and the
branch settings screen offers only create and list. Two declared audit actions
are therefore unreachable by any code path.
*Deliberately deferred until after R6-F:* implementing it needs a new migration,
and adding migration 9 now would put a freshly built TEST project out of step
with DEV and invalidate the equivalence R6-E must prove. Recorded here as an open
Phase 1 scope item, not as complete.

**H-6 — The manual responsive and accessibility pass has not been performed.**
The automated matrix (`e2e/responsive-accessibility.spec.ts`, 5 form factors) is
authored but unrun, and `docs/testing/RESPONSIVE_ACCESSIBILITY_QA.md` is blank.
Automated scanning cannot judge virtual-keyboard behaviour, screen-reader output,
focus *order*, or one-handed reachability. A blank checklist is a blocker.

**H-7 — The hosted Supabase Auth posture has never been verified.**
`npm run security:auth` and its 14-rule policy are authored; no hosted project
has been read. Invitation-only onboarding, disabled public signup, the password
policy, the redirect allowlist, and TOTP availability are all currently
*intended* rather than *confirmed*.

**H-8 — No independent review of the security-critical remediation.**
ADR-017 lists twelve verification questions and ADR-018 four more, all
outstanding. The project's own workflow forbids the implementing agent being the
only reviewer of database, RLS, and migration-sensitive work. This is a process
blocker that no amount of further implementation resolves.

### Medium

**M-1 — Hosted Auth policy key names are unvalidated.** The 14 keys come from the
documented Management API surface, not from a live response. Any renamed key
surfaces as `UNVERIFIED` (exit non-zero) rather than as a false pass, so the
failure mode is safe — but the policy file will likely need correction on first
run.

**M-2 — MFA factor *removal* is not projected into application audit history.**
`public.record_mfa_enrollment` covers enrollment only. The plan lists
`mfa.removed` as *"(later/privileged)"*, so this is a documented deferral rather
than a missed Phase 1 requirement. The reconciliation semantics are now written
down in `docs/security/AUDIT_FOUNDATION.md` — including the non-negotiable point
that a removal assertion must be captured **before** the unenroll, because after
it the factor row is gone and absence is indistinguishable from "never existed".
Implementation needs a migration and is deferred until after R6-F.

**M-6 — CodeQL and Dependency review cannot run on the current GitHub plan.**
Both fail on every run: code scanning and dependency review require GitHub
Advanced Security on a private repository. `npm run security:audit` and
`npm run security:secrets` run in CI and pass, but they are narrower — no static
taint analysis, no PR-diff-scoped dependency gate. Recorded as an accepted gap
with a plan gate, not as equivalent coverage. `continue-on-error` was deliberately
not used: a job reporting success while doing nothing is worse than an honest red.

**M-5 — Leaked-password protection is unavailable on the current Supabase plan.**
The security advisors flagged it as disabled; it is gated on Pro plan and above,
so the disposable Free-tier TEST project cannot enable it. Recorded as a **Phase 1
production gate**: the production project must be provisioned on a plan that
supports it. The hosted-Auth checker requires it in staging/production and
reports it as advisory elsewhere, so it stays visible without producing a check
that can never pass.

**M-3 — Phase 1 has no branch-scoped write path.** Every mutation is
organization-wide-permission gated, so the R5-A branch-revocation section asserts
authorization *predicates* and read visibility rather than a refused branch-bound
mutation. Correct for what exists; a mutation-level assertion must be added with
the first Phase 2 branch-scoped write.

**M-4 — The freeze guard cannot intercept a raw CLI invocation.** It covers the
`npm run db:*` paths only. No repository change can cover a `npx supabase db push`
typed at a shell. The documented operator precaution (removing `supabase/.temp/`)
has not been applied, and local link state still points at DEV.

### Low

- **L-1** Migration file 1 was renamed in R6-C1; ADR-017's table is updated, but any external note referencing the old filename is now stale.
- **L-2** The automated target-size check enforces the WCAG 2.2 minimum (24 px), not the project's larger coarse-pointer preference. Deliberate; carried by manual row P6.
- **L-3** Email template bodies, SMTP configuration, and Auth rate limits are outside the hosted-Auth checker.
- **L-4** `service_role` privileges are out of scope for both migration-privilege layers per ADR-017 §5. Correct for R6, but it means "no browser-reachable role can write" is proven while "the server role holds only what it needs" is not.

## Acceptance criteria — passed

| Criterion | Evidence |
|---|---|
| Repository/application scaffold, environment separation | `npm run verify` green, environment-pairing guards, `docs/deployment/ENVIRONMENT_SEPARATION.md` |
| Grant-last fail-closed migration invariant, mechanically enforced | `npm run security:migrations`: 8 files, 231 statements, 93 GRANT/REVOKE, 30 approved privileges, 0 violations, 0 extensions; 40 lint unit tests incl. 13 negative fixtures |
| Canonical baseline is production-shaped | ADR-018; empty `APPROVED_EXTENSIONS`; unit tests assert reintroducing pgTAP fails |
| Lint, strict typecheck, unit/component tests, production build | 225/225 tests across 22 files; ESLint 0 problems; `tsc --noEmit` clean; build succeeds |
| Secret scanning | secretlint 0 findings across the tree |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| Guarded remote-command architecture | TEST-target guard tests, scoped freeze acknowledgement tests, mandatory `SUPABASE_DEV_PROJECT_ID`, sentinel-checked provisioning |
| Authorization test *matrix* authored to the required scenario list | R5-A (database) + R5-B (browser) + pre-existing suites; suite registration asserted against the directory |
| Documented architecture decisions | ADR-001…ADR-005, ADR-016, ADR-017, ADR-018 |

## Acceptance criteria — still open

| Criterion | Blocked by | Unblocked by |
|---|---|---|
| Fresh Cloud TEST reconstruction from committed migrations | H-1 | Human: create TEST-01 |
| pgTAP / RLS / tenant-isolation suites green on that project | H-3 | TEST-01 |
| Interrupted-boundary (statement-level) verification | H-1 | Human: create TEST-02 after TEST-01 is disposed |
| Schema/security equivalence, DB lint, security advisors, generated-type drift | H-1 | TEST-01 |
| DEV migration-history reconciliation and freeze removal | H-2 | R6-D + R6-E green, then approval |
| Hosted Auth posture verified | H-7 | TEST-01 + access token |
| Playwright hosted security scenarios executed | H-3 | TEST-01 + synthetic login identities |
| Responsive matrix executed + manual QA recorded | H-6 | TEST-01, then a human with real devices |
| CI executed, required checks configured | H-4 | Human: GitHub bootstrap |
| Branch update/archive implemented and tested | H-5 | After R6-F |
| Independent review of high-risk commits | H-8 | Codex availability |

## Decision

**Phase 1 is not accepted.** Eight High findings are open. Seven of them are
"evidence has never been produced" rather than "a defect was found", and every
one of those is gated on a human action, not on further implementation.

The honest summary is: the remediation *work* is substantially complete and the
remediation *proof* has not started, because proof requires a hosted project and
a remote that do not yet exist.

Phase 2 has not been started and must not be.

## Re-review trigger

Re-run this review after: R6-C, R6-D, R6-E, R6-F complete with preserved
evidence; CI has executed; the manual QA checklist is filled in; branch
update/archive ships; and Codex has reviewed the high-risk commits listed in
`docs/AI_HANDOFF.md`.
