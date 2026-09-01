import { expect, type Page } from "@playwright/test";

import { signInOwnerWithTotp } from "./login";

type OdontogramE2EEnvironment = {
  branchA1Id: string;
  branchUser: { email: string; password: string };
  dentist: { email: string; password: string; totpSecret: string };
};

export async function signInDentistWithTotp(
  page: Page,
  environment: OdontogramE2EEnvironment,
) {
  await signInOwnerWithTotp(page, environment.dentist);
}

async function signInBranchUser(
  page: Page,
  environment: OdontogramE2EEnvironment,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(environment.branchUser.email);
  await page.getByLabel("Password").fill(environment.branchUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Creates a short-lived synthetic patient through the receptionist UI, then
 * signs out. Clinical scenarios must subsequently authenticate independently
 * as the dentist; no service-role or direct-table setup is used.
 */
export async function createSyntheticOdontogramPatient(
  page: Page,
  environment: OdontogramE2EEnvironment,
  suffix: string,
) {
  await signInBranchUser(page, environment);
  await page.goto("/patients/new");

  const firstName = "Synthetic";
  const lastName = `Odontogram${suffix}`;
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Birth date").fill("1990-01-01");
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page).toHaveURL(/\/patients$/);

  const patientLink = page.getByRole("link", { name: `${firstName} ${lastName}` });
  await expect(patientLink).toBeVisible();
  await patientLink.click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+/);

  const patientId = new URL(page.url()).pathname.split("/").at(-1);
  if (!patientId) throw new Error("Synthetic odontogram patient route did not contain an id.");

  await signOut(page);
  return patientId;
}

export function odontogramClinicalHref(
  patientId: string,
  environment: OdontogramE2EEnvironment,
) {
  return `/patients/${patientId}?section=clinical&branch=${environment.branchA1Id}`;
}

export async function openOdontogram(
  page: Page,
  patientId: string,
  environment: OdontogramE2EEnvironment,
) {
  // The unified Clinical chart workspace opens in Current status mode, so the
  // chart is present without a legacy inner tab click.
  await page.goto(odontogramClinicalHref(patientId, environment));
  await expect(page.getByTestId("fork-odontogram")).toBeVisible();
}
