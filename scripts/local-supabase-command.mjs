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

const LOCAL_PROVISIONING_SENTINEL_COMMAND = Object.freeze([
  "db",
  "query",
  "--local",
  "--output-format",
  "json",
  "--file",
  "supabase/provisioning/nonproduction/002_database_test_tooling_sentinel.sql",
]);

const LOCAL_DATABASE_TEST_COMMAND = Object.freeze([
  "docker",
  "exec",
  "-i",
  "supabase_db_dental-emr",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
]);

export function assertLocalSupabaseCommand(command) {
  const containsRemoteSelector = command.some(
    (argument) =>
      argument === "--linked" ||
      argument.startsWith("--linked=") ||
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

export function assertLocalDockerDatabaseCommand(command) {
  if (
    !Array.isArray(command) ||
    command.length !== LOCAL_DATABASE_TEST_COMMAND.length ||
    command.some((argument, index) => argument !== LOCAL_DATABASE_TEST_COMMAND[index])
  ) {
    throw new Error(
      "A local database suite must execute only in the known local Postgres container.",
    );
  }
}

export function assertLocalDockerContext(context) {
  if (context.trim() !== "desktop-linux") {
    throw new Error(
      "Local database suites require Docker Desktop's desktop-linux context.",
    );
  }
}

export function assertLocalDockerProject(project) {
  if (project.trim() !== "dental-emr") {
    throw new Error(
      "Local database suites require the dental-emr local Supabase project.",
    );
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

export function resolveLocalSupabaseCommands(commandName) {
  const command = resolveLocalSupabaseCommand(commandName);

  if (commandName !== "provision-test-tooling") {
    return [command];
  }

  const sentinelCommand = [...LOCAL_PROVISIONING_SENTINEL_COMMAND];
  assertLocalSupabaseCommand(sentinelCommand);
  return [command, sentinelCommand];
}

export function resolveLocalDatabaseTestCommand(suitePath) {
  if (typeof suitePath !== "string" || suitePath.trim() === "") {
    throw new Error("A local database test suite path is required.");
  }

  const command = [...LOCAL_DATABASE_TEST_COMMAND];
  assertLocalDockerDatabaseCommand(command);
  return command;
}

export function resolveLocalCommandResultSentinel(commandName) {
  if (!Object.hasOwn(LOCAL_COMMAND_RESULT_SENTINELS, commandName)) {
    return null;
  }

  return LOCAL_COMMAND_RESULT_SENTINELS[commandName];
}
