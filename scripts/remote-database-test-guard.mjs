import { readFileSync } from "node:fs";

export const DATABASE_TEST_CONFIRMATION =
  "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_CLOUD_TEST_PROJECT";

// R6 temporary migration freeze. While supabase/MIGRATION_FREEZE.md exists, the
// Git baseline intentionally disagrees with the linked DEV migration history
// until R6-F reconciliation. See docs/decisions/ADR-017 and that file.
export const MIGRATION_FREEZE_ACK = "I_ACKNOWLEDGE_THE_R6_MIGRATION_FREEZE";

const MIGRATION_APPLYING_COMMANDS = Object.freeze([
  "db-push-dry",
  "db-push",
  "db-seed",
]);

const CI_DATABASE_COMMANDS = Object.freeze({
  "db-push-dry": ["db", "push", "--linked", "--dry-run"],
  "db-push": ["db", "push", "--linked", "--yes"],
  "db-seed": [
    "db",
    "query",
    "--linked",
    "--file",
    "supabase/seed.sql",
  ],
  "db-lint": [
    "db",
    "lint",
    "--linked",
    "--schema",
    "public",
    "--level",
    "warning",
    "--fail-on",
    "error",
  ],
  "db-advisors": [
    "db",
    "advisors",
    "--linked",
    "--type",
    "security",
    "--level",
    "warn",
    "--fail-on",
    "error",
  ],
});

const PROJECT_ID_PATTERN = /^[a-z0-9]{8,40}$/;

