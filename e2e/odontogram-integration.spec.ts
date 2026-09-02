import { expect, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

const environment = loadE2EEnvironment();

test("@odontogram a dentist records a clinical finding and it survives a reload", async ({
  page,
}, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  const tooth16 = page.locator('.tooth-tile.side-view[data-tooth="16"]');
  await tooth16.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.tooth-tile.side-view[data-tooth="15"]')).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");

  const inspectorDialog = page
    .getByRole("dialog")
    .filter({ has: page.getByTestId("tooth-inspector") });
  const inspector = inspectorDialog.getByTestId("tooth-inspector");
  await expect(inspectorDialog).toBeVisible();
  await inspector.getByRole("button", { name: "Record finding" }).click();
  const dialog = page.getByRole("dialog", { name: /Record finding/ });
  await dialog.getByLabel("Clinical code").selectOption("CARIES");
  await dialog.getByLabel("Status").selectOption("ACTIVE");
  await dialog.getByLabel("Surfaces (comma)").fill("O,M");
  await dialog.getByLabel("Notes").fill("Synthetic E2E odontogram finding");
  await dialog.getByRole("button", { name: "Save entry" }).click();

  await expect(inspector).toContainText("CARIES · ACTIVE");
  await page.reload();
  await expect(page.getByTestId("clinical-chart-anatomy")).toBeVisible();
  await expect(page.locator('.tooth-tile.side-view[data-tooth="16"] svg [id="caries-occlusal"]')).toHaveAttribute("data-active", "1");
});

test("@odontogram a receptionist cannot open the clinical odontogram route", async ({
  page,
}, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `denied${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await page.goto("/login");
  await page.getByLabel("Email address").fill(environment.branchUser.email);
  await page.getByLabel("Password").fill(environment.branchUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/patients/${patientId}?section=clinical&branch=${environment.branchA1Id}`);

  await expect(
    page.getByText("Your current access does not include the clinical record."),
  ).toBeVisible();
  await expect(page.getByTestId("clinical-chart-anatomy")).toHaveCount(0);
});

/**
 * Task 12 — the periodontal work surface is a primary chart mode.
 *
 * PENDING: written, never executed. Hosted E2E is a release gate and was not
 * authorized for this task, so this test has not been run against the shared
 * synthetic TEST environment and must not be reported as passing.
 */
test("@odontogram a dentist charts a periodontal examination from the Periodontal chart mode", async ({
  page,
}, testInfo) => {
  const patientId = await createSyntheticOdontogramPatient(
    page,
    environment,
    `periomode${environment.runId}${testInfo.retry}${Date.now()}`,
  );

  await signInDentistWithTotp(page, environment);
  await openOdontogram(page, patientId, environment);

  // The detached top-right action is gone; periodontal is a chart mode.
  await expect(page.getByRole("button", { name: "Open periodontal entry" })).toHaveCount(0);

  await page
    .getByRole("group", { name: "Chart mode" })
    .getByRole("button", { name: "Periodontal" })
    .click();

  const workspace = page.getByTestId("perio-exam-workspace");
  await expect(workspace).toBeVisible();

  // A patient with no examination is told exactly that, and is never shown a
  // healthy mouth by default.
  await expect(page.getByTestId("perio-exam-empty")).toContainText("No periodontal examination");

  await page.getByLabel("Examination type").selectOption("INITIAL");
  await page.getByRole("button", { name: "Start new examination" }).click();
  await expect(page.getByTestId("perio-autosave-status")).toBeVisible();

  // The unmeasured site says so, in words, before anything is typed.
  const probingDepth = page.getByRole("spinbutton", {
    name: /Tooth 16 mesio-buccal probing depth in millimetres, not recorded/,
  });
  await expect(probingDepth).toHaveValue("");
  await expect(page.getByTestId("perio-grid-cal-16-MB")).toContainText("Not recorded");

  await probingDepth.fill("5");
  await expect(page.getByTestId("perio-autosave-status")).toHaveText(/Saved/);

  // A probing depth with no gingival margin leaves the attachment level
  // unknown; it is never reported as the depth.
  await expect(page.getByTestId("perio-grid-cal-16-MB")).toContainText("Not recorded");

  await page.reload();
  await page
    .getByRole("group", { name: "Chart mode" })
    .getByRole("button", { name: "Periodontal" })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: /Tooth 16 mesio-buccal probing depth in millimetres/ }),
  ).toHaveValue("5");

  // The confirmation form is seeded by the server derivation, not the browser.
  await expect(page.getByTestId("perio-derived-source")).toContainText("Derived by the server");
});
