# GitHub bootstrap (R8)

**Status at the time of writing: this repository has no Git remote.** Everything
CI-related that can exist without one already does —
`.github/workflows/ci.yml`, `codeql.yml`, `dependency-review.yml`, and
`dependabot.yml` are committed and their YAML parses. None of it has ever
executed, and Phase 1 must not claim CI evidence until it has.

This page is the minimum set of actions only a human can perform.

## What the agent has already done

- Authored and committed all four workflow/configuration files.
- Verified they parse and that job and step names match the required-check names in [`CI_FOUNDATION.md`](CI_FOUNDATION.md).
- Kept every credential out of the repository: workflows reference `secrets.*` and `vars.*` only.

## What you need to do

### 1. Create the repository and add the remote

Create a **private** repository. This codebase is healthcare software; it must
not be public.

```powershell
gh auth login
gh repo create <owner>/<repo> --private --source . --remote origin --push
```

Or, without the CLI: create the repository in the web UI, then

```powershell
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

The push is outward-facing. Confirm before running it that you intend this code
to leave the workstation, and that the repository is private.

### 2. Enable repository security features

In **Settings → Code security**: secret scanning, push protection, and
Dependabot alerts. The CI secret scan is a complement, never a substitute — a
real detected secret must be **rotated or revoked**, not merely deleted from the
newest commit.

### 3. Create the protected `cloud-test` environment

**Settings → Environments → New environment → `cloud-test`.** Require reviewers,
and restrict deployment branches to trusted branches.

Add the variables and secrets listed in [`CI_FOUNDATION.md`](CI_FOUNDATION.md).
Note `SUPABASE_TEST_SECRET_KEY` is new — the R5 mid-session withdrawal harness
and the Next.js process both need it.

Only synthetic values. No production reference, no real workforce identity, no
patient data.

### 4. Watch the first run, then set branch protection

Let CI run once on `main` and read the result honestly — a workflow file is not
evidence that CI works.

While the R6 freeze is active the Cloud TEST job will fail at the first
migration-applying step. That is the control working. Do not bypass it.

**Settings → Branches → protect `main`:**

- require a pull request before merging;
- require `CI / Application verification` to pass;
- add `CI / Cloud TEST database and E2E`, `Dependency review / Review dependency changes`, and `CodeQL / Analyze JavaScript and TypeScript` once each has passed at least once;
- require branches to be up to date before merging;
- require the second review that high-risk database, RLS, authorization, and migration changes already call for.

## What must not happen

- No `MIGRATION_FREEZE_ACK` in any workflow.
- No production project reference or credential in any GitHub variable or secret.
- No secret value pasted into a chat, an agent prompt, a document, or a commit — only the variable **names** belong in Git.
- No claim of CI evidence until a run has actually completed and its result has been read.
