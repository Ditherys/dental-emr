import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

/**
 * The Periodontal chart mode, end to end.
 *
 * ------------------------------------------------------------------------
 * PENDING: WRITTEN, NEVER EXECUTED.
 *
 * Hosted browser execution needs the explicitly designated synthetic Cloud
 * TEST metadata and credentials described in `e2e/README.md`, and that gate was
 * not authorized for the local-completion window this file was written in.
 * Nothing here may be reported as evidence until the Cloud TEST run happens.
 * ------------------------------------------------------------------------
 *
 * The environment is loaded inside the test bodies, never at module scope, so
 * `playwright test --list` can collect this file without hosted secrets. See
 * the same note in `clinical-chart-workspace.spec.ts`.
 */
let cachedEnvironment: ReturnType<typeof loadE2EEnvironment> | null = null;
function e2eEnvironment() {
  cachedEnvironment ??= loadE2EEnvironment();
  return cachedEnvironment;
}

function suffix(prefix: string, runId: string, retry: number) {
  return `${prefix}${runId}${retry}${Date.now()}`;
}

function periodontalMode(page: Page) {
  return page.getByRole("group", { name: "Chart mode" }).getByRole("button", { name: "Periodontal" });
}

async function openPeriodontal(page: Page, patientId: string) {
  await openOdontogram(page, patientId, e2eEnvironment());
  await periodontalMode(page).click();
  await expect(page.getByTestId("perio-exam-workspace")).toBeVisible();
}

async function startDraft(page: Page) {
  await expect(page.getByTestId("perio-exam-empty")).toContainText("No periodontal examination");
  await page.getByLabel("Examination type").selectOption("INITIAL");
  await page.getByRole("button", { name: "Start new examination" }).click();
  await expect(page.getByTestId("perio-autosave-status")).toBeVisible();
}

function probingDepth(page: Page, fdi: number, site: string) {
  return page.getByRole("spinbutton", {
    name: new RegExp(`Tooth ${fdi} ${site} probing depth in millimetres`),
  });
}

