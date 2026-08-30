/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OdontogramSettings, type OdontogramSettingsValue } from "./odontogram-settings";

const value: OdontogramSettingsValue = {
  notation: "FDI",
  dentition: "permanent",
  labelDensity: "comfortable",
  language: "en",
  visibleLayers: { CARIES: true, RESTORATION: true },
  exportPreference: "screen",
};

describe("odontogram display settings", () => {
  afterEach(() => cleanup());
  it("changes notation, density, language and export display preferences", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OdontogramSettings value={value} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Notation"), "PALMER");
    await user.selectOptions(screen.getByLabelText("Label density"), "compact");
    await user.selectOptions(screen.getByLabelText("Language"), "fil");
    await user.selectOptions(screen.getByLabelText("Export display"), "print");
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ exportPreference: "print" });
    expect(window.localStorage.length).toBe(0);
  });

  it("toggles a layer through an allowlisted display preference", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OdontogramSettings value={value} onChange={onChange} />);
    await user.click(screen.getAllByRole("checkbox", { name: "Caries" })[0]!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visibleLayers: expect.objectContaining({ CARIES: false }) }));
  });
});
