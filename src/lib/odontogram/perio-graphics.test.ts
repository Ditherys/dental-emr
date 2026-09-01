import { describe, expect, it } from "vitest";

import {
  PERIO_MM_GRID_MAX,
  PERIO_MM_PX,
  PERIO_ROW_BASELINE_Y,
  PERIO_SITE_INSET_RATIO,
  PERIO_TOOTH_GAP,
  gradeHeatBucket,
  kgHeatBucket,
  pdCalHeatBucket,
  perioArchLayout,
  perioBandPath,
  perioCurve,
  perioCurveSegments,
  perioMmGridLines,
  perioSiteOverlayMarks,
  perioSurfaceOverlayMarks,
  perioToothOverlayMarks,
  recessionHeatBucket,
  type PerioSurfaceOverlayTooth,
  type PerioToothGeometry,
} from "./perio-graphics";

/** A 40-unit-wide template whose cervical band spans 10..30 in template space. */
function geometry(fdi: number, overrides: Partial<PerioToothGeometry> = {}): PerioToothGeometry {
  return {
    fdi,
    viewBoxX: 0,
    width: 40,
    cervicalLeftX: 10,
    cervicalRightX: 30,
    mirrored: false,
    ...overrides,
  };
}

const CURVE_OPTS = { cejY: PERIO_ROW_BASELINE_Y, mmPx: PERIO_MM_PX };

describe("periodontal arch layout", () => {
  it("walks a shared left-to-right cursor so every tooth column is reproducible", () => {
    const layout = perioArchLayout([geometry(26), geometry(27), geometry(28)]);
    expect(layout.cejY).toBe(PERIO_ROW_BASELINE_Y);
    expect(layout.teeth.map((tooth) => tooth.x)).toEqual([0, 42, 84]);
    expect(layout.totalWidth).toBe(126);
    expect(PERIO_TOOTH_GAP).toBe(2);
  });

  it("interpolates six sites from one cervical span across the two aspects", () => {
    const [tooth] = perioArchLayout([geometry(26)]).teeth;
    // span 10..30, inset 12 % of 20 = 2.4
    expect(PERIO_SITE_INSET_RATIO).toBe(0.12);
    expect(tooth.siteXs).toEqual({
      MB: 12.4,
      B: 20,
      DB: 27.6,
      ML: 12.4,
      L: 20,
      DL: 27.6,
    });
  });

  it("puts mesial on the right for the patient's right quadrants and on the left for the left ones", () => {
    const right = perioArchLayout([geometry(16), geometry(46), geometry(55), geometry(85)]).teeth;
    for (const tooth of right) {
      expect(tooth.siteXs.MB, `tooth ${tooth.fdi}`).toBeGreaterThan(tooth.siteXs.DB);
      expect(tooth.siteXs.ML, `tooth ${tooth.fdi}`).toBeGreaterThan(tooth.siteXs.DL);
    }

    const left = perioArchLayout([geometry(26), geometry(36), geometry(65), geometry(75)]).teeth;
    for (const tooth of left) {
      expect(tooth.siteXs.MB, `tooth ${tooth.fdi}`).toBeLessThan(tooth.siteXs.DB);
      expect(tooth.siteXs.ML, `tooth ${tooth.fdi}`).toBeLessThan(tooth.siteXs.DL);
    }
  });

  it("keeps the buccal and lingual aspects on identical columns", () => {
    const [tooth] = perioArchLayout([geometry(16)]).teeth;
    expect(tooth.siteXs.MB).toBe(tooth.siteXs.ML);
    expect(tooth.siteXs.B).toBe(tooth.siteXs.L);
    expect(tooth.siteXs.DB).toBe(tooth.siteXs.DL);
  });

  it("mirrors a mirrored template's cervical registration into the row's own space", () => {
    const [tooth] = perioArchLayout([geometry(26, { cervicalLeftX: 8, cervicalRightX: 30, mirrored: true })]).teeth;
    // mirrored span: [2*0 + 40 - 30, 2*0 + 40 - 8] = [10, 32]; inset 12 % of 22 = 2.64
    expect(tooth.siteXs.MB).toBe(12.64);
    expect(tooth.siteXs.B).toBe(21);
    expect(tooth.siteXs.DB).toBe(29.36);
  });

  it("falls back to the template sixths when the cervical registration is missing", () => {
    const [tooth] = perioArchLayout([geometry(26, { cervicalLeftX: null, cervicalRightX: null })]).teeth;
    expect(tooth.siteXs.B).toBe(20);
    expect(tooth.siteXs.MB).toBe(9.867);
    expect(tooth.siteXs.DB).toBe(30.133);
  });

  it("produces stable, rounded coordinates for the same input", () => {
    const teeth = [geometry(16, { width: 37.7, cervicalLeftX: 3.111, cervicalRightX: 31.777 }), geometry(15)];
    const first = perioArchLayout(teeth);
    const second = perioArchLayout(teeth);
    expect(first).toEqual(second);
    for (const tooth of first.teeth) {
      for (const x of Object.values(tooth.siteXs)) {
        expect(Number.isFinite(x)).toBe(true);
        expect(x).toBe(Number(x.toFixed(3)));
      }
    }
  });
});

