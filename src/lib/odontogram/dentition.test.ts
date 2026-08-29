import { describe, expect, it } from "vitest";

import {
  ADULT_FDI_TEETH,
  ALL_FDI_TEETH,
  ANTERIOR_TEETH,
  archFor,
  CANINE_TEETH,
  classifyTooth,
  fdiFromLabel,
  INCISOR_TEETH,
  isAdultFdi,
  isAnteriorTooth,
  isMolarFdi,
  isPermanentFdi,
  isPosteriorTooth,
  isPrimaryFdi,
  isUpperTooth,
  MOLAR_TEETH,
  PERMANENT_FDI_TEETH,
  positionInArch,
  PREMOLAR_TEETH,
  PRIMARY_FDI_TEETH,
  quadrantFor,
  toLabel,
  toothCategory,
} from "./dentition";

describe("dentition FDI canonical", () => {
  it("recognises the four permanent and four primary quadrants", () => {
    expect(isPermanentFdi(11)).toBe(true);
    expect(isPermanentFdi(28)).toBe(true);
    expect(isPermanentFdi(38)).toBe(true);
    expect(isPermanentFdi(48)).toBe(true);
    expect(isAdultFdi(18)).toBe(true);
    expect(isAdultFdi(48)).toBe(true);
    expect(isPrimaryFdi(55)).toBe(true);
    expect(isPrimaryFdi(85)).toBe(true);
    expect(isAdultFdi(55)).toBe(false);
    expect(isPrimaryFdi(18)).toBe(false);
  });

  it("rejects invalid FDI codes", () => {
    for (const bad of [0, 1, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 56, 60, 66, 70, 76, 80, 86, 99, -1, 1.5, NaN]) {
      expect(isPermanentFdi(bad)).toBe(false);
      expect(isPrimaryFdi(bad)).toBe(false);
    }
  });

  it("exposes the full permanent and primary sets", () => {
    expect(PERMANENT_FDI_TEETH).toHaveLength(32);
    expect(PRIMARY_FDI_TEETH).toHaveLength(20);
    expect(ADULT_FDI_TEETH).toHaveLength(32);
    expect(ALL_FDI_TEETH).toHaveLength(52);
    expect(new Set(ALL_FDI_TEETH).size).toBe(52);
    for (const fdi of PERMANENT_FDI_TEETH) {
      expect(isPermanentFdi(fdi)).toBe(true);
    }
    for (const fdi of PRIMARY_FDI_TEETH) {
      expect(isPrimaryFdi(fdi)).toBe(true);
    }
  });
});

describe("dentition arch and quadrant", () => {
  it("classifies upper/lower by quadrant", () => {
    expect(isUpperTooth(11)).toBe(true);
    expect(isUpperTooth(18)).toBe(true);
    expect(isUpperTooth(21)).toBe(true);
    expect(isUpperTooth(28)).toBe(true);
    expect(isUpperTooth(31)).toBe(false);
    expect(isUpperTooth(38)).toBe(false);
    expect(isUpperTooth(55)).toBe(true);
    expect(isUpperTooth(75)).toBe(false);
    expect(isUpperTooth(85)).toBe(false);
  });

  it("extracts the quadrant (1..8) and 1-based position", () => {
    expect(quadrantFor(11)).toBe(1);
    expect(quadrantFor(28)).toBe(2);
    expect(quadrantFor(31)).toBe(3);
    expect(quadrantFor(48)).toBe(4);
    expect(quadrantFor(55)).toBe(5);
    expect(quadrantFor(85)).toBe(8);
    expect(positionInArch(11)).toBe(1);
    expect(positionInArch(18)).toBe(8);
    expect(positionInArch(55)).toBe(5);
    expect(archFor(11)).toBe("upper");
    expect(archFor(48)).toBe("lower");
    expect(archFor(55)).toBe("upper");
    expect(archFor(75)).toBe("lower");
  });

  it("rejects non-FDI quadrant and position lookups", () => {
    for (const bad of [0, 9, 10, 19, 50, 99, NaN]) {
      expect(quadrantFor(bad)).toBeNull();
      expect(positionInArch(bad)).toBeNull();
      expect(archFor(bad)).toBeNull();
    }
  });
});

