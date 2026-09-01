import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_FDI_TEETH, isPermanentFdi, isPrimaryFdi } from "@/lib/odontogram/dentition";

import {
  MEASURED_ASSET_KEYS,
  MEASURED_ASSET_SHA256,
  MEASURED_FRONT_TEMPLATES,
  MEASURED_OCCLUSAL_TEMPLATES,
  measuredAssetKey,
  measuredAssetKeyForFdi,
  measuredOrientation,
  measuredSvgTree,
  measuredTemplateLayerIds,
  templateForFdi,
} from "./measured-assets";
import { MEASURED_FORK_LAYER_IDS } from "./measured-fork-layers";

const ASSET_DIRECTORY = resolve(process.cwd(), "src/components/odontogram/assets/measured");

/** Hash over LF-normalised bytes so a CRLF checkout cannot break the guard. */
function assetSha256(fileName: string): string {
  const raw = readFileSync(resolve(ASSET_DIRECTORY, fileName), "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

describe("measured asset provenance", () => {
  it("records a hash for exactly the installed asset files", () => {
    const files = readdirSync(ASSET_DIRECTORY)
      .filter((name) => name.endsWith(".svg"))
      .map((name) => name.slice(0, -4))
      .sort();

    expect(files).toEqual([...MEASURED_ASSET_KEYS]);
    expect(Object.keys(MEASURED_ASSET_SHA256).sort()).toEqual(files);
  });

  it("fails when a reviewed asset changes without a reviewed regeneration", () => {
    for (const key of MEASURED_ASSET_KEYS) {
      expect(assetSha256(`${key}.svg`), `asset ${key}.svg changed`).toBe(MEASURED_ASSET_SHA256[key]);
    }
  });

  it("carries a generated node tree and a layer index for every asset", () => {
    for (const key of MEASURED_ASSET_KEYS) {
      expect(measuredSvgTree(key), `missing tree for ${key}`).not.toBeNull();
      expect(measuredTemplateLayerIds(key).size).toBeGreaterThan(20);
    }
  });

  it("keeps a template's layer index immutable", () => {
    const ids = measuredTemplateLayerIds("11");
    expect(() => (ids as Set<string>).add("injected")).toThrow();
  });

  it("only ever exposes registry layers, and every registry layer exists in some template", () => {
    const installed = new Set<string>();
    for (const key of MEASURED_ASSET_KEYS) {
      for (const id of measuredTemplateLayerIds(key)) installed.add(id);
    }
    for (const id of MEASURED_FORK_LAYER_IDS) {
      expect(installed.has(id), `registry layer ${id} exists in no installed template`).toBe(true);
    }
  });
});

describe("measured asset selection", () => {
  it("maps every canonical FDI to an installed lateral template", () => {
    for (const fdi of ALL_FDI_TEETH) {
      const key = measuredAssetKeyForFdi(fdi, "front");
      expect(key, `no lateral template for FDI ${fdi}`).not.toBeNull();
      expect(MEASURED_ASSET_KEYS).toContain(key);
    }
  });

  it("installs occlusal templates for posterior teeth only", () => {
    expect(measuredAssetKeyForFdi(11, "occlusal")).toBeNull();
    expect(measuredAssetKeyForFdi(13, "occlusal")).toBeNull();
    expect(measuredAssetKeyForFdi(16, "occlusal")).toBe("16_occl");
    expect(measuredAssetKeyForFdi(46, "occlusal")).toBe("36_occl");
    expect(measuredAssetKeyForFdi(85, "occlusal")).toBe("75_occl");
    expect(measuredAssetKeyForFdi(51, "occlusal")).toBeNull();
  });

  it("shares one authored template across the mirrored and rotated quadrants", () => {
    expect(templateForFdi(11, "front")).toBe(11);
    expect(templateForFdi(21, "front")).toBe(11);
    expect(templateForFdi(31, "front")).toBe(31);
    expect(templateForFdi(41, "front")).toBe(31);
    expect(templateForFdi(61, "front")).toBe(51);
    expect(templateForFdi(81, "front")).toBe(71);

    expect(measuredOrientation(11)).toBe("normal");
    expect(measuredOrientation(21)).toBe("mirror");
    expect(measuredOrientation(31)).toBe("rotate");
    expect(measuredOrientation(41)).toBe("rotate-mirror");
    expect(measuredOrientation(65)).toBe("mirror");
    expect(measuredOrientation(85)).toBe("rotate-mirror");
  });

  it("rejects an identifier that is not a canonical FDI tooth", () => {
    expect(templateForFdi(19, "front")).toBeNull();
    expect(templateForFdi(56, "front")).toBeNull();
    expect(templateForFdi(0, "front")).toBeNull();
  });

  it("resolves nothing for an inherited Object.prototype key", () => {
    // The generated records are plain object literals. A key such as
    // `constructor` must not resolve to an inherited function and reach React.
    for (const hostile of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(measuredSvgTree(hostile), `tree for ${hostile}`).toBeNull();
      expect(measuredTemplateLayerIds(hostile).size, `layers for ${hostile}`).toBe(0);
    }
  });

  it("names assets deterministically", () => {
    expect(measuredAssetKey(16, "front")).toBe("16");
    expect(measuredAssetKey(16, "occlusal")).toBe("16_occl");
  });

  it("installs a template for both dentitions", () => {
    expect(MEASURED_FRONT_TEMPLATES.filter((template) => isPermanentFdi(template)).length).toBe(16);
    expect(MEASURED_FRONT_TEMPLATES.filter((template) => isPrimaryFdi(template)).length).toBe(10);
    expect(MEASURED_OCCLUSAL_TEMPLATES.length).toBe(14);
  });
});
