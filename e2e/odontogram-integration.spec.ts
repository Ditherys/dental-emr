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

  const tooth16 = page.locator('button[data-fdi="16"]');
  await tooth16.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('button[data-fdi="15"]')).toBeFocused();
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
  await page.getByRole("button", { name: "Odontogram", exact: true }).click();
  await expect(page.getByTestId("measured-chart")).toBeVisible();
  await expect(tooth16).toHaveAttribute("aria-label", /CARIES ACTIVE FINDING surfaces O,M/);
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
  await expect(page.getByTestId("measured-chart")).toHaveCount(0);
});
