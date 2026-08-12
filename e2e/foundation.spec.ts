import { expect, type Page, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import { currentTotp } from "./support/totp";

const environment = loadE2EEnvironment();

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function loginOwner(page: Page) {
  await submitLogin(
    page,
    environment.owner.email,
    environment.owner.password,
  );
  await page.waitForURL(/\/mfa\/challenge/);
  await expect(
    page.getByRole("heading", { name: "Enter your authenticator code" }),
  ).toBeVisible();
  await page
    .getByLabel("Six-digit code")
    .fill(currentTotp(environment.owner.totpSecret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/dashboard$/);
}

async function loginWithoutMfa(page: Page, email: string, password: string) {
  await submitLogin(page, email, password);
  await page.waitForURL(/\/dashboard$/);
}

test("unauthenticated users are rejected from the private EMR", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to the clinic workspace" }),
  ).toBeVisible();
});

test("owner completes MFA and sees the authorized shell @shell", async ({
  page,
}) => {
  await loginOwner(page);

  await expect(page.getByText(environment.organizationAName).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Branch context: All Branches" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Branch context: All Branches" })
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: environment.branchA1Name }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", { name: environment.branchA2Name }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("owner creates Branch A3 and selects it", async ({ page }) => {
  const branchName = `E2E Branch A3 ${environment.runId}`;
  const branchCode = `A3-${environment.runId}`.toUpperCase();
  const branchSlug = `e2e-branch-a3-${environment.runId}`;

  await loginOwner(page);
  await page.goto("/settings/branches");
  await page.getByLabel("Branch name").fill(branchName);
  await page.getByLabel("Code").fill(branchCode);
  await page.getByLabel("Slug").fill(branchSlug);
  await page.getByLabel("Address line 1").fill("300 Synthetic Avenue");
  await page.getByLabel("City or municipality").fill("Quezon City");
  await page.getByLabel("Province").fill("Metro Manila");
  await page.getByRole("button", { name: "Add branch" }).click();

  await expect(page.getByRole("status")).toContainText(`${branchName} was added`);
  await expect(page.getByText(branchName).first()).toBeVisible();

  await page
    .getByRole("button", { name: /Branch context:/ })
    .click();
  await page.getByRole("menuitemradio", { name: branchName }).click();
  await expect(
    page.getByRole("button", { name: `Branch context: ${branchName}` }),
  ).toBeVisible();
});

test("an Org A owner cannot select an Org B administrative context", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto(
    `/settings/branches?organizationId=${environment.organizationBId}`,
  );

  await expect(page.getByText(environment.organizationAName).first()).toBeVisible();
  await expect(page.getByText(environment.organizationBName)).toHaveCount(0);

  await page.evaluate(
    ({ organizationId, branchId }) => {
      window.localStorage.setItem(
        `dental-emr:branch-context:${organizationId}`,
        branchId,
      );
    },
    {
      organizationId: environment.organizationAId,
      branchId: environment.branchB1Id,
    },
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Branch context: All Branches" }),
  ).toBeVisible();
});

test("a branch-scoped user cannot forge another branch", async ({ page }) => {
  await loginWithoutMfa(
    page,
    environment.branchUser.email,
    environment.branchUser.password,
  );
  await page.evaluate(
    ({ organizationId, branchId }) => {
      window.localStorage.setItem(
        `dental-emr:branch-context:${organizationId}`,
        branchId,
      );
    },
    {
      organizationId: environment.organizationAId,
      branchId: environment.branchA2Id,
    },
  );
  await page.reload();

  await expect(
    page.getByRole("button", {
      name: `Branch context: ${environment.branchA1Name}`,
    }),
  ).toBeVisible();
  await expect(page.getByText(environment.branchA2Name)).toHaveCount(0);

  await page.goto("/settings/branches");
  await expect(
    page.getByRole("heading", { name: "Permission denied" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add branch" })).toHaveCount(0);
});

test("a suspended user cannot reach tenant shell content", async ({ page }) => {
  await submitLogin(
    page,
    environment.suspendedUser.email,
    environment.suspendedUser.password,
  );
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
  await expect(page.getByText(environment.organizationAName)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Branch context:/ }),
  ).toHaveCount(0);
});
