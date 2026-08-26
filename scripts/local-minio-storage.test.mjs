import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MINIO_CONTAINER_NAME,
  interpretMinioContainerState,
  isSuccessfulMinioHealthProbe,
  mergeLocalStorageEnvironment,
  redactMinioOutput,
  resolveLocalMinioSecrets,
  resolveMinioBucketProvisioningCommands,
  resolveMinioContainerCreateCommand,
  resolveMinioContainerInspectCommand,
  resolveMinioContainerStopCommand,
  resolveMinioStorageCommand,
} from "./local-minio-storage.mjs";

describe("local MinIO command allowlist", () => {
  it("returns only the exact reviewed lifecycle commands", () => {
    expect(resolveMinioStorageCommand("start")).toBe("start");
    expect(resolveMinioStorageCommand("stop")).toBe("stop");
    expect(resolveMinioStorageCommand("status")).toBe("status");
  });

  it.each([undefined, "", "db-push", "restart", "constructor", "toString"])(
    "rejects %s outside the explicit allowlist",
    (commandName) => {
      expect(() => resolveMinioStorageCommand(commandName)).toThrow(
        /allowlisted local MinIO command/,
      );
    },
  );
});

describe("local MinIO container commands", () => {
  it("creates the container on loopback ports with a named data volume", () => {
    expect(resolveMinioContainerCreateCommand()).toEqual([
      "run",
      "-d",
      "--name",
      "dental-emr-minio",
      "-p",
      "127.0.0.1:9000:9000",
      "-p",
      "127.0.0.1:9001:9001",
      "-v",
      "dental-emr-minio-data:/data",
      "-e",
      "MINIO_ROOT_USER=minioadmin",
      "-e",
      "MINIO_ROOT_PASSWORD=minioadmin",
      "minio/minio",
      "server",
      "/data",
      "--console-address",
      ":9001",
    ]);
  });

  it("inspects and stop the fixed machine-scoped container", () => {
    expect(resolveMinioContainerInspectCommand()).toEqual([
      "inspect",
      "--format",
      "{{.State.Status}}",
      "dental-emr-minio",
    ]);
    expect(resolveMinioContainerStopCommand()).toEqual([
      "stop",
      "dental-emr-minio",
    ]);
    expect(MINIO_CONTAINER_NAME).toBe("dental-emr-minio");
  });

  it.each([
    ["running\n", "running"],
    ["exited\n", "stopped"],
    ["paused", "stopped"],
    ["created", "stopped"],
  ])("interprets Docker state %s as %s", (output, expected) => {
    expect(interpretMinioContainerState(output)).toBe(expected);
  });

  it.each(["", "\n", null])("refuses to interpret an unreadable state (%s)", (output) => {
    expect(() => interpretMinioContainerState(output)).toThrow(
      /could not be interpreted/,
    );
  });
});

describe("local MinIO bucket provisioning", () => {
  it("provisions the bucket through in-container mc against the live API only", () => {
    const commands = resolveMinioBucketProvisioningCommands();

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual([
      "exec",
      "dental-emr-minio",
      "mc",
      "alias",
      "set",
      "local",
      "http://127.0.0.1:9000",
      "minioadmin",
      "minioadmin",
    ]);
    expect(commands[1]).toEqual([
      "exec",
      "dental-emr-minio",
      "mc",
      "mb",
      "--ignore-existing",
      "local/dental-emr-local",
    ]);

    for (const command of commands) {
      expect(command[0]).toBe("exec");
      expect(command).not.toContain("--linked");
    }
  });
});

describe("local MinIO health and redaction", () => {
  it("accepts only a live health endpoint response", () => {
    expect(isSuccessfulMinioHealthProbe({ ok: true, status: 200 })).toBe(true);
    expect(isSuccessfulMinioHealthProbe({ ok: false, status: 503 })).toBe(false);
    expect(isSuccessfulMinioHealthProbe({ ok: true, status: 302 })).toBe(false);
  });

  it("removes the documented local root password from forwarded output", () => {
    const secrets = resolveLocalMinioSecrets();
    const output = redactMinioOutput(
      "mc: <ERROR> Unable to authenticate with alias local using Access Key minioadmin.",
      secrets,
    );

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("minioadmin");
  });

  it("keeps unrelated output intact while redacting every secret occurrence", () => {
    const output = redactMinioOutput(
      "MINIO_ROOT_PASSWORD=minioadmin minioadmin minioadmin tail",
    );

    expect(output).toBe("MINIO_ROOT_PASSWORD=[REDACTED] [REDACTED] [REDACTED] tail");
  });
});

describe("local storage environment merge", () => {
  const allKeys = [
    "STORAGE_PROVIDER=s3",
    "STORAGE_ENDPOINT=http://127.0.0.1:9000",
    "STORAGE_BUCKET=dental-emr-local",
    "STORAGE_ACCESS_KEY=minioadmin",
    "STORAGE_SECRET_KEY=minioadmin",
    "STORAGE_REGION=auto",
  ];

  it("appends every missing STORAGE_* entry to empty content", () => {
    const { content, addedKeys } = mergeLocalStorageEnvironment("");

    expect(addedKeys).toHaveLength(6);
    for (const entry of allKeys) {
      expect(content).toContain(`${entry}\n`);
    }
  });

  it("preserves existing values and adds only missing keys without duplication", () => {
    const existing = "APP_URL=http://localhost:3000\nSTORAGE_PROVIDER=s3\n";
    const { content, addedKeys } = mergeLocalStorageEnvironment(existing);

    expect(addedKeys.sort()).toEqual([
      "STORAGE_ACCESS_KEY",
      "STORAGE_BUCKET",
      "STORAGE_ENDPOINT",
      "STORAGE_REGION",
      "STORAGE_SECRET_KEY",
    ]);
    expect(content).toContain("APP_URL=http://localhost:3000");
    expect(content.match(/STORAGE_PROVIDER=/g)).toHaveLength(1);
    expect(content.startsWith(existing)).toBe(true);
  });

  it("leaves complete configuration untouched and reports nothing added", () => {
    const existing = `${allKeys.join("\n")}\n`;
    const { content, addedKeys } = mergeLocalStorageEnvironment(existing);

    expect(addedKeys).toEqual([]);
    expect(content).toBe(existing);
  });

  it("tolerates content without a trailing newline and export-prefixed lines", () => {
    const existing = 'APP_ENVIRONMENT=development';
    const { content, addedKeys } = mergeLocalStorageEnvironment(existing);

    expect(addedKeys).toHaveLength(6);
    expect(content.startsWith(`${existing}\n`)).toBe(true);
    expect(content.match(/STORAGE_PROVIDER=/g)).toHaveLength(1);
  });

  it("never emits a duplicated STORAGE_* key", () => {
    const existing = "STORAGE_BUCKET=other-bucket\n";
    const { content } = mergeLocalStorageEnvironment(existing);

    for (const key of [
      "STORAGE_PROVIDER",
      "STORAGE_ENDPOINT",
      "STORAGE_BUCKET",
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "STORAGE_REGION",
    ]) {
      expect(content.match(new RegExp(`^${key}=`, "gm"))).toHaveLength(1);
    }
  });
});

describe("local MinIO package interface", () => {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );

  it("exposes explicit local storage commands alongside the database loop", () => {
    expect(packageJson.scripts).toMatchObject({
      "storage:start:local": "node scripts/run-local-minio.mjs start",
      "storage:stop:local": "node scripts/run-local-minio.mjs stop",
      "storage:status:local": "node scripts/run-local-minio.mjs status",
    });
  });
});
