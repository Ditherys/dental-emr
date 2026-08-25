export class ProviderServiceError extends Error {
  constructor(public readonly code: "NOT_AUTHORIZED" | "NOT_FOUND_OR_DENIED" | "STALE" | "INVALID_INPUT" | "INVALID_STATE" | "FAILED") {
    super(code);
    this.name = "ProviderServiceError";
  }
}

export function mapProviderRpcError(error: { code: string; message: string }) {
  if (error.code === "42501") return new ProviderServiceError("NOT_AUTHORIZED");
  if (error.code === "P0001" && error.message.includes("stale version")) return new ProviderServiceError("STALE");
  if (error.code === "P0001" && error.message.includes("invalid state")) return new ProviderServiceError("INVALID_STATE");
  if (error.code === "P0002") return new ProviderServiceError("NOT_FOUND_OR_DENIED");
  if (error.code === "22023") return new ProviderServiceError("INVALID_INPUT");
  return new ProviderServiceError("FAILED");
}
