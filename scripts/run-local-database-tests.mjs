import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLocalDockerRuntime,
  resolveLocalDockerEnvironment,
  resolveLocalDatabaseTestCommand,
} from "./local-supabase-command.mjs";
import {
  DATABASE_TEST_SUITES,
  formatRemoteDatabaseQueryFailure as formatDatabaseQueryFailure,
  parseSupabaseQueryResult,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const suites = DATABASE_TEST_SUITES.map((filename) =>
  join(repositoryRoot, "supabase", "tests", filename),
);

function fail(message) {
  console.error(`Local database test runner refused to continue: ${message}`);
  process.exit(1);
}

function assertVerifiedLocalDockerRuntime() {
  const dockerEnvironment = resolveLocalDockerEnvironment(process.env);
  const context = spawnSync("docker", ["context", "show"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: dockerEnvironment,
  });

  if (context.error || context.status !== 0) {
    throw new Error("Docker Desktop's local context could not be inspected.");
  }

  const endpoint = spawnSync(
    "docker",
    [
      "context",
      "inspect",
      "desktop-linux",
      "--format",
      "{{.Endpoints.docker.Host}}",
    ],
    { cwd: repositoryRoot, encoding: "utf8", env: dockerEnvironment },
  );

  if (endpoint.error || endpoint.status !== 0) {
    throw new Error("Docker Desktop's local engine endpoint could not be inspected.");
  }

  const project = spawnSync(
    "docker",
    [
      "--context",
      "desktop-linux",
      "inspect",
      "--format",
      '{{ index .Config.Labels "com.supabase.cli.project" }}',
      "supabase_db_dental-emr",
    ],
    { cwd: repositoryRoot, encoding: "utf8", env: dockerEnvironment },
  );

  if (project.error || project.status !== 0) {
    throw new Error("The known local Supabase Postgres container could not be inspected.");
  }

  assertLocalDockerRuntime({
    context: context.stdout ?? "",
    endpoint: endpoint.stdout ?? "",
    project: project.stdout ?? "",
  });
  return dockerEnvironment;
}

try {
  const dockerEnvironment = assertVerifiedLocalDockerRuntime();

  for (const suite of suites) {
    const suiteLabel = relative(repositoryRoot, suite).replaceAll("\\", "/");
    const source = readFileSync(suite, "utf8");
    validateTransactionalSuite(source, suiteLabel);

    const command = resolveLocalDatabaseTestCommand(suite);
    const result = spawnSync(command[0], command.slice(1), {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: source,
      env: dockerEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    });

    if (result.error) {
      throw new Error(`${suiteLabel} could not start local Postgres execution.`);
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
