import { expect, type Page } from "@playwright/test";

import { freshTotp } from "./totp";

/**
 * Signs the MFA-enrolled owner in and completes the step-up challenge.
 *
 * Retries a rejected hosted password sign-in once, then retries the MFA
 * challenge once with a code from the next window. Supabase Auth enforces
 * single use per TOTP code, and a serial suite performs several owner logins
 * inside the same 30-second window, so the second one can be rejected with
 * "That code could not be verified" — correct behaviour that looks exactly like
 * a flaky timeout. Both retries are bounded; wrong fixture credentials, a
 * missing factor, or a broken redirect still fail with a sanitized error.
 */
export async function signInOwnerWithTotp(
  page: Page,
  owner: { email: string; password: string; totpSecret: string },
) {
  const passwordRejectionMessage = "Unable to sign in with those credentials.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    const codeField = page.getByLabel("Six-digit code");
    const passwordRejection = page.getByRole("alert").filter({
      hasText: passwordRejectionMessage,
    });

    await expect(codeField.or(passwordRejection)).toBeVisible({
      timeout: 15_000,
    });

    if (await codeField.isVisible()) {
      break;
    }

    if (attempt === 1) {
      throw new Error("Hosted TEST sign-in was rejected after one retry.");
    }

    // The application deliberately presents one generic message for every
    // credential rejection. A short, single retry absorbs transient hosted
    // Auth rejection without turning a genuinely wrong fixture password into
    // an unbounded or falsely passing test.
    await page.waitForTimeout(5_000);
  }

  const codeField = page.getByLabel("Six-digit code");
  const verify = page.getByRole("button", { name: "Verify and continue" });
  const rejection = page.getByText("That code could not be verified");

  await codeField.fill(await freshTotp(owner.totpSecret));
  await verify.click();

  const rejected = await rejection
    .waitFor({ state: "visible", timeout: 6_000 })
    .then(() => true)
    .catch(() => false);

  if (rejected) {
    // Wait out the window so the next code is genuinely new, then retry once.
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1_000);
    await codeField.fill(await freshTotp(owner.totpSecret));
    await verify.click();
  }

  await page.waitForURL(/\/dashboard$/);
  await expect(page).toHaveURL(/\/dashboard$/);
}
