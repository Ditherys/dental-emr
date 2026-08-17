/**
 * R6-D boundary privilege invariant runner.
 *
 * AUTHORED IN R6-B. DELIBERATELY INERT UNTIL R6-D IS APPROVED.
 *
 * Running this applies the Phase 1 baseline to a Supabase Cloud project one
 * boundary at a time, snapshotting effective privileges after each. It is
 * therefore gated four ways, and every gate must be satisfied deliberately:
 *
 *   1. the `--approved-r6d` argument, which nothing in the repository passes;
 *   2. R6D_BOUNDARY_TEST_CONFIRMATION set to the exact constant below;
 *   3. the pre-existing Cloud TEST target guard in full (APP_ENVIRONMENT=test,
 *      SUPABASE_PROJECT_ID === SUPABASE_TEST_PROJECT_ID, the linked project
 *      matching it, TEST differing from DEV and production, and
 *      DATABASE_TEST_CONFIRMATION);
 *   4. the R6 migration freeze acknowledgement, because this applies migrations.
 *
 * It is not wired into `npm run verify` or into any CI job, and it is not
 * referenced by `npm run test:db`.
 *
 * TARGET STATE: the project must be EMPTY of the baseline. The first snapshot is
 * taken before any migration is applied and becomes the platform baseline every
 * later boundary is compared against.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { APPROVED_EXTENSIONS, TERMINAL_MIGRATIONS } from "./approved-final-grants.mjs";
import {
  assertBaselineObservesPrivileges,
  assertExaminedGrowth,
  assertFinalBoundary,
  assertPreFinalBoundary,
  assertPreFinalStatementBoundary,
  assertSnapshotUsable,
  BOUNDARY_PROBE_FILE,
  LIVE_AUTHORIZATION_PROBE_FILE,
} from "./boundary-privilege-invariant.mjs";
import {
  classifyStatement,
  lintMigrations,
  splitSqlStatements,
} from "./migration-privilege-lint.mjs";
import {
  assertMigrationFreezeAllows,
  assertPgtapIsProvisioned,
  parseSupabaseQueryResult,
  PGTAP_PRESENCE_CHECK_FILE,
  readLinkedProjectId,
  validateRemoteDatabaseTestEnvironment,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

export const R6D_BOUNDARY_TEST_CONFIRMATION =
  "I_UNDERSTAND_THIS_APPLIES_THE_BASELINE_TO_A_DISPOSABLE_CLOUD_TEST_PROJECT";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const workingDirectory = join(repositoryRoot, "supabase", ".temp", "r6d");
const linkedProjectFile = join(repositoryRoot, "supabase", ".temp", "project-ref");
const migrationFreezeFile = join(repositoryRoot, "supabase", "MIGRATION_FREEZE.md");
const supabaseCli = join(repositoryRoot, "node_modules", "supabase", "dist", "supabase.js");

/**
 * Refuses to run unless R6-D has been explicitly approved and targeted. Exported
 * so the gate itself is unit-testable without a database.
 */
export function assertR6dExecutionIsApproved(argv, environment) {
  if (!argv.includes("--approved-r6d")) {
    throw new Error(
      "R6-D has not been approved. This tool applies migrations to a Cloud project one boundary at a time. " +
        "Nothing in the repository passes --approved-r6d; an operator must pass it deliberately after the R6-C/R6-D approval gate.",
    );
  }

  if (environment.R6D_BOUNDARY_TEST_CONFIRMATION?.trim() !== R6D_BOUNDARY_TEST_CONFIRMATION) {
    throw new Error(
      "R6D_BOUNDARY_TEST_CONFIRMATION does not authorize applying the baseline to a disposable Cloud TEST project.",
    );
  }
}

export function resolveMode(argv) {
  const flag = argv.find((argument) => argument.startsWith("--mode="));
  const mode = flag ? flag.slice("--mode=".length) : "file";

  if (mode !== "file" && mode !== "statement") {
    throw new Error('--mode must be "file" (one boundary per migration) or "statement".');
  }

  return mode;
}

function fail(message) {
  console.error(`R6-D boundary invariant run refused to continue: ${message}`);
  process.exit(1);
}

