import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveLocalCommandResultSentinel,
  resolveLocalSupabaseCommand,
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

try {
  const commandName = process.argv[2];
  const command = resolveLocalSupabaseCommand(commandName);

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  const sentinel = resolveLocalCommandResultSentinel(commandName);
  const result = spawnSync(process.execPath, [supabaseCli, ...command], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
    stdio: sentinel ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw new Error("The pinned Supabase CLI could not start.");
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (sentinel) {
    parseSupabaseQueryResult(result.stdout ?? "", commandName, sentinel);
    console.log(`PASS ${commandName} (${sentinel.value})`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
