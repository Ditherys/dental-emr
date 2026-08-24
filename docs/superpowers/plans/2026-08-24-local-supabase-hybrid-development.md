# Local Supabase Hybrid Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, fail-closed local Supabase feedback loop while preserving the existing guarded Cloud TEST workflow as the mandatory acceptance gate.

**Architecture:** The repository will expose a small allowlisted local-command adapter around the pinned Supabase CLI and a local pgTAP runner that reuses the existing suite registry, transaction checks, result sentinel parser, migrations, non-production provisioning SQL, and synthetic seed. Local commands are local by construction (`--local` where the CLI accepts a database target) and never consume linked-project or hosted credentials; the existing remote runner and target guard remain separate and unchanged.

**Tech Stack:** Windows PowerShell, Docker Desktop with WSL2 backend, Node.js `^22.13.0 || >=24.0.0`, npm, Supabase CLI `2.113.0`, local PostgreSQL `17`, JavaScript ES modules, Vitest `4.1.10`, pgTAP, Markdown.

## Global Constraints

- [ADR-020](../../decisions/ADR-020-local-supabase-hybrid-development.md) is accepted and is the authority for this checkpoint.
- Local Supabase is optional developer feedback; Cloud TEST remains mandatory acceptance evidence.
- Git migration files remain the only authoritative application-schema history.
- Do not run `supabase init`; `supabase/config.toml` already exists.
- Local commands must never use `--linked`, `--db-url`, a hosted project reference, or hosted credentials.
- Only deterministic synthetic fixtures may be used locally or in Cloud TEST; never import real patient, clinical, financial, or workforce data.
- pgTAP remains outside `supabase/migrations/` and is provisioned from `supabase/provisioning/nonproduction/001_database_test_tooling.sql`.
- Do not weaken or merge the existing Cloud TEST target guard into the local guard.
- `test:db` remains the Cloud TEST command; `test:db:local` is the new local command.
- Committed generated database types remain Cloud TEST-authoritative; local types are not committed as sole evidence.
- Use Windows PowerShell-compatible commands and repository-relative paths.
- Do not start Docker Desktop, WSL, or Supabase containers until Task 4's explicit live-verification checkpoint.
- One `dental-emr` local stack uses the fixed repository ports at a time; run it from the worktree whose migrations are being tested.

## File structure

- Create `scripts/local-supabase-command.mjs`: pure allowlist, local-only argument validation, database-test command construction, and provisioning sentinel metadata.
- Create `scripts/local-supabase-command.test.mjs`: unit contract proving that every local command is exact and cannot select a remote target.
- Create `scripts/run-local-supabase-command.mjs`: lifecycle/reset/provision entrypoint around the pinned repository CLI.
- Create `scripts/run-local-database-tests.mjs`: local pgTAP runner using the existing suite registry and sentinel parser.
- Modify `package.json`: expose the five ADR-020 local commands and an explicit Cloud TEST alias without changing `test:db`.
- Create `docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md`: Windows/PowerShell runbook and local-versus-cloud boundary.
- Modify active architecture and workflow documents listed in Task 3 so they agree with ADR-020.
- Modify `docs/AI_HANDOFF.md`: record the exact architecture checkpoint and verification evidence for independent review.

---

### Task 1: Fail-closed local Supabase command contract

**Files:**

- Create: `scripts/local-supabase-command.test.mjs`
- Create: `scripts/local-supabase-command.mjs`

**Interfaces:**

- Consumes: the existing relative paths `supabase/seed.sql`, `supabase/tests/`, and `supabase/provisioning/nonproduction/001_database_test_tooling.sql`.
- Produces: `assertLocalSupabaseCommand(command: string[]): void`, `resolveLocalSupabaseCommand(commandName: string): string[]`, `resolveLocalDatabaseTestCommand(suitePath: string): string[]`, and `resolveLocalCommandResultSentinel(commandName: string): { column: string; value: string } | null`.

- [ ] **Step 1: Write the failing local-target contract tests**

Create `scripts/local-supabase-command.test.mjs`:

