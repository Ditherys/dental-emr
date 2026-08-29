import { describe, expect, it } from "vitest";

import {
  currentBridgeProjection,
  deriveBridgeSupportMode,
  validateBridgeUnits,
  type BridgeRecord,
  type BridgeUnit,
} from "./bridge";

const span: BridgeUnit[] = [
  { toothFdi: 24, ordinal: 1, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
  { toothFdi: 25, ordinal: 2, role: "PONTIC", supportKind: "NONE", supportComponentId: null },
  { toothFdi: 26, ordinal: 3, role: "ABUTMENT", supportKind: "IMPLANT_COMPONENT", supportComponentId: "component-26" },
];

describe("bridge domain", () => {
  it("accepts an arbitrary contiguous 24-25-26 span and derives mixed support", () => {
    expect(validateBridgeUnits(span)).toEqual({ ok: true, errors: [], value: span });
    expect(deriveBridgeSupportMode(span)).toBe("MIXED");
  });

  it("rejects duplicate positions, non-contiguous spans, and incompatible support roles", () => {
    expect(validateBridgeUnits([span[0]!, { ...span[1]!, toothFdi: 24 }]).ok).toBe(false);
    expect(validateBridgeUnits([span[0]!, { ...span[2]!, ordinal: 2 }]).ok).toBe(false);
    expect(validateBridgeUnits([{ ...span[1]!, role: "ABUTMENT" }]).ok).toBe(false);
    expect(validateBridgeUnits([{ ...span[0]!, supportKind: "IMPLANT_COMPONENT", supportComponentId: null }]).ok).toBe(false);
  });

  it("projects only sealed, nonvoid, nonsuperseded CURRENT relationships", () => {
    const records: BridgeRecord[] = [
      { id: "old", recordKind: "CURRENT", sealedAt: "2026-08-28T01:00:00Z", voidedAt: null, supersedesBridgeId: null },
      { id: "new", recordKind: "CURRENT", sealedAt: "2026-08-28T02:00:00Z", voidedAt: null, supersedesBridgeId: "old" },
      { id: "draft", recordKind: "CURRENT", sealedAt: null, voidedAt: null, supersedesBridgeId: null },
      { id: "void", recordKind: "CURRENT", sealedAt: "2026-08-28T03:00:00Z", voidedAt: "2026-08-28T04:00:00Z", supersedesBridgeId: null },
      { id: "plan", recordKind: "PLAN_DESIGN", sealedAt: null, voidedAt: null, supersedesBridgeId: null },
    ];

    expect(currentBridgeProjection(records).map((record) => record.id)).toEqual(["new"]);
  });
});
