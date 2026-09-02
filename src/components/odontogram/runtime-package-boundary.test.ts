import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The repository boundary that replaced the fork package tests.
 *
 * Until task 16 the odontogram renderer was a `file:vendor/...` npm dependency:
 * a module-global singleton with its own DOM, its own reset controls, its own
 * localStorage persistence and a transitive `jspdf`. The EMR now owns the
 * anatomy as reviewed, checked-in SVG node trees and prints through the
 * browser, so none of that may come back by accident.
 *
 * The old suites asserted the package RESOLVED. This asserts the opposite
 * property, which is the one that now needs defending: nothing in the shipped
 * source may import the package, its stylesheet, its vendored directory, or a
 * PDF library. The MIT notice and the fork provenance are preserved in
 * THIRD_PARTY_NOTICES.md and docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md, which is
 * where a licence obligation belongs once the code is gone.
 *
 * Tokens are assembled from fragments so this file - the one file allowed to
 * name them - cannot be caught by a grep meant for the rest of the tree, and so
 * a careless "just delete the test" leaves an obvious hole.
 */

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");

const FORBIDDEN: ReadonlyArray<{ token: string; why: string }> = [
  {
    token: ["react", "advanced", "odontogram"].join("-"),
    why: "the retired renderer package is not a runtime dependency any more",
  },
  {
    token: ["js", "pdf"].join(""),
    why: "print is produced by the browser; this repository has no PDF library",
  },
  {
    token: ["emr", "style.css"].join("-"),
    why: "the fork's global stylesheet is gone; the EMR owns its own renderer CSS",
  },
  {
    token: ["vendor/react", "advanced", "odontogram"].join("-"),
    why: "the vendored fork directory was removed",
  },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
// `generated/` is deliberately NOT skipped: the checked-in anatomical node tree
// is shipped source and once carried a path into the vendored directory.
const SKIP_DIRECTORIES = new Set(["node_modules", ".next"]);
const SELF = relative(repositoryRoot, import.meta.filename).replaceAll(sep, "/");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(repositoryRoot, directory), { withFileTypes: true })) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...sourceFiles(relativePath));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (relativePath === SELF) continue;
    found.push(relativePath);
  }
  return found;
}

const scanned = sourceFiles("src").concat(sourceFiles("scripts"));
/** One read pass; the anatomical node tree alone is several megabytes. */
const offendersByToken = new Map(FORBIDDEN.map(({ token }) => [token, [] as string[]]));
for (const file of scanned) {
  const source = readFileSync(join(repositoryRoot, file), "utf8");
  for (const { token } of FORBIDDEN) {
    if (source.includes(token)) offendersByToken.get(token)!.push(file);
  }
}

describe("the odontogram runtime package boundary", () => {
  it("scans a real corpus rather than trivially passing on an empty one", () => {
    expect(scanned.length).toBeGreaterThan(200);
    expect(scanned).toContain("src/components/odontogram/measured-svg-asset.tsx");
    expect(scanned).toContain("src/components/odontogram/generated/measured-svg-nodes.ts");
    expect(scanned).toContain("src/app/layout.tsx");
    expect(scanned).not.toContain(SELF);
  });

  for (const { token, why } of FORBIDDEN) {
    it(`no shipped source mentions ${token} - ${why}`, () => {
      expect(offendersByToken.get(token), `${token}: ${why}`).toEqual([]);
    });
  }

  it("declares no such dependency", () => {
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    for (const { token } of FORBIDDEN) {
      expect(declared.some((name) => name.includes(token))).toBe(false);
      expect(
        Object.values(manifest.scripts ?? {}).some((command) => command.includes(token)),
      ).toBe(false);
    }
    // A `file:` dependency on anything vendored would reintroduce the whole
    // class, whatever it were called.
    expect(
      Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).some((range) =>
        range.startsWith("file:"),
      ),
    ).toBe(false);
  });

  it("leaves nothing of it in the lockfile", () => {
    const lockfile = readFileSync(join(repositoryRoot, "package-lock.json"), "utf8");
    for (const { token, why } of FORBIDDEN) {
      expect(lockfile.includes(token), `${token}: ${why}`).toBe(false);
    }
  });

  it("keeps the MIT notice in a repository-owned location", () => {
    const notices = readFileSync(join(repositoryRoot, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain("MIT License");
    expect(notices).toContain("Copyright (c) 2026 Zoltán Dul");
    expect(notices).toContain(
      "The above copyright notice and this permission notice shall be included in all",
    );
    expect(notices).toContain("5e28d931feefe4c3382513dbb0f5a9db9cf9948c");

    const manifest = readFileSync(
      join(repositoryRoot, "docs", "ODONTOGRAM_FORK_SOURCE_MANIFEST.md"),
      "utf8",
    );
    expect(manifest).toContain("5e28d93");
  });
});
