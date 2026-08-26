import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLocalDockerEndpointIsSafe,
  resolveLocalDockerEnvironment,
} from "./local-supabase-command.mjs";
import {
  MINIO_CONTAINER_NAME,
  MINIO_HEALTH_URL,
  interpretMinioContainerState,
  isSuccessfulMinioHealthProbe,
  mergeLocalStorageEnvironment,
  redactMinioOutput,
  resolveMinioBucketProvisioningCommands,
  resolveMinioContainerCreateCommand,
  resolveMinioContainerInspectCommand,
  resolveMinioContainerStartCommand,
  resolveMinioContainerStopCommand,
  resolveMinioImageInspectCommand,
  resolveMinioImagePullCommand,
  resolveMinioStorageCommand,
} from "./local-minio-storage.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const HEALTH_WAIT_TIMEOUT_MS = 90_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;
const HEALTH_PROBE_TIMEOUT_MS = 5_000;

function fail(message) {
  console.error(`Local MinIO command refused to continue: ${message}`);
  process.exit(1);
}

function runDocker(arguments_, environment) {
  const result = spawnSync("docker", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    maxBuffer: 16 * 1024 * 1024,
    stdio: "pipe",
  });

  if (result.error) {
    throw new Error("The Docker CLI could not start. Is Docker Desktop running?");
  }

  return result;
}

function forwardRedactedResult(result) {
  if (result.stdout) {
    process.stdout.write(redactMinioOutput(result.stdout));
  }

  if (result.stderr) {
    process.stderr.write(redactMinioOutput(result.stderr));
  }
}

function runRedactedDocker(arguments_, environment) {
  const result = runDocker(arguments_, environment);
  forwardRedactedResult(result);
  return result;
}

async function waitForMinioHealth() {
  const deadline = Date.now() + HEALTH_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(MINIO_HEALTH_URL, {
        signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
      });

      if (
        isSuccessfulMinioHealthProbe({ ok: response.ok, status: response.status })
      ) {
        return;
      }
    } catch {
      // The server is not accepting connections yet; keep polling.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, HEALTH_POLL_INTERVAL_MS));
  }

  throw new Error(
    `${MINIO_CONTAINER_NAME} did not report a live health endpoint in time.`,
  );
}

async function probeMinioHealthOnce() {
  try {
    const response = await fetch(MINIO_HEALTH_URL, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    return isSuccessfulMinioHealthProbe({ ok: response.ok, status: response.status })
      ? "healthy"
      : "unhealthy";
  } catch {
    return "unhealthy";
  }
}

function ensureLocalStorageEnvironmentFile() {
  const environmentFilePath = join(repositoryRoot, ".env.local");
  let existingContent = "";

  try {
    existingContent = readFileSync(environmentFilePath, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }

    existingContent = "";
  }

  const { content, addedKeys } = mergeLocalStorageEnvironment(existingContent);

  if (addedKeys.length === 0) {
    console.log(".env.local already carries the STORAGE_* entries; values not printed.");
    return;
  }

  writeFileSync(environmentFilePath, content, "utf8");
  console.log(`Appended ${addedKeys.length} STORAGE_* entries to .env.local; values not printed.`);
}

function inspectMinioContainer(environment) {
  const result = runDocker(resolveMinioContainerInspectCommand(), environment);

  if (result.status !== 0) {
    return "missing";
  }

  return interpretMinioContainerState(result.stdout);
}

async function startMinio(environment) {
  const imageResult = runDocker(resolveMinioImageInspectCommand(), environment);

  if (imageResult.status !== 0) {
    const pullResult = runRedactedDocker(resolveMinioImagePullCommand(), environment);

    if (pullResult.status !== 0) {
      throw new Error("The MinIO image could not be pulled.");
    }
  }

  const state = inspectMinioContainer(environment);

  if (state === "missing") {
    const createResult = runRedactedDocker(
      resolveMinioContainerCreateCommand(),
      environment,
    );

    if (createResult.status !== 0) {
      throw new Error(`${MINIO_CONTAINER_NAME} could not be created.`);
    }
  } else if (state !== "running") {
    const startResult = runRedactedDocker(
      resolveMinioContainerStartCommand(),
      environment,
    );

    if (startResult.status !== 0) {
      throw new Error(`${MINIO_CONTAINER_NAME} could not be started.`);
    }
  } else {
    console.log(`${MINIO_CONTAINER_NAME} is already running.`);
  }

  await waitForMinioHealth();

  for (const command of resolveMinioBucketProvisioningCommands()) {
    const bucketResult = runRedactedDocker(command, environment);

    if (bucketResult.status !== 0) {
      throw new Error("The dental-emr-local bucket could not be ensured.");
    }
  }

  ensureLocalStorageEnvironmentFile();
  console.log("PASS storage:start:local (dental-emr-local ready)");
}

function stopMinio(environment) {
  const state = inspectMinioContainer(environment);

  if (state === "missing") {
    console.log(`${MINIO_CONTAINER_NAME} is not present; nothing to stop.`);
    return;
  }

  const stopResult = runRedactedDocker(resolveMinioContainerStopCommand(), environment);

  if (stopResult.status !== 0) {
    throw new Error(`${MINIO_CONTAINER_NAME} could not be stopped.`);
  }

  console.log("PASS storage:stop:local");
}

async function showMinioStatus(environment) {
  const state = inspectMinioContainer(environment);

  if (state === "missing") {
    console.log(`${MINIO_CONTAINER_NAME}: missing`);
    return;
  }

  if (state !== "running") {
    console.log(`${MINIO_CONTAINER_NAME}: stopped`);
    return;
  }

  const health = await probeMinioHealthOnce();
  console.log(`${MINIO_CONTAINER_NAME}: running (${health})`);
}

try {
  const commandName = resolveMinioStorageCommand(process.argv[2]);
  const dockerEnvironment = resolveLocalDockerEnvironment(process.env);
  assertLocalDockerEndpointIsSafe(dockerEnvironment);

  if (commandName === "start") {
    await startMinio(dockerEnvironment);
  } else if (commandName === "stop") {
    stopMinio(dockerEnvironment);
  } else {
    await showMinioStatus(dockerEnvironment);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
