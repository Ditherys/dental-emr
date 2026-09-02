import { describe, expect, it } from "vitest";

import type { RendererToothProjection, RendererToothView } from "@/lib/odontogram/renderer-projection";
import type { ToothRenderFeature } from "@/lib/odontogram/feature-contract";
import { dentitionFor } from "@/lib/odontogram/dentition";

import { measuredAssetKeyForFdi, measuredTemplateLayerIds } from "./measured-assets";
import { DEFAULT_ANATOMY_DISPLAY, MEASURED_FORK_LAYER_IDS, measuredForkLayers, type ChartAnatomyDisplay } from "./measured-fork-layers";

function feature(
  detail: ToothRenderFeature["detail"],
  surfaces: ToothRenderFeature["surfaces"] = [],
  planned = false,
): ToothRenderFeature {
  return { detail, surfaces, planned };
}

function tooth(
  fdi: number,
  overrides: Partial<RendererToothProjection> = {},
  view: RendererToothView = "front",
): RendererToothProjection {
  return {
    fdi,
    dentition: dentitionFor(fdi) ?? "permanent",
    view,
    anatomy: "NATURAL",
    features: [],
    bridgeRole: null,
    mobility: "none",
    perioAlert: false,
    ...overrides,
  };
}

/** Activation is always filtered against the real layer ids of the real asset. */
function active(projection: RendererToothProjection): ReadonlySet<string> {
  const key = measuredAssetKeyForFdi(projection.fdi, projection.view);
  if (!key) throw new Error(`No measured asset for FDI ${projection.fdi} (${projection.view})`);
  return measuredForkLayers(projection, measuredTemplateLayerIds(key));
}

/** Activation with an explicit display preference, against the real asset. */
function activeWith(
  projection: RendererToothProjection,
  display: ChartAnatomyDisplay,
): ReadonlySet<string> {
  const key = measuredAssetKeyForFdi(projection.fdi, projection.view);
  if (!key) throw new Error(`No measured asset for FDI ${projection.fdi} (${projection.view})`);
  return measuredForkLayers(projection, measuredTemplateLayerIds(key), display);
}

