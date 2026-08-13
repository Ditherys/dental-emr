import { expect, type Page, test } from "@playwright/test";

import { createAdminHarness } from "./support/admin";
import { signInOwnerWithTotp } from "./support/login";

/**
 * R5 — authorization withdrawn while the browser session stays open.
 *
 * `foundation.spec.ts` proves that a session which never had authorization is
 * refused. These flows prove the harder property: a session that *did* have it
 * loses it on the next request, without signing out and without a new token.
 *
 * The withdrawal itself is performed by the server-side harness — see the note
 * in `support/admin.ts` about what that does and does not claim. Each test
 * restores the fixture in a `finally` block, and a final safety net runs after
 * the file so a mid-test failure cannot leave the shared TEST project degraded
 * for later runs.
 *
 * The mutation-after-suspension test below suspends `environment.adminUser`, a
 * fixture dedicated to this file, rather than `environment.owner`. The owner is
 * shared with every other spec file; a failure that left it suspended (a timed-
 * out test skipping its `finally`, for example) would cascade into unrelated
 * tests signing in concurrently in other Playwright workers. Suspending a
 * fixture nothing else logs in as keeps that failure contained to this file.
 */

const harness = createAdminHarness();
const environment = harness.environment;

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function loginBranchUser(page: Page) {
  await submitLogin(
    page,
    environment.branchUser.email,
    environment.branchUser.password,
  );
  await page.waitForURL(/\/dashboard$/);
}

test.afterAll(async () => {
  // Safety net: whatever happened above, the fixtures go back to their
  // documented state. A disposable project is still a shared one within a run.
  const branchMemberId = await harness.resolveMemberId(
    environment.organizationAId,
    environment.branchUser.email,
  );
  await harness.setBranchAccess(
    environment.organizationAId,
    environment.branchA1Id,
    branchMemberId,
    "active",
  );
  await harness.setMembershipStatus(branchMemberId, "active");

  const adminMemberId = await harness.resolveMemberId(
    environment.organizationAId,
    environment.adminUser.email,
  );
  await harness.setMembershipStatus(adminMemberId, "active");
});

test("branch access revoked mid-session disappears from the open session", async ({
  page,
}) => {
  const memberId = await harness.resolveMemberId(
    environment.organizationAId,
    environment.branchUser.email,
  );

  await loginBranchUser(page);
  await expect(
    page.getByRole("button", {
      name: `Branch context: ${environment.branchA1Name}`,
    }),
  ).toBeVisible();

  try {
    await harness.setBranchAccess(
      environment.organizationAId,
      environment.branchA1Id,
      memberId,
      "revoked",
    );

    // No sign-out, no new token — the same session simply asks again.
    await page.reload();

    await expect(
      page.getByRole("button", { name: "Branch context: No branch access" }),
    ).toBeVisible();
    await expect(page.getByText(environment.branchA1Name)).toHaveCount(0);
  } finally {
    await harness.setBranchAccess(
      environment.organizationAId,
      environment.branchA1Id,
      memberId,
      "active",
    );
  }
});

test("a member suspended mid-session loses tenant content on the next request", async ({
  page,
}) => {
  const memberId = await harness.resolveMemberId(
    environment.organizationAId,
    environment.branchUser.email,
  );

  await loginBranchUser(page);
  await expect(page.getByText(environment.organizationAName).first()).toBeVisible();

  try {
    await harness.setMembershipStatus(memberId, "suspended");
    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: "Your workspace access is no longer active.",
      }),
    ).toBeVisible();
    await expect(page.getByText(environment.organizationAName)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Branch context:/ }),
    ).toHaveCount(0);

    // Direct navigation must not route around the revoked shell.
    await page.goto("/settings/branches");
    await expect(
      page.getByRole("heading", {
        name: "Your workspace access is no longer active.",
      }),
    ).toBeVisible();
  } finally {
    await harness.setMembershipStatus(memberId, "active");
  }
});

test("a mutation submitted after mid-session suspension is refused", async ({
  page,
}) => {
  const memberId = await harness.resolveMemberId(
    environment.organizationAId,
    environment.adminUser.email,
  );
  const branchName = `E2E Suspended Attempt ${environment.runId}`;
  const branchCode = `SA-${environment.runId}`.toUpperCase();
  const branchSlug = `e2e-suspended-attempt-${environment.runId}`;

  await signInOwnerWithTotp(page, environment.adminUser);
  await page.goto("/settings/branches");

  // The form is filled while the session is fully authorized. Authorization is
  // withdrawn between filling and submitting, which is exactly the window a
  // client-trusting implementation would miss.
  await page.getByLabel("Branch name").fill(branchName);
  await page.getByLabel("Code", { exact: true }).fill(branchCode);
  await page.getByLabel("Slug").fill(branchSlug);
  await page.getByLabel("Address line 1").fill("400 Synthetic Avenue");
  await page.getByLabel("City or municipality").fill("Quezon City");
  await page.getByLabel("Province").fill("Metro Manila");

  try {
    await harness.setMembershipStatus(memberId, "suspended");
    await page.getByRole("button", { name: "Add branch" }).click();

    await expect(page.getByText(`${branchName} was added`)).toHaveCount(0);
    await expect(page.getByText(branchName)).toHaveCount(0);
  } finally {
    await harness.setMembershipStatus(memberId, "active");
  }

  // The refusal must have written nothing: a reauthorized reload must not show
  // the branch the suspended submission tried to create.
  await page.goto("/settings/branches");
  await expect(page.getByText(branchName)).toHaveCount(0);
});

test("an unchallenged MFA session cannot reach the step-up-gated surface", async ({
  page,
}) => {
  await submitLogin(page, environment.owner.email, environment.owner.password);
  await page.waitForURL(/\/mfa\/challenge/);

  // AAL1 with an enrolled factor. Navigating straight at the administrative
  // surface must not bypass the outstanding challenge.
  await page.goto("/settings/branches");
  await expect(page).toHaveURL(/\/mfa\/challenge/);
  await expect(page.getByRole("button", { name: "Add branch" })).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/mfa\/challenge/);
});

test("a branch-scoped user cannot reach workforce invitation issuance", async ({
  page,
}) => {
  await loginBranchUser(page);
  await page.goto("/settings/users/invite");

  await expect(
    page.getByRole("heading", { name: "You don't have access to this area." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invitation" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("combobox", { name: /role/i })).toHaveCount(0);
});
