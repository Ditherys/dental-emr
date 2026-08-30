// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

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

  it("omits destructive reset controls from the patient composition", async () => {
    const {
      OdontogramProvider,
      OdontogramChartSurface,
      ToothControlsSurface,
    } = await import("react-advanced-odontogram");

    const { container } = render(
      createElement(
        OdontogramProvider,
        null,
        createElement(OdontogramChartSurface),
        createElement(ToothControlsSurface),
      ),
    );

    await waitFor(() => {
      expect(container.querySelector("#btnResetAll")).toBeNull();
      expect(container.querySelector("#btnResetTooth")).toBeNull();
    });
  }, 15000);
});
