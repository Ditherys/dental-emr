import "server-only";

export type StoragePutResult = Readonly<{
  key: string;
  checksum: string;
}>;

export type StorageGetResult = Readonly<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
}>;

export type StorageUrlResult = Readonly<{
  url: string;
  expiresAt: Date;
}>;

export type StorageAdapter = Readonly<{
  put: (
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
  ) => Promise<StoragePutResult>;
  get: (key: string) => Promise<StorageGetResult>;
  delete: (key: string) => Promise<void>;
  createUploadUrl: (
    key: string,
    contentType: string,
    expiresIn?: number,
  ) => Promise<StorageUrlResult>;
  createDownloadUrl: (
    key: string,
    expiresIn?: number,
  ) => Promise<StorageUrlResult>;
}>;
