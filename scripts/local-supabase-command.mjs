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
