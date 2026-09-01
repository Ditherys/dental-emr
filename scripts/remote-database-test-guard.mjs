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
  "db-provision-test-tooling",
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
  // R6-C1 / ADR-018. Installs pgTAP into a non-production project only. It is
  // deliberately not a migration, so it is listed here rather than being
  // reachable through `db push`, and it is treated as migration-applying so the
  // R6 freeze acknowledgement is required for it too.
  "db-provision-test-tooling": [
    "db",
    "query",
    "--linked",
    "--output-format",
    "json",
    "--file",
    "supabase/provisioning/nonproduction/001_database_test_tooling.sql",
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

const PROVISIONING_SENTINEL_COMMAND = Object.freeze([
  "db",
  "query",
  "--linked",
  "--output-format",
  "json",
  "--file",
  "supabase/provisioning/nonproduction/002_database_test_tooling_sentinel.sql",
]);

/**
 * The pgTAP suites the remote runner executes, in execution order.
 *
 * Exported so a unit test can assert it matches `supabase/tests/` exactly. An
 * authored suite that is never registered here is worse than a missing test: it
 * reads as coverage while proving nothing.
 */
export const DATABASE_TEST_SUITES = Object.freeze([
  "schema.test.sql",
  "foundation_rls.test.sql",
  "audit_metadata_contract.test.sql",
  "odontogram_domain_expansion.test.sql",
  "odontogram_feature_details.test.sql",
  "odontogram_o2_o4_contract_repair.test.sql",
  "odontogram_permission_contract.test.sql",
  "odontogram_relationships.test.sql",
  "odontogram_revamp_relationship_perio.test.sql",
  "odontogram_revamp_permission_contract.test.sql",
  "odontogram_revamp_rpcs.test.sql",
  "odontogram_atomic_completion_revamp.test.sql",
  "odontogram_rpcs_v2.test.sql",
  "periodontal_charting.test.sql",
  "clinical_photographs.test.sql",
  "periodontal_current_state_guard.test.sql",
  "procedure_cases_and_plan_details.test.sql",
  "workforce_invitations.test.sql",
  "patient_authorization.test.sql",
  "patient_identity.test.sql",
  "patient_contacts_relationships.test.sql",
  "patient_create.test.sql",
  "patient_reads.test.sql",
  "patient_demographics_write.test.sql",
  "patient_children_write.test.sql",
  "patient_lifecycle.test.sql",
"provider_permission_contract.test.sql",
  "provider_foundation.test.sql",
  "provider_availability.test.sql",
  "procedure_foundation.test.sql",
  "queue_foundation.test.sql",
  "queue_permission_contract.test.sql",
  "queue_rpcs.test.sql",
  "recall_foundation.test.sql",
  "recall_permission_contract.test.sql",
  "recall_rpcs.test.sql",
  "reservation_ledgers.test.sql",
  "resource_foundation.test.sql",
  "scheduling_reads.test.sql",
  "site_permission_contract.test.sql",
  "site_rpcs.test.sql",
  "file_objects_foundation.test.sql",
  "file_upload_rpcs.test.sql",
  "file_read_rpcs.test.sql",
  "file_archive_rpc.test.sql",
  "calendar_permission_contract.test.sql",
  "calendar_sync_foundation.test.sql",
  "calendar_sync_rpcs.test.sql",
  "clinical_permission_contract.test.sql",
  "clinical_rpcs.test.sql",
  "unified_clinical_visit.test.sql",
  "current_managed_visit.test.sql",
  "clinical_record_composer.test.sql",
  "clinical_schema.test.sql",
  "communication_permission_contract.test.sql",
  "communication_rpcs.test.sql",
  "communications_foundation.test.sql",
  "document_permission_contract.test.sql",
  "document_rpcs.test.sql",
  "documents_foundation.test.sql",
  "document_treatment_plan.test.sql",
  "acquisition_catalogs.test.sql",
  "acquisition_report.test.sql",
  "appointment_foundation.test.sql",
  "appointment_permission_contract.test.sql",
  "appointment_rpcs.test.sql",
  "patient_attribution_columns.test.sql",
  "patient_attribution_rpcs.test.sql",
  "patient_referrals_foundation.test.sql",
"patient_referral_rpcs.test.sql",
  "audit_foundation.test.sql",
  "specialist_permission_contract.test.sql",
  "specialist_request_rpcs.test.sql",
  "specialist_requests_foundation.test.sql",
  "tooth_conditions.test.sql",
  "treatment_item_execution.test.sql",
  "treatment_plan_estimated_fee_contract.test.sql",
  "treatment_plan_rpcs.test.sql",
  "treatment_plans.test.sql",
  "session_authorization_boundaries.test.sql",
  "seed_security_fixtures.test.sql",
  "booking_permission_contract.test.sql",
  "booking_public_rpcs.test.sql",
  "booking_review_rpcs.test.sql",
  "branch_lifecycle.test.sql",
  "intake_consent_templates.test.sql",
  "intake_forms.test.sql",
  "intake_permission_contract.test.sql",
  "intake_rpcs.test.sql",
  "inventory_foundation.test.sql",
  "inventory_permission_contract.test.sql",
  "inventory_rpcs.test.sql",
"operational_analytics.test.sql",
  "owner_full_access.test.sql",
  "billing_permission_contract.test.sql",
  "billing_authorization.test.sql",
  "procedure_installment_schedules.test.sql",
  "financial_analytics.test.sql",
  "billing_charge_ledger.test.sql",
"billing_attribution.test.sql",
  "billing_payment_allocations.test.sql",
  "billing_corrections.test.sql",
  "billing_procedure_configuration_authorization.test.sql",
  "provider_compensation.test.sql",
  "postdated_cheques.test.sql",
]);

const PROJECT_ID_PATTERN = /^[a-z0-9]{8,40}$/;
const ANSI_ESCAPE_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const DATABASE_URL = /\b(?:postgres|postgresql):\/\/[^\s]+/gi;
const CREDENTIAL_ASSIGNMENT =
  /\b(?:password|token|api[_-]?key|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|R6D_DB_URL_OVERRIDE)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s]+/gi;