test.describe("@periodontal the periodontal chart mode", () => {
  test("drafts, autosaves and reloads a periodontal examination from canonical data", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("periodraft", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openPeriodontal(page, patientId);
    await startDraft(page);

    // An unmeasured site says so in words. NULL is unknown and is never shown
    // as zero, and never as a healthy reading.
    await expect(page.getByTestId("perio-grid-cal-16-MB")).toContainText("Not recorded");
    await expect(probingDepth(page, 16, "mesio-buccal")).toHaveValue("");

    await probingDepth(page, 16, "mesio-buccal").fill("5");
    await expect(page.getByTestId("perio-autosave-status")).toHaveText(/Saved/);

    // A probing depth with no gingival margin leaves the attachment level
    // unknown; it is never silently reported as the depth.
    await expect(page.getByTestId("perio-grid-cal-16-MB")).toContainText("Not recorded");

    await page.reload();
    await periodontalMode(page).click();
    await expect(probingDepth(page, 16, "mesio-buccal")).toHaveValue("5");
  });

  test("finalizes an examination, then amends it into a successor rather than editing it", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("periofinal", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openPeriodontal(page, patientId);
    await startDraft(page);
    await probingDepth(page, 16, "mesio-buccal").fill("5");
    await expect(page.getByTestId("perio-autosave-status")).toHaveText(/Saved/);

    // The staging the clinician confirms comes from the SERVER derivation.
    await expect(page.getByTestId("perio-derived-source")).toContainText("Derived by the server");
    await page.getByRole("button", { name: /finalize examination/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /finalize/i }).click();

    // A finalized examination is not editable in place.
    await expect(probingDepth(page, 16, "mesio-buccal")).toBeDisabled();
    await expect(page.getByRole("button", { name: /finalize examination/i })).toHaveCount(0);

    await page.getByRole("button", { name: /amend examination/i }).click();
    await page.getByLabel(/reason/i).fill("Synthetic amendment reason");
    await page.getByRole("dialog").getByRole("button", { name: /amend/i }).click();

    // The amendment is a NEW examination whose predecessor is preserved.
    await expect(page.getByTestId("perio-autosave-status")).toBeVisible();
    await expect(probingDepth(page, 16, "mesio-buccal")).toBeEnabled();

    await page.getByRole("button", { name: /compare/i }).click();
    await expect(page.getByTestId("perio-summary")).toBeVisible();
  });

  test("refuses a stale save instead of overwriting a newer examination", async ({
    browser,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const first = await browser.newContext();
    const second = await browser.newContext();
    const pageA = await first.newPage();
    const pageB = await second.newPage();

    try {
      const patientId = await createSyntheticOdontogramPatient(
        pageA,
        environment,
        suffix("periostale", environment.runId, testInfo.retry),
      );

      await signInDentistWithTotp(pageA, environment);
      await openPeriodontal(pageA, patientId);
      await startDraft(pageA);

      await signInDentistWithTotp(pageB, environment);
      await openPeriodontal(pageB, patientId);

      // Both windows hold the same version. B writes first and wins.
      await probingDepth(pageB, 16, "mesio-buccal").fill("6");
      await expect(pageB.getByTestId("perio-autosave-status")).toHaveText(/Saved/);

      // A's write is now stale. It must be REFUSED, and A must be told, rather
      // than silently overwriting the reading B recorded.
      await probingDepth(pageA, 16, "mesio-buccal").fill("3");
      await expect(pageA.getByTestId("perio-conflict")).toBeVisible();

      await pageB.reload();
      await periodontalMode(pageB).click();
      await expect(probingDepth(pageB, 16, "mesio-buccal")).toHaveValue("6");
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("warns before a chart mode change discards unsaved readings", async ({ page }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("periounsaved", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openPeriodontal(page, patientId);
    await startDraft(page);

    // Type a reading and leave immediately, before autosave settles.
    await probingDepth(page, 16, "mesio-buccal").fill("7");
    await page
      .getByRole("group", { name: "Chart mode" })
      .getByRole("button", { name: "Current status" })
      .click();

    // Leaving the mode unmounts the panel and its state with it, so the loss is
    // confirmed first rather than discovered afterwards.
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText(/unsaved/i);
    await confirmation.getByRole("button", { name: "Keep charting" }).click();

    await expect(page.getByTestId("perio-exam-workspace")).toBeVisible();
    await expect(probingDepth(page, 16, "mesio-buccal")).toHaveValue("7");
  });

  test("a receptionist cannot open or write the periodontal chart mode", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("periodenied", environment.runId, testInfo.retry),
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
    await expect(page.getByTestId("perio-exam-workspace")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start new examination" })).toHaveCount(0);
  });
});

test.describe("@responsive @periodontal the periodontal grid at every supported width", () => {
  for (const viewport of [
    { label: "desktop", width: 1440, height: 900 },
    { label: "tablet", width: 1024, height: 1366 },
    { label: "phone", width: 390, height: 844 },
  ] as const) {
    test(`${viewport.label}: the grid scrolls inside itself and the page does not`, async ({
      page,
    }, testInfo) => {
      const environment = e2eEnvironment();
      const patientId = await createSyntheticOdontogramPatient(
        page,
        environment,
        suffix(`periorwd${viewport.label}`, environment.runId, testInfo.retry),
      );

      await signInDentistWithTotp(page, environment);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openPeriodontal(page, patientId);
      await startDraft(page);

      // A wide measurement grid is allowed its own horizontal scroller. The
      // PAGE is not.
      const pageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(pageOverflow).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("perio-grid-scroll")).toBeVisible();

      // The autosave status is announced, not merely coloured.
      const status = page.getByTestId("perio-autosave-status");
      await expect(status).toHaveAttribute("role", /status|alert/);

      const results = await new AxeBuilder({ page })
        .include('[data-testid="perio-exam-workspace"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
