/**
 * R6-D boundary privilege invariant runner.
 *
 * AUTHORED IN R6-B. DELIBERATELY INERT UNTIL R6-D IS APPROVED.
 *
 * Running this applies the Phase 1 baseline to a Supabase Cloud project one
 * boundary at a time, snapshotting effective privileges after each. It is
 * therefore gated three ways, and every gate must be satisfied deliberately:
 *
 *   1. the `--approved-r6d` argument, which nothing in the repository passes;
 *   2. R6D_BOUNDARY_TEST_CONFIRMATION set to the exact constant below;
 *   3. the pre-existing Cloud TEST target guard in full (APP_ENVIRONMENT=test,
 *      SUPABASE_PROJECT_ID === SUPABASE_TEST_PROJECT_ID, the linked project
 *      matching it, TEST differing from DEV and production, and
 *      DATABASE_TEST_CONFIRMATION);
 *
 * The historical R6 migration freeze was lifted at R6-F. The shared guard
 * still fails closed if a future freeze file is introduced.
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
  assertPreFinalStatementBoundary,
  assertSnapshotUsable,
  BOUNDARY_PROBE_FILE,
  browserReachableApprovedKeys,
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

/**
 * Returns the approved terminal migrations whose files have been reached at
 * the current migration boundary. Migration filenames begin with sortable
 * timestamps, and TERMINAL_MIGRATIONS is recorded in that same order.
 *
 * R6-D originally had one terminal migration at the end of the baseline. H-5
 * added a second terminal later in the chain. Comparing every terminal
 * boundary against the union of all future grants would falsely require H-5's
 * functions before their migration exists; comparing against no accumulated
 * grants would reject the already-approved baseline grants after file 8.
 */
export function terminalMigrationsThroughFile(terminalMigrations, fileName) {
  return terminalMigrations.filter(
    (terminal) => terminal.file.localeCompare(fileName) <= 0,
  );
}

function fail(message) {
  console.error(`R6-D boundary invariant run refused to continue: ${message}`);
  process.exit(1);
}

const IPV6_CONNECTIVITY_ERROR = "LegacyDbConfigIpv6Error";
const IPV6_RETRY_ATTEMPTS = 3;
const IPV6_RETRY_DELAY_MS = 2000;

/**
 * `supabase db query --linked` opens a direct connection under the hood
 * (despite its own help text saying "via Management API"), which some
 * networks cannot complete because Supabase's direct/non-pooler host requires
 * IPv6. Observed in practice: an operator's `--linked` run can succeed for a
 * platform-baseline snapshot and an entire migration file's worth of
 * statement-by-statement snapshots, then fail consistently afterward on the
 * exact same network — so this is treated as retryable, not purely fatal.
 *
 * `R6D_DB_URL_OVERRIDE`, if set, is an escape hatch for a network where
 * `--linked` cannot complete at all: a full Postgres connection string
 * (percent-encoded), which the operator supplies directly (e.g. the disposable
 * TEST project's Session Pooler URL — IPv4-compatible). It is never derived,
 * guessed, or defaulted by this script, and it must reference the same
 * project already validated as the linked TEST target — this check is what
 * stops a stray or malicious override from silently redirecting a boundary
 * check (or, worse, a migration-applying statement) at a different project.
 *
 * The check parses the URL and requires the *host and username* to match the
 * linked project's known Supabase connection shape (Session Pooler:
 * `postgres.<ref>@*.pooler.supabase.com`; direct: `postgres@db.<ref>.supabase.co`)
 * -- not merely that the project ref appears somewhere in the string. A
 * substring check alone would accept, for example, the real ref embedded in
 * the password field of a URL whose actual host is unrelated.
 */