describe("periodontal curve geometry", () => {
  it("places the margin from the CEJ and the pocket base from the margin", () => {
    const curve = perioCurve(
      [
        { site: "MB", x: 10, probingDepthMm: 4, gingivalMarginMm: 2 },
        { site: "B", x: 20, probingDepthMm: 4, gingivalMarginMm: -1 },
        { site: "DB", x: 30, probingDepthMm: 3, gingivalMarginMm: 0 },
      ],
      CURVE_OPTS,
    );

    expect(curve.cejY).toBe(40);
    expect(curve.marginPts).toEqual([
      { x: 10, y: 46 },
      { x: 20, y: 37 },
      { x: 30, y: 40 },
    ]);
    expect(curve.pocketPts).toEqual([
      { x: 10, y: 58 },
      { x: 20, y: 49 },
      { x: 30, y: 49 },
    ]);
    expect(curve.siteStates).toEqual(["CHARTED", "CHARTED", "CHARTED"]);
    expect(curve.chartedSiteCount).toBe(3);
    expect(curve.unknownSiteCount).toBe(0);
  });

  it("breaks the curve at an uncharted site rather than drawing through it", () => {
    const curve = perioCurve(
      [
        { site: "MB", x: 10, probingDepthMm: 4, gingivalMarginMm: 0 },
        { site: "B", x: 20, probingDepthMm: null, gingivalMarginMm: null },
        { site: "DB", x: 30, probingDepthMm: 5, gingivalMarginMm: 0 },
      ],
      CURVE_OPTS,
    );

    expect(curve.siteStates).toEqual(["CHARTED", "UNCHARTED", "CHARTED"]);
    expect(curve.marginPts[1]).toBeNull();
    expect(curve.pocketPts[1]).toBeNull();
    expect(curve.chartedSiteCount).toBe(2);
    expect(curve.unknownSiteCount).toBe(1);
  });

  it("refuses to draw a margin at the CEJ when the margin was never recorded", () => {
    const curve = perioCurve(
      [{ site: "MB", x: 10, probingDepthMm: 6, gingivalMarginMm: null }],
      CURVE_OPTS,
    );

    expect(curve.siteStates).toEqual(["MARGIN_UNKNOWN"]);
    expect(curve.marginPts).toEqual([null]);
    expect(curve.pocketPts).toEqual([null]);
    expect(curve.chartedSiteCount).toBe(0);
    expect(curve.unknownSiteCount).toBe(1);
  });

  it("splits point arrays into contiguous drawable runs", () => {
    const pts = [
      { x: 1, y: 1 },
      null,
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      null,
    ];
    expect(perioCurveSegments(pts)).toEqual([[{ x: 1, y: 1 }], [{ x: 3, y: 3 }, { x: 4, y: 4 }]]);
    expect(perioCurveSegments([null, null])).toEqual([]);
  });

  it("closes the filled band from the margin run forward and the pocket run back", () => {
    expect(
      perioBandPath(
        [
          { x: 10, y: 40 },
          { x: 20, y: 41 },
        ],
        [
          { x: 10, y: 52 },
          { x: 20, y: 56 },
        ],
      ),
    ).toBe("M10 40 L20 41 L20 56 L10 52 Z");
    expect(perioBandPath([], [])).toBe("");
  });

  it("draws a millimetre guide line per millimetre and emphasises every fifth", () => {
    const lines = perioMmGridLines({ cejY: PERIO_ROW_BASELINE_Y, mmPx: PERIO_MM_PX, max: PERIO_MM_GRID_MAX });
    expect(PERIO_MM_GRID_MAX).toBe(15);
    expect(lines).toHaveLength(15);
    expect(lines[0]).toEqual({ mm: 1, y: 43, emphasized: false });
    expect(lines[4]).toEqual({ mm: 5, y: 55, emphasized: true });
    expect(lines[14]).toEqual({ mm: 15, y: 85, emphasized: true });
  });
});

