/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodontalRiskClassification } from "./periodontal-risk-classification";
import type { PerioDerivedPayload, PerioRiskPayload } from "./periodontal-summary";

afterEach(() => cleanup());

const emptyRisk: PerioRiskPayload = {
  age_years_snapshot: null,
  smoking_status: null,
  cigarettes_per_day: null,
  diabetes_status: null,
  hba1c_percent: null,
  teeth_lost_to_periodontitis: null,
  radiographic_bone_loss_percent: null,
};

const serverDerived: PerioDerivedPayload = {
  diagnosis: "PERIODONTITIS",
  stage: "III",
  grade: "B",
  extent: "GENERALIZED",
  present_tooth_count: 28,
  teeth_with_known_interdental_cal: 28,
  assessed_bop_site_count: 168,
  bleeding_site_count: 42,
  bop_percent: 25,
  complete: true,
};

function renderPanel(overrides: Record<string, unknown> = {}) {
  return render(
    <PeriodontalRiskClassification
      derived={serverDerived}
      preview={null}
      hasUnsavedEdits={false}
      confirmed={null}
      risk={emptyRisk}
      onRiskChange={() => {}}
      onConfirm={async () => {}}
      {...overrides}
    />,
  );
}

describe("PeriodontalRiskClassification", () => {
  it("seeds the confirmation form from the server derivation, not from the local preview", async () => {
    // The local preview deliberately disagrees with the server. The clinician
    // must be asked to confirm the SERVER value; confirming a browser value the
    // server disagrees with would force an override reason for a bug.
    renderPanel({
      hasUnsavedEdits: true,
      preview: { diagnosis: "GINGIVITIS", stage: null, grade: null, extent: null },
    });

    expect((screen.getByRole("combobox", { name: /confirmed diagnosis/i }) as HTMLSelectElement).value).toBe(
      "PERIODONTITIS",
    );
    expect((screen.getByRole("combobox", { name: /confirmed stage/i }) as HTMLSelectElement).value).toBe("III");
    expect(screen.getByTestId("perio-derived-source")).toHaveTextContent(/server/i);
    expect(screen.getByTestId("perio-derived-source")).toHaveTextContent(/saved measurements/i);
  });

  it("labels the local preview as a preview of unsaved edits and never as the record", () => {
    renderPanel({
      hasUnsavedEdits: true,
      preview: { diagnosis: "GINGIVITIS", stage: null, grade: null, extent: null },
    });

    const preview = screen.getByTestId("perio-classification-preview");
    expect(preview).toHaveTextContent(/unsaved/i);
    expect(preview).toHaveTextContent(/not the record/i);
  });

  it("hides the preview entirely once there is nothing unsaved", () => {
    renderPanel({ hasUnsavedEdits: false, preview: { diagnosis: "GINGIVITIS", stage: null, grade: null, extent: null } });
    expect(screen.queryByTestId("perio-classification-preview")).toBeNull();
  });

  it("requires a reasoned override before a clinician may confirm a different classification", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    renderPanel({ onConfirm });

    await user.click(screen.getByRole("checkbox", { name: /i confirm this classification/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /confirmed diagnosis/i }), "GINGIVITIS");

    const confirm = screen.getByRole("button", { name: /confirm and finalize/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("perio-override-required")).toHaveTextContent(/differs/i);

    await user.type(screen.getByRole("textbox", { name: /override reason/i }), "Radiographs contradict.");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      diagnosis: "GINGIVITIS",
      override_reason: "Radiographs contradict.",
    });
  }, 20000);

  it("confirms the server value with no override reason at all", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    renderPanel({ onConfirm });

    await user.click(screen.getByRole("checkbox", { name: /i confirm this classification/i }));
    await user.click(screen.getByRole("button", { name: /confirm and finalize/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      diagnosis: "PERIODONTITIS",
      stage: "III",
      grade: "B",
      extent: "GENERALIZED",
    });
  });

  it("reports an unknown derived field and an unassessed bleeding share as unrecorded", () => {
    renderPanel({
      derived: { ...serverDerived, diagnosis: null, stage: null, grade: null, extent: null, bop_percent: null, assessed_bop_site_count: 0, bleeding_site_count: 0, complete: false },
    });

    expect(screen.getByTestId("perio-derived-diagnosis")).toHaveTextContent(/not recorded/i);
    expect(screen.getByTestId("perio-derived-bop")).toHaveTextContent(/not assessed/i);
    expect(screen.getByTestId("perio-derived-bop")).not.toHaveTextContent("0%");
  });

  it("lists the data limitations of an incomplete examination", () => {
    renderPanel({
      derived: { ...serverDerived, complete: false, teeth_with_known_interdental_cal: 12, present_tooth_count: 28 },
    });
    const limitations = screen.getByTestId("perio-data-limitations");
    expect(limitations).toHaveTextContent(/12 of 28/i);
    expect(limitations).toHaveTextContent(/incomplete/i);
  });

  it("explains that no examination has been derived yet rather than showing a healthy mouth", () => {
    renderPanel({ derived: null });
    expect(screen.getByTestId("perio-derived-empty")).toHaveTextContent(/no periodontal examination/i);
    expect(screen.queryByRole("combobox", { name: /confirmed diagnosis/i })).toBeNull();
  });

  it("clears a risk input back to unknown instead of to zero", async () => {
    const user = userEvent.setup();
    const onRiskChange = vi.fn();
    renderPanel({ risk: { ...emptyRisk, age_years_snapshot: 44 }, onRiskChange });

    await user.clear(screen.getByRole("spinbutton", { name: /age in years/i }));
    expect(onRiskChange).toHaveBeenLastCalledWith("age_years_snapshot", null);
  });

  it("keeps the visible units on every risk input", () => {
    renderPanel();
    expect(screen.getByRole("spinbutton", { name: /cigarettes per day/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /hba1c.*percent/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /radiographic bone loss.*percent/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /teeth lost to periodontitis/i })).toBeInTheDocument();
  });

  it("says a signed classification differs from today's derivation without calling it an override", () => {
    renderPanel({
      readOnly: true,
      confirmed: { diagnosis: "GINGIVITIS", stage: null, grade: null, extent: null, override_reason: null, confirmed_at: "2026-01-02T03:04:05Z" },
    });

    const drift = screen.getByTestId("perio-signed-vs-derived");
    expect(drift).toHaveTextContent(/differs/i);
    expect(drift).toHaveTextContent(/no override reason was recorded/i);
    expect(drift.textContent ?? "").not.toMatch(/clinician overrode/i);
  });

  it("refuses to finalize while the draft holds an edit the record does not", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    renderPanel({ hasUnsavedEdits: true, preview: null, onConfirm });

    await user.click(screen.getByRole("checkbox", { name: /i confirm this classification/i }));

    const confirm = screen.getByRole("button", { name: /confirm and finalize/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("perio-finalize-blocked")).toHaveTextContent(/not on the record yet/i);
    expect(screen.getByTestId("perio-finalize-blocked")).toHaveTextContent(/amendment/i);

    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  }, 20000);

  it("names charting the probing depth, not saving the draft, when a reading cannot be written yet", async () => {
    const user = userEvent.setup();
    renderPanel({ hasUnsavedEdits: true, hasDeferredReadings: true, preview: null });

    await user.click(screen.getByRole("checkbox", { name: /i confirm this classification/i }));

    const blocked = screen.getByTestId("perio-finalize-blocked");
    expect(blocked).toHaveTextContent(/chart the missing probing depth/i);
    // "Save draft" is a no-op for this cause; sending the clinician there is a loop.
    expect(blocked).toHaveTextContent(/saving the draft will not help/i);
    expect(blocked.textContent ?? "").not.toMatch(/Save the draft first/);
    expect(screen.getByRole("button", { name: /confirm and finalize/i })).toBeDisabled();
  }, 20000);

  it("tells an ordinary unsaved diff to save the draft", () => {
    renderPanel({ hasUnsavedEdits: true, hasDeferredReadings: false, preview: null });
    const blocked = screen.getByTestId("perio-finalize-blocked");
    expect(blocked).toHaveTextContent(/save the draft first/i);
    expect(blocked.textContent ?? "").not.toMatch(/probing depth/i);
  });

  it("emphasises the finalize block with a token this design system actually defines", () => {
    renderPanel({ hasUnsavedEdits: true, preview: null });
    // --color-warning exists in globals.css; --color-warning-foreground does not,
    // so text-warning-foreground would resolve to nothing at all.
    expect(screen.getByTestId("perio-finalize-blocked").className).toMatch(/(^|\s)text-warning(\s|$)/);
    expect(screen.getByTestId("perio-finalize-blocked").className).not.toMatch(/text-warning-foreground/);
  });

  it("is read-only for a finalized examination", () => {
    renderPanel({ readOnly: true });
    expect(screen.queryByRole("button", { name: /confirm and finalize/i })).toBeNull();
    expect(screen.getByRole("spinbutton", { name: /age in years/i })).toBeDisabled();
  });
});
