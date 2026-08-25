import { expect, test, type Page } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";

const environment = loadE2EEnvironment();

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard$/);
}

test("a receptionist can open the organization-wide patient directory", async ({ page }) => {
  await signIn(page, environment.branchUser.email, environment.branchUser.password);
  await expect(page.getByRole("link", { name: "Patients" })).toBeVisible();
  await page.getByRole("link", { name: "Patients" }).click();

  await expect(page.getByRole("heading", { name: "Patients", exact: true })).toBeVisible();
  await expect(page.getByLabel("Find a patient")).toBeVisible();
  await expect(page.getByText("shared across the organization")).toBeVisible();
});

test("an owner cannot use the patient directory through a direct URL", async ({ page }) => {
  await signIn(page, environment.owner.email, environment.owner.password);
  await expect(page.getByRole("link", { name: "Patients" })).toHaveCount(0);
  await page.goto("/patients");

  await expect(page.getByLabel("Find a patient")).toHaveCount(0);
});

test("a receptionist reviews and explicitly confirms a synthetic duplicate before registering a distinct patient", async ({ page }) => {
  await signIn(page, environment.branchUser.email, environment.branchUser.password);
  await page.goto("/patients/new");

  const suffix = Date.now().toString();
  const firstName = "Synthetic";
  const lastName = `P2Ten${suffix}`;
  const birthDate = "1990-01-01";

  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Birth date").fill(birthDate);
  await page.getByRole("button", { name: "Register patient" }).click();
  await page.waitForURL(/\/patients$/);

  await page.getByRole("link", { name: "Register patient" }).click();
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Birth date").fill(birthDate);
  await page.getByRole("button", { name: "Register patient" }).click();

  const dialog = page.getByRole("dialog", { name: "Review possible duplicate" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("No record has been created yet.");
  await page.getByRole("button", { name: "Continue editing" }).click();
  await expect(page.getByLabel("First name")).toHaveValue(firstName);

  await page.getByRole("button", { name: "Register patient" }).click();
  await page.getByRole("button", { name: "Register as distinct patient" }).click();
  await page.waitForURL(/\/patients$/);
});

test("a receptionist opens and edits a synthetic patient workspace", async ({ page }) => {
  await signIn(page, environment.branchUser.email, environment.branchUser.password);
  await page.goto("/patients/new");

  const suffix = Date.now().toString();
  const firstName = "Synthetic";
  const lastName = `P2Eleven${suffix}`;
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Birth date").fill("1991-01-01");
  await page.getByRole("button", { name: "Register patient" }).click();
  await page.waitForURL(/\/patients$/);

  await page.getByLabel("Find a patient").fill(lastName);
  await expect(page.getByRole("link", { name: `${firstName} ${lastName}` })).toBeVisible();
  await page.getByRole("link", { name: `${firstName} ${lastName}` }).click();
  await expect(page.getByRole("heading", { name: `${firstName} ${lastName}`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contacts" })).toBeVisible();

  await page.getByLabel("Preferred name").fill("P2-11");
  await page.getByRole("button", { name: "Save demographics" }).click();
  await expect(page.getByText("Prefers P2-11")).toBeVisible();
});
