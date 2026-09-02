import { expect, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

const environment = loadE2EEnvironment();

/**
 * The print sheet, under real print CSS.
 *
 * WHY THIS EXISTS. Four separate defects have now come from the measured asset
 * tree losing a stylesheet rule it depends on: the component not importing the
 * stylesheet (task 3), a surface inheriting the constraint without it (task
 * 12), an export that could not carry it (task 15), and - the reason this file
 * exists - a print rule that hid every tooth because `MeasuredTooth` renders
 * each tile as a `<button>` (task 16, review C1).
 *
 * Every one of those slipped through a green unit suite for the same reason:
 * **jsdom applies no CSS**. A unit test can assert that a rule is present in
 * `styles.css`; it cannot assert that nothing else in the cascade cancels it.
 * Only a real browser under `emulateMedia({ media: 'print' })` can, and only
 * that closes the class rather than the instance.
 *
 * STATUS: PENDING. Written and committed deliberately, but NOT run - hosted
 * E2E is a release gate and was not authorized for task 16. It should be run at
 * the first authorized hosted E2E pass; until then the scoping is defended by
 * the positive/negative stylesheet assertions in
 * `src/components/odontogram/clinical-chart-print.test.tsx`.
 */
test("@odontogram @print the printed clinical chart shows the anatomy, not an empty box", async ({
  page,
}, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  const sheet = page.getByTestId("clinical-chart-print");

  // On screen the sheet is `hidden print:block`: the workspace already shows
  // this chart interactively and must not show a second static copy.
  await expect(sheet).toBeHidden();

  await page.emulateMedia({ media: "print" });

  // The sheet itself, its header and its chronology.
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("clinical-chart-print-header")).toBeVisible();
  await expect(page.getByTestId("clinical-chart-print-record")).toBeVisible();

  // THE ASSERTION THIS FILE EXISTS FOR. Anatomy, actually painted.
  const anatomy = page.locator(
    ".clinical-chart-print .odontogram-measured-asset",
  );
  await expect(anatomy.first()).toBeVisible();
  expect(await anatomy.count()).toBeGreaterThan(16);

  // The tooth tiles themselves are not display:none. `toBeVisible` on the
  // asset already implies this, but assert the tile directly so a regression
  // in the `:not(.odontogram-tooth)` exception names itself.
  const tiles = page.locator(".clinical-chart-print button.odontogram-tooth");
  await expect(tiles.first()).toBeVisible();

  // The two genuine screen affordances ARE hidden on paper.
  await expect(
    page.locator(".clinical-chart-print").getByRole("button", { name: "Select multiple" }),
  ).toBeHidden();
  await expect(
    page.locator(".clinical-chart-print").getByRole("button", { name: "Clear selection" }),
  ).toBeHidden();

  // The interactive chart must not print a second time underneath the sheet.
  await expect(page.locator(".dental-emr-fork")).toBeHidden();

  await page.emulateMedia({ media: "screen" });
});
