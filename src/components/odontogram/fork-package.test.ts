import { describe, expect, it } from "vitest";

describe("controlled odontogram fork package", () => {
  it("resolves the pinned package API and stylesheet", async () => {
    const odontogram = await import("react-advanced-odontogram");

    for (const exportName of [
      "OdontogramProvider",
      "OdontogramChartSurface",
      "ToothInfoSurface",
      "ToothControlsSurface",
      "importStatus",
      "setPlanChart",
      "getStatusChart",
      "getPlanChart",
      "onStateChange",
    ]) {
      expect(odontogram, `missing export: ${exportName}`).toHaveProperty(exportName);
    }

    await import("react-advanced-odontogram/style.css");
  });
});
