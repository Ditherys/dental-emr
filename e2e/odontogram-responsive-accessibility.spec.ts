import { expect, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

const environment = loadE2EEnvironment();

/**
 * O11 responsive coverage, retargeted at the EMR-owned chart.
 *
 * This remains guarded by the shared synthetic TEST environment and the
 * @responsive Playwright matrix (360/430/iPad portrait/iPad landscape/1440/1920).
 * Traces are disabled in playwright.config.ts because this flow authenticates.
 *
 * This spec is the **only** place the geometry claims are actually verified.
 * The unit suite can assert rendered structure — which teeth exist, in which
 * order, how many a region renders — but jsdom applies no Tailwind and resolves
 * no container query, so 44px touch targets, the AUTO region bands, and
 * page-level overflow are unproven until this runs against the hosted gate.
 */
test("@responsive dental chart stays complete, touch-safe and free of page overflow", async ({ page }, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `perio${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  const chart = page.locator('[data-testid="measured-chart"]');
  await expect(chart).toBeVisible();

  // ---------------------------------------------------------------------
  // The AUTO default. Every permanent tooth stays mounted at every width;
  // container queries decide which region is displayed, and an explicit region
  // choice brings the rest back. Nothing is dropped from the canonical record.
  // ---------------------------------------------------------------------
  await expect(chart).toHaveAttribute("data-viewport", "AUTO");
  await expect(chart.locator("[data-fdi]")).toHaveCount(32);

  // The upper-right quadrant is the one region AUTO paints in every band, so it
  // is the only visibility assertion that holds across the whole matrix.
  await expect(chart.locator('[data-fdi="18"]')).toBeVisible();
  await expect(chart.locator('[data-fdi="11"]')).toBeVisible();

  await expectNoPageOverflow(page);

  // ---------------------------------------------------------------------
  // One toolbar carries mode, region, notation, dentition and the selection.
  // ---------------------------------------------------------------------
  const toolbar = page.getByTestId("clinical-chart-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByLabel("Tooth notation")).toBeVisible();
  await expect(toolbar.getByLabel("Dentition")).toBeVisible();

  const regions = toolbar.getByRole("group", { name: "Chart region" }).getByRole("button");
  await expect(regions).toHaveCount(8);
  await expect(toolbar.getByRole("button", { name: "Fit to screen" })).toHaveAttribute("aria-pressed", "true");

  for (const name of ["Fit to screen", "Both arches", "Upper arch", "Lower arch", "Upper right quadrant"]) {
    const box = await toolbar.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
  }

  // ---------------------------------------------------------------------
  // Narrowing the region is an explicit click, never a hover or a drag, and it
  // changes what is rendered rather than what is scrolled.
  // ---------------------------------------------------------------------
  await page.getByRole("button", { name: "Upper arch" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(16);
  await expect(chart.locator('[data-fdi="48"]')).toHaveCount(0);
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Upper right quadrant" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(8);
  await expect(chart.locator('[data-fdi="21"]')).toHaveCount(0);
  await expectNoPageOverflow(page);

  // The hardest case in the matrix: all 32 permanent teeth forced on at 360px.
  // They must reflow into quadrant blocks, not squeeze and not overflow.
  await page.getByRole("button", { name: "Both arches" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(32);
  await expect(chart.locator('[data-fdi="18"]')).toBeVisible();
  await expect(chart.locator('[data-fdi="48"]')).toBeVisible();
  await expectNoPageOverflow(page);
  await expect(chart.locator(".overflow-x-auto, .overflow-x-scroll")).toHaveCount(0);

  for (const fdi of ["18", "11", "48", "31"]) {
    const box = await chart.locator(`[data-fdi="${fdi}"]`).boundingBox();
    expect(box?.height ?? 0, `tooth ${fdi} height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `tooth ${fdi} width`).toBeGreaterThanOrEqual(44);
  }

  // ---------------------------------------------------------------------
  // Touch multi-select needs no desktop modifier key.
  // ---------------------------------------------------------------------
  const multiSelect = page.getByRole("button", { name: "Select multiple" });
  expect((await multiSelect.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await multiSelect.click();
  await expect(multiSelect).toHaveAttribute("aria-pressed", "true");

  const tooth11 = chart.locator('[data-fdi="11"]');
  await tooth11.click();
  await chart.locator('[data-fdi="12"]').click();
  await expect(page.getByTestId("chart-selection-summary")).toHaveText(/Teeth 11, 12 selected/);

  // ---------------------------------------------------------------------
  // Nothing clinical is conveyed by colour alone. Selection and clinical state
  // are both exposed as attributes and as text in the accessible name, so a
  // colour-blind or high-contrast user reads the same chart.
  // ---------------------------------------------------------------------
  await expect(tooth11).toHaveAttribute("data-selected", "1");
  await expect(tooth11).toHaveAttribute("aria-pressed", "true");
  await expect(tooth11).toHaveAttribute("data-current", /^[01]$/);
  await expect(tooth11).toHaveAttribute("data-planned", /^[01]$/);

  const accessibleName = await tooth11.getAttribute("aria-label");
  expect(accessibleName).toContain("FDI 11");
  // The clinical summary — a finding, a treatment, or an explicit "no active
  // clinical record" — must be in the name, not only in the artwork's colour.
  expect(accessibleName).toMatch(/no active clinical record|current |planned /);

  const unselected = chart.locator('[data-fdi="18"]');
  await expect(unselected).toHaveAttribute("data-selected", "0");
  await expect(unselected).toHaveAttribute("aria-pressed", "false");

  // Keyboard reaches the same target the pointer does.
  await tooth11.focus();
  await expect(tooth11).toBeFocused();
});

/**
 * Task 12 — the periodontal work surface under the responsive matrix.
 *
 * PENDING: written, never executed. Hosted E2E is a release gate and was not
 * authorized for this task. The 44px and overflow claims below are unproven
 * until this runs on the shared synthetic TEST environment; jsdom applies no
 * Tailwind and resolves no container query, so the unit suite cannot stand in.
 */
test("@responsive the periodontal chart mode stays touch-safe and free of page overflow", async ({ page }, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `periogrid${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  await page
    .getByRole("group", { name: "Chart mode" })
    .getByRole("button", { name: "Periodontal" })
    .click();

  await expect(page.getByTestId("perio-exam-workspace")).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByLabel("Examination type").selectOption("INITIAL");
  await page.getByRole("button", { name: "Start new examination" }).click();

  // The dense grid is wide by nature. It must scroll inside its own container
  // and never push the page sideways, at every width in the matrix.
  const gridScroll = page.getByTestId("perio-grid-scroll");
  await expect(gridScroll).toBeVisible();
  await expectNoPageOverflow(page);

  const archScroll = page.getByTestId("perio-arch-scroll");
  await expect(archScroll).toBeVisible();
  await expectNoPageOverflow(page);

  // Every three-state toggle is a 44px touch target, and it reads its state in
  // words rather than only by colour.
  const bleeding = page.getByRole("button", {
    name: /Tooth 16 mesio-buccal bleeding on probing, not recorded/,
  });
  const box = await bleeding.boundingBox();
  expect(box?.height ?? 0, "bleeding toggle height").toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0, "bleeding toggle width").toBeGreaterThanOrEqual(44);

  await bleeding.click();
  await expect(
    page.getByRole("button", { name: /Tooth 16 mesio-buccal bleeding on probing, present/ }),
  ).toHaveAttribute("data-state", "PRESENT");

  // Switching the charting arch changes what is rendered, not what is scrolled.
  await page.getByLabel("Charting arch").selectOption("LOWER");
  await expect(page.getByRole("rowheader", { name: /Tooth 46/ })).toBeVisible();
  await expectNoPageOverflow(page);

  // The arch focus control keeps both arches reachable.
  await page.getByLabel("Arch focus").selectOption("LOWER");
  await expect(page.getByTestId("perio-arch-LOWER")).toBeVisible();
  await expect(page.getByTestId("perio-arch-UPPER")).toHaveCount(0);
  await expectNoPageOverflow(page);
});

async function expectNoPageOverflow(page: import("@playwright/test").Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.page, "document horizontal overflow").toBeLessThanOrEqual(1);
  expect(overflow.body, "body horizontal overflow").toBeLessThanOrEqual(1);
}