describe("periodontal site overlays", () => {
  const site = (over: Partial<Parameters<typeof perioSiteOverlayMarks>[1][number]> = {}) => ({
    fdi: 16,
    site: "MB" as const,
    x: 10,
    probingDepthMm: 4 as number | null,
    gingivalMarginMm: 0 as number | null,
    bleedingOnProbing: null as boolean | null,
    ...over,
  });

  it("marks a bleeding site at the gingival margin and never marks an unassessed one", () => {
    const marks = perioSiteOverlayMarks(
      "BOP",
      [
        site({ bleedingOnProbing: true, gingivalMarginMm: 2 }),
        site({ x: 20, bleedingOnProbing: false }),
        site({ x: 30, bleedingOnProbing: null }),
      ],
      CURVE_OPTS,
    );
    expect(marks).toEqual([
      { index: "BOP", fdi: 16, site: "MB", x: 10, y: 46, anchor: "MARGIN", bucket: null },
    ]);
  });

  it("flags a bleeding mark whose margin is unknown instead of asserting no recession", () => {
    const marks = perioSiteOverlayMarks(
      "BOP",
      [site({ bleedingOnProbing: true, gingivalMarginMm: null })],
      CURVE_OPTS,
    );
    expect(marks).toEqual([
      { index: "BOP", fdi: 16, site: "MB", x: 10, y: 40, anchor: "CEJ_FALLBACK", bucket: null },
    ]);
  });

  // The whole PD family anchors on the pocket base, whose position relative to
  // the CEJ depends on the margin. The depth itself is known either way, so the
  // mark is still drawn when the margin is not — but it must say so.
  it.each([
    ["PD_GTE_5", 4, 0, 0, null],
    ["PD_GTE_5", 5, 0, 1, "POCKET_BASE"],
    ["PD_GTE_5", 5, null, 1, "CEJ_FALLBACK"],
    ["PD_GTE_5", 4, null, 0, null],
    ["PD_GTE_6", 5, 0, 0, null],
    ["PD_GTE_6", 6, 0, 1, "POCKET_BASE"],
    ["PD_GTE_6", 7, null, 1, "CEJ_FALLBACK"],
    ["PD", 3, 2, 1, "POCKET_BASE"],
    ["PD", 3, null, 1, "CEJ_FALLBACK"],
  ] as const)(
    "marks %s at probing depth %i with margin %s as %i mark(s) anchored %s",
    (index, pd, gm, expected, anchor) => {
      const marks = perioSiteOverlayMarks(
        index,
        [site({ probingDepthMm: pd, gingivalMarginMm: gm })],
        CURVE_OPTS,
      );
      expect(marks).toHaveLength(expected);
      if (expected === 1) {
        expect(marks[0].anchor).toBe(anchor);
        expect(marks[0].y).toBe(40 + ((gm ?? 0) + pd) * 3);
      }
    },
  );

  it("never marks a probing threshold for an uncharted depth", () => {
    expect(perioSiteOverlayMarks("PD_GTE_6", [site({ probingDepthMm: null })], CURVE_OPTS)).toEqual([]);
  });

  it("heat-buckets probing depth at the pocket base", () => {
    const marks = perioSiteOverlayMarks(
      "PD",
      [site({ probingDepthMm: 3 }), site({ x: 20, probingDepthMm: 4 }), site({ x: 30, probingDepthMm: 7 })],
      CURVE_OPTS,
    );
    expect(marks.map((mark) => mark.bucket)).toEqual(["SHALLOW", "MODERATE", "DEEP"]);
    expect(marks.map((mark) => mark.y)).toEqual([49, 52, 61]);
  });

  it("omits a CAL mark entirely when the attachment level is unknown", () => {
    const marks = perioSiteOverlayMarks(
      "CAL",
      [site({ probingDepthMm: 5, gingivalMarginMm: 2 }), site({ x: 20, probingDepthMm: 5, gingivalMarginMm: null })],
      CURVE_OPTS,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({
      index: "CAL",
      fdi: 16,
      site: "MB",
      x: 10,
      y: 61,
      anchor: "POCKET_BASE",
      bucket: "DEEP",
    });
  });

  it("marks recession only where the margin is apical to the CEJ", () => {
    const marks = perioSiteOverlayMarks(
      "RECESSION",
      [
        site({ gingivalMarginMm: 3 }),
        site({ x: 20, gingivalMarginMm: 0 }),
        site({ x: 30, gingivalMarginMm: -2 }),
        site({ x: 40, gingivalMarginMm: null }),
      ],
      CURVE_OPTS,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].y).toBe(49);
    expect(marks[0].bucket).toBe("MODERATE");
    expect(marks[0].anchor).toBe("MARGIN");
  });

  it("marks recession from the margin alone, without requiring a probing depth", () => {
    // Recession is a measurement of the margin against the CEJ. The fork gated
    // every site overlay behind a charted probing depth; a recorded margin with
    // no probing depth is still a recorded recession.
    const marks = perioSiteOverlayMarks(
      "RECESSION",
      [site({ probingDepthMm: null, gingivalMarginMm: 3 })],
      CURVE_OPTS,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].y).toBe(49);
    expect(marks[0].anchor).toBe("MARGIN");
  });

  it("ramps each index on its own clinical scale", () => {
    expect([3, 4, 5, 6].map(pdCalHeatBucket)).toEqual(["SHALLOW", "MODERATE", "MODERATE", "DEEP"]);
    expect([1, 2, 3, 4].map(recessionHeatBucket)).toEqual(["SHALLOW", "MODERATE", "MODERATE", "DEEP"]);
    expect([1, 2, 3].map(gradeHeatBucket)).toEqual(["SHALLOW", "MODERATE", "DEEP"]);
    // A narrow keratinized band is the risk, so the KG ramp is inverted.
    expect([1, 2, 3, 4, 6].map(kgHeatBucket)).toEqual(["DEEP", "MODERATE", "MODERATE", "SHALLOW", "SHALLOW"]);
  });
});

