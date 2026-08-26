import "server-only";

import { z } from "zod";

export type DocumentServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "FAILED";

export class DocumentServiceError extends Error {
  constructor(public readonly code: DocumentServiceErrorCode) {
    super(code);
    this.name = "DocumentServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapDocumentRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new DocumentServiceError("FAILED");
  if (parsed.data.code === "42501") return new DocumentServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new DocumentServiceError("INVALID_INPUT");
  return new DocumentServiceError("FAILED");
}