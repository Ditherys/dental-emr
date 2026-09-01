import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clinicalFindingCodeSchema,
  findingInputSchema,
  visitClinicalNoteInputSchema,
} from "./schema";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const idempotencyKey = "c3000000-0000-0000-0000-000000000003";

function finding(overrides: Record<string, unknown> = {}) {
  return {
    patientId,
    branchId,
    toothCodes: ["16"],
    findingCode: "CARIES",
    surfaces: ["O"],
    status: "ACTIVE",
    clinicalDate: "2026-09-01",
    idempotencyKey,
    ...overrides,
  };
}

describe("clinical record composer finding contract", () => {
  it("accepts a bounded multi-tooth surface finding with an optional note", () => {
    const parsed = findingInputSchema.parse(
      finding({ toothCodes: ["16", "17"], surfaces: ["O", "M"], note: "Synthetic occlusal caries" }),
    );

    expect(parsed).toEqual({
      patientId,
      branchId,
      toothCodes: ["16", "17"],
      findingCode: "CARIES",
      surfaces: ["O", "M"],
      status: "ACTIVE",
      clinicalDate: "2026-09-01",
      note: "Synthetic occlusal caries",
      idempotencyKey,
    });
  });

  it("refuses every browser-supplied authorization field", () => {
    for (const forged of [
      { organizationId: "c4000000-0000-0000-0000-000000000004" },
      { treatingProviderId: "c5000000-0000-0000-0000-000000000005" },
      { createdBy: "c6000000-0000-0000-0000-000000000006" },
      { providerDisplay: "Dr Synthetic" },
      { encounterId: "c7000000-0000-0000-0000-000000000007" },
      { actingBranchId: branchId },
    ]) {
      expect(findingInputSchema.safeParse(finding(forged)).success).toBe(false);
    }
  });

  it("rejects an occlusal surface on an anterior tooth and an incisal surface on a posterior tooth", () => {
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["11"], surfaces: ["O"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["16"], surfaces: ["I"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["11"], surfaces: ["I"] })).success).toBe(true);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["16"], surfaces: ["O"] })).success).toBe(true);
    // A mixed selection may only carry surfaces every selected tooth owns.
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["11", "16"], surfaces: ["O"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["11", "16"], surfaces: ["B", "M"] })).success).toBe(true);
  });

  it("binds surface expectations to the finding code", () => {
    expect(findingInputSchema.safeParse(finding({ findingCode: "MISSING", surfaces: [] })).success).toBe(true);
    expect(findingInputSchema.safeParse(finding({ findingCode: "CROWN", surfaces: [] })).success).toBe(true);
    expect(findingInputSchema.safeParse(finding({ findingCode: "MISSING", surfaces: ["O"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ findingCode: "CARIES", surfaces: [] })).success).toBe(false);
  });

  it("keeps the composer inside its bounded finding vocabulary and ACTIVE status", () => {
    expect(clinicalFindingCodeSchema.options).toEqual([
      "CARIES",
      "RESTORATION",
      "CROWN",
      "MISSING",
      "SEALANT",
      "FRACTURE",
      "OTHER",
    ]);
    // Relationship-owned records belong to their own workflows, not this form.
    expect(findingInputSchema.safeParse(finding({ findingCode: "BRIDGE" })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ findingCode: "IMPLANT" })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ status: "PLANNED" })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ status: "COMPLETED" })).success).toBe(false);
  });

  it("bounds the tooth selection, rejects duplicates, and requires a uuid idempotency key", () => {
    expect(findingInputSchema.safeParse(finding({ toothCodes: [] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["16", "16"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ toothCodes: ["99"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ surfaces: ["O", "O"] })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ idempotencyKey: "not-a-uuid" })).success).toBe(false);
    expect(findingInputSchema.safeParse(finding({ clinicalDate: "01-09-2026" })).success).toBe(false);
  });
});

describe("clinical record composer note contract", () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    patientId,
    branchId,
    noteType: "PROGRESS",
    content: "Synthetic visit note",
    idempotencyKey,
    ...overrides,
  });

  it("accepts a bounded authored note under route context only", () => {
    expect(visitClinicalNoteInputSchema.parse(note())).toEqual({
      patientId,
      branchId,
      noteType: "PROGRESS",
      content: "Synthetic visit note",
      idempotencyKey,
    });
  });

  it("refuses forged attribution, an empty note, an unbounded note, and an amendment type", () => {
    expect(visitClinicalNoteInputSchema.safeParse(note({ encounterId: patientId })).success).toBe(false);
    expect(visitClinicalNoteInputSchema.safeParse(note({ createdBy: patientId })).success).toBe(false);
    expect(visitClinicalNoteInputSchema.safeParse(note({ content: "   " })).success).toBe(false);
    expect(visitClinicalNoteInputSchema.safeParse(note({ content: "x".repeat(4001) })).success).toBe(false);
    expect(visitClinicalNoteInputSchema.safeParse(note({ noteType: "AMENDMENT" })).success).toBe(false);
  });
});
