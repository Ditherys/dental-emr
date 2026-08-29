import { describe, expect, it } from "vitest";

import {
  buildCurrentProjection,
  flattenEntrySurfaces,
  isEntryCurrentlyActive,
  projectPerToothEntries,
  type ClinicalEntry,
} from "./state";

const recordedAt = "2026-08-01T09:00:00+00:00";

function entry(partial: Partial<ClinicalEntry>): ClinicalEntry {
  return {
    entryId: "00000000-0000-0000-0000-000000000001",
    patientId: "00000000-0000-0000-0000-000000000002",
    toothFdi: 16,
    kind: "FINDING",
    clinicalCode: "CARIES",
    surfaces: ["O"],
    status: "ACTIVE",
    recordedAt,
    voidedAt: null,
    supersededByEntryId: null,
    ...partial,
  };
}

describe("state entry surface flattening", () => {
  it("returns an empty list when the entry has no surfaces", () => {
    expect(flattenEntrySurfaces(entry({ surfaces: [] }).surfaces)).toEqual([]);
  });

  it("expands FULL to the five anatomic surfaces", () => {
    const surfaces = flattenEntrySurfaces(entry({ surfaces: ["FULL"] }).surfaces);
    expect(surfaces.sort()).toEqual(["B", "D", "L", "M", "O"].sort());
  });

  it("preserves a single-surface entry as-is", () => {
    const e = entry({ surfaces: ["O"] });
    expect(Array.isArray(e.surfaces)).toBe(true);
    expect(JSON.stringify(e.surfaces)).toBe('["O"]');
    const result = flattenEntrySurfaces(e.surfaces);
    expect(result).toEqual(["O"]);
  });

  it("de-duplicates a mixed list and preserves canonical order", () => {
    const e = entry({ surfaces: ["FULL", "O", "M"] });
    expect(Array.isArray(e.surfaces)).toBe(true);
    expect(e.surfaces.length).toBe(3);
    const surfaces = flattenEntrySurfaces(e.surfaces);
    expect(surfaces).toEqual(["O", "B", "L", "M", "D"]);
  });
});

describe("state current-active gate", () => {
  it("an ACTIVE non-superseded entry is currently active", () => {
    expect(isEntryCurrentlyActive(entry({}))).toBe(true);
  });

  it("a voided entry is not currently active", () => {
    expect(isEntryCurrentlyActive(entry({ voidedAt: "2026-08-02T00:00:00+00:00" }))).toBe(false);
  });

  it("a superseded entry is not currently active", () => {
    expect(
      isEntryCurrentlyActive(
        entry({ supersededByEntryId: "00000000-0000-0000-0000-0000000000aa" }),
      ),
    ).toBe(false);
  });
});

describe("state per-tooth projection", () => {
  it("groups entries by FDI and surfaces", () => {
    const entries: ClinicalEntry[] = [
      entry({ entryId: "1", toothFdi: 16, clinicalCode: "CARIES", surfaces: ["O"] }),
      entry({ entryId: "2", toothFdi: 16, clinicalCode: "RESTORATION", surfaces: ["M"] }),
      entry({ entryId: "3", toothFdi: 14, clinicalCode: "CROWN", surfaces: ["FULL"] }),
    ];
    const projection = projectPerToothEntries(entries);
    expect(projection.get(16)?.size).toBe(2);
    expect(projection.get(16)?.get("O")?.[0]?.entryId).toBe("1");
    expect(projection.get(14)?.size).toBe(5);
  });

  it("ignores voided and superseded entries from the projection", () => {
    const entries: ClinicalEntry[] = [
      entry({ entryId: "1", clinicalCode: "CARIES", surfaces: ["O"] }),
      entry({
        entryId: "2",
        clinicalCode: "RESTORATION",
        surfaces: ["M"],
        voidedAt: "2026-08-02T00:00:00+00:00",
      }),
      entry({
        entryId: "3",
        clinicalCode: "FRACTURE",
        surfaces: ["B"],
        supersededByEntryId: "00000000-0000-0000-0000-0000000000aa",
      }),
    ];
    const projection = projectPerToothEntries(entries);
    const tooth16 = projection.get(16);
    expect(tooth16?.has("O")).toBe(true);
    expect(tooth16?.has("M")).toBe(false);
    expect(tooth16?.has("B")).toBe(false);
  });
});

describe("state current projection (renderer-independent chart)", () => {
  it("returns the active clinical code per (tooth, surface)", () => {
    const entries: ClinicalEntry[] = [
      entry({ entryId: "1", clinicalCode: "CARIES", surfaces: ["O"] }),
      entry({ entryId: "2", clinicalCode: "RESTORATION", surfaces: ["M"] }),
    ];
    const current = buildCurrentProjection(entries);
    expect(current.get(16)?.get("O")?.clinicalCode).toBe("CARIES");
    expect(current.get(16)?.get("M")?.clinicalCode).toBe("RESTORATION");
  });

  it("hides voided and superseded rows from the current state", () => {
    const entries: ClinicalEntry[] = [
      entry({ entryId: "1", clinicalCode: "CARIES", surfaces: ["O"] }),
      entry({
        entryId: "2",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        voidedAt: "2026-08-02T00:00:00+00:00",
      }),
    ];
    const current = buildCurrentProjection(entries);
    expect(current.get(16)?.has("O")).toBe(true);
    expect(current.get(16)?.get("O")?.clinicalCode).toBe("CARIES");
  });

  it("hides rows when the only entries are voided or superseded", () => {
    const entries: ClinicalEntry[] = [
      entry({
        entryId: "1",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        voidedAt: "2026-08-02T00:00:00+00:00",
      }),
      entry({
        entryId: "2",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        supersededByEntryId: "00000000-0000-0000-0000-0000000000aa",
      }),
    ];
    const current = buildCurrentProjection(entries);
    const toothMap = current.get(16);
    expect(toothMap === undefined || !toothMap.has("O")).toBe(true);
  });

  it("omits the patient id and entryId from the projection shape", () => {
    const entries: ClinicalEntry[] = [
      entry({ entryId: "1", clinicalCode: "CARIES", surfaces: ["O"] }),
    ];
    const current = buildCurrentProjection(entries);
    const cell = current.get(16)?.get("O");
    expect(cell).toBeDefined();
    const keys = Object.keys(cell as object).sort();
    expect(keys).toEqual(["clinicalCode", "kind", "recordedAt", "status", "surfaces"]);
  });
});