describe("periodontal surface overlays", () => {
  const NO_INDICES = {
    plaquePresent: null,
    plaqueIndex: null,
    gingivalIndex: null,
    modifiedPlaqueIndex: null,
    modifiedBleedingIndex: null,
  };

  function surfaceTooth(
    fdi: number,
    surfaces: PerioSurfaceOverlayTooth["surfaces"],
    implantContext = false,
  ): PerioSurfaceOverlayTooth {
    const [tooth] = perioArchLayout([geometry(fdi)]).teeth;
    return { fdi, implantContext, siteXs: tooth.siteXs, surfaces };
  }

  it("draws each charted plaque surface exactly once across the two aspects", () => {
    const tooth = surfaceTooth(26, {
      mesial: { ...NO_INDICES, plaquePresent: true },
      buccal: { ...NO_INDICES, plaquePresent: true },
      distal: { ...NO_INDICES, plaquePresent: false },
      lingual: { ...NO_INDICES, plaquePresent: true },
    });

    const buccal = perioSurfaceOverlayMarks("PLAQUE", [tooth], "BUCCAL", { cejY: PERIO_ROW_BASELINE_Y });
    const lingual = perioSurfaceOverlayMarks("PLAQUE", [tooth], "LINGUAL", { cejY: PERIO_ROW_BASELINE_Y });

    expect(buccal.map((mark) => mark.x)).toEqual([12.4, 20]);
    expect(buccal.every((mark) => mark.y === PERIO_ROW_BASELINE_Y)).toBe(true);
    expect(lingual.map((mark) => mark.x)).toEqual([20]);
    expect(buccal.length + lingual.length).toBe(3);
  });

  it("respects arch orientation when placing an interproximal surface mark", () => {
    const upperRight = surfaceTooth(16, { mesial: { ...NO_INDICES, plaquePresent: true } });
    const upperLeft = surfaceTooth(26, { mesial: { ...NO_INDICES, plaquePresent: true } });
    expect(perioSurfaceOverlayMarks("PLAQUE", [upperRight], "BUCCAL", { cejY: 40 })[0].x).toBe(27.6);
    expect(perioSurfaceOverlayMarks("PLAQUE", [upperLeft], "BUCCAL", { cejY: 40 })[0].x).toBe(12.4);
  });

  it("distinguishes a recorded score of zero from an unrecorded score", () => {
    const tooth = surfaceTooth(26, {
      mesial: { ...NO_INDICES, plaqueIndex: 0 },
      buccal: { ...NO_INDICES, plaqueIndex: null },
      distal: { ...NO_INDICES, plaqueIndex: 2 },
    });
    const marks = perioSurfaceOverlayMarks("PI", [tooth], "BUCCAL", { cejY: 40 });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({
      index: "PI",
      fdi: 26,
      surface: "distal",
      x: 27.6,
      y: 40,
      anchor: "CEJ",
      bucket: "MODERATE",
    });
  });

  it("keeps the natural-tooth and peri-implant index families on their own contexts", () => {
    const natural = surfaceTooth(26, { buccal: { ...NO_INDICES, gingivalIndex: 2, modifiedBleedingIndex: 2 } });
    const implant = surfaceTooth(36, { buccal: { ...NO_INDICES, gingivalIndex: 2, modifiedBleedingIndex: 2 } }, true);

    expect(perioSurfaceOverlayMarks("GI", [natural], "BUCCAL", { cejY: 40 })).toHaveLength(1);
    expect(perioSurfaceOverlayMarks("GI", [implant], "BUCCAL", { cejY: 40 })).toHaveLength(0);
    expect(perioSurfaceOverlayMarks("MBI", [implant], "BUCCAL", { cejY: 40 })).toHaveLength(1);
    expect(perioSurfaceOverlayMarks("MBI", [natural], "BUCCAL", { cejY: 40 })).toHaveLength(0);
  });
});