```js
import { describe, expect, it } from "vitest";

import {
  assertLocalSupabaseCommand,
  resolveLocalCommandResultSentinel,
  resolveLocalDatabaseTestCommand,
  resolveLocalSupabaseCommand,
} from "./local-supabase-command.mjs";

describe("local Supabase command allowlist", () => {
  it("returns only the exact reviewed local lifecycle commands", () => {
    expect(resolveLocalSupabaseCommand("start")).toEqual(["start"]);
    expect(resolveLocalSupabaseCommand("stop")).toEqual(["stop"]);
    expect(resolveLocalSupabaseCommand("reset")).toEqual([
      "db",
      "reset",
      "--local",
      "--yes",
    ]);
    expect(resolveLocalSupabaseCommand("provision-test-tooling")).toEqual([
      "db",
      "query",
      "--local",
      "--output-format",
      "json",
      "--file",
      "supabase/provisioning/nonproduction/001_database_test_tooling.sql",
    ]);
  });

  it("rejects names outside the explicit allowlist", () => {
    expect(() => resolveLocalSupabaseCommand("db-push")).toThrow(
      /allowlisted local Supabase command/,
    );
    expect(() => resolveLocalSupabaseCommand("constructor")).toThrow(
      /allowlisted local Supabase command/,
    );
  });

  it.each([
    ["db", "query", "--linked"],
    ["db", "reset", "--db-url", "postgresql://example.invalid/postgres"],
    ["db", "query", "--db-url=postgresql://example.invalid/postgres"],
    ["db", "query", "--file", "supabase/tests/schema.test.sql"],
  ])("rejects a database command that is not provably local", (...command) => {
    expect(() => assertLocalSupabaseCommand(command)).toThrow(/local target/);
  });

  it("constructs every database suite invocation with --local and no remote selector", () => {
    const command = resolveLocalDatabaseTestCommand(
      "C:/repo/supabase/tests/schema.test.sql",
    );

    expect(command).toEqual([
      "db",
      "query",
      "--local",
      "--output-format",
      "json",
      "--file",
      "C:/repo/supabase/tests/schema.test.sql",
    ]);
    expect(command).not.toContain("--linked");
    expect(command.some((argument) => argument.startsWith("--db-url"))).toBe(false);
  });

  it("requires the provisioning success sentinel", () => {
    expect(resolveLocalCommandResultSentinel("provision-test-tooling")).toEqual({
      column: "p1_provision_result",
      value: "P1_PROVISION_PASS",
    });
    expect(resolveLocalCommandResultSentinel("reset")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```powershell
npx vitest run scripts/local-supabase-command.test.mjs
```

Expected: FAIL because `scripts/local-supabase-command.mjs` does not exist.

- [ ] **Step 3: Implement the minimal local command contract**

Create `scripts/local-supabase-command.mjs`:

```js
const LOCAL_SUPABASE_COMMANDS = Object.freeze({
  start: Object.freeze(["start"]),
  stop: Object.freeze(["stop"]),
  reset: Object.freeze(["db", "reset", "--local", "--yes"]),
  "provision-test-tooling": Object.freeze([
    "db",
    "query",
    "--local",
    "--output-format",
    "json",
    "--file",
    "supabase/provisioning/nonproduction/001_database_test_tooling.sql",
  ]),
});

const LOCAL_COMMAND_RESULT_SENTINELS = Object.freeze({
  "provision-test-tooling": Object.freeze({
    column: "p1_provision_result",
    value: "P1_PROVISION_PASS",
  }),
});

export function assertLocalSupabaseCommand(command) {
  const containsRemoteSelector = command.some(
    (argument) =>
      argument === "--linked" ||
      argument === "--db-url" ||
      argument.startsWith("--db-url="),
  );

  if (containsRemoteSelector) {
    throw new Error(
      "The command does not prove an exclusive local target; remote database selectors are forbidden.",
    );
  }

  if (command[0] === "db" && !command.includes("--local")) {
    throw new Error("A local database command must declare the --local target.");
  }

  if (!["start", "stop", "db"].includes(command[0])) {
    throw new Error("The command does not select a supported local target.");
  }
}

export function resolveLocalSupabaseCommand(commandName) {
  if (!Object.hasOwn(LOCAL_SUPABASE_COMMANDS, commandName)) {
    throw new Error("Select one of the allowlisted local Supabase commands.");
  }

  const command = [...LOCAL_SUPABASE_COMMANDS[commandName]];
  assertLocalSupabaseCommand(command);
  return command;
}