function required(environment, name) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for remote database tests.`);
  }

  return value;
}

export function resolveCiDatabaseCommand(commandName) {
  if (!Object.hasOwn(CI_DATABASE_COMMANDS, commandName)) {
    throw new Error("Select one of the allowlisted CI database commands.");
  }

  const command = CI_DATABASE_COMMANDS[commandName];
  return [...command];
}

function persistedAcknowledgementWarning(commandName) {
  return (
    `A migration freeze bypass token is present in the environment while ` +
    `running "${commandName}", which does not need one. A bypass token must ` +
    `not persist in a shell session. Clear it:\n` +
    `  Remove-Item Env:\\MIGRATION_FREEZE_ACK, Env:\\MIGRATION_FREEZE_ACK_COMMAND`
  );
}

/**
 * Refuses migration-applying commands while the R6 freeze file exists.
 *
 * Returns warnings for the caller to surface; throws when the command is
 * refused. The acknowledgement is narrowly scoped on purpose: it authorizes one
 * named command, so a token left exported after an approved step cannot silently
 * authorize the next one. It is additive — every pre-existing Cloud TEST target
 * check in validateRemoteDatabaseTestEnvironment still applies in full.
 */
export function assertMigrationFreezeAllows(
  commandName,
  freezeIsActive,
  environment,
) {
  const warnings = [];
  const acknowledgementPresent =
    (environment.MIGRATION_FREEZE_ACK?.trim() ?? "") !== "" ||
    (environment.MIGRATION_FREEZE_ACK_COMMAND?.trim() ?? "") !== "";

  if (!freezeIsActive || !MIGRATION_APPLYING_COMMANDS.includes(commandName)) {
    if (acknowledgementPresent) {
      warnings.push(persistedAcknowledgementWarning(commandName));
    }

    return warnings;
  }

  if (environment.MIGRATION_FREEZE_ACK?.trim() !== MIGRATION_FREEZE_ACK) {
    throw new Error(
      `The R6 migration freeze is active (see supabase/MIGRATION_FREEZE.md). ` +
        `"${commandName}" is refused until R6-F reconciliation. The approved ` +
        `Cloud TEST steps must set MIGRATION_FREEZE_ACK; every existing Cloud ` +
        `TEST target check still applies.`,
    );
  }

  if (environment.MIGRATION_FREEZE_ACK_COMMAND?.trim() !== commandName) {
    throw new Error(
      `The R6 migration freeze acknowledgement is scoped to one command. ` +
        `Set MIGRATION_FREEZE_ACK_COMMAND to exactly "${commandName}" to ` +
        `authorize this step. This prevents an acknowledgement left in a shell ` +
        `session from silently authorizing a different migration command.`,
    );
  }

  warnings.push(
    [
      "",
      "  ============================================================",
      "   R6 MIGRATION FREEZE BYPASS IN USE",
      `   command : ${commandName}`,
      "   This is only approved for the disposable Cloud TEST project.",
      "   If this is DEV, stop now — see supabase/MIGRATION_FREEZE.md.",
      "  ============================================================",
      "",
    ].join("\n"),
  );

  return warnings;
}

export function validateRemoteDatabaseTestEnvironment(
  environment,
  linkedProjectId,
) {
  if (required(environment, "APP_ENVIRONMENT") !== "test") {
    throw new Error("Remote database tests require APP_ENVIRONMENT=test.");
  }

  const projectId = required(environment, "SUPABASE_PROJECT_ID");
  const testProjectId = required(environment, "SUPABASE_TEST_PROJECT_ID");

  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("SUPABASE_PROJECT_ID is not a valid project reference.");
  }

  if (projectId !== testProjectId) {
    throw new Error(
      "SUPABASE_PROJECT_ID must match the explicitly designated SUPABASE_TEST_PROJECT_ID.",
    );
  }

  if (linkedProjectId.trim() !== testProjectId) {
    throw new Error(
      "The linked Supabase project does not match SUPABASE_TEST_PROJECT_ID.",
    );
  }

  for (const protectedVariable of [
    "SUPABASE_DEV_PROJECT_ID",
    "SUPABASE_PRODUCTION_PROJECT_ID",
  ]) {
    const protectedProjectId = environment[protectedVariable]?.trim();

    if (protectedProjectId && protectedProjectId === testProjectId) {
      throw new Error(
        `The designated TEST project must differ from ${protectedVariable}.`,
      );
    }
  }

  const supabaseUrl = new URL(required(environment, "NEXT_PUBLIC_SUPABASE_URL"));
  const expectedOrigin = `https://${testProjectId}.supabase.co`;

  if (
    supabaseUrl.origin !== expectedOrigin ||
    supabaseUrl.pathname !== "/" ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    supabaseUrl.username ||
    supabaseUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the exact Cloud TEST project origin.",
    );
  }

  if (
    required(environment, "DATABASE_TEST_CONFIRMATION") !==
    DATABASE_TEST_CONFIRMATION
  ) {
    throw new Error(
      "DATABASE_TEST_CONFIRMATION does not authorize the disposable Cloud TEST target.",
    );
  }

  return { projectId, supabaseUrl: supabaseUrl.origin };
}

export function validateTransactionalSuite(source, filename) {
  const executableSource = source.replace(/^\s*--.*$/gm, "").trim();

  if (!/^begin\s*;/i.test(executableSource)) {
    throw new Error(`${filename} must begin a transaction.`);
  }

  if (!/extensions\.finish\s*\(\s*\)/i.test(executableSource)) {
    throw new Error(`${filename} must finish its pgTAP plan.`);
  }

  if (!/rollback\s*;\s*$/i.test(executableSource)) {
    throw new Error(`${filename} must end with ROLLBACK.`);
  }
}

export function parseSupabaseQueryResult(output, filename) {
  let result;

  try {
    result = JSON.parse(output);
  } catch {
    throw new Error(`${filename} returned malformed Supabase CLI JSON.`);
  }

  if (!Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new Error(`${filename} did not return one pgTAP completion row.`);
  }

  if (result.rows[0]?.p1_test_result !== "P1_TEST_PASS") {
    throw new Error(`${filename} reported a pgTAP failure.`);
  }
}

export function readLinkedProjectId(filename) {
  return readFileSync(filename, "utf8").trim();
}