const MAX_REMOTE_DATABASE_DIAGNOSTIC_LENGTH = 8_192;

function required(environment, name) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for remote database tests.`);
  }

  return value;
}

/**
 * Produces a bounded diagnostic from a failed Supabase CLI invocation without
 * exposing connection credentials. Only stderr is accepted: stdout may contain
 * database query rows and must never be surfaced by the remote test runner.
 */
function stdoutFailureDiagnostic(stdout) {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed) || Array.isArray(parsed?.rows)) {
      return "";
    }

    return typeof parsed?.message === "string" ? parsed.message : "";
  } catch {
    return trimmed;
  }
}

export function formatRemoteDatabaseQueryFailure(stderr, stdout = "") {
  return `${stderr}\n${stdoutFailureDiagnostic(stdout)}`
    .replaceAll(ANSI_ESCAPE_SEQUENCE, "")
    .replaceAll(DATABASE_URL, "[REDACTED_DATABASE_URL]")
    .replaceAll(CREDENTIAL_ASSIGNMENT, "[REDACTED_CREDENTIAL]")
    .replaceAll(BEARER_TOKEN, "Bearer [REDACTED_TOKEN]")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REMOTE_DATABASE_DIAGNOSTIC_LENGTH);
}

/**
 * Commands whose single result row must carry an explicit success sentinel.
 *
 * A guarded command that produced no rows, was silently skipped, or partially
 * applied must not read as success merely because the CLI exited zero.
 */
const COMMAND_RESULT_SENTINELS = Object.freeze({
  "db-provision-test-tooling": Object.freeze({
    column: "p1_provision_result",
    value: "P1_PROVISION_PASS",
  }),
});

export function resolveCiDatabaseCommand(commandName) {
  if (!Object.hasOwn(CI_DATABASE_COMMANDS, commandName)) {
    throw new Error("Select one of the allowlisted CI database commands.");
  }

  const command = CI_DATABASE_COMMANDS[commandName];
  return [...command];
}

export function resolveCiDatabaseCommands(commandName) {
  const command = resolveCiDatabaseCommand(commandName);

  if (commandName !== "db-provision-test-tooling") {
    return [command];
  }

  return [command, [...PROVISIONING_SENTINEL_COMMAND]];
}

export function resolveCommandResultSentinel(commandName) {
  if (!Object.hasOwn(COMMAND_RESULT_SENTINELS, commandName)) {
    return null;
  }

  return COMMAND_RESULT_SENTINELS[commandName];
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

  // R6-C1: the DEV reference is mandatory, not merely honoured when present.
  // An omitted value used to make the "TEST must differ from DEV" check pass
  // vacuously, so forgetting to export it weakened the strongest protection the
  // non-disposable DEV project has.
  required(environment, "SUPABASE_DEV_PROJECT_ID");

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

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A multi-statement query run via `psql` (scripts/run-boundary-privilege-
 * invariant.mjs's R6D_DB_URL_OVERRIDE fallback, since the Supabase CLI's
 * `--db-url` cannot run more than one statement) returns psql's default
 * aligned plain-text table format, not the Supabase CLI's JSON: one such
 * block per statement in the script, in order.
 *
 * Matches the exact shape -- column header, dash separator, a captured value,
 * "(1 row)" -- rather than a loose substring check, so pgTAP's own
 * "ok N - ..." output can never coincidentally satisfy it. Critically, this
 * evaluates only the LAST such block for the expected column, mirroring the
 * JSON path's `rows.length !== 1` strictness: an earlier statement in the
 * script that happens to render a same-shaped block (e.g. a leftover debug
 * `select ... as p1_test_result`) must never be mistaken for the script's
 * actual, final completion row.
 */
export function hasPsqlPlainTextCompletion(
  output,
  expectation = { column: "p1_test_result", value: "P1_TEST_PASS" },
) {
  const blockPattern = new RegExp(
    `^\\s*${escapeRegExp(expectation.column)}\\s*$\\r?\\n-+\\r?\\n\\s*(.*?)\\s*$\\r?\\n\\(1 row\\)`,
    "gm",
  );

  let lastValue = null;
  let match;

  while ((match = blockPattern.exec(output)) !== null) {
    lastValue = match[1];
  }

  return lastValue !== null || hasPsqlUnalignedCompletion(output, expectation);
}

function hasPsqlUnalignedCompletion(output, expectation) {
  const failureValue = expectation.value.replace(/PASS$/, "FAIL");

  return new RegExp(
    `(?:^|\\r?\\n)(?:${escapeRegExp(expectation.value)}|${escapeRegExp(failureValue)})(?:\\r?\\n|$)`,
  ).test(output.trim());
}

function matchesPsqlUnalignedCompletion(output, expectation) {
  return output.trim().split(/\r?\n/).at(-1) === expectation.value;
}

function matchesPsqlPlainTextCompletion(output, expectation) {
  const blockPattern = new RegExp(
    `^\\s*${escapeRegExp(expectation.column)}\\s*$\\r?\\n-+\\r?\\n\\s*(.*?)\\s*$\\r?\\n\\(1 row\\)`,
    "gm",
  );

  let lastValue = null;
  let match;

  while ((match = blockPattern.exec(output)) !== null) {
    lastValue = match[1];
  }

  return lastValue === expectation.value;
}

export function parseSupabaseQueryResult(
  output,
  filename,
  expectation = { column: "p1_test_result", value: "P1_TEST_PASS" },
) {
  let result;

  try {
    result = JSON.parse(output);
  } catch {
    if (
      !matchesPsqlPlainTextCompletion(output, expectation) &&
      !matchesPsqlUnalignedCompletion(output, expectation)
    ) {
      throw new Error(
        `${filename} did not report ${expectation.value} in ${expectation.column}.`,
      );
    }

    return;
  }

  // Supabase CLI 2.113.0 emits { rows: [...] } on Windows and a bare row
  // array on Linux for the same `db query --output-format json` invocation.
  // Normalize only those two exact envelopes; the one-row invariant remains
  // fail-closed in both cases.
  const rows = Array.isArray(result) ? result : result.rows;

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`${filename} did not return one completion row.`);
  }

  if (rows[0]?.[expectation.column] !== expectation.value) {
    throw new Error(
      `${filename} did not report ${expectation.value} in ${expectation.column}.`,
    );
  }
}

export function readLinkedProjectId(filename) {
  return readFileSync(filename, "utf8").trim();
}

export const PGTAP_PRESENCE_CHECK_FILE = "supabase/verification/r6d/pgtap-presence-check.sql";

/**
 * Fails closed, with an actionable remedy, if pgTAP was never provisioned on
 * the linked project. Without this, live-authorization-probe.sql fails deep
 * inside its own execution with a cryptic "function extensions.no_plan() does
 * not exist" error — after R6-D has already spent time replaying every
 * baseline migration. See ADR-018: pgTAP is deliberately not part of the
 * canonical baseline and must be provisioned separately per environment.
 */
export function assertPgtapIsProvisioned(output) {
  let result;

  try {
    result = JSON.parse(output);
  } catch {
    throw new Error(`${PGTAP_PRESENCE_CHECK_FILE} returned malformed Supabase CLI JSON.`);
  }

  if (!Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new Error(`${PGTAP_PRESENCE_CHECK_FILE} did not return one row.`);
  }

  if (result.rows[0]?.r6d_pgtap_presence === "R6D_PGTAP_PRESENT") {
    return;
  }

  throw new Error(
    "pgTAP is not installed on the linked project. live-authorization-probe.sql requires it and pgTAP is " +
      "deliberately not part of the canonical baseline (ADR-018), so it must be provisioned separately against " +
      "this exact disposable Cloud TEST project before R6-D runs:\n" +
      "  npm run db:provision:test\n" +
      "The historical R6 migration freeze was lifted at R6-F; no freeze acknowledgement is required.",
  );
}