export function resolveLocalDatabaseTestCommand(suitePath) {
  if (typeof suitePath !== "string" || suitePath.trim() === "") {
    throw new Error("A local database test suite path is required.");
  }

  const command = [
    "db",
    "query",
    "--local",
    "--output-format",
    "json",
    "--file",
    suitePath,
  ];
  assertLocalSupabaseCommand(command);
  return command;
}

export function resolveLocalCommandResultSentinel(commandName) {
  if (!Object.hasOwn(LOCAL_COMMAND_RESULT_SENTINELS, commandName)) {
    return null;
  }

  return LOCAL_COMMAND_RESULT_SENTINELS[commandName];
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx vitest run scripts/local-supabase-command.test.mjs
```

Expected: PASS with 8 tests (the table-driven rejection cases are reported separately).

- [ ] **Step 5: Commit the local target contract**

```powershell
git add scripts/local-supabase-command.mjs scripts/local-supabase-command.test.mjs
git commit -m "test: define local Supabase target contract"
```

---

### Task 2: Local lifecycle adapter and pgTAP runner

**Files:**

- Modify: `scripts/local-supabase-command.test.mjs`
- Create: `scripts/run-local-supabase-command.mjs`
- Create: `scripts/run-local-database-tests.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: all four exports from Task 1; `DATABASE_TEST_SUITES`, `formatRemoteDatabaseQueryFailure`, `parseSupabaseQueryResult`, and `validateTransactionalSuite` from `scripts/remote-database-test-guard.mjs`.
- Produces: npm commands `db:start:local`, `db:stop:local`, `db:reset:local`, `db:provision:local`, `test:db:local`, and `test:db:cloud`. Existing `test:db` remains unchanged.

- [ ] **Step 1: Add a failing package-interface test**

Add these imports at the top of `scripts/local-supabase-command.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
```

Append this test block:

```js
describe("local Supabase package interface", () => {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );

  it("exposes explicit local commands without replacing the Cloud TEST runner", () => {
    expect(packageJson.scripts).toMatchObject({
      "db:start:local": "node scripts/run-local-supabase-command.mjs start",
      "db:stop:local": "node scripts/run-local-supabase-command.mjs stop",
      "db:reset:local": "node scripts/run-local-supabase-command.mjs reset",
      "db:provision:local":
        "node scripts/run-local-supabase-command.mjs provision-test-tooling",
      "test:db:local": "node scripts/run-local-database-tests.mjs",
      "test:db:cloud": "npm run test:db",
      "test:db": "node scripts/run-remote-database-tests.mjs",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the package-interface failure**

Run:

```powershell
npx vitest run scripts/local-supabase-command.test.mjs
```

Expected: FAIL because the new npm scripts are absent.

- [ ] **Step 3: Create the local lifecycle/reset/provision adapter**

Create `scripts/run-local-supabase-command.mjs`:

```js
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveLocalCommandResultSentinel,
  resolveLocalSupabaseCommand,
} from "./local-supabase-command.mjs";
import { parseSupabaseQueryResult } from "./remote-database-test-guard.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const supabaseCli = join(
  repositoryRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

function fail(message) {
  console.error(`Local Supabase command refused to continue: ${message}`);
  process.exit(1);
}

