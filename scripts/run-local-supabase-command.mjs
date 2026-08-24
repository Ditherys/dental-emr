import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLocalDockerContext,
  assertLocalDockerEndpoint,
  resolveLocalDockerEnvironment,
  resolveLocalCommandResultSentinel,
  resolveLocalSupabaseCommands,
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

function assertLocalDockerEndpointIsSafe(environment) {
  const context = spawnSync("docker", ["context", "show"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });
  const endpoint = spawnSync(
    "docker",
    ["context", "inspect", "desktop-linux", "--format", "{{.Endpoints.docker.Host}}"],
    { cwd: repositoryRoot, encoding: "utf8", env: environment },
  );

  if (context.error || context.status !== 0 || endpoint.error || endpoint.status !== 0) {
    throw new Error("Docker Desktop's local endpoint could not be inspected.");
  }

  assertLocalDockerContext(context.stdout ?? "");
  assertLocalDockerEndpoint(endpoint.stdout ?? "");
}

try {
  const commandName = process.argv[2];
  const commands = resolveLocalSupabaseCommands(commandName);
  const dockerEnvironment = resolveLocalDockerEnvironment(process.env);
  assertLocalDockerEndpointIsSafe(dockerEnvironment);

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  const sentinel = resolveLocalCommandResultSentinel(commandName);
  let sentinelOutput = "";

  for (const [index, command] of commands.entries()) {
    const capturesSentinel = sentinel && index === commands.length - 1;
    const result = spawnSync(process.execPath, [supabaseCli, ...command], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: dockerEnvironment,
      maxBuffer: 16 * 1024 * 1024,
      stdio: capturesSentinel ? ["inherit", "pipe", "inherit"] : "inherit",
    });

    if (result.error) {
      throw new Error("The pinned Supabase CLI could not start.");
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    if (capturesSentinel) {
      sentinelOutput = result.stdout ?? "";
    }
  }

  if (sentinel) {
    parseSupabaseQueryResult(sentinelOutput, commandName, sentinel);
    console.log(`PASS ${commandName} (${sentinel.value})`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
