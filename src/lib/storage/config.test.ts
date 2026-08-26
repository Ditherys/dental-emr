import { describe, expect, it } from "vitest";

import { parseStorageConfig } from "./config";

const validEnvironment = {
  STORAGE_PROVIDER: "s3",
  STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  STORAGE_BUCKET: "dental-emr-local",
  STORAGE_ACCESS_KEY: "minioadmin-placeholder-access",
  STORAGE_SECRET_KEY: "minioadmin-placeholder-secret",
  STORAGE_REGION: "auto",
};

describe("storage configuration", () => {
  it("parses and freezes a valid storage environment", () => {
    const config = parseStorageConfig(validEnvironment);

    expect(config).toEqual({
      provider: "s3",
      endpoint: "http://127.0.0.1:9000",
      bucket: "dental-emr-local",
      accessKey: "minioadmin-placeholder-access",
      secretKey: "minioadmin-placeholder-secret",
      region: "auto",
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("rejects an unsupported storage provider", () => {
    expect(() =>
      parseStorageConfig({
        ...validEnvironment,
        STORAGE_PROVIDER: "gcs",
      }),
    ).toThrow(
      "Missing or invalid required storage environment variable(s): STORAGE_PROVIDER.",
    );
  });

  it("names every missing variable without echoing values", () => {
    let message = "";

    try {
      parseStorageConfig({});
    } catch (error) {
      message = (error as Error).message;
    }

    for (const name of [
      "STORAGE_PROVIDER",
      "STORAGE_ENDPOINT",
      "STORAGE_BUCKET",
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "STORAGE_REGION",
    ]) {
      expect(message).toContain(name);
    }

    expect(message).not.toContain("minioadmin");
  });

  it.each([
    ["STORAGE_ENDPOINT", { STORAGE_ENDPOINT: "not-a-url" }],
    ["STORAGE_BUCKET", { STORAGE_BUCKET: "" }],
    ["STORAGE_ACCESS_KEY", { STORAGE_ACCESS_KEY: "" }],
    ["STORAGE_SECRET_KEY", { STORAGE_SECRET_KEY: "" }],
    ["STORAGE_REGION", { STORAGE_REGION: "" }],
    ["STORAGE_REGION", { STORAGE_REGION: undefined }],
  ])("rejects invalid %s", (name, override) => {
    expect(() =>
      parseStorageConfig({ ...validEnvironment, ...override }),
    ).toThrow(`storage environment variable(s): ${name}.`);
  });
});