try {
  const commandName = process.argv[2];
  const command = resolveLocalSupabaseCommand(commandName);

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  const sentinel = resolveLocalCommandResultSentinel(commandName);
  const result = spawnSync(process.execPath, [supabaseCli, ...command], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
    stdio: sentinel ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw new Error("The pinned Supabase CLI could not start.");
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (sentinel) {
    parseSupabaseQueryResult(result.stdout ?? "", commandName, sentinel);
    console.log(`PASS ${commandName} (${sentinel.value})`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
```

- [ ] **Step 4: Create the local database suite runner**

Create `scripts/run-local-database-tests.mjs`:

```js
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLocalDatabaseTestCommand } from "./local-supabase-command.mjs";
import {
  DATABASE_TEST_SUITES,
  formatRemoteDatabaseQueryFailure as formatDatabaseQueryFailure,
  parseSupabaseQueryResult,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const supabaseCli = join(
  repositoryRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const suites = DATABASE_TEST_SUITES.map((filename) =>
  join(repositoryRoot, "supabase", "tests", filename),
);

function fail(message) {
  console.error(`Local database test runner refused to continue: ${message}`);
  process.exit(1);
}

try {
  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  for (const suite of suites) {
    const suiteLabel = relative(repositoryRoot, suite).replaceAll("\\", "/");
    const source = readFileSync(suite, "utf8");
    validateTransactionalSuite(source, suiteLabel);

    const result = spawnSync(
      process.execPath,
      [supabaseCli, ...resolveLocalDatabaseTestCommand(suite)],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    if (result.error) {
      throw new Error(`${suiteLabel} could not start the Supabase CLI.`);
    }

    if (result.status !== 0) {
      const diagnostic = formatDatabaseQueryFailure(
        result.stderr ?? "",
        result.stdout ?? "",
      );
      throw new Error(
        `${suiteLabel} failed during local SQL execution.` +
          (diagnostic ? ` Diagnostic: ${diagnostic}` : ""),
      );
    }

    parseSupabaseQueryResult(result.stdout, suiteLabel);
    console.log(`PASS ${suiteLabel}`);
  }

  console.log("Local Supabase pgTAP suites passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
```

- [ ] **Step 5: Add the explicit npm commands without changing `test:db`**

Add these keys next to the existing database scripts in `package.json`:

```json
"db:start:local": "node scripts/run-local-supabase-command.mjs start",
"db:stop:local": "node scripts/run-local-supabase-command.mjs stop",
"db:reset:local": "node scripts/run-local-supabase-command.mjs reset",
"db:provision:local": "node scripts/run-local-supabase-command.mjs provision-test-tooling",
"test:db:local": "node scripts/run-local-database-tests.mjs",
"test:db:cloud": "npm run test:db",
```

Keep this existing entry exactly as-is:

```json
"test:db": "node scripts/run-remote-database-tests.mjs"
```

- [ ] **Step 6: Run the focused and full unit suites**

Run:

```powershell
npx vitest run scripts/local-supabase-command.test.mjs
npm run test:unit
```

Expected: the focused file passes 9 tests, and the full suite passes with no regression from the accepted P2-02 baseline.

- [ ] **Step 7: Prove remote selectors are absent from the local implementation**

Run:

```powershell
rg -n -- "--linked|--db-url|SUPABASE_PROJECT_ID|SUPABASE_TEST_PROJECT_ID|SUPABASE_PRODUCTION_PROJECT_ID" scripts/run-local-supabase-command.mjs scripts/run-local-database-tests.mjs
rg -n -- "--linked|--db-url" scripts/local-supabase-command.mjs
```

Expected: the first search returns no matches; the second finds only the two fail-closed rejection checks. No local entrypoint constructs or consumes a remote selector or project variable.

- [ ] **Step 8: Commit the local runners**

```powershell
git add package.json scripts/local-supabase-command.test.mjs scripts/run-local-supabase-command.mjs scripts/run-local-database-tests.mjs
git commit -m "feat: add guarded local Supabase workflow"
```

---

### Task 3: Reconcile authoritative architecture and workflow documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/decisions/ADR-016-supabase-cloud-first-development.md`
- Modify: `docs/decisions/ADR-018-nonproduction-database-test-tooling.md`
- Modify: `docs/TECHNICAL_ARCHITECTURE.md`
- Modify: `docs/DATABASE_DESIGN.md`
- Modify: `docs/SECURITY_ARCHITECTURE.md`
- Modify: `docs/plans/002-patient-foundation.md`
- Modify: `docs/deployment/CLOUD_TEST_PROVISIONING.md`
- Create: `docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md`
- Modify: `supabase/config.toml`
- Modify: `supabase/tests/README.md`

**Interfaces:**

- Consumes: accepted ADR-020 and the npm commands from Task 2.
- Produces: one consistent rule set: optional local feedback, mandatory Cloud TEST acceptance, synthetic-only data, Git-authoritative migrations, and separate local/remote guards.

- [ ] **Step 1: Capture the currently contradictory active statements**

Run:

```powershell
rg -n "no local Supabase|cloud-only workflow|Neither workflow starts Docker|violates ADR-016|local Docker Supabase" AGENTS.md README.md docs/TECHNICAL_ARCHITECTURE.md docs/DATABASE_DESIGN.md docs/SECURITY_ARCHITECTURE.md docs/plans/002-patient-foundation.md supabase/config.toml supabase/tests/README.md
```

Expected: matches in the active documents, proving that documentation reconciliation is required.

- [ ] **Step 2: Mark ADR-016 partially superseded without erasing history**

Change ADR-016's status to:

```markdown
**Status:** Accepted historically; local-runtime prohibition superseded by [ADR-020](ADR-020-local-supabase-hybrid-development.md)
```

Add immediately before `## Context`:

```markdown
> **Current rule:** ADR-020 permits an optional, disposable, synthetic-only local
> Supabase feedback loop. This ADR remains authoritative for Git-managed
> migrations, hosted environment separation, guarded remote writes, MCP limits,
> and production protection.
```

- [ ] **Step 3: Extend ADR-018 to both non-production test environments**

Add ADR-020 to ADR-018's `Related` field and add this paragraph after Decision item 2:

```markdown
ADR-020 does not move pgTAP into the canonical baseline. Local Supabase and
Cloud TEST both install the same file as an explicit non-production step. Local
installation uses the local-only command adapter; Cloud TEST retains the remote
target guard described below.
```

- [ ] **Step 4: Update the active architecture rules**

Make these exact policy changes:

In `docs/TECHNICAL_ARCHITECTURE.md`, replace the no-local database bullet with:

```markdown
- developers may optionally run a disposable, synthetic-only local Supabase stack for fast migration, RLS, and pgTAP feedback; guarded Cloud TEST remains the mandatory acceptance environment under ADR-020
- hosted development, test/staging, and production continue to use separate Supabase project boundaries; local success never substitutes for hosted acceptance
```

Add this ADR index entry and mark ADR-016 as partially superseded:

```text
ADR-016 — Supabase Cloud-first development; local prohibition superseded      [superseded in part]
ADR-020 — Optional local Supabase; mandatory Cloud TEST acceptance            [accepted]
```

In `docs/DATABASE_DESIGN.md`, replace the development-data metadata line with:

```markdown
**Development data location:** optional disposable local Supabase plus hosted non-production Supabase projects; synthetic data only; Git migrations authoritative
```

In `docs/SECURITY_ARCHITECTURE.md`, replace the no-local bullet with:

```markdown
- an optional disposable local Supabase stack may contain deterministic synthetic fixtures only; it is never a backup, staging, or production-data environment;
- guarded Supabase Cloud TEST verification remains mandatory before database-bearing work is accepted;
```

In `docs/plans/002-patient-foundation.md`, replace rule 8 in the migration workflow with:

```markdown
8. Never use Dashboard-first SQL, direct MCP-only schema changes, an unguarded
   local database target, linked reset/reseed, or a production target. Optional
   local Supabase feedback must follow ADR-020 and cannot replace Cloud TEST.
```

- [ ] **Step 5: Update the active agent authority**

Replace the stale P2-01 current-phase block in `AGENTS.md` with:

```markdown
## Current Phase: Phase 2 Patient Foundation — Hybrid database tooling checkpoint

P2-01 and P2-02 are accepted, and P2-02 is merged into `main`. ADR-020 is
accepted. Current implementation authority is limited to the local Supabase
hybrid tooling and documentation checkpoint described by ADR-020 and its
implementation plan.

Do NOT advance to P2-03 implementation until this architecture/tooling checkpoint
is independently reviewed and accepted. P2-03 planning may be reconciled only
after this checkpoint; all later Phase 2 scope remains ordered by
`docs/plans/002-patient-foundation.md`.
```

Replace the local-stack rule under `## Supabase / MCP Rules` with:

```markdown
- Optional local Supabase is permitted only through ADR-020's explicit local commands, with deterministic synthetic data and no hosted credentials.
- Cloud TEST remains the mandatory database acceptance gate; local success is feedback only.
```

- [ ] **Step 6: Update CLI configuration and top-level developer guidance**

Replace the first four lines of `supabase/config.toml` with:

```toml
# Local services are optional developer feedback under ADR-020. Git migrations
# remain authoritative, local data must be synthetic, and Cloud TEST remains the
# mandatory acceptance gate. Use the guarded npm commands; never add --linked or
# a hosted database URL to a local command.
#
```

Do not change PostgreSQL `major_version = 17`, the fixed local ports, migration enablement, or the existing `./seed.sql` path.

Replace README's database-testing paragraph with:

```markdown
Database tests support two paths. The optional local Supabase path gives fast,
disposable feedback through Docker Desktop; the guarded synthetic Cloud TEST
project remains mandatory for checkpoint acceptance. Commands and safety
boundaries are documented in
[`docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md`](docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md)
and [`supabase/tests/README.md`](supabase/tests/README.md).
```

- [ ] **Step 7: Create the Windows local-development runbook**

Create `docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md` with this complete content:

```markdown
# Optional local Supabase development

**Authority:** [ADR-020](../decisions/ADR-020-local-supabase-hybrid-development.md)

This is a disposable, synthetic-only feedback environment. It is not DEV,
Cloud TEST, staging, production, or a backup. Git migrations are authoritative,
and Cloud TEST remains mandatory before acceptance.

## Prerequisites on Windows

- WSL2 installed; `wsl --status` reports default version 2.
- Docker Desktop installed and using the WSL2 engine.
- Docker Desktop opened and the engine running before a local stack command.
- Locked dependencies installed with `npm ci`; the repository CLI is 2.113.0.

The first Docker Desktop launch may show license/onboarding screens. Complete
those manually. Do not enable Kubernetes; this project does not require it.

## Start and reconstruct

Run from the active feature worktree in PowerShell:

```powershell
npm run db:start:local
npm run db:reset:local
npm run db:provision:local
npm run test:db:local
```

`db:reset:local` replays every committed migration and `supabase/seed.sql`.
Provisioning then installs pgTAP from the non-production provisioning file.
Reset removes pgTAP, so provision it again after every reset.

Only one local stack with project ID `dental-emr` and the committed fixed ports
can run at a time. Stop a stack before switching worktrees, then start and reset
from the worktree whose migration state you intend to test.

## Stop

```powershell
npm run db:stop:local
```

Stopping preserves the local Docker volume. The volume is never authoritative;
use `db:reset:local` whenever exact reconstruction matters. Do not use
`supabase stop --all` because it can affect unrelated local projects.

## Application environment

Use `npx supabase status -o env` to view local runtime variables. Copy only the
needed local URL and publishable key into the ignored `.env.local`; never commit
the output. Do not copy a hosted secret key, database password, or project
reference into the local workflow.

## Mandatory hosted acceptance

Local success is not checkpoint acceptance. Against the explicitly designated
Cloud TEST project, run the guarded commands documented in
[`supabase/tests/README.md`](../../supabase/tests/README.md):

```powershell
npm run ci:test-target
npm run test:db:cloud
npm run db:types:check:test
npm run db:lint:test
npm run db:advisors:test
```

## Stop conditions

Stop instead of improvising if a local command mentions `--linked`, requests a
hosted database password, targets a non-loopback URL, encounters real patient
data, or requires disabling RLS. Never run a linked reset/reseed from this
runbook.
```

- [ ] **Step 8: Rewrite the database-test README as a two-path contract**

In `supabase/tests/README.md`, retain the suite-coverage and transaction-boundary explanation. Replace the cloud-only prohibition and command section with:

```markdown
These suites require pgTAP, which the canonical baseline deliberately does not
install. Provision it separately in each non-production target under ADR-018.

## Optional local feedback

```powershell
npm run db:start:local
npm run db:reset:local
npm run db:provision:local
npm run test:db:local
```

The local runner constructs only `db query --local` invocations. It never reads
a linked project reference or hosted credential. Reset loads the committed
synthetic seed and removes pgTAP, so provisioning must follow every reset.

## Mandatory Cloud TEST acceptance

Remote tests must target the explicitly designated disposable Cloud TEST
project. Set the documented environment variables from the secret store, verify
the link, and run:

```powershell
npm run ci:test-target
npm run test:db:cloud
```

`test:db` remains the same Cloud TEST runner; `test:db:cloud` is only an explicit
alias. The remote guard still verifies TEST identity, exact cloud URL, linked
project reference, DEV/production exclusion, confirmation text, suite rollback
boundaries, CLI status, and the completion sentinel.
```

Retain the existing variable-name list and remote seed warning. Remove the statement that `supabase test db` violates ADR-016; the supported project command is `test:db:local`, which preserves the repository's suite registry and completion-sentinel checks.

- [ ] **Step 9: Keep the Cloud TEST runbook authoritative and remove obsolete freeze instructions**

Add ADR-020 to `docs/deployment/CLOUD_TEST_PROVISIONING.md`'s authority line and add this paragraph near the top:

```markdown
ADR-020 adds an optional local feedback path but does not relax this runbook.
Cloud TEST remains the required hosted acceptance environment, and every remote
command below retains its target guard.
```

Because `supabase/MIGRATION_FREEZE.md` no longer exists after R6-F, remove it from the authority line and remove the `MIGRATION_FREEZE_ACK` setup/cleanup commands. Keep the guarded `npm run db:push:dry`, `npm run db:push:test`, `npm run db:provision:test`, and `npm run db:seed:test` commands unchanged.

- [ ] **Step 10: Verify the active documents no longer contradict ADR-020**

Run:

```powershell
rg -n "no local Supabase|cloud-only workflow|Neither workflow starts Docker|violates ADR-016|local Docker Supabase" AGENTS.md README.md docs/TECHNICAL_ARCHITECTURE.md docs/DATABASE_DESIGN.md docs/SECURITY_ARCHITECTURE.md docs/plans/002-patient-foundation.md supabase/config.toml supabase/tests/README.md
rg -n "MIGRATION_FREEZE_ACK|supabase/MIGRATION_FREEZE.md" docs/deployment/CLOUD_TEST_PROVISIONING.md
rg -n "Cloud TEST remains|synthetic|Git migrations|--local|--linked" docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md
git diff --check
```

Expected: the first two searches return no matches; the local runbook search finds all safety concepts; `git diff --check` returns no errors.

- [ ] **Step 11: Commit the reconciled documentation**

```powershell
git add AGENTS.md README.md docs/decisions/ADR-016-supabase-cloud-first-development.md docs/decisions/ADR-018-nonproduction-database-test-tooling.md docs/TECHNICAL_ARCHITECTURE.md docs/DATABASE_DESIGN.md docs/SECURITY_ARCHITECTURE.md docs/plans/002-patient-foundation.md docs/deployment/CLOUD_TEST_PROVISIONING.md docs/deployment/LOCAL_SUPABASE_DEVELOPMENT.md supabase/config.toml supabase/tests/README.md
git commit -m "docs: adopt hybrid Supabase development workflow"
```

---

### Task 4: First local Docker/WSL2 verification

**Files:**

- No source changes.
- Verify: Docker Desktop, WSL2, migrations, synthetic seed, pgTAP provisioning, and all registered database suites.

**Interfaces:**

- Consumes: local npm commands from Task 2 and runbook from Task 3.
- Produces: live proof that a fresh local stack reconstructs the accepted P2-02 schema and passes the existing database suites.

- [ ] **Step 1: Check WSL2 without changing its configuration**

Run in PowerShell:

```powershell
wsl --status
wsl --version
```

Expected: WSL reports default version `2` and prints installed component versions. If WSL reports that a restart or update is required, stop and complete that operating-system step before continuing.

- [ ] **Step 2: Complete Docker Desktop's first launch manually**

Open Docker Desktop from the Start menu. Complete its license/onboarding screen, confirm **Use the WSL 2 based engine** is enabled, and wait until Docker reports that the engine is running. Do not enable Kubernetes.

- [ ] **Step 3: Verify both Docker client and engine are reachable**

Run:

```powershell
docker version
docker info --format '{{.OSType}} {{.ServerVersion}}'
```

Expected: `docker version` contains both `Client` and `Server`; the second command prints `linux` followed by a server version. If only the client appears, Docker Desktop is not ready—do not run Supabase yet.

- [ ] **Step 4: Start the repository-local stack**

Run from this worktree:

```powershell
npm run db:start:local
```

Expected: exit 0 after the first image download and health checks. No command should request a Supabase access token, hosted database password, or linked project confirmation.

- [ ] **Step 5: Reconstruct from migrations and the synthetic seed**

Run:

```powershell
npm run db:reset:local
```

Expected: exit 0; all committed migrations apply in order and `supabase/seed.sql` loads. Any migration failure is a checkpoint failure—do not bypass it with Dashboard SQL or by disabling RLS.

- [ ] **Step 6: Provision non-production pgTAP locally**

Run:

```powershell
npm run db:provision:local
```

Expected: `PASS provision-test-tooling (P1_PROVISION_PASS)`.

- [ ] **Step 7: Run every registered database suite locally**

Run:

```powershell
npm run test:db:local
```

Expected: one `PASS supabase/tests/...` line for every filename in `DATABASE_TEST_SUITES`, ending with `Local Supabase pgTAP suites passed.` No suite may be skipped.

- [ ] **Step 8: Run the complete non-database verification gate**

Run:

```powershell
npm run verify
```

Expected: migration security lint, ESLint, TypeScript, unit tests, production build, secret scan, and high-severity dependency audit all pass.

- [ ] **Step 9: Stop the local stack safely**

Run:

```powershell
npm run db:stop:local
```

Expected: exit 0 for the `dental-emr` local project. Do not use `supabase stop --all`.

---

### Task 5: Cloud TEST regression, handoff, and review checkpoint

**Files:**

- Modify: `docs/AI_HANDOFF.md`

**Interfaces:**

- Consumes: the unchanged remote guard, a human-verified disposable Cloud TEST link, and the same Git checkpoint tested locally.
- Produces: hosted acceptance evidence and an exact independent-review handoff. This task performs no production access and no destructive remote reset.

- [ ] **Step 1: Confirm the working tree and exact checkpoint**

Run:

```powershell
git status --short
git log --oneline -5
git rev-parse HEAD
```

Expected: clean working tree before evidence editing; the log contains the ADR, local command, and documentation commits. Preserve the exact 40-character `HEAD` output for the handoff.

- [ ] **Step 2: Human checkpoint—load Cloud TEST environment values without exposing them**

Use the secret store and `docs/deployment/CLOUD_TEST_PROVISIONING.md`. Do not paste values into chat, Git, tickets, logs, or the plan. Verify the CLI is linked to the designated disposable TEST project, not DEV or production.

- [ ] **Step 3: Prove the Cloud TEST guard accepts only the designated target**

Run:

```powershell
npm run ci:test-target
npx supabase migration list --linked
```

Expected: `Cloud TEST environment metadata is internally consistent.` and a migration list matching the accepted P2-02 checkpoint. If the guard fails or the target is ambiguous, stop; do not change guard conditions.

- [ ] **Step 4: Run the hosted acceptance checks without applying new migrations**

Run:

```powershell
npm run test:db:cloud
npm run db:types:check:test
npm run db:lint:test
npm run db:advisors:test
```

Expected: all registered pgTAP suites pass; generated types are current; schema lint and security advisors exit 0. These architecture/tooling changes add no migration, so do not run a remote push or seed merely for this checkpoint.

- [ ] **Step 5: Update the handoff with exact evidence**

Replace the stale current-state section in `docs/AI_HANDOFF.md` with a section titled:

```markdown
# AI Handoff — ADR-020 local Supabase hybrid tooling checkpoint
```

Record all of the following using the exact outputs from Tasks 4 and 5:

```markdown
- Decision: ADR-020 accepted by the project owner on 2026-08-24.
- Base: accepted P2-02 merge `9103e9e`.
- Review target: the exact `git rev-parse HEAD` value captured in Step 1.
- Local environment: WSL default version 2; Docker Linux engine reachable; Supabase CLI 2.113.0; PostgreSQL major 17.
- Local verification: start, reset, non-production pgTAP provisioning sentinel, every registered database suite, and `npm run verify` passed.
- Cloud TEST verification: target guard, migration list inspection, every registered database suite, generated-type check, schema lint, and security advisors passed.
- Security review: local entrypoints contain no linked/project/database-URL selector; fixtures are synthetic; Cloud TEST guard is unchanged; no production target or credential was used.
- Remaining gate: independent review and human acceptance of this architecture/tooling checkpoint before P2-03 implementation.
```

Do not record project references, URLs containing credentials, access tokens, database passwords, local keys, patient-like content, or raw command output that may contain them.

- [ ] **Step 6: Re-run static verification after the handoff edit**

Run:

```powershell
git diff --check
npm run test:unit
npm run security:secrets
git status --short
```

Expected: all commands pass; only `docs/AI_HANDOFF.md` is modified.

- [ ] **Step 7: Commit the review handoff**

```powershell
git add docs/AI_HANDOFF.md
git commit -m "docs: hand off hybrid Supabase checkpoint"
```

- [ ] **Step 8: Review the final diff for scope and safety**

Run:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
rg -n -- "--linked|--db-url|SUPABASE_PROJECT_ID|SUPABASE_TEST_PROJECT_ID|SUPABASE_PRODUCTION_PROJECT_ID" scripts/run-local-supabase-command.mjs scripts/run-local-database-tests.mjs
```

Expected: clean tree; no whitespace errors; only ADR-020, local tooling/tests, active documentation, and handoff changes; the final search returns no matches. Request independent review before merging. Do not begin P2-03 implementation in this branch.
