# Phase 1 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Phase 1 review and CI gates, then formally record Phase 1 acceptance.

**Architecture:** Treat Git migrations and the current Phase 1 plan as authoritative. Independently review the security-sensitive R6-D tooling and H-5 branch lifecycle implementation before publication, preserve the DEV/TEST separation guards, configure GitHub's `cloud-test` environment from the existing synthetic TEST credential file without printing secret values, and change the acceptance decision only after both GitHub Actions jobs pass.

**Tech Stack:** Git, GitHub CLI/Actions, Next.js 16, TypeScript, Supabase CLI/PostgreSQL, pgTAP, Vitest, Playwright, PowerShell.

**Spec:** `docs/plans/001-foundation.md`

## Global Constraints

- Never print or commit Supabase access tokens, database passwords, secret keys, TOTP secrets, or synthetic account passwords.
- Never target production; Cloud CI must identify the explicitly designated TEST project and remain distinct from DEV.
- Migration files in Git remain authoritative; no schema change may exist only as a hosted side effect.
- Do not weaken RLS, server authorization, AAL2 requirements, auditability, or the grant-last migration invariant.
- Do not mark Phase 1 accepted until independent review is complete and both required GitHub Actions jobs pass on the published commit.
- Preserve unrelated user changes and keep all work within Phase 1 closeout scope.

---

### Task 1: Establish the exact review and publication baseline

**Files:**
- Read: `AGENTS.md`
- Read: `docs/plans/001-foundation.md`
- Read: `docs/decisions/ADR-017-phase1-secure-migration-baseline.md`
- Read: `docs/AI_HANDOFF.md`
- Read: `docs/PHASE1_ACCEPTANCE_REVIEW.md`

**Interfaces:**
- Consumes: current local `main`, `origin/main`, and the recorded Phase 1 evidence.
- Produces: an exact commit list and clean-worktree baseline for the review.

- [ ] **Step 1: Capture local and remote Git state**

Run:

```powershell
git status --short --branch
git log -n 30 --oneline --decorate
git remote -v
```

Expected: local `main` is ahead of `origin/main`; no unrecognized working-tree changes exist before this plan file.

- [ ] **Step 2: Confirm GitHub identity and repository access**

Run:

```powershell
gh auth status
gh repo view Ditherys/dental-emr --json nameWithOwner,defaultBranchRef,isPrivate
```

Expected: the active account can write to private repository `Ditherys/dental-emr`.

### Task 2: Independently review R6-D tooling and H-5

**Files:**
- Review: `scripts/run-boundary-privilege-invariant.mjs`
- Review: `scripts/boundary-privilege-invariant.test.mjs`
- Review: `supabase/verification/r6d/*`
- Review: `supabase/migrations/20260818010000_branch_update_and_archive.sql`
- Review: `supabase/tests/branch_lifecycle.test.sql`
- Review: H-5 TypeScript/server action/UI files shown by `git show 21694ec`
- Review: `scripts/migration-privilege-lint.mjs`
- Review: `scripts/approved-final-grants.mjs`

**Interfaces:**
- Consumes: commits `033754f`, `338c59c`, `afbb3a8`, and `21694ec` plus their architectural context.
- Produces: a severity-ranked independent Codex review and, if necessary, bounded remediations with regression tests.

- [ ] **Step 1: Inspect every target diff and its final composed state**

Run:

```powershell
git show 033754f
git show 338c59c
git show afbb3a8
git show 21694ec
```

Check override-target validation, credential-safe failures, retry semantics, psql parsing, organization/branch derivation, AAL2, advisory/row locking, last-branch races, cross-tenant non-disclosure, audit emission, grants, and negative tests.

- [ ] **Step 2: Run targeted offline checks**

Run:

```powershell
npx vitest run scripts/boundary-privilege-invariant.test.mjs
npm run security:migrations
npx vitest run
```

Expected: all targeted and full unit checks pass.

- [ ] **Step 3: Remediate each valid finding test-first**

For each finding: add or strengthen the narrowest regression test, observe the test fail for the claimed reason, apply the minimal fix with `apply_patch`, then rerun the targeted check and `npm run verify`.

- [ ] **Step 4: Commit any review remediation**

Run only if files changed:

```powershell
git add <reviewed-files>
git commit -m "fix(phase1): address independent closeout review"
```

### Task 3: Publish the reviewed Phase 1 history

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: reviewed, verified local `main`.
- Produces: `origin/main` at the same reviewed commit.

- [ ] **Step 1: Verify immediately before push**

Run:

```powershell
npm run verify
git status --short --branch
```

Expected: verification exits 0 and the only planned uncommitted file is this closeout plan if it has not yet been committed.

- [ ] **Step 2: Commit the closeout plan if needed**

