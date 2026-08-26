import "server-only";

import { z } from "zod";

type StorageEnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export type StorageConfig = Readonly<{
  provider: "s3";
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}>;

const storageConfigSchema = z.object({
  STORAGE_PROVIDER: z.literal("s3"),
  STORAGE_ENDPOINT: z.url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_REGION: z.string().min(1),
});

export function parseStorageConfig(
  environment: StorageEnvironmentSource,
): StorageConfig {
  const result = storageConfigSchema.safeParse({
    STORAGE_PROVIDER: environment.STORAGE_PROVIDER,
    STORAGE_ENDPOINT: environment.STORAGE_ENDPOINT,
    STORAGE_BUCKET: environment.STORAGE_BUCKET,
    STORAGE_ACCESS_KEY: environment.STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY: environment.STORAGE_SECRET_KEY,
    STORAGE_REGION: environment.STORAGE_REGION,
  });

  if (!result.success) {
    const invalidNames = result.error.issues
      .map((issue) => issue.path[0])
      .filter((name): name is string => typeof name === "string")
      .join(", ");

    throw new Error(
      `Missing or invalid required storage environment variable(s): ${invalidNames}.`,
    );
  }

  return Object.freeze({
    provider: "s3",
    endpoint: result.data.STORAGE_ENDPOINT,
    bucket: result.data.STORAGE_BUCKET,
    accessKey: result.data.STORAGE_ACCESS_KEY,
    secretKey: result.data.STORAGE_SECRET_KEY,
    region: result.data.STORAGE_REGION,
  });
}

export function getStorageConfig(): StorageConfig {
  return parseStorageConfig(process.env);
}
