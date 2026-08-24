export class PatientServiceError extends Error {
  constructor(
    public readonly code:
      | "DUPLICATE_REVIEW_REQUIRED"
      | "NOT_AUTHORIZED"
      | "INVALID_INPUT"
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
  if (error.code === "42501") return new PatientServiceError("NOT_AUTHORIZED");
  if (error.code === "22023") return new PatientServiceError("INVALID_INPUT");
  return new PatientServiceError("FAILED");
}
