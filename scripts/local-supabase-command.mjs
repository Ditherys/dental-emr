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

const LOCAL_DATABASE_TEST_COMMAND_TEMPLATE = Object.freeze([
  "docker",
  "--context",
  "desktop-linux",
  "exec",
  "-i",
  "<resolved-local-container>",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
]);

const LOCAL_DOCKER_ENDPOINT = "npipe:////./pipe/dockerDesktopLinuxEngine";
const LOCAL_CREDENTIAL_TABLE_ROW =
  /(│\s*(?:publishable|secret(?: key)?|access key|jwt secret|anon key|service_role key)\s*│)\s*[^│\r\n]+/gi;
const DATABASE_URL = /\b(?:postgres|postgresql):\/\/[^\s]+/gi;

export function redactLocalSupabaseOutput(output) {
  return output
    .replaceAll(DATABASE_URL, "[REDACTED_DATABASE_URL]")
    .replace(LOCAL_CREDENTIAL_TABLE_ROW, "$1 [REDACTED]");
}

export function assertLocalSupabaseCommand(command) {
  const containsRemoteSelector = command.some(
    (argument) =>
      argument === "--linked" ||
      argument.startsWith("--linked=") ||
      argument === "--db-url" ||
      argument.startsWith("--db-url=") ||
      argument === "--project-ref" ||
      argument.startsWith("--project-ref="),
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
    command.length !== LOCAL_DATABASE_TEST_COMMAND_TEMPLATE.length ||
    command[0] !== "docker" ||
    command[1] !== "--context" ||
    command[2] !== "desktop-linux" ||
    command[3] !== "exec" ||
    command[4] !== "-i" ||
    !/^supabase_db_[a-z0-9_-]+$/.test(command[5]) ||
    command[6] !== "psql" ||
    command[7] !== "-U" ||
    command[8] !== "postgres" ||
    command[9] !== "-v" ||
    command[10] !== "ON_ERROR_STOP=1"
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

export function assertLocalDockerEndpoint(endpoint) {
  if (endpoint.trim() !== LOCAL_DOCKER_ENDPOINT) {
    throw new Error(
      "Local database suites require Docker Desktop's local engine endpoint.",
    );
  }
}

export function assertLocalDockerRuntime({ context, endpoint }) {
  assertLocalDockerContext(context);
  assertLocalDockerEndpoint(endpoint);
}

export function resolveLocalDockerEnvironment(environment) {
  const blocked = new Set([
    "DOCKER_HOST",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
  ]);
  const sanitized = {};

  for (const [name, value] of Object.entries(environment)) {
    if (!blocked.has(name.toUpperCase())) {
      sanitized[name] = value;
    }
  }

  sanitized.DOCKER_CONTEXT = "desktop-linux";
  return sanitized;
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

export function resolveLocalDockerDatabaseContainer(output) {
  const containers = output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => /^supabase_db_[a-z0-9_-]+$/.test(name));

  if (containers.length !== 1) {
    throw new Error(
      "Expected exactly one local Supabase Postgres container for this worktree.",
    );
  }

  return containers[0];
}

export function resolveLocalDatabaseTestCommand(suitePath, containerName) {
  if (typeof suitePath !== "string" || suitePath.trim() === "") {
    throw new Error("A local database test suite path is required.");
  }

  const command = [...LOCAL_DATABASE_TEST_COMMAND_TEMPLATE];
  command[5] = resolveLocalDockerDatabaseContainer(containerName);
  assertLocalDockerDatabaseCommand(command);
  return command;
}

export function resolveLocalCommandResultSentinel(commandName) {
  if (!Object.hasOwn(LOCAL_COMMAND_RESULT_SENTINELS, commandName)) {
    return null;
  }

  return LOCAL_COMMAND_RESULT_SENTINELS[commandName];
}
