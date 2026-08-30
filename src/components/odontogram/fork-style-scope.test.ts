import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);
const emrStyleSource = readFileSync(
  resolve(
    process.cwd(),
    "vendor/react-advanced-odontogram/dist/emr-style.css",
  ),
  "utf8",
);

describe("controlled odontogram stylesheet integration", () => {
  it("loads the fork stylesheet through the EMR-scoped entrypoint", () => {
    expect(layoutSource).toContain(
      'import "react-advanced-odontogram/emr-style.css";',
    );
  });

  it("keeps the fork's generic rules inside its host", () => {
    expect(emrStyleSource).toContain(".dental-emr-fork .hidden");
    expect(emrStyleSource).not.toMatch(/(?:^|})\s*\.hidden\{/);
    expect(emrStyleSource).not.toMatch(/(?:^|})\s*\*\{/);
    expect(emrStyleSource).not.toMatch(/(?:^|})\s*html,body\{/);
  });
});
