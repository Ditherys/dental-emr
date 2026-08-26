export const MINIO_CONTAINER_NAME = "dental-emr-minio";
export const MINIO_IMAGE = "minio/minio";
export const MINIO_DATA_VOLUME = "dental-emr-minio-data";
export const MINIO_API_HOST_PORT = 9000;
export const MINIO_CONSOLE_HOST_PORT = 9001;
export const MINIO_HEALTH_URL = "http://127.0.0.1:9000/minio/health/live";

const LOCAL_MINIO_ROOT_USER = "minioadmin";
const LOCAL_MINIO_ROOT_PASSWORD = "minioadmin";

const STORAGE_ENVIRONMENT_ENTRIES = Object.freeze({
  STORAGE_PROVIDER: "s3",
  STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  STORAGE_BUCKET: "dental-emr-local",
  STORAGE_ACCESS_KEY: LOCAL_MINIO_ROOT_USER,
  STORAGE_SECRET_KEY: LOCAL_MINIO_ROOT_PASSWORD,
  STORAGE_REGION: "auto",
});

export const MINIO_CORS_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
export const MINIO_CORS_ALLOWED_METHODS = Object.freeze(["GET", "PUT"]);
export const MINIO_CORS_ALLOWED_HEADERS = Object.freeze([
  "content-type",
  "range",
]);
export const MINIO_CORS_EXPOSE_HEADERS = Object.freeze(["etag"]);
export const MINIO_CORS_PROBE_ORIGIN = "http://127.0.0.1:3000";

// Recent community MinIO releases removed the S3 bucket-CORS API
// (PutBucketCors answers 501 NotImplemented), so the pinned browser CORS
// posture is applied through the documented MINIO_API_CORS_* server
// environment variables at container creation instead.
const MINIO_CORS_ENVIRONMENT_PREFIX = "MINIO_API_CORS_";

export function resolveMinioCorsEnvironmentEntries() {
  return [
    [
      `${MINIO_CORS_ENVIRONMENT_PREFIX}ALLOW_ORIGIN`,
      MINIO_CORS_ALLOWED_ORIGINS.join(","),
    ],
    [
      `${MINIO_CORS_ENVIRONMENT_PREFIX}ALLOW_METHODS`,
      MINIO_CORS_ALLOWED_METHODS.join(","),
    ],
    [
      `${MINIO_CORS_ENVIRONMENT_PREFIX}ALLOW_HEADERS`,
      MINIO_CORS_ALLOWED_HEADERS.join(","),
    ],
    [
      `${MINIO_CORS_ENVIRONMENT_PREFIX}EXPOSE_HEADERS`,
      MINIO_CORS_EXPOSE_HEADERS.join(","),
    ],
  ];
}

const MINIO_STORAGE_COMMANDS = Object.freeze(["start", "stop", "status"]);

const ENVIRONMENT_KEY_PATTERN = /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function resolveMinioStorageCommand(commandName) {
  if (
    typeof commandName !== "string" ||
    !MINIO_STORAGE_COMMANDS.includes(commandName)
  ) {
    throw new Error("Select one of the allowlisted local MinIO commands.");
  }

  return commandName;
}

export function resolveMinioImageInspectCommand() {
  return ["image", "inspect", MINIO_IMAGE];
}

export function resolveMinioImagePullCommand() {
  return ["pull", MINIO_IMAGE];
}

export function resolveMinioContainerInspectCommand() {
  return [
    "inspect",
    "--format",
    "{{.State.Status}}",
    MINIO_CONTAINER_NAME,
  ];
}