function runSupabaseQuery(file, { json = true } = {}) {
  const result = spawnSync(
    process.execPath,
    [
      supabaseCli,
      "db",
      "query",
      "--linked",
      ...(json ? ["--output-format", "json"] : []),
      "--file",
      file,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new Error(`The pinned Supabase CLI could not start for ${file}.`);
  }

  if (result.status !== 0) {
    throw new Error(`Remote execution failed for ${file}.`);
  }

  return result.stdout;
}

function takeSnapshot(label) {
  const output = runSupabaseQuery(join(repositoryRoot, ...BOUNDARY_PROBE_FILE.split("/")));

  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`${label}: the boundary probe returned malformed Supabase CLI JSON.`);
  }

  const snapshot = parsed?.rows?.[0]?.r6d_boundary_snapshot;

  if (!snapshot) {
    throw new Error(
      `${label}: the boundary probe returned no snapshot row. Failing closed rather than treating an empty result as a clean boundary.`,
    );
  }

  return snapshot;
}

/** Object counts the migrations applied so far are known to create. */
function expectedObjectCounts(appliedFiles) {
  let tables = 0;
  let functions = 0;
  let securityDefinerFunctions = 0;

  for (const file of appliedFiles) {
    for (const statement of splitSqlStatements(file.source, file.name).map(classifyStatement)) {
      if (statement.type !== "create") {
        continue;
      }

      if (statement.objectClass === "table") {
        tables += 1;
      }

      if (statement.objectClass === "function") {
        functions += 1;

        if (statement.securityDefiner) {
          securityDefinerFunctions += 1;
        }
      }
    }
  }

  return { tables, functions, securityDefinerFunctions };
}

/**
 * Pure statement-mode grace bookkeeping for one migration file. Takes the
 * file's split statements and the snapshot already taken after each was
 * executed (no I/O here — the caller executes and snapshots), and returns the
 * accumulated problems plus the report rows and the snapshot to carry forward
 * as `previousSnapshot` into the next file.
 *
 * `pendingGrace` always starts empty inside this function and is never a
 * parameter. That is what keeps ADR-017's "adjacent to the CREATE" promise
 * from silently stretching across a file boundary: an entry left ungraced at
 * one file's last statement is caught by that file's own unmodified
 * "boundary after <file>" check (assertPreFinalBoundary/assertFinalBoundary,
 * called by the caller against this function's returned `previousSnapshot`),
 * never carried into the next file's first statement as if it were still
 * within grace.
 */
export function assertStatementModeFile({
  file,
  statements,
  snapshots,
  baselineSnapshot,
  isTerminal,
  previousSnapshot,
}) {
  const problems = [];
  const report = [];
  let pendingGrace = [];
  let previous = previousSnapshot;

  statements.forEach((statement, index) => {
    const snapshot = snapshots[index];
    const label = `${file.name} statement ${index + 1}/${statements.length}`;

    problems.push(...assertSnapshotUsable(snapshot, label));
    problems.push(...assertExaminedGrowth(previous, snapshot, label));

    if (!isTerminal) {
      const result = assertPreFinalStatementBoundary({
        label,
        baselineSnapshot,
        snapshot,
        pending: pendingGrace,
        statement: classifyStatement(statement),
      });
      problems.push(...result.problems);
      pendingGrace = result.pending;
    }

    previous = snapshot;
    report.push({ boundary: label, snapshot });
  });

  return { problems, report, previousSnapshot: previous };
}

