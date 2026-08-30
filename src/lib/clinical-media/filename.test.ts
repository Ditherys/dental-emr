import { describe, expect, it } from "vitest";
import { proposeDisplayFilename, sanitizeDisplayFilename } from "./filename";

describe("clinical photo filenames", () => {
  it("proposes deterministic, human-readable names", () => {
    expect(proposeDisplayFilename({ captureDate: "2026-08-30", category: "AFTER", toothCodes: ["11"], sequence: 1, extension: "jpg" })).toBe("2026-08-30_after_tooth-11_01.jpg");
  });
  it("normalizes a safe display name to the accepted media extension", () => {
    expect(sanitizeDisplayFilename("Before 01.jpg", "image/jpeg")).toBe("Before 01.jpg");
    expect(sanitizeDisplayFilename("Before 01.png", "image/webp")).toBe("Before 01.webp");
  });
  it("rejects traversal, controls, and unknown media types", () => {
    expect(() => sanitizeDisplayFilename("../Patient Name.jpg", "image/jpeg")).toThrow("INVALID_FILENAME");
    expect(() => sanitizeDisplayFilename("photo?.jpg", "image/jpeg")).toThrow("INVALID_FILENAME");
    expect(() => sanitizeDisplayFilename("photo.jpg", "application/pdf")).toThrow("INVALID_FILENAME");
    expect(() => proposeDisplayFilename({ captureDate: "2026-08-30", category: "AFTER", toothCodes: [], sequence: 1, extension: "exe" })).toThrow("INVALID_FILENAME");
  });
});