export function resolveMinioContainerCreateCommand() {
  return Object.freeze([
    "run",
    "-d",
    "--name",
    MINIO_CONTAINER_NAME,
    "-p",
    `127.0.0.1:${MINIO_API_HOST_PORT}:9000`,
    "-p",
    `127.0.0.1:${MINIO_CONSOLE_HOST_PORT}:9001`,
    "-v",
    `${MINIO_DATA_VOLUME}:/data`,
    "-e",
    `MINIO_ROOT_USER=${LOCAL_MINIO_ROOT_USER}`,
    "-e",
    `MINIO_ROOT_PASSWORD=${LOCAL_MINIO_ROOT_PASSWORD}`,
    ...resolveMinioCorsEnvironmentEntries().flatMap(([name, value]) => [
      "-e",
      `${name}=${value}`,
    ]),
    MINIO_IMAGE,
    "server",
    "/data",
    "--console-address",
    ":9001",
  ]);
}

export function resolveMinioContainerEnvironmentInspectCommand() {
  return [
    "inspect",
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
    MINIO_CONTAINER_NAME,
  ];
}

export function resolveMinioContainerRemoveCommand() {
  return ["rm", "-f", MINIO_CONTAINER_NAME];
}

export function containerHasPinnedCorsEnvironment(inspectOutput) {
  const lines = String(inspectOutput ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  return resolveMinioCorsEnvironmentEntries().every(([name]) =>
    lines.some((line) => line.startsWith(`${name}=`)),
  );
}

export function resolveMinioContainerStartCommand() {
  return ["start", MINIO_CONTAINER_NAME];
}

export function resolveMinioContainerStopCommand() {
  return ["stop", MINIO_CONTAINER_NAME];
}

export function interpretMinioContainerState(inspectOutput) {
  const status = String(inspectOutput ?? "").trim().toLowerCase();

  if (status === "") {
    throw new Error("The local MinIO container state could not be interpreted.");
  }

  return status === "running" ? "running" : "stopped";
}

export function resolveMinioBucketProvisioningCommands() {
  return [
    [
      "exec",
      MINIO_CONTAINER_NAME,
      "mc",
      "alias",
      "set",
      "local",
      `http://127.0.0.1:${MINIO_API_HOST_PORT}`,
      LOCAL_MINIO_ROOT_USER,
      LOCAL_MINIO_ROOT_PASSWORD,
    ],
    [
      "exec",
      MINIO_CONTAINER_NAME,
      "mc",
      "mb",
      "--ignore-existing",
      "local/dental-emr-local",
    ],
  ];
}

export function isSuccessfulMinioHealthProbe({ ok, status }) {
  return Boolean(ok) && status === 200;
}

export function resolveMinioCorsPreflightProbeUrl(
  bucketName = STORAGE_ENVIRONMENT_ENTRIES.STORAGE_BUCKET,
) {
  return `http://127.0.0.1:${MINIO_API_HOST_PORT}/${bucketName}/cors-preflight-probe`;
}

export function interpretMinioCorsPreflightProbe({
  status,
  allowedOriginHeader,
  expectedOrigin,
}) {
  return (
    (status === 200 || status === 204) &&
    allowedOriginHeader === expectedOrigin &&
    MINIO_CORS_ALLOWED_ORIGINS.includes(expectedOrigin)
  );
}

export function resolveLocalMinioSecrets() {
  return [LOCAL_MINIO_ROOT_PASSWORD];
}

export function redactMinioOutput(output, secrets = resolveLocalMinioSecrets()) {
  let redacted = String(output ?? "");

  for (const secret of secrets.filter((value) => value !== "")) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }

  return redacted;
}

export function mergeLocalStorageEnvironment(existingContent) {
  const base = existingContent == null ? "" : String(existingContent);
  const present = new Set();

  for (const line of base.split(/\r?\n/)) {
    const match = ENVIRONMENT_KEY_PATTERN.exec(line);

    if (match) {
      present.add(match[2]);
    }
  }

  const missing = Object.entries(STORAGE_ENVIRONMENT_ENTRIES).filter(
    ([key]) => !present.has(key),
  );

  if (missing.length === 0) {
    return { content: base, addedKeys: [] };
  }

  const separator = base.length === 0 || base.endsWith("\n") ? "" : "\n";
  const block = missing.map(([key, value]) => `${key}=${value}`).join("\n");

  return {
    content: `${base}${separator}\n${block}\n`,
    addedKeys: missing.map(([key]) => key),
  };
}