describe("periodontal tooth overlays", () => {
  function toothOverlay(fdi: number, over: { keratinizedGingivaMm?: number | null; cairoRecessionType?: "RT1" | "RT2" | "RT3" | null; implantContext?: boolean } = {}) {
    const [tooth] = perioArchLayout([geometry(fdi)]).teeth;
    return {
      fdi,
      implantContext: over.implantContext ?? false,
      siteXs: tooth.siteXs,
      keratinizedGingivaMm: over.keratinizedGingivaMm ?? null,
      cairoRecessionType: over.cairoRecessionType ?? null,
    };
  }

  it("marks a charted keratinized band on the buccal centre and skips an unmeasured one", () => {
    const marks = perioToothOverlayMarks(
      "KG",
      [toothOverlay(26, { keratinizedGingivaMm: 1.5 }), toothOverlay(27)],
      { cejY: PERIO_ROW_BASELINE_Y },
    );
    expect(marks).toEqual([
      { index: "KG", fdi: 26, x: 20, y: 40, anchor: "CEJ", bucket: "DEEP" },
    ]);
  });

  it("marks a keratinized band of zero, which is a finding, not a gap", () => {
    const marks = perioToothOverlayMarks("KG", [toothOverlay(26, { keratinizedGingivaMm: 0 })], { cejY: 40 });
    expect(marks).toHaveLength(1);
    expect(marks[0].bucket).toBe("DEEP");
  });

  it("marks a supplied Cairo recession type on natural teeth only", () => {
    expect(
      perioToothOverlayMarks("CAIRO", [toothOverlay(26, { cairoRecessionType: "RT2" })], { cejY: 40 }),
    ).toEqual([{ index: "CAIRO", fdi: 26, x: 20, y: 40, anchor: "CEJ", bucket: null }]);
    expect(
      perioToothOverlayMarks(
        "CAIRO",
        [toothOverlay(26, { cairoRecessionType: "RT2", implantContext: true })],
        { cejY: 40 },
      ),
    ).toEqual([]);
    expect(perioToothOverlayMarks("CAIRO", [toothOverlay(26)], { cejY: 40 })).toEqual([]);
  });
});
