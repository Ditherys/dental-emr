export class StorageError extends Error {
  constructor(
    public readonly code:
      | "EXPIRATION_INVALID"
      | "STORE_FAILED"
      | "READ_FAILED"
      | "DELETE_FAILED"
      | "UPLOAD_URL_FAILED"
      | "DOWNLOAD_URL_FAILED",
  ) {
    super(code);
    this.name = "StorageError";
  }
}
