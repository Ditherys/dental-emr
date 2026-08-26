import "server-only";

import type { StorageAdapter } from "./types";

import { getStorageConfig } from "./config";
import { createS3Storage } from "./s3-storage";

export function createStorageClient(): StorageAdapter {
  return createS3Storage(getStorageConfig());
}

export { StorageError } from "./errors";
export type { StorageAdapter } from "./types";
