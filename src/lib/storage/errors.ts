import "server-only";

export class StorageError extends Error {
  constructor(
    public readonly code:
      | "EXPIRATION_INVALID"
      | "PAYLOAD_TOO_LARGE"
      | "STORE_FAILED"
      | "READ_FAILED"
      | "DELETE_FAILED"
      | "UPLOAD_URL_FAILED"
      | "DOWNLOAD_URL_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "StorageError";
  }
}
