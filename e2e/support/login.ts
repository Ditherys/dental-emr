import { expect, type Page } from "@playwright/test";

import { freshTotp } from "./totp";

/**
 * Signs the MFA-enrolled owner in and completes the step-up challenge.
 *
 * Retries the challenge once with a code from the next window. Supabase Auth
 * enforces single use per TOTP code, and a serial suite performs several owner
 * logins inside the same 30-second window, so the second one is rejected with
 * "That code could not be verified" — correct behaviour that looks exactly like
 * a flaky timeout. Only the *code* is retried: a genuinely wrong password, a
 * missing factor, or a broken redirect still fails.
 */
export async function signInOwnerWithTotp(
  page: Page,
  owner: { email: string; password: string; totpSecret: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/mfa\/challenge/);

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