export function assertOverrideTargetsLinkedProject(override, linkedProjectId) {
  const refuse = () => {
    throw new Error(
      "R6D_DB_URL_OVERRIDE does not reference the linked TEST project " +
        `(${linkedProjectId || "unknown"}). Refusing to query an unverified target.`,
    );
  };

  if (!linkedProjectId) {
    refuse();
  }

  let parsed;

  try {
    parsed = new URL(override);
  } catch {
    refuse();
  }

  const hostname = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username);
  const isPoolerTarget =
    hostname.endsWith(".pooler.supabase.com") && username === `postgres.${linkedProjectId}`;
  const isDirectTarget =
    hostname === `db.${linkedProjectId}.supabase.co` && username === "postgres";

  if (!isPoolerTarget && !isDirectTarget) {
    refuse();
  }
}

function currentLinkedProjectId() {
  return existsSync(linkedProjectFile) ? readLinkedProjectId(linkedProjectFile) : null;
}

export function resolveQueryArgs(
  file,
  json,
  { override = process.env.R6D_DB_URL_OVERRIDE, linkedProjectId = currentLinkedProjectId() } = {},
) {
  const outputArgs = json ? ["--output-format", "json"] : [];

  if (!override) {
    return ["db", "query", "--linked", ...outputArgs, "--file", file];
  }

  assertOverrideTargetsLinkedProject(override, linkedProjectId);

  return ["db", "query", "--db-url", override, ...outputArgs, "--file", file];
}

/**
 * `supabase db query --db-url` cannot run a multi-statement file at all (see
 * POOLER_PREPARED_STATEMENT_ERROR below), because it always issues the query
 * over the extended/prepared-statement protocol. `psql`'s default `-f`
 * behavior sends a script through the simple query protocol instead, which
 * Postgres does allow to carry multiple statements — so a multi-statement
 * query with an override set runs via `psql` against the same
 * already-validated connection string, never the Supabase CLI.
 */
function runMultiStatementOverrideViaPsql(file, override) {
  assertOverrideTargetsLinkedProject(override, currentLinkedProjectId());

  const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });

  if (probe.error) {
    throw new Error(
      `R6D_DB_URL_OVERRIDE is set and ${file} contains more than one statement, which the ` +
        "Session Pooler cannot run through the Supabase CLI (prepared-statement protocol " +
        "limit). This path requires `psql` on PATH, which was not found.",
    );
  }

  if (probe.status !== 0) {
    throw new Error(
      `R6D_DB_URL_OVERRIDE is set and ${file} contains more than one statement, which the ` +
        "Session Pooler cannot run through the Supabase CLI (prepared-statement protocol " +
        `limit). \`psql\` is on PATH but failed its own --version check (exit code ${probe.status}): ` +
        `${(probe.stderr || probe.stdout || "no output").trim()}`,
    );
  }

  // The connection string (including the password) is never echoed into an
  // error message below: R6D_DB_URL_OVERRIDE is a live database credential
  // (see supabase/verification/r6d/README.md), and a failed psql invocation
  // can echo connection details back in its own stderr.
  const result = spawnSync("psql", [override, "-v", "ON_ERROR_STOP=1", "-f", file], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`psql could not start for ${file}.`);
  }

  if (result.status !== 0) {
    const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const remedy = combinedOutput.includes(POOLER_PREPARED_STATEMENT_ERROR)
      ? " Unexpected: psql itself reported a multi-statement/prepared-statement error; treat this as a tooling bug, not an environment issue."
      : " (output withheld: R6D_DB_URL_OVERRIDE is a live database credential and psql's own error output can echo connection details.)";

    throw new Error(`Remote execution via psql failed for ${file} (exit code ${result.status}).${remedy}`);
  }

  return result.stdout;
}

const POOLER_PREPARED_STATEMENT_ERROR =
  "cannot insert multiple commands into a prepared statement";

/**
 * The Supabase CLI's `db query --db-url` (the pooler path `R6D_DB_URL_OVERRIDE`
 * uses) always issues the query over the extended/prepared-statement
 * protocol, and Postgres refuses a prepared statement containing more than
 * one command ("cannot insert multiple commands into a prepared statement").
 * That is a protocol-level limitation, not a transient network issue. A
 * multi-statement query this script knows about in advance -- an entire
 * migration file replayed in `--mode=file`, and the transactional
 * `live-authorization-probe.sql` -- therefore never goes through the CLI's
 * `--db-url` path: with an override set, it runs via `psql` instead (which
 * supports multi-statement scripts over the same connection); without one,
 * it falls back to `--linked` like everything else.
 */