describe("dentition tooth classification", () => {
  it("identifies anterior vs posterior by FDI position", () => {
    expect(isAnteriorTooth(11)).toBe(true);
    expect(isAnteriorTooth(13)).toBe(true);
    expect(isAnteriorTooth(23)).toBe(true);
    expect(isAnteriorTooth(43)).toBe(true);
    expect(isAnteriorTooth(14)).toBe(false);
    expect(isAnteriorTooth(18)).toBe(false);
    expect(isAnteriorTooth(48)).toBe(false);
    expect(isAnteriorTooth(51)).toBe(true);
    expect(isAnteriorTooth(53)).toBe(true);
    expect(isAnteriorTooth(55)).toBe(false);
    expect(isAnteriorTooth(75)).toBe(false);
    expect(isAnteriorTooth(85)).toBe(false);
    expect(isPosteriorTooth(14)).toBe(true);
    expect(isPosteriorTooth(18)).toBe(true);
    expect(isPosteriorTooth(38)).toBe(true);
    expect(isPosteriorTooth(11)).toBe(false);
  });

  it("classifies incisor/canine/premolar/molar by position", () => {
    expect(toothCategory(11)).toBe("incisor");
    expect(toothCategory(12)).toBe("incisor");
    expect(toothCategory(13)).toBe("canine");
    expect(toothCategory(14)).toBe("premolar");
    expect(toothCategory(15)).toBe("premolar");
    expect(toothCategory(16)).toBe("molar");
    expect(toothCategory(18)).toBe("molar");
    expect(toothCategory(31)).toBe("incisor");
    expect(toothCategory(33)).toBe("canine");
    expect(toothCategory(36)).toBe("molar");
    expect(toothCategory(55)).toBe("molar");
    expect(toothCategory(53)).toBe("canine");
  });

  it("classifyTooth returns a single complete record", () => {
    const r = classifyTooth(16);
    expect(r).toEqual({
      fdi: 16,
      quadrant: 1,
      position: 6,
      arch: "upper",
      dentition: "permanent",
      category: "molar",
      isAnterior: false,
      isPosterior: true,
      isMolar: true,
    });
    const primary = classifyTooth(55);
    expect(primary?.dentition).toBe("primary");
    expect(primary?.category).toBe("molar");
    expect(primary?.arch).toBe("upper");
    expect(classifyTooth(99)).toBeNull();
  });

  it("exposes incisor/canine/premolar/molar sets", () => {
    expect(INCISOR_TEETH).toContain(11);
    expect(INCISOR_TEETH).toContain(32);
    expect(CANINE_TEETH).toContain(13);
    expect(CANINE_TEETH).toContain(43);
    expect(PREMOLAR_TEETH).toContain(14);
    expect(PREMOLAR_TEETH).toContain(45);
    expect(PREMOLAR_TEETH).not.toContain(16);
    expect(MOLAR_TEETH).toContain(16);
    expect(MOLAR_TEETH).toContain(17);
    expect(MOLAR_TEETH).toContain(48);
    expect(MOLAR_TEETH).toContain(55);
    expect(MOLAR_TEETH).toContain(85);
    expect(ANTERIOR_TEETH.length).toBeGreaterThan(0);
  });

  it("rejects invalid FDI from molar helper", () => {
    for (const bad of [0, 10, 19, 50, 99, 86, NaN]) {
      expect(isMolarFdi(bad)).toBe(false);
    }
  });
});

describe("dentition display notation", () => {
  it("emits FDI labels as decimal strings", () => {
    expect(toLabel(11, "FDI")).toBe("11");
    expect(toLabel(48, "FDI")).toBe("48");
    expect(toLabel(55, "FDI")).toBe("55");
  });

  it("maps permanent FDI to Universal (ADA) numbers", () => {
    expect(toLabel(18, "UNIVERSAL")).toBe("1");
    expect(toLabel(11, "UNIVERSAL")).toBe("8");
    expect(toLabel(21, "UNIVERSAL")).toBe("9");
    expect(toLabel(28, "UNIVERSAL")).toBe("16");
    expect(toLabel(38, "UNIVERSAL")).toBe("17");
    expect(toLabel(31, "UNIVERSAL")).toBe("24");
    expect(toLabel(41, "UNIVERSAL")).toBe("25");
    expect(toLabel(48, "UNIVERSAL")).toBe("32");
    expect(toLabel(14, "UNIVERSAL")).toBe("5");
    expect(toLabel(46, "UNIVERSAL")).toBe("30");
  });

  it("maps primary FDI to Universal letters", () => {
    expect(toLabel(55, "UNIVERSAL")).toBe("A");
    expect(toLabel(51, "UNIVERSAL")).toBe("E");
    expect(toLabel(65, "UNIVERSAL")).toBe("J");
    expect(toLabel(61, "UNIVERSAL")).toBe("F");
    expect(toLabel(75, "UNIVERSAL")).toBe("K");
    expect(toLabel(71, "UNIVERSAL")).toBe("O");
    expect(toLabel(85, "UNIVERSAL")).toBe("T");
    expect(toLabel(81, "UNIVERSAL")).toBe("P");
  });

  it("maps FDI to Palmer quadrant-position labels", () => {
    expect(toLabel(14, "PALMER")).toBe("UR-4");
    expect(toLabel(28, "PALMER")).toBe("UL-8");
    expect(toLabel(38, "PALMER")).toBe("LL-8");
    expect(toLabel(48, "PALMER")).toBe("LR-8");
    expect(toLabel(55, "PALMER")).toBe("UR-E");
    expect(toLabel(85, "PALMER")).toBe("LR-E");
  });

  it("accepts numeric-string FDI input", () => {
    expect(toLabel("14", "FDI")).toBe("14");
    expect(toLabel("55", "UNIVERSAL")).toBe("A");
    expect(toLabel("48", "PALMER")).toBe("LR-8");
  });

  it("falls back to the input string for non-FDI values", () => {
    expect(toLabel("not-a-number", "FDI")).toBe("not-a-number");
  });

  it("fdiFromLabel accepts and rejects label shapes", () => {
    expect(fdiFromLabel("14", "FDI")).toBe(14);
    expect(fdiFromLabel("5", "UNIVERSAL")).toBe(14);
    expect(fdiFromLabel("A", "UNIVERSAL")).toBe(55);
    expect(fdiFromLabel("T", "UNIVERSAL")).toBe(81);
    expect(fdiFromLabel("UR-4", "PALMER")).toBe(14);
    expect(fdiFromLabel("LR-E", "PALMER")).toBe(85);
    expect(fdiFromLabel("bogus", "FDI")).toBeNull();
    expect(fdiFromLabel("UR-9", "PALMER")).toBeNull();
  });
});
