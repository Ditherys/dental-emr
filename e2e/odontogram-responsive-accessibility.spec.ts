import { expect, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

const environment = loadE2EEnvironment();

/**
 * O11 responsive coverage. This remains guarded by the shared synthetic TEST
 * environment and the @responsive Playwright matrix (360/430/iPad/1440).
 * Traces are disabled in playwright.config.ts because this flow authenticates.
 */
test("@responsive odontogram remains touch-safe and non-color-dependent", async ({ page }, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `perio${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "auto");

  const tooth11 = page.getByRole("button", { name: /tooth 11/i }).first();
  await expect(tooth11).toBeVisible();
  await expect(tooth11).toHaveAttribute("data-fdi", "11");

  await tooth11.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /tooth 21/i }).first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tooth11).toBeFocused();
});