function runSupabaseQuery(file, { json = true, multiStatement = false, mutatesSchema = false } = {}) {
  const override = process.env.R6D_DB_URL_OVERRIDE;

  if (multiStatement && override) {
    return runMultiStatementOverrideViaPsql(file, override);
  }

  const args = resolveQueryArgs(file, json, multiStatement ? { override: undefined } : undefined);
  const usingOverride = args.includes("--db-url");
  // Retrying on a connectivity error is only safe where a retry cannot mask a
  // genuine partial success: read-only snapshots (safe to re-run), and the
  // transactional, always-ROLLBACK live-authorization-probe (idempotent by
  // construction). `LegacyDbConfigIpv6Error` is understood to fail before any
  // query reaches Postgres, but that is a claim about a third-party CLI's
  // internals this script cannot verify -- so schema-mutating replay (a
  // migration statement or file actually applying DDL) never auto-retries,
  // and instead fails closed on the first connectivity error, requiring a
  // fresh disposable-project cycle rather than risking a silent double-apply.
  const attempts = usingOverride || mutatesSchema ? 1 : IPV6_RETRY_ATTEMPTS;
  let lastResult;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = spawnSync(process.execPath, [supabaseCli, ...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });

    if (lastResult.error) {
      throw new Error(`The pinned Supabase CLI could not start for ${file}.`);
    }

    if (lastResult.status === 0) {
      return lastResult.stdout;
    }

    const combinedOutput = `${lastResult.stdout ?? ""}${lastResult.stderr ?? ""}`;
    const isIpv6ConnectivityError = combinedOutput.includes(IPV6_CONNECTIVITY_ERROR);

    if (!isIpv6ConnectivityError || attempt === attempts) {
      break;
    }

    console.warn(
      `${IPV6_CONNECTIVITY_ERROR} querying ${file} (attempt ${attempt}/${attempts}); retrying...`,
    );
    const until = Date.now() + IPV6_RETRY_DELAY_MS;
    while (Date.now() < until) {
      // Deliberate synchronous wait: this script has no event loop work to
      // yield to between attempts, and a short fixed delay is simpler than a
      // second async entry point solely for retry backoff.
    }
  }

  const finalOutput = lastResult ? `${lastResult.stdout ?? ""}${lastResult.stderr ?? ""}` : "";
  let remedy = "";

  if (finalOutput.includes(IPV6_CONNECTIVITY_ERROR)) {
    // Reaching this branch with multiStatement=true means no override was set
    // (an override would have short-circuited to the psql path above), so the
    // remedy is the same for both: set the override, which now handles a
    // multi-statement query too, via psql instead of the CLI.
    remedy =
      " Network cannot reach Supabase's direct connection host (IPv6 required). " +
      "Set R6D_DB_URL_OVERRIDE to the TEST project's Session Pooler connection string to work around this.";
  } else if (finalOutput.includes(POOLER_PREPARED_STATEMENT_ERROR)) {
    remedy =
      " The Session Pooler cannot run a multi-statement query over the " +
      "prepared-statement protocol. This should be unreachable -- this query " +
      "was not marked multiStatement but evidently contains more than one " +
      "statement; treat this as a tooling bug, not an environment issue.";
  }

  throw new Error(`Remote execution failed for ${file}.${remedy}`);
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
  allowedTerminalMigrations = [],
  previousSnapshot,
}) {
  const problems = [];
  const report = [];
  let pendingGrace = [];
  let previous = previousSnapshot;
  const approvedKeys = browserReachableApprovedKeys(allowedTerminalMigrations, file.name);

  statements.forEach((statement, index) => {
    const snapshot = snapshots[index];
    const label = `${file.name} statement ${index + 1}/${statements.length}`;

    problems.push(...assertSnapshotUsable(snapshot, label));
    problems.push(...assertExaminedGrowth(previous, snapshot, label));

    const result = assertPreFinalStatementBoundary({
      label,
      baselineSnapshot,
      previousSnapshot: previous,
      snapshot,
      pending: pendingGrace,
      statement: classifyStatement(statement),
      approvedKeys,
    });
    problems.push(...result.problems);
    pendingGrace = result.pending;

    previous = snapshot;
    report.push({ boundary: label, snapshot });
  });

  return { problems, report, previousSnapshot: previous };
}

