import { describe, expect, it } from "vitest";

import {
  bridgeConnectors,
  bridgeSpanSummary,
  currentBridgeProjection,
  deriveBridgeSupportMode,
  orderedBridgeUnits,
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

  it("orders units by their canonical ordinal, not by the order they arrived", () => {
    expect(orderedBridgeUnits([span[2]!, span[0]!, span[1]!]).map((unit) => unit.toothFdi)).toEqual([
      24, 25, 26,
    ]);
  });

  it("derives one connector between each consecutive canonical unit pair", () => {
    expect(bridgeConnectors(span)).toEqual([
      { fromToothFdi: 24, toToothFdi: 25 },
      { fromToothFdi: 25, toToothFdi: 26 },
    ]);
    // A connector is a projection of the relationship, so a single unit — which
    // is not a bridge — has none, and nothing is invented to draw one.
    expect(bridgeConnectors([span[0]!])).toEqual([]);
  });

  it("summarises the span with its abutment and pontic roles for the record drawer", () => {
    expect(bridgeSpanSummary(span)).toBe("24–26 · 3 units · 2 abutments, 1 pontic");
  });
});
