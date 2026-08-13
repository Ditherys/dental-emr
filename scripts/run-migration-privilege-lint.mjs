/**
 * CLI entry point for the R6-B static migration privilege lint.
 *
 * Local and offline. It reads the active migration files and the approved final
 * privilege set, and contacts no database.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_EXTENSIONS,
  MIGRATIONS_DIRECTORY,
  TERMINAL_MIGRATIONS,
} from "./approved-final-grants.mjs";
import { formatViolations, lintMigrations } from "./migration-privilege-lint.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, ...MIGRATIONS_DIRECTORY.split("/"));

function fail(message) {
  console.error(`Migration privilege lint failed: ${message}`);
  process.exit(1);
}

try {
  const fileNames = readdirSync(migrationsDirectory)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort();

  if (fileNames.length === 0) {
    throw new Error(
      `No migration files were found in ${MIGRATIONS_DIRECTORY}. The lint fails closed rather than reporting a vacuous pass.`,
    );
  }

  const files = fileNames.map((name) => ({
    name,
    source: readFileSync(join(migrationsDirectory, name), "utf8"),
  }));

  const { violations, checked } = lintMigrations({
    files,
    terminalMigrations: TERMINAL_MIGRATIONS,
    approvedExtensions: APPROVED_EXTENSIONS,
  });

  if (violations.length > 0) {
    console.error(
      `\nMigration privilege lint found ${violations.length} violation(s) of the ADR-017 grant-last invariant:\n`,
    );
    console.error(formatViolations(violations));
    console.error(
      "\nSee docs/decisions/ADR-017-phase1-secure-migration-baseline.md and scripts/approved-final-grants.mjs.\n",
    );
    process.exit(1);
  }

  const approvedGrantCount = TERMINAL_MIGRATIONS.reduce(
    (total, terminal) => total + terminal.grants.length,
    0,
  );

  console.log(
    [
      "Migration privilege lint passed.",
      `  migration files checked      : ${checked.files}`,
      `  SQL statements parsed        : ${checked.statements}`,
      `  GRANT/REVOKE statements       : ${checked.privilegeStatements}`,
      `  grant-terminal migrations     : ${checked.terminalMigrations}`,
      `  approved final privileges     : ${approvedGrantCount}`,
      "  invariant                     : files outside a registered grant-terminal migration grant nothing;",
      "                                  every privilege-bearing object revokes PUBLIC/anon/authenticated adjacent to creation;",
      "                                  the terminal migration's grants equal the approved set exactly.",
    ].join("\n"),
  );
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
