export class BillingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingContractError";
  }
}

export class BillingServiceError extends Error {
  constructor(message: "NOT_AUTHORIZED" | "INVALID_INPUT" | "INVALID_STATE" | "STALE" | "FAILED") {
    super(message);
    this.name = "BillingServiceError";
  }
}

export function mapBillingRpcError(error: unknown): BillingServiceError {
  const value = error as { code?: string; message?: string };

  if (value?.code === "42501") return new BillingServiceError("NOT_AUTHORIZED");
  if (value?.code === "22023" || value?.code === "23514") return new BillingServiceError("INVALID_INPUT");
  if (value?.code === "P0001" && value.message === "stale version") return new BillingServiceError("STALE");
  if (value?.code === "P0001") return new BillingServiceError("INVALID_STATE");
  return new BillingServiceError("FAILED");
}
