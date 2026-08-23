# Remote pgTAP Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a bounded, redacted Supabase CLI error when a remote pgTAP suite cannot execute.

**Architecture:** A pure formatter in the existing remote-database guard module will normalize CLI stderr and failed stdout, suppress valid JSON query-result envelopes, redact token and connection-string credential values, and cap diagnostics at 8 KiB. The runner will call it only for a non-zero child-process exit, leaving its successful execution and target-validation paths unchanged.

**Tech Stack:** Node.js ESM, Vitest, Supabase CLI wrapper.

## Global Constraints

- Never print database passwords, access tokens, or complete connection strings.
- Keep Cloud TEST target validation, Supabase CLI arguments, SQL, migration behavior, and workflow YAML unchanged.
- Cap emitted diagnostic text at 8 KiB and remove terminal-control characters.
- Follow the P2-01 scope; do not add patient-schema or authorization behavior.

---

### Task 1: Redacted remote-query failure formatter

**Files:**
- Modify: `scripts/remote-database-test-guard.mjs`
- Modify: `scripts/remote-database-test-guard.test.mjs`
- Modify: `scripts/run-remote-database-tests.mjs`

**Interfaces:**
- Produces: `formatRemoteDatabaseQueryFailure(stderr: string, stdout: string): string`
- Consumes: Supabase CLI child-process stderr and non-query-result stdout only after a non-zero exit.

- [ ] **Step 1: Write the failing tests**

```js
import { formatRemoteDatabaseQueryFailure } from "./remote-database-test-guard.mjs";

it("keeps a bounded SQL error while redacting credentials", () => {
  const diagnostic = formatRemoteDatabaseQueryFailure(
    "ERROR: relation \"public.patients\" does not exist password=secret SUPABASE_ACCESS_TOKEN=sbp_token-value postgresql://user:secret@db.example.test:5432/postgres",
  );

  expect(diagnostic).toContain('relation "public.patients" does not exist');
  expect(diagnostic).not.toContain("secret");
  expect(diagnostic).not.toContain("sbp_token-value");
  expect(diagnostic).not.toContain("postgresql://");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test:unit -- scripts/remote-database-test-guard.test.mjs`

Expected: FAIL because `formatRemoteDatabaseQueryFailure` is not exported.

- [ ] **Step 3: Implement the minimal formatter and runner integration**

```js
export function formatRemoteDatabaseQueryFailure(stderr) {
  const output = stderr.replaceAll(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  return redactSecrets(output).replaceAll(/\s+/g, " ").trim().slice(0, 8192);
}
```

`run-remote-database-tests.mjs` throws an error including that formatter result only when `result.status !== 0`.

- [ ] **Step 4: Run focused tests and the full local verification gate**

Run: `npm run test:unit -- scripts/remote-database-test-guard.test.mjs`

Expected: PASS.

Run: `npm run security:migrations && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run security:secrets && npm run security:audit`

Expected: all checks pass.

- [ ] **Step 5: Commit and publish the diagnostic change**

```powershell
git add scripts/remote-database-test-guard.mjs scripts/remote-database-test-guard.test.mjs scripts/run-remote-database-tests.mjs docs/superpowers/plans/2026-08-24-remote-pgtap-diagnostics.md
git commit -m "fix: report redacted remote pgTAP failures"
git push origin HEAD:verify/p2-01-cloud-test
```

- [ ] **Step 6: Re-run guarded Cloud TEST and remove temporary PR-ref access**

Add only `refs/pull/8/merge` as a temporary `cloud-test` environment policy, re-run the existing CI workflow, inspect the diagnostic if it fails, and remove the policy immediately after the run.