function main() {
  assertR6dExecutionIsApproved(process.argv.slice(2), process.env);
  const mode = resolveMode(process.argv.slice(2));

  // The historical R6 freeze is lifted, but retain the shared fail-closed
  // guard in case a future freeze file is introduced.
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
    const terminalMigrationsThroughCurrentFile = terminalMigrationsThroughFile(
      TERMINAL_MIGRATIONS,
      file.name,
    );

    if (mode === "statement") {
      // The interrupted-replay proof: a snapshot after every statement, so an
      // interruption anywhere inside a file is covered, not just between files.
      const statements = splitSqlStatements(file.source, file.name);
      const statementFile = join(workingDirectory, "statement.sql");
      const snapshots = [];

      for (const [index, statement] of statements.entries()) {
        writeFileSync(statementFile, `${statement.raw}\n`, "utf8");
        runSupabaseQuery(statementFile, { json: false, mutatesSchema: true });
        snapshots.push(
          takeSnapshot(`${file.name} statement ${index + 1}/${statements.length}`),
        );
      }

      // Inside any terminal file the approved privilege set is mid-flight.
      // Statement boundaries may hold a subset of approvals accumulated
      // through this file, but never an unapproved privilege; PostgreSQL's own
      // CREATE defaults still receive only the one-statement adjacent-revoke
      // grace. The grace state itself always starts fresh for this file.
      const result = assertStatementModeFile({
        file,
        statements,
        snapshots,
        baselineSnapshot: platformBaseline,
        allowedTerminalMigrations: terminalMigrationsThroughCurrentFile,
        previousSnapshot,
      });

      problems.push(...result.problems);
      report.push(...result.report);
      previousSnapshot = result.previousSnapshot;
    } else {
      runSupabaseQuery(file.path, { json: false, multiStatement: true, mutatesSchema: true });
    }

    applied.push(file);

    const label = `boundary after ${file.name}`;
    const snapshot = mode === "statement" ? previousSnapshot : takeSnapshot(label);

    problems.push(...assertSnapshotUsable(snapshot, label, expectedObjectCounts(applied)));
    problems.push(...assertExaminedGrowth(previousSnapshot, snapshot, label));

    // Every file boundary must equal the platform baseline plus exactly the
    // grants from terminal migrations reached so far. This generalizes the
    // original single-final-terminal invariant to later grant-terminal files
    // without expecting future grants early or forgetting prior approvals.
    // throughFile also keeps a superseded historical signature expected until
    // its own revoking migration has been applied, and excludes it after.
    problems.push(
      ...assertFinalBoundary({
        label,
        baselineSnapshot: platformBaseline,
        snapshot,
        terminalMigrations: terminalMigrationsThroughCurrentFile,
        throughFile: file.name,
      }),
    );

    previousSnapshot = snapshot;
    report.push({ boundary: label, snapshot });
    console.log(`snapshot taken: ${label}`);
  }

  // Catalog inspection says what the ACLs are. The live probe says what a real
  // privileged session can actually do.
  const liveProbe = join(repositoryRoot, ...LIVE_AUTHORIZATION_PROBE_FILE.split("/"));
  validateTransactionalSuite(readFileSync(liveProbe, "utf8"), LIVE_AUTHORIZATION_PROBE_FILE);
  parseSupabaseQueryResult(
    runSupabaseQuery(liveProbe, { multiStatement: true }),
    LIVE_AUTHORIZATION_PROBE_FILE,
  );
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
