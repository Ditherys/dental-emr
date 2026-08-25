export class PatientServiceError extends Error {
  constructor(
    public readonly code:
      | "DUPLICATE_REVIEW_REQUIRED"
      | "NOT_AUTHORIZED"
      | "NOT_FOUND"
      | "INVALID_INPUT"
      | "STALE_VERSION"
      | "INVALID_STATE"
      | "FAILED",
  ) {
    super(code);
    this.name = "PatientServiceError";
  }
}

export function mapPatientRpcError(error: { code: string; message: string }) {
  if (error.code === "P0001" && error.message.includes("duplicate review required")) {
    return new PatientServiceError("DUPLICATE_REVIEW_REQUIRED");
  }
  if (error.code === "P0001" && error.message.includes("stale version")) {
    return new PatientServiceError("STALE_VERSION");
  }
  if (error.code === "P0001" && error.message.includes("invalid state")) {
    return new PatientServiceError("INVALID_STATE");
  }
  if (error.code === "42501") return new PatientServiceError("NOT_AUTHORIZED");
  if (error.code === "P0002") return new PatientServiceError("NOT_FOUND");
  if (error.code === "22023") return new PatientServiceError("INVALID_INPUT");
  return new PatientServiceError("FAILED");
}
