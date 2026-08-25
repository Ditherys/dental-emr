import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eslintConfig = readFileSync(resolve(repositoryRoot, "eslint.config.mjs"), "utf8");

describe("ESLint generated-runtime ignores", () => {
  it("ignores only Supabase's generated local runtime directory", () => {
    expect(eslintConfig).toContain('"supabase/.temp/**"');
    expect(eslintConfig).not.toContain('"supabase/**"');
  });

  it("ignores git-ignored local worktrees", () => {
    expect(eslintConfig).toContain('".worktrees/**"');
  });
});