function main() {
  assertR6dExecutionIsApproved(process.argv.slice(2), process.env);
  const mode = resolveMode(process.argv.slice(2));

  // Applying migrations is exactly what the R6 freeze covers.
  for (const warning of assertMigrationFreezeAllows(
    "db-push",
    existsSync(migrationFreezeFile),
    process.env,
  )) {
    console.warn(warning);
  }

  if (!existsSync(linkedProjectFile)) {
    throw new Error(
      "No linked project was found. Link the explicitly designated disposable Cloud TEST project first.",
    );
  }

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  validateRemoteDatabaseTestEnvironment(process.env, readLinkedProjectId(linkedProjectFile));

  // Fail fast, before spending time replaying every baseline migration: the
  // live authorization probe at the end of this run requires pgTAP, which the
  // canonical baseline deliberately never installs (ADR-018).
  assertPgtapIsProvisioned(
    runSupabaseQuery(join(repositoryRoot, ...PGTAP_PRESENCE_CHECK_FILE.split("/")), {
      json: true,
    }),
  );

  const files = readdirSync(migrationsDirectory)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      path: join(migrationsDirectory, name),
      source: readFileSync(join(migrationsDirectory, name), "utf8"),
    }));

  // A dynamic run must never contradict the static one: if the static invariant
  // does not hold, the boundary expectations below are not the right ones.
  const staticResult = lintMigrations({
    files,
    terminalMigrations: TERMINAL_MIGRATIONS,
    approvedExtensions: APPROVED_EXTENSIONS,
  });

  if (staticResult.violations.length > 0) {
    throw new Error(
      "The static migration privilege lint fails, so the dynamic expectations are not trustworthy. Run npm run security:migrations first.",
    );
  }

  const terminalFiles = new Set(TERMINAL_MIGRATIONS.map((terminal) => terminal.file));
  mkdirSync(workingDirectory, { recursive: true });

  const problems = [];
  const report = [];

  const platformBaseline = takeSnapshot("platform baseline");
  problems.push(...assertSnapshotUsable(platformBaseline, "platform baseline"));
  problems.push(...assertBaselineObservesPrivileges(platformBaseline));
  report.push({ boundary: "platform-baseline", snapshot: platformBaseline });

  if (problems.length > 0) {
    throw new Error(
      `The platform baseline snapshot is not usable, so no boundary can be judged:\n  ${problems.join("\n  ")}`,
    );
  }

  const applied = [];
  let previousSnapshot = platformBaseline;

  for (const file of files) {
    const isTerminal = terminalFiles.has(file.name);

    if (mode === "statement") {
      // The interrupted-replay proof: a snapshot after every statement, so an
      // interruption anywhere inside a file is covered, not just between files.
      const statements = splitSqlStatements(file.source, file.name);
      const statementFile = join(workingDirectory, "statement.sql");
      const snapshots = [];

      for (const [index, statement] of statements.entries()) {
        writeFileSync(statementFile, `${statement.raw}\n`, "utf8");
        runSupabaseQuery(statementFile, { json: false });
        snapshots.push(
          takeSnapshot(`${file.name} statement ${index + 1}/${statements.length}`),
        );
      }

      // Inside the terminal file the privilege set is mid-flight, so only the
      // pre-final assertion is meaningful until the file completes; the grace
      // state itself always starts fresh for this file (see
      // assertStatementModeFile).
      const result = assertStatementModeFile({
        file,
        statements,
        snapshots,
        baselineSnapshot: platformBaseline,
        isTerminal,
        previousSnapshot,
      });

      problems.push(...result.problems);
      report.push(...result.report);
      previousSnapshot = result.previousSnapshot;
    } else {
      runSupabaseQuery(file.path, { json: false });
    }

    applied.push(file);

    const label = `boundary after ${file.name}`;
    const snapshot = mode === "statement" ? previousSnapshot : takeSnapshot(label);

    problems.push(...assertSnapshotUsable(snapshot, label, expectedObjectCounts(applied)));
    problems.push(...assertExaminedGrowth(previousSnapshot, snapshot, label));

    problems.push(
      ...(isTerminal
        ? assertFinalBoundary({
            label,
            baselineSnapshot: platformBaseline,
            snapshot,
            terminalMigrations: TERMINAL_MIGRATIONS,
          })
        : assertPreFinalBoundary({
            label,
            baselineSnapshot: platformBaseline,
            snapshot,
          })),
    );

    previousSnapshot = snapshot;
    report.push({ boundary: label, snapshot });
    console.log(`snapshot taken: ${label}`);
  }

  // Catalog inspection says what the ACLs are. The live probe says what a real
  // privileged session can actually do.
  const liveProbe = join(repositoryRoot, ...LIVE_AUTHORIZATION_PROBE_FILE.split("/"));
  validateTransactionalSuite(readFileSync(liveProbe, "utf8"), LIVE_AUTHORIZATION_PROBE_FILE);
  parseSupabaseQueryResult(runSupabaseQuery(liveProbe), LIVE_AUTHORIZATION_PROBE_FILE);
  console.log(`PASS ${LIVE_AUTHORIZATION_PROBE_FILE}`);

  writeFileSync(
    join(workingDirectory, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  if (problems.length > 0) {
    console.error(`\nR6-D found ${problems.length} boundary invariant violation(s):\n`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }

  console.log(
    `\nR6-D boundary invariant holds across ${report.length} snapshot(s) in ${mode} mode.`,
  );
}

// Importing this module for its exported gate must never start a remote run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unknown failure.");
  }
}