```powershell
git add docs/superpowers/plans/2026-08-18-phase1-closeout.md
git commit -m "docs: plan Phase 1 closeout"
```

- [ ] **Step 3: Push local main**

```powershell
git push origin main
```

Expected: push succeeds and GitHub starts the `CI` workflow for the pushed SHA.

### Task 4: Configure the protected Cloud TEST environment

**Files:**
- Read without emitting values: `C:\Users\D_Reyes\.dental-emr\test.env`
- Read: `docs/deployment/CI_FOUNDATION.md`
- Read: `e2e/README.md`

**Interfaces:**
- Consumes: synthetic TEST-only variables/secrets and the GitHub environment contract.
- Produces: GitHub environment `cloud-test` with all required names configured.

- [ ] **Step 1: Inspect key names only and validate completeness**

Use PowerShell to parse assignment names from `test.env`, compare them to `CI_FOUNDATION.md`, and print only missing/present key names—never values.

- [ ] **Step 2: Verify TEST/DEV separation locally without revealing identifiers**

Load variables in-process, assert TEST project ID differs from DEV and any production ID, and assert the TEST URL hostname corresponds to the TEST project ID. Abort on ambiguity.

- [ ] **Step 3: Create/update the GitHub environment variables**

Use `gh variable set <NAME> --env cloud-test --repo Ditherys/dental-emr --body <in-process-value>` for the documented non-secret metadata. Do not print values.

- [ ] **Step 4: Create/update the GitHub environment secrets**

Pipe each in-process secret value to `gh secret set <NAME> --env cloud-test --repo Ditherys/dental-emr` through standard input. Do not place secret values in command arguments or output.

- [ ] **Step 5: Verify configured names only**

Run:

```powershell
gh variable list --env cloud-test --repo Ditherys/dental-emr
gh secret list --env cloud-test --repo Ditherys/dental-emr
```

Expected: every required variable and secret name is present; secret values remain undisclosed.

### Task 5: Verify GitHub Actions and remediate failures

**Files:**
- Modify only if a confirmed CI defect requires it: `.github/workflows/ci.yml`, relevant scripts/tests/docs.

**Interfaces:**
- Consumes: pushed commit and configured `cloud-test` environment.
- Produces: successful `CI / Application verification` and `CI / Cloud TEST database and E2E` checks.

- [ ] **Step 1: Watch the pushed workflow**

Run:

```powershell
gh run list --workflow CI --branch main --limit 5
gh run watch <run-id> --exit-status
```

- [ ] **Step 2: If a job fails, use systematic CI diagnosis**

Read the failed job logs with `gh run view <run-id> --log-failed`, identify the first causal failure, reproduce safely where practical, and use the `github:gh-fix-ci` plus `superpowers:systematic-debugging` workflows before editing.

- [ ] **Step 3: Verify hosted evidence**

Expected: both Phase 1 CI jobs succeed on the same published SHA. Do not treat CodeQL/Dependency Review plan-gated failures as Phase 1 blockers, per the accepted M-5/M-6 record.

### Task 6: Formally accept Phase 1

**Files:**
- Modify: `docs/PHASE1_ACCEPTANCE_REVIEW.md`
- Modify: `docs/AI_HANDOFF.md`

**Interfaces:**
- Consumes: completed independent review and successful GitHub Actions run URLs/IDs.
- Produces: an accurate formal acceptance decision with remaining production-only gates clearly separated.

- [ ] **Step 1: Update the acceptance review**

Record the reviewed commit, Codex reviewer, resolved H-8, successful Application and Cloud TEST CI run, and the decision `PHASE 1 IS ACCEPTED`. Keep M-5/M-6 and any TEST-project disposal decision explicitly non-blocking or production-only.

- [ ] **Step 2: Update the handoff**

Add a concise current checkpoint that records the independent review outcome, CI evidence, formal acceptance, and that Phase 2 remains planning-only until `docs/plans/002-patient-foundation.md` is authored and approved.

- [ ] **Step 3: Verify the final documentation change**

Run:

```powershell
npm run verify
git diff --check
git status --short
```

Expected: verification exits 0, no whitespace errors, and only the intended acceptance/handoff files are modified.

- [ ] **Step 4: Commit and push formal acceptance**

```powershell
git add docs/PHASE1_ACCEPTANCE_REVIEW.md docs/AI_HANDOFF.md
git commit -m "docs: formally accept Phase 1 foundation"
git push origin main
```

- [ ] **Step 5: Confirm final application CI**

Watch the resulting `CI` run. Phase 1 is formally closed only when the final documentation commit's Application job succeeds; Cloud TEST may be confirmed from the immediately preceding same-code SHA because the final commit is documentation-only, unless the workflow runs it again automatically—in which case require that run to pass too.

