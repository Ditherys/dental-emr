import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PERIO_INDEX_DEFINITIONS,
  PERIO_INDEX_IDS,
  isPerioIndexId,
  perioIndexDefinition,
  perioIndexIdsForContext,
} from "./perio-indices";

const GLOBALS_CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Every `--token: ...` declared in the `:root` block of the EMR stylesheet. */
function rootTokenNames(): Set<string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(GLOBALS_CSS);
  if (!root) throw new Error("globals.css has no :root block");
  const names = new Set<string>();
  for (const match of root[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) names.add(match[1]);
  return names;
}

describe("periodontal index registry", () => {
  it("is the closed union of the thirteen approved indices, in order", () => {
    expect(PERIO_INDEX_IDS).toEqual([
      "PD",
      "CAL",
      "RECESSION",
      "CAIRO",
      "KG",
      "BOP",
      "PLAQUE",
      "PI",
      "GI",
      "MPI",
      "MBI",
      "PD_GTE_5",
      "PD_GTE_6",
    ]);
    expect(Object.keys(PERIO_INDEX_DEFINITIONS).sort()).toEqual([...PERIO_INDEX_IDS].sort());
  });

  it("rejects any index outside the union", () => {
    expect(isPerioIndexId("PD")).toBe(true);
    expect(isPerioIndexId("PD_GTE_4")).toBe(false);
    expect(isPerioIndexId("pd")).toBe(false);
    expect(isPerioIndexId(null)).toBe(false);
    expect(isPerioIndexId(undefined)).toBe(false);
    expect(() => perioIndexDefinition("BLEEDING" as never)).toThrow(/not a periodontal index/i);
  });

  it.each(PERIO_INDEX_IDS)("%s carries a unit, scope, applicability, and a token colour", (id) => {
    const definition = PERIO_INDEX_DEFINITIONS[id];
    expect(definition.id).toBe(id);
    expect(definition.label.length).toBeGreaterThan(0);
    expect(["MILLIMETRES", "ORDINAL_SCORE", "PRESENCE", "RECESSION_CLASS"]).toContain(definition.unit);
    expect(["SITE", "TOOTH_SURFACE", "TOOTH"]).toContain(definition.scope);
    expect(typeof definition.appliesToNaturalTooth).toBe("boolean");
    expect(typeof definition.appliesToPeriImplant).toBe("boolean");
    expect(definition.appliesToNaturalTooth || definition.appliesToPeriImplant).toBe(true);
  });

  it("takes every colour from an EMR design token, never a literal", () => {
    const tokens = rootTokenNames();
    for (const id of PERIO_INDEX_IDS) {
      const colorToken = PERIO_INDEX_DEFINITIONS[id].colorToken;
      expect(colorToken, `${id} colour`).toMatch(/^var\(--[a-z0-9-]+\)$/);
      expect(colorToken, `${id} colour`).not.toMatch(/#|rgb|hsl/);
      const name = colorToken.slice(4, -1);
      expect(tokens.has(name), `${id} uses ${name}, which globals.css :root does not define`).toBe(true);
    }
  });

  it("bounds every measured index and leaves presence indices unbounded", () => {
    expect(PERIO_INDEX_DEFINITIONS.PD.bounds).toEqual({ min: 1, max: 15 });
    expect(PERIO_INDEX_DEFINITIONS.CAL.bounds).toEqual({ min: -9, max: 35 });
    expect(PERIO_INDEX_DEFINITIONS.RECESSION.bounds).toEqual({ min: 0, max: 20 });
    expect(PERIO_INDEX_DEFINITIONS.KG.bounds).toEqual({ min: 0, max: 15 });
    for (const id of ["PI", "GI", "MPI", "MBI"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].bounds, id).toEqual({ min: 0, max: 3 });
    }
    for (const id of ["BOP", "PLAQUE", "PD_GTE_5", "PD_GTE_6"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].unit, id).toBe("PRESENCE");
      expect(PERIO_INDEX_DEFINITIONS[id].bounds, id).toBeNull();
    }
    expect(PERIO_INDEX_DEFINITIONS.CAIRO.unit).toBe("RECESSION_CLASS");
    expect(PERIO_INDEX_DEFINITIONS.CAIRO.classes).toEqual(["RT1", "RT2", "RT3"]);
  });

  it("keeps the natural-tooth and peri-implant index families apart", () => {
    for (const id of ["PI", "GI", "CAIRO"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].appliesToNaturalTooth, id).toBe(true);
      expect(PERIO_INDEX_DEFINITIONS[id].appliesToPeriImplant, id).toBe(false);
    }
    for (const id of ["MPI", "MBI"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].appliesToNaturalTooth, id).toBe(false);
      expect(PERIO_INDEX_DEFINITIONS[id].appliesToPeriImplant, id).toBe(true);
    }

    const natural = perioIndexIdsForContext(false);
    const periImplant = perioIndexIdsForContext(true);
    expect(natural).toContain("PI");
    expect(natural).not.toContain("MPI");
    expect(periImplant).toContain("MBI");
    expect(periImplant).not.toContain("GI");
    expect(periImplant).not.toContain("CAIRO");
    expect(natural).toContain("PD");
    expect(periImplant).toContain("PD");
  });

  it("marks the derived indices as derived and the recorded ones as recorded", () => {
    for (const id of ["CAL", "RECESSION", "CAIRO", "PD_GTE_5", "PD_GTE_6"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].derived, id).toBe(true);
    }
    for (const id of ["PD", "KG", "BOP", "PLAQUE", "PI", "GI", "MPI", "MBI"] as const) {
      expect(PERIO_INDEX_DEFINITIONS[id].derived, id).toBe(false);
    }
  });
});
