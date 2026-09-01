import { describe, expect, it } from "vitest";

import {
  currentImplantProjection,
  currentImplantStage,
  describeImplantStage,
  nextImplantStage,
  validateImplantChain,
  type ImplantComponentRecord,
} from "./implant";

const internalChain: ImplantComponentRecord[] = [
  { id: "fixture", patientId: "patient-a", toothFdi: 26, ordinal: 1, componentKind: "FIXTURE", recordKind: "CURRENT", dependsOnComponentId: null, provenance: "INTERNAL", sealedAt: "2026-08-28T01:00:00Z", voidedAt: null, supersedesComponentId: null },
  { id: "abutment", patientId: "patient-a", toothFdi: 26, ordinal: 2, componentKind: "ABUTMENT", recordKind: "CURRENT", dependsOnComponentId: "fixture", provenance: "INTERNAL", sealedAt: "2026-08-28T01:00:00Z", voidedAt: null, supersedesComponentId: null },
  { id: "crown", patientId: "patient-a", toothFdi: 26, ordinal: 3, componentKind: "CROWN", recordKind: "CURRENT", dependsOnComponentId: "abutment", provenance: "INTERNAL", sealedAt: "2026-08-28T01:00:00Z", voidedAt: null, supersedesComponentId: null },
];

describe("implant domain", () => {
  it("accepts a same-patient, same-position CURRENT fixture-abutment-crown chain", () => {
    expect(validateImplantChain(internalChain)).toEqual({ ok: true, errors: [], value: internalChain });
  });

  it("rejects cross-patient, cross-position, wrong-kind, and incompatible-record dependencies", () => {
    expect(validateImplantChain([internalChain[0]!, { ...internalChain[1]!, patientId: "patient-b" }]).ok).toBe(false);
    expect(validateImplantChain([internalChain[0]!, { ...internalChain[1]!, toothFdi: 25 }]).ok).toBe(false);
    expect(validateImplantChain([internalChain[0]!, { ...internalChain[2]!, dependsOnComponentId: "fixture" }]).ok).toBe(false);
    expect(validateImplantChain([{ ...internalChain[0]!, recordKind: "PLAN_DESIGN" }, internalChain[1]!]).ok).toBe(false);
  });

  it("rejects a second fixture root or a disconnected component chain", () => {
    expect(
      validateImplantChain([
        ...internalChain,
        { ...internalChain[0]!, id: "second-fixture", ordinal: 4 },
      ]),
    ).toMatchObject({ ok: false });

    expect(
      validateImplantChain([
        internalChain[0]!,
        { ...internalChain[1]!, dependsOnComponentId: "missing-fixture" },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("allows an explicit pre-existing external CURRENT fixture placeholder", () => {
    const placeholder: ImplantComponentRecord = {
      ...internalChain[0]!,
      id: "unknown-fixture",
      provenance: "PREEXISTING_EXTERNAL",
    };
    expect(validateImplantChain([placeholder]).ok).toBe(true);
  });

  it("projects the latest nonvoid component while preserving the component chain order", () => {
    const successor: ImplantComponentRecord = {
      ...internalChain[2]!,
      id: "new-crown",
      supersedesComponentId: "crown",
    };
    expect(currentImplantProjection([...internalChain, successor]).map((component) => component.id)).toEqual([
      "fixture",
      "abutment",
      "new-crown",
    ]);
  });

  it("excludes unsealed CURRENT components from the current projection", () => {
    expect(currentImplantProjection([{ ...internalChain[0]!, id: "unsealed", sealedAt: null }])).toEqual([]);
  });

  it("reports the stage the current chain has actually reached", () => {
    expect(currentImplantStage([])).toBeNull();
    expect(currentImplantStage([internalChain[0]!])).toBe("FIXTURE");
    expect(currentImplantStage([internalChain[0]!, internalChain[1]!])).toBe("ABUTMENT");
    expect(currentImplantStage(internalChain)).toBe("CROWN");
  });

  it("names the one component a clinician may add next, and refuses to skip a stage", () => {
    expect(nextImplantStage(null)).toBe("FIXTURE");
    expect(nextImplantStage("FIXTURE")).toBe("ABUTMENT");
    expect(nextImplantStage("ABUTMENT")).toBe("CROWN");
    expect(nextImplantStage("CROWN")).toBeNull();
    expect(nextImplantStage("ATTACHMENT")).toBeNull();
  });

  it("describes each stage in the words a chart reader uses", () => {
    expect(describeImplantStage(null)).toBe("No implant recorded");
    expect(describeImplantStage("FIXTURE")).toBe("Fixture placed");
    expect(describeImplantStage("ABUTMENT")).toBe("Abutment connected");
    expect(describeImplantStage("CROWN")).toBe("Crown seated");
    expect(describeImplantStage("ATTACHMENT")).toBe("Attachment seated");
  });
});