describe("measured fork layer registry", () => {
  it("returns an immutable set that a caller cannot mutate into the renderer", () => {
    const result = active(tooth(11));
    expect(() => (result as Set<string>).add("tooth-radix")).toThrow();
    expect(result.has("tooth-radix")).toBe(false);
  });

  it("only ever activates ids inside the closed registry, for every installed template", () => {
    const details: ToothRenderFeature["detail"][] = [
      { code: "TOOTH_STATE", state: "PRESENT" },
      { code: "TOOTH_STATE", state: "MISSING" },
      { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" },
      { code: "TOOTH_STATE", state: "SUBGINGIVAL" },
      { code: "TOOTH_STATE", state: "RADIX" },
      { code: "TOOTH_STATE", state: "BROKEN" },
      { code: "TOOTH_STATE", state: "CROWN_PREPARATION" },
      { code: "ROOT_CANAL", state: "endo-filling" },
      { code: "ROOT_CANAL", state: "endo-medical-filling" },
      { code: "ROOT_CANAL", state: "endo-filling-incomplete" },
      { code: "ROOT_CANAL", state: "endo-glass-pin" },
      { code: "ROOT_CANAL", state: "endo-metal-pin" },
      { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
      { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true },
      { code: "RESTORATION", restorationType: "veneer", material: "emax", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "inlay", material: "gold", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "onlay", material: "gradia", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "bridge", material: "metal-ceramic", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "crown", material: "telescope", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "none", material: "amalgam", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "none", material: "gic", marginalLeakage: false },
      { code: "RESTORATION", restorationType: "none", material: "temporary", marginalLeakage: false },
      { code: "ORTHODONTIC", appliance: "BRACKET", movement: "ROTATION" },
      { code: "ORTHODONTIC", appliance: "BAND", movement: "DRIFT" },
      { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" },
      { code: "ORTHODONTIC", appliance: "BRACKET", movement: "EXTRUSION" },
      { code: "OTHER", controlledCode: "SEALANT" },
      { code: "OTHER", controlledCode: "FRACTURE" },
      { code: "OTHER", controlledCode: "PERIAPICAL_LESION" },
      { code: "OTHER", controlledCode: "CROWN" },
      { code: "OTHER", controlledCode: "UNRECOGNISED_CODE" },
    ];

    const anatomies: RendererToothProjection["anatomy"][] = [
      "NATURAL",
      "MISSING",
      "EXTRACTION_WOUND",
      "IMPLANT_FIXTURE",
      "IMPLANT_ABUTMENT",
      "IMPLANT_CROWN",
    ];

    const seen = new Set<string>();
    for (const fdi of [11, 13, 16, 18, 34, 37, 45, 51, 53, 54, 55, 71, 74, 75]) {
      for (const view of ["front", "occlusal"] as const) {
        if (!measuredAssetKeyForFdi(fdi, view)) continue;
        for (const anatomy of anatomies) {
          for (const detail of details) {
            for (const surfaces of [[], ["O"], ["B", "L", "M", "D"], ["FULL"]] as const) {
              const result = active(
                tooth(
                  fdi,
                  {
                    anatomy,
                    features: [feature(detail, surfaces)],
                    bridgeRole: "ABUTMENT",
                    mobility: "m3",
                    perioAlert: true,
                  },
                  view,
                ),
              );
              for (const id of result) {
                expect(MEASURED_FORK_LAYER_IDS.has(id)).toBe(true);
                seen.add(id);
              }
            }
          }
        }
      }
    }
    expect(seen.size).toBeGreaterThan(40);
  }, 60_000);
});

describe("measured fork layer activation — permanent anatomy", () => {
  it("renders a healthy permanent tooth from natural anatomy only", () => {
    const result = active(tooth(11));
    expect([...result].sort()).toEqual(["bone-base", "gum-base", "tooth-base", "tooth-base-beauty", "tooth-healthy-pulp"]);
  });

  it("renders a missing tooth without natural crown artwork", () => {
    const result = active(
      tooth(11, { anatomy: "MISSING", features: [feature({ code: "TOOTH_STATE", state: "MISSING" })] }),
    );
    expect(result.has("missing-closed")).toBe(true);
    expect(result.has("tooth-base")).toBe(false);
    expect(result.has("tooth-base-beauty")).toBe(false);
    expect(result.has("tooth-healthy-pulp")).toBe(false);
  });

  it("renders an extracted tooth as an extraction wound", () => {
    const result = active(
      tooth(11, {
        anatomy: "EXTRACTION_WOUND",
        features: [feature({ code: "TOOTH_STATE", state: "EXTRACTION_WOUND" })],
      }),
    );
    expect(result.has("no-tooth-after-extraction")).toBe(true);
    expect(result.has("tooth-base")).toBe(false);
  });

  it("renders an unerupted or impacted tooth through the sub-gingival layer", () => {
    const result = active(tooth(13, { features: [feature({ code: "TOOTH_STATE", state: "SUBGINGIVAL" })] }));
    expect(result.has("tooth-under-gum")).toBe(true);
    expect(result.has("tooth-base")).toBe(true);
  });

  it("renders a retained root", () => {
    expect(active(tooth(13, { features: [feature({ code: "TOOTH_STATE", state: "RADIX" })] })).has("tooth-radix")).toBe(true);
  });

  it("renders a broken tooth and a crown preparation", () => {
    expect(active(tooth(11, { features: [feature({ code: "TOOTH_STATE", state: "BROKEN" })] })).has("tooth-broken-distal")).toBe(true);
    expect(active(tooth(11, { features: [feature({ code: "TOOTH_STATE", state: "CROWN_PREPARATION" })] })).has("tooth-crownprep")).toBe(true);
  });

  it("renders each implant component stage", () => {
    const fixture = active(tooth(36, { anatomy: "IMPLANT_FIXTURE" }));
    expect(fixture.has("implant")).toBe(true);
    expect(fixture.has("implant-base")).toBe(true);
    expect(fixture.has("tooth-base")).toBe(false);

    const abutment = active(tooth(36, { anatomy: "IMPLANT_ABUTMENT" }));
    expect(abutment.has("implant-connector")).toBe(true);

    const crown = active(tooth(36, { anatomy: "IMPLANT_CROWN" }));
    expect(crown.has("prosthesis-implant")).toBe(true);
    expect(crown.has("prosthesis-implant-crown")).toBe(true);
  });

  it("renders bridge abutments, pontics and their connector", () => {
    const abutment = active(
      tooth(14, {
        bridgeRole: "ABUTMENT",
        features: [
          feature({ code: "RESTORATION", restorationType: "bridge", material: "zircon", marginalLeakage: false }),
        ],
      }),
    );
    expect(abutment.has("zircon-crown")).toBe(true);
    expect(abutment.has("zircon-bridge-connector")).toBe(true);

    const pontic = active(tooth(15, { anatomy: "MISSING", bridgeRole: "PONTIC" }));
    expect(pontic.has("prosthesis")).toBe(true);
    expect(pontic.has("prosthesis-crown")).toBe(true);
    expect(pontic.has("prosthesis-connector")).toBe(true);
  });

  it("renders every root-canal-treated root state", () => {
    expect(active(tooth(11, { features: [feature({ code: "ROOT_CANAL", state: "endo-filling" })] })).has("endo-filling")).toBe(true);
    expect(active(tooth(11, { features: [feature({ code: "ROOT_CANAL", state: "endo-medical-filling" })] })).has("endo-medical-filling")).toBe(true);
    expect(active(tooth(11, { features: [feature({ code: "ROOT_CANAL", state: "endo-filling-incomplete" })] })).has("endo-filling-incomplete")).toBe(true);

    const glass = active(tooth(11, { features: [feature({ code: "ROOT_CANAL", state: "endo-glass-pin" })] }));
    expect(glass.has("endo-glass-pin")).toBe(true);
    expect(glass.has("endo-filling")).toBe(true);

    const metal = active(tooth(11, { features: [feature({ code: "ROOT_CANAL", state: "endo-metal-pin" })] }));
    expect(metal.has("endo-metal-pin")).toBe(true);
    expect(metal.has("endo-filling")).toBe(true);
  });

  it("renders an apical finding through the periapical inflammation layers", () => {
    const result = active(tooth(11, { features: [feature({ code: "OTHER", controlledCode: "PERIAPICAL_LESION" })] }));
    expect(result.has("inflammation")).toBe(true);
    expect(result.has("granuloma")).toBe(true);
  });

  it("renders caries by surface and root caries when no surface is recorded", () => {
    const surfaced = active(
      tooth(16, {
        features: [
          feature({ code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null }, ["O", "B"]),
        ],
      }),
    );
    expect(surfaced.has("caries-occlusal")).toBe(true);
    expect(surfaced.has("caries-buccal")).toBe(true);
    expect(surfaced.has("caries-root")).toBe(false);

    const root = active(
      tooth(16, {
        features: [feature({ code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null })],
      }),
    );
    expect(root.has("caries-root")).toBe(true);
  });

  it("expands a FULL surface record into every anatomic caries surface the template carries", () => {
    const occlusal = active(
      tooth(
        16,
        { features: [feature({ code: "CARIES", depth: "ENAMEL", icdas: 2, cars: null, radiographicDepth: null }, ["FULL"])] },
        "occlusal",
      ),
    );
    for (const id of ["caries-occlusal", "caries-buccal", "caries-lingual", "caries-mesial", "caries-distal"]) {
      expect(occlusal.has(id)).toBe(true);
    }

    // The lateral templates carry no lingual caries artwork; a layer the
    // template does not have is never activated.
    const front = active(
      tooth(16, {
        features: [feature({ code: "CARIES", depth: "ENAMEL", icdas: 2, cars: null, radiographicDepth: null }, ["FULL"])],
      }),
    );
    expect(front.has("caries-occlusal")).toBe(true);
    expect(front.has("caries-lingual")).toBe(false);
  });

  it("renders a direct restoration by material and surface", () => {
    const result = active(
      tooth(16, {
        features: [
          feature({ code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false }, ["O", "M"]),
        ],
      }),
    );
    expect(result.has("filling-composite-occlusal")).toBe(true);
    expect(result.has("filling-composite-mesial")).toBe(true);
    expect(result.has("filling-amalgam-occlusal")).toBe(false);
  });

  it("renders indirect crown, veneer, inlay and onlay restorations", () => {
    const crown = active(
      tooth(16, {
        features: [feature({ code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true })],
      }),
    );
    expect(crown.has("zircon")).toBe(true);
    expect(crown.has("zircon-crown")).toBe(true);
    expect(crown.has("crown-leakage")).toBe(true);

    expect(
      active(tooth(16, { features: [feature({ code: "RESTORATION", restorationType: "veneer", material: "emax", marginalLeakage: false })] })).has("emax-veneer"),
    ).toBe(true);
    expect(
      active(tooth(16, { features: [feature({ code: "RESTORATION", restorationType: "inlay", material: "gold", marginalLeakage: false })] })).has("gold-inlay"),
    ).toBe(true);

    const onlayOcclusal = active(
      tooth(
        16,
        { features: [feature({ code: "RESTORATION", restorationType: "onlay", material: "gradia", marginalLeakage: false })] },
        "occlusal",
      ),
    );
    expect(onlayOcclusal.has("gradia-onlay")).toBe(true);

    // An onlay is authored occlusal-only; the lateral view falls back to the
    // material's inlay geometry exactly as the controlled fork does.
    const onlayFront = active(
      tooth(16, { features: [feature({ code: "RESTORATION", restorationType: "onlay", material: "gradia", marginalLeakage: false })] }),
    );
    expect(onlayFront.has("gradia-inlay")).toBe(true);
    expect(onlayFront.has("gradia-onlay")).toBe(false);
  });

  it("renders a telescope crown as its three-layer composition", () => {
    const result = active(
      tooth(16, {
        features: [feature({ code: "RESTORATION", restorationType: "crown", material: "telescope", marginalLeakage: false })],
      }),
    );
    expect(result.has("telescope-crown")).toBe(true);
    expect(result.has("telescope-crown-inside")).toBe(true);
    expect(result.has("telescope-crown-outside")).toBe(true);
  });

  it("renders a sealant on a sealable tooth", () => {
    const result = active(tooth(16, { features: [feature({ code: "OTHER", controlledCode: "SEALANT" })] }, "occlusal"));
    expect(result.has("fissure-sealing")).toBe(true);
    expect(result.has("fissure-sealing-occlusal")).toBe(true);
  });

  it("renders no artwork for a controlled code that collides with Object.prototype", () => {
    for (const hostile of ["constructor", "toString", "__proto__", "valueOf"]) {
      const result = active(tooth(11, { features: [feature({ code: "OTHER", controlledCode: hostile })] }));
      expect([...result].sort()).toEqual(["bone-base", "gum-base", "tooth-base", "tooth-base-beauty", "tooth-healthy-pulp"]);
    }
  });

  it("renders a fracture", () => {
    expect(active(tooth(11, { features: [feature({ code: "OTHER", controlledCode: "FRACTURE" })] })).has("fracture-vertical")).toBe(true);
  });

  it("renders orthodontic brackets, bands, rotation and drift", () => {
    const bracket = active(tooth(13, { features: [feature({ code: "ORTHODONTIC", appliance: "BRACKET", movement: "ROTATION" })] }));
    expect(bracket.has("ortho-bracket")).toBe(true);
    expect(bracket.has("arrow-rotation")).toBe(true);

    const band = active(tooth(13, { features: [feature({ code: "ORTHODONTIC", appliance: "BAND", movement: "DRIFT" })] }));
    expect(band.has("ortho-ring")).toBe(true);
    expect(band.has("arrow-mesial")).toBe(true);

    expect(active(tooth(13, { features: [feature({ code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" })] })).has("arrow-down")).toBe(true);
    expect(active(tooth(13, { features: [feature({ code: "ORTHODONTIC", appliance: "BRACKET", movement: "EXTRUSION" })] })).has("arrow-up")).toBe(true);
  });

  it("renders mobility and a periodontal alert from canonical periodontal data", () => {
    expect(active(tooth(11, { mobility: "m2" })).has("mobility")).toBe(true);
    expect(active(tooth(11, { mobility: "none" })).has("mobility")).toBe(false);
    expect(active(tooth(11, { perioAlert: true })).has("parodontal")).toBe(true);
    expect(active(tooth(11, { perioAlert: false })).has("parodontal")).toBe(false);
  });

  it("activates planned features so a plan view is never blank", () => {
    const result = active(
      tooth(11, {
        features: [feature({ code: "ROOT_CANAL", state: "endo-filling" }, [], true)],
      }),
    );
    expect(result.has("endo-filling")).toBe(true);
  });
});

describe("measured fork layer activation — primary anatomy", () => {
  it("uses milk-tooth artwork when the primary template provides it", () => {
    const result = active(tooth(51));
    expect(result.has("milktooth")).toBe(true);
    expect(result.has("milktooth-base")).toBe(true);
    expect(result.has("milktooth-beauty")).toBe(true);
    expect(result.has("milktooth-healthy-pulp")).toBe(true);
    expect(result.has("tooth-base")).toBe(false);
  });

  it("falls back to the natural crown for primary templates without milk-tooth artwork", () => {
    const result = active(tooth(75));
    expect(result.has("milktooth-base")).toBe(false);
    expect(result.has("tooth-base")).toBe(true);
  });

  it("renders clinical findings on primary teeth through the same closed registry", () => {
    const caries = active(
      tooth(74, {
        features: [feature({ code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null }, ["O"])],
      }, "occlusal"),
    );
    expect(caries.has("caries-occlusal")).toBe(true);

    const missing = active(tooth(52, { anatomy: "MISSING", features: [feature({ code: "TOOTH_STATE", state: "MISSING" })] }));
    expect(missing.has("missing-closed")).toBe(true);
    expect(missing.has("milktooth-base")).toBe(false);

    const endo = active(tooth(53, { features: [feature({ code: "ROOT_CANAL", state: "endo-filling" })] }));
    expect(endo.has("endo-filling")).toBe(true);
  });

  it("never activates a layer the primary template does not carry", () => {
    const result = active(tooth(51, { features: [feature({ code: "OTHER", controlledCode: "SEALANT" })] }));
    expect(result.has("fissure-sealing")).toBe(false);
  });
});

/**
 * Task 7. A relationship is not a crown-shaped approximation: an implant and a
 * bridge each activate their own reviewed anatomy, and each stage of the implant
 * chain changes which anatomical layers are painted.
 */
describe("measured fork layer activation — relationship anatomy", () => {
  const missing = tooth(16, {
    anatomy: "MISSING",
    features: [feature({ code: "TOOTH_STATE", state: "MISSING" })],
  });

  it("moves a missing tooth through fixture, abutment and crown as real anatomical layers", () => {
    const gap = active(missing);
    expect(gap.has("missing-closed")).toBe(true);
    expect(gap.has("implant")).toBe(false);
    expect(gap.has("implant-base")).toBe(false);

    const fixture = active(tooth(16, { anatomy: "IMPLANT_FIXTURE" }));
    expect(fixture.has("implant")).toBe(true);
    expect(fixture.has("implant-base")).toBe(true);
    expect(fixture.has("implant-connector")).toBe(false);
    expect(fixture.has("prosthesis-implant-crown")).toBe(false);
    expect(fixture.has("tooth-base")).toBe(false);

    const abutment = active(tooth(16, { anatomy: "IMPLANT_ABUTMENT" }));
    expect(abutment.has("implant")).toBe(true);
    expect(abutment.has("implant-connector")).toBe(true);
    expect(abutment.has("prosthesis-implant-crown")).toBe(false);

    const crown = active(tooth(16, { anatomy: "IMPLANT_CROWN" }));
    expect(crown.has("implant")).toBe(true);
    expect(crown.has("implant-connector")).toBe(true);
    expect(crown.has("prosthesis-implant")).toBe(true);
    expect(crown.has("prosthesis-implant-crown")).toBe(true);
    expect(crown.has("prosthesis-implant-gum")).toBe(true);

    // Every stage is a different set, so the chart genuinely changes shape as
    // the chain advances rather than repainting one implant icon.
    const sets = [gap, fixture, abutment, crown].map((set) => [...set].sort().join("|"));
    expect(new Set(sets).size).toBe(4);
  });

  it("renders a bridge abutment and pontic as prosthesis anatomy with its own connector", () => {
    const abutment = active(tooth(24, { bridgeRole: "ABUTMENT" }));
    expect(abutment.has("prosthesis")).toBe(true);
    expect(abutment.has("prosthesis-crown")).toBe(true);
    expect(abutment.has("prosthesis-connector")).toBe(true);
    // A bridge is not a crown: no single-tooth crown artwork stands in for it.
    expect(abutment.has("tooth-crownprep")).toBe(false);
    expect(abutment.has("emax-crown")).toBe(false);

    const pontic = active(
      tooth(25, {
        bridgeRole: "PONTIC",
        anatomy: "MISSING",
        features: [feature({ code: "TOOTH_STATE", state: "MISSING" })],
      }),
    );
    expect(pontic.has("prosthesis")).toBe(true);
    expect(pontic.has("prosthesis-connector")).toBe(true);
    // The gap the pontic fills is no longer drawn as a closed gap.
    expect(pontic.has("missing-closed")).toBe(false);
  });

  it("uses the recorded bridge material rather than the generic prosthesis when one exists", () => {
    const zircon = active(
      tooth(24, {
        bridgeRole: "ABUTMENT",
        features: [
          feature({ code: "RESTORATION", restorationType: "bridge", material: "zircon", marginalLeakage: false }),
        ],
      }),
    );
    expect(zircon.has("zircon-crown")).toBe(true);
    expect(zircon.has("zircon-bridge-connector")).toBe(true);
    expect(zircon.has("prosthesis-connector")).toBe(false);
  });
});

describe("pulp visibility", () => {
  it("draws the healthy pulp chamber by default", () => {
    expect(active(tooth(11)).has("tooth-healthy-pulp")).toBe(true);
    expect(activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY).has("tooth-healthy-pulp")).toBe(true);
  });

  it("hides the healthy pulp chamber when the clinician turns pulp off", () => {
    const result = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false });
    expect(result.has("tooth-healthy-pulp")).toBe(false);
  });

  it("hides the primary healthy pulp chamber too", () => {
    const milk = tooth(51);
    expect(activeWith(milk, DEFAULT_ANATOMY_DISPLAY).has("milktooth-healthy-pulp")).toBe(true);
    expect(
      activeWith(milk, { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false }).has("milktooth-healthy-pulp"),
    ).toBe(false);
  });

  // The load-bearing safety rule. A view preference must never remove a
  // clinical finding from the chart.
  it("still draws endodontic treatment when pulp display is off", () => {
    const off: ChartAnatomyDisplay = { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false };

    for (const state of ["endo-filling", "endo-medical-filling", "endo-metal-pin"] as const) {
      const endo = tooth(11, { features: [feature({ code: "ROOT_CANAL", state })] });
      expect(activeWith(endo, off).has(state), `${state} suppressed by a display preference`).toBe(true);
    }
  });

  // Containment guard. The suppression set must stay exactly the two baseline
  // ids, so a later edit cannot quietly add a pathology layer to it and turn
  // this rule into a comment.
  it("suppresses only the two baseline pulp layers", () => {
    const on = activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY);
    const off = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false });
    const removed = [...on].filter((id) => !off.has(id));
    expect(removed).toEqual(["tooth-healthy-pulp"]);
  });
});

describe("bone and gum visibility", () => {
  it("draws the bone and gum backdrop by default", () => {
    const result = activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY);
    expect(result.has("bone-base")).toBe(true);
    expect(result.has("gum-base")).toBe(true);
  });

  it("hides the backdrop when the clinician turns bone and gum off", () => {
    const result = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showBoneGum: false });
    expect(result.has("bone-base")).toBe(false);
    expect(result.has("gum-base")).toBe(false);
  });

  // The load-bearing safety rule.
  it("still draws periodontal and peri-implant findings when the backdrop is off", () => {
    const off: ChartAnatomyDisplay = { ...DEFAULT_ANATOMY_DISPLAY, showBoneGum: false };

    expect(activeWith(tooth(11, { perioAlert: true }), off).has("parodontal")).toBe(true);

    const subgingival = tooth(11, {
      features: [feature({ code: "TOOTH_STATE", state: "SUBGINGIVAL" })],
    });
    expect(activeWith(subgingival, off).has("tooth-under-gum")).toBe(true);
  });
});
