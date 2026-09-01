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
 * @responsive Playwright matrix (360/430/iPad/1440). Traces are disabled in
 * playwright.config.ts because this flow authenticates.
 *
 * The chart reflows the arch into quadrant blocks rather than hiding teeth or
 * scrolling, so every assertion below must hold at every width in the matrix.
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

  // Every permanent tooth is present and in clinical chart order at every width.
  await expect(chart.locator("[data-fdi]")).toHaveCount(32);
  await expect(chart.locator('[data-fdi="18"]')).toBeVisible();
  await expect(chart.locator('[data-fdi="48"]')).toBeVisible();

  // No page-level horizontal overflow, and no scroll container hiding a
  // squeezed composition inside the chart.
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.page).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  await expect(chart.locator(".overflow-x-auto, .overflow-x-scroll")).toHaveCount(0);

  // One toolbar carries mode, region, notation, dentition and the selection.
  const toolbar = page.getByTestId("clinical-chart-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByLabel("Tooth notation")).toBeVisible();
  await expect(toolbar.getByLabel("Dentition")).toBeVisible();

  // Explicit arch and quadrant controls, all touch-safe.
  const regions = toolbar.getByRole("group", { name: "Chart region" }).getByRole("button");
  await expect(regions).toHaveCount(7);
  for (const name of ["Both arches", "Upper arch", "Lower arch", "Upper right quadrant"]) {
    const control = toolbar.getByRole("button", { name });
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  // Narrowing to one arch is an explicit choice, never a hover or a drag.
  await page.getByRole("button", { name: "Upper arch" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(16);
  await page.getByRole("button", { name: "Upper right quadrant" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(8);
  await page.getByRole("button", { name: "Both arches" }).click();
  await expect(chart.locator("[data-fdi]")).toHaveCount(32);

  // Touch multi-select needs no desktop modifier key.
  const multiSelect = page.getByRole("button", { name: "Select multiple" });
  const multiSelectBox = await multiSelect.boundingBox();
  expect(multiSelectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await multiSelect.click();
  await expect(multiSelect).toHaveAttribute("aria-pressed", "true");

  const tooth11 = chart.locator('[data-fdi="11"]');
  const toothBox = await tooth11.boundingBox();
  expect(toothBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(toothBox?.width ?? 0).toBeGreaterThanOrEqual(44);

  await tooth11.click();
  await chart.locator('[data-fdi="12"]').click();
  await expect(tooth11).toHaveAttribute("data-selected", "1");
  await expect(chart.locator('[data-fdi="12"]')).toHaveAttribute("data-selected", "1");
  await expect(page.getByTestId("chart-selection-summary")).toHaveText(/Teeth 11, 12 selected/);

  // Selection is keyboard reachable and never colour-only.
  await tooth11.focus();
  await expect(tooth11).toBeFocused();
});
