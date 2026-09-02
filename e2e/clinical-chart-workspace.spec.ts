import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import {
  createSyntheticOdontogramPatient,
  odontogramClinicalHref,
  openOdontogram,
  signInDentistWithTotp,
} from "./support/odontogram";

/**
 * The unified Clinical chart workspace, end to end.
 *
 * ------------------------------------------------------------------------
 * PENDING: WRITTEN, NEVER EXECUTED.
 *
 * Hosted browser execution needs the explicitly designated synthetic Cloud
 * TEST metadata and credentials described in `e2e/README.md`, and that gate was
 * not authorized for the local-completion window this file was written in. Not
 * one assertion below has been observed passing. Nothing here may be reported
 * as evidence until the Cloud TEST run happens.
 * ------------------------------------------------------------------------
 *
 * WHY THE ENVIRONMENT IS LOADED LAZILY. `loadE2EEnvironment()` throws when the
 * Cloud TEST metadata is absent. Called at module scope it throws during
 * COLLECTION, so `playwright test --list` reports "0 tests in 0 files" and the
 * specs cannot even be syntax-checked without hosted secrets. Building the
 * harness inside the test body keeps collection credential-free, which is the
 * only verification available locally. Do not hoist this call.
 */
let cachedEnvironment: ReturnType<typeof loadE2EEnvironment> | null = null;
function e2eEnvironment() {
  cachedEnvironment ??= loadE2EEnvironment();
  return cachedEnvironment;
}

const CHART_MODE = "Chart mode";

function chartMode(page: Page, name: "Current status" | "Treatment plan" | "Periodontal") {
  return page.getByRole("group", { name: CHART_MODE }).getByRole("button", { name });
}

/** A short synthetic suffix that is unique per run, retry and test. */
function suffix(prefix: string, runId: string, retry: number) {
  return `${prefix}${runId}${retry}${Date.now()}`;
}

async function signInBranchUser(page: Page) {
  const environment = e2eEnvironment();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(environment.branchUser.email);
  await page.getByLabel("Password").fill(environment.branchUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Opens the record drawer for one tooth through the chart itself. */
async function openToothRecord(page: Page, fdi: number) {
  await page.locator(`[data-fdi="${fdi}"]`).click();
  await expect(page.getByTestId("tooth-record-drawer")).toBeVisible();
}

test.describe("@clinical-chart the unified Clinical chart workspace", () => {
  test("opens on Clinical with no inner tab, and rebuilds the whole chart from canonical data after a reload", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("canonical", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await page.goto(odontogramClinicalHref(patientId, environment));

    // One workspace, reached directly. There is no Odontogram inner tab to
    // click, and no second chart surface anywhere on the page.
    await expect(page.getByTestId("clinical-chart-workspace")).toBeVisible();
    await expect(page.getByTestId("clinical-chart-anatomy")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Odontogram" })).toHaveCount(0);
    await expect(page.getByTestId("clinical-progress-record")).toBeVisible();

    await openToothRecord(page, 16);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    await page.getByRole("button", { name: "Record finding" }).click();

    await expect(page.getByTestId("tooth-current-state")).toContainText(/caries/i);

    // The reload is the whole point: nothing is held in browser state, so the
    // chart, the drawer's current state and the chronological record must all
    // come back from the authorized server projection alone.
    await page.reload();
    await expect(page.getByTestId("clinical-chart-workspace")).toBeVisible();
    await openToothRecord(page, 16);
    await expect(page.getByTestId("tooth-current-state")).toContainText(/caries/i);
    await expect(page.getByTestId("progress-record")).toContainText(/16/);
  });

  test("resolves a current finding through a treatment that confirms one immutable charge", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("resolve", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    await openToothRecord(page, 16);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    await page.getByRole("button", { name: "Record finding" }).click();

    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Treatment performed" }).click();
    const treatment = page.getByRole("form", { name: /record treatment performed/i });
    await treatment.getByRole("checkbox", { name: /occlusal/i }).check();
    // The finding this treatment resolves is chosen from the canonical open
    // findings for THIS tooth; nothing is auto-resolved.
    await treatment.getByLabel(/Caries · tooth 16/).check();
    await treatment.getByLabel(/actual cost/i).fill("2500.00");
    await treatment.getByRole("button", { name: /review charge/i }).click();

    // The confirmation states the amount, and says in words that confirming is
    // final. That wording is the boundary: a confirmed charge is immutable.
    const confirmation = page.getByRole("dialog");
    await expect(confirmation).toContainText(/2,500\.00/);
    await confirmation.getByRole("button", { name: /cannot be edited after/i }).click();

    await expect(page.getByTestId("tooth-current-state")).not.toContainText(/caries/i);
    await expect(page.getByTestId("progress-record")).toContainText(/2,500\.00/);

    // There is no edit affordance for a confirmed charge anywhere on the record.
    await expect(page.getByRole("button", { name: /edit charge/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /change amount/i })).toHaveCount(0);
  });

  test("keeps a partial payment on its own procedure case rather than a patient balance", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("partial", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    // Two separately charged procedures on two teeth.
    for (const [fdi, cost] of [[16, "2500.00"], [26, "1500.00"]] as const) {
      await openToothRecord(page, fdi);
      await page.getByRole("button", { name: "Add clinical record" }).click();
      await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Treatment performed" }).click();
      const treatment = page.getByRole("form", { name: /record treatment performed/i });
      await treatment.getByRole("checkbox", { name: /occlusal/i }).check();
      await treatment.getByLabel(/actual cost/i).fill(cost);
      await treatment.getByRole("button", { name: /review charge/i }).click();
      await page.getByRole("dialog").getByRole("button", { name: /cannot be edited after/i }).click();
      await page.keyboard.press("Escape");
    }

    await page.reload();
    const record = page.getByTestId("progress-record");
    // Each case reports its OWN balance. A single patient-level figure would be
    // the accounting defect this record exists to prevent.
    await expect(record).toContainText(/2,500\.00/);
    await expect(record).toContainText(/1,500\.00/);
    await expect(record).not.toContainText(/4,000\.00/);
  });

  test("authors a plan proposal in Treatment plan mode and executes it from the chart", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("plan", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);
    await chartMode(page, "Treatment plan").click();

    await expect(page.getByTestId("treatment-plan-mode")).toBeVisible();
    const create = page.getByRole("form", { name: "Create treatment plan" });
    await create.getByLabel("Plan title").fill("Synthetic plan");
    await create.getByRole("button", { name: /create/i }).click();

    // The plan chart is the SAME anatomy, with proposal markers on top.
    await expect(page.getByTestId("treatment-plan-chart")).toBeVisible();
    await page.locator('[data-fdi="26"]').click();
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Planned treatment" }).click();
    await page.getByRole("form", { name: "Add planned treatment" }).getByRole("button", { name: /add to plan/i }).click();

    await expect(page.getByTestId("plan-items")).toContainText(/26/);
    await expect(page.getByTestId("plan-overlay-tooth-26")).toBeVisible();

    await page.getByRole("button", { name: "Present plan" }).click();
    await page.getByRole("button", { name: "Acknowledge plan" }).click();
    // An acknowledged plan is no longer editable in place: a change is a new
    // version, never a silent overwrite.
    await expect(page.getByTestId("plan-immutable-notice")).toBeVisible();

    await chartMode(page, "Current status").click();
    await openToothRecord(page, 26);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Treatment performed" }).click();
    const treatment = page.getByRole("form", { name: /record treatment performed/i });
    await treatment.getByRole("checkbox", { name: /occlusal/i }).check();
    await treatment.getByLabel(/actual cost/i).fill("8000.00");
    await treatment.getByRole("button", { name: /review charge/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cannot be edited after/i }).click();

    await expect(page.getByTestId("progress-record")).toContainText(/8,000\.00/);
  });

  test("records a bridge span, an implant chain and a root canal, and each reloads from the record", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("relations", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    // A bridge is a SPAN, so it is authored from a multi-tooth selection.
    await page.getByRole("button", { name: "Select multiple" }).click();
    for (const fdi of [14, 15, 16]) await page.locator(`[data-fdi="${fdi}"]`).click();
    await expect(page.getByTestId("tooth-record-drawer")).toBeVisible();
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Bridge" }).click();
    await page.getByTestId("bridge-charge").fill("30000.00");
    await page.getByTestId("bridge-submit").click();
    await expect(page.getByTestId("bridge-span-summary")).toContainText("14");

    await page.reload();
    await expect(page.getByTestId("bridge-overlay")).toBeVisible();

    // An implant is a single-tooth CHAIN and refuses a span.
    await openToothRecord(page, 36);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Implant" }).click();
    await page.getByTestId("implant-charge").fill("45000.00");
    await page.getByTestId("implant-submit").click();
    await expect(page.getByTestId("implant-stage-recorded")).toBeVisible();

    // A root canal is an ordinary treatment that draws its own overlay.
    await openToothRecord(page, 46);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Treatment performed" }).click();
    const treatment = page.getByRole("form", { name: /record treatment performed/i });
    await treatment.getByLabel(/^treatment$/i).selectOption("ROOT_CANAL");
    await treatment.getByLabel(/actual cost/i).fill("12000.00");
    await treatment.getByRole("button", { name: /review charge/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /cannot be edited after/i }).click();

    await page.reload();
    await expect(
      page.locator('[data-fdi="46"] svg [id*="endo"]').first(),
    ).toHaveAttribute("data-active", "1");
  });

  test("uploads and renames a clinical photograph without exposing a signed URL in the page", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("photo", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    await openToothRecord(page, 11);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Photo" }).click();
    const upload = page.getByRole("dialog", { name: "Add clinical photograph" });
    // Deterministic synthetic bytes: a 1x1 JPEG, never a real clinical image.
    await upload.getByLabel("Photo file").setInputFiles({
      name: "synthetic-tooth-11.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgAAQABAwEiAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAAAAAAAAAAA//9k=",
        "base64",
      ),
    });
    await upload.getByLabel("Display filename").fill("synthetic-before-11.jpg");
    await upload.getByRole("button", { name: "Confirm and add to record" }).click();

    await page.getByRole("button", { name: "More chart actions" }).click();
    await page.getByRole("menuitem", { name: "Clinical photographs" }).click();
    const gallery = page.getByTestId("clinical-photo-gallery");
    await expect(gallery).toContainText("synthetic-before-11.jpg");

    // The rename repairs the DISPLAY name only. It had never worked before the
    // task 14 ambiguity repair, so the success path is asserted here, not just
    // the denial path.
    await gallery.getByRole("button", { name: "Rename photo" }).first().click();
    await page.getByLabel("Display filename").fill("synthetic-before-11-renamed.jpg");
    await page.getByRole("button", { name: "Save filename" }).click();
    await expect(gallery).toContainText("synthetic-before-11-renamed.jpg");

    // A signed object URL is a credential. It may be fetched by an <img>, but it
    // must never be sitting in the readable document text.
    await expect(page.locator("body")).not.toContainText(/X-Amz-Signature|Signature=/);
  });

  test("reviews a staged import before applying it, and registers every canonical export", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("interchange", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    await page.getByRole("button", { name: "More chart actions" }).click();
    await page.getByRole("menuitem", { name: "Import clinical records" }).click();
    await page.getByLabel("File").setInputFiles({
      name: "synthetic-import.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "EMR_JSON_V1",
          records: [
            { kind: "FINDING", toothCode: "24", clinicalCode: "CARIES", surfaces: ["O"], status: "ACTIVE" },
          ],
        }),
      ),
    });
    await page.getByRole("button", { name: "Review file" }).click();

    // Staged, not applied: the review table is shown first and nothing is on
    // the record until the reviewer confirms.
    await expect(page.getByTestId("import-batch-format")).toContainText("EMR_JSON_V1");
    await expect(page.getByTestId("import-batch-count")).toContainText("1");
    await page.getByRole("checkbox", { name: /I have reviewed these records/ }).check();
    await page.getByRole("button", { name: /Apply 1 record/ }).click();

    await expect(page.getByTestId("progress-record")).toContainText(/24/);

    for (const label of ["FHIR R4 Bundle", "Dental EMR JSON", "Chart image (SVG)"]) {
      await page.getByRole("button", { name: "Export chart" }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: label }).click();
      const file = await download;
      expect(file.suggestedFilename()).not.toContain("@");
    }
  });

  test("attributes every clinical record to the signed-in dentist with no provider selector", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("attribution", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    // No provider selector exists anywhere on the clinical write path: the
    // treating provider is derived from the signed-in user, server-side.
    await expect(page.getByLabel(/treating provider/i)).toHaveCount(0);
    await expect(page.getByLabel(/recorded by/i)).toHaveCount(0);

    await openToothRecord(page, 16);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    await page.getByRole("button", { name: "Record finding" }).click();

    await expect(page.getByTestId("progress-record")).not.toContainText("Unknown provider");
    await expect(page.getByTestId("clinical-visit-state")).toBeVisible();
  });
});

test.describe("@clinical-chart authorization and failure paths", () => {
  test("a receptionist may allocate a payment but reaches no clinical write path", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("reception", environment.runId, testInfo.retry),
    );

    await signInBranchUser(page);
    await page.goto(odontogramClinicalHref(patientId, environment));

    await expect(
      page.getByText("Your current access does not include the clinical record."),
    ).toBeVisible();
    await expect(page.getByTestId("clinical-chart-anatomy")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add clinical record" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: CHART_MODE })).toHaveCount(0);

    // The billing surface the same identity IS authorized for stays reachable,
    // so this proves a bounded denial rather than a blanket one.
    await page.goto(`/patients/${patientId}?section=billing&branch=${environment.branchA1Id}`);
    await expect(page.getByRole("heading", { name: /billing/i })).toBeVisible();
  });

  test("a cross-tenant patient route is refused rather than rendered empty", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("crosstenant", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    // Organization A's patient, requested in organization B's branch context.
    await page.goto(`/patients/${patientId}?section=clinical&branch=${environment.branchB1Id}`);

    await expect(page.getByTestId("clinical-chart-anatomy")).toHaveCount(0);
    await expect(page.getByTestId("progress-record")).toHaveCount(0);
    // An empty chart would read as "this patient has no clinical history".
    await expect(page.getByText(/no recorded event/i)).toHaveCount(0);
  });

  test("navigating from patient A to patient B leaves no chart, drawer, gallery or record state behind", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientA = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("patienta", environment.runId, testInfo.retry),
    );
    const patientB = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("patientb", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientA, environment);
    await openToothRecord(page, 16);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    await page.getByRole("button", { name: "Record finding" }).click();
    await page.keyboard.press("Escape");

    await page.goto(odontogramClinicalHref(patientB, environment));
    await expect(page.getByTestId("clinical-chart-workspace")).toBeVisible();

    await expect(page.getByTestId("tooth-record-drawer")).toHaveCount(0);
    await expect(page.getByTestId("chart-selection-summary")).toContainText("No tooth selected");
    await expect(page.getByTestId("clinical-photo-region")).toHaveCount(0);
    await expect(page.getByTestId("progress-record")).not.toContainText(/caries/i);
  });

  test("a failed clinical write paints no record and a duplicate submit records once", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("failure", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);
    await openToothRecord(page, 16);

    // The FIRST attempt is refused at the network boundary. The chart must not
    // paint an optimistic finding the record does not hold.
    await page.route("**/patients/**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "" });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    await page.getByRole("button", { name: "Record finding" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await page.unroute("**/patients/**");
    await page.reload();
    await openToothRecord(page, 16);
    await expect(page.getByTestId("tooth-current-state")).not.toContainText(/caries/i);

    // A double-pressed save carries the same attempt key, so the retry replays
    // rather than recording a second finding.
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Finding" }).click();
    await page.getByRole("checkbox", { name: /occlusal/i }).check();
    const save = page.getByRole("button", { name: "Record finding" });
    await save.click();
    await save.click({ force: true }).catch(() => undefined);

    await page.reload();
    await expect(page.getByTestId("progress-record-table").getByText(/caries/i)).toHaveCount(1);
  });

  test("a finalized clinical note is amended, never mutated", async ({ page }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("amend", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await openOdontogram(page, patientId, environment);

    await page.getByRole("button", { name: "More clinical actions" }).click();
    await page.getByRole("menuitem", { name: "Treatment history" }).click();
    await page.getByRole("button", { name: "View notes" }).first().click();
    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Content").fill("Synthetic finalized note.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByRole("button", { name: "Finalize" }).first().click();

    // A finalized note offers Amend and nothing else. The original text stays.
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("button", { name: "Amend" }).click();
    await page.getByLabel("Amendment").fill("Synthetic amendment.");
    await page.getByRole("button", { name: "Save amendment" }).click();

    await expect(page.getByText("Synthetic finalized note.")).toBeVisible();
    await expect(page.getByText("Synthetic amendment.")).toBeVisible();
  });
});

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet", width: 1024, height: 1366 },
  { label: "phone", width: 390, height: 844 },
] as const;

test.describe("@responsive @clinical-chart the workspace at every supported width", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label}: no page overflow, reachable write path, and labelled overlays`, async ({
      page,
    }, testInfo) => {
      const environment = e2eEnvironment();
      const patientId = await createSyntheticOdontogramPatient(
        page,
        environment,
        suffix(`rwd${viewport.label}`, environment.runId, testInfo.retry),
      );

      await signInDentistWithTotp(page, environment);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openOdontogram(page, patientId, environment);

      // The page itself never scrolls sideways. A chart squeezed into a
      // horizontal scroller would hide the problem rather than fix it.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      const teeth = page.locator("[data-fdi]");
      if (viewport.label === "desktop") {
        // The whole permanent dentition is present and visible at once.
        await expect(teeth).toHaveCount(32);
      } else {
        await expect(teeth.first()).toBeVisible();
      }

      // Every tooth tile stays a safe touch target at every width.
      const box = await teeth.first().boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      // The clinical write path is reachable by keyboard alone, with a visible
      // focus ring, and never depends on hover or drag.
      await teeth.first().focus();
      await expect(teeth.first()).toBeFocused();
      await page.keyboard.press("Enter");
      const drawer = page.getByTestId("tooth-record-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-labelledby", /.+/);

      const results = await new AxeBuilder({ page })
        .include('[data-testid="clinical-chart-workspace"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("phone: the primary action is not clipped under a virtual keyboard or a safe area", async ({
    page,
  }, testInfo) => {
    const environment = e2eEnvironment();
    const patientId = await createSyntheticOdontogramPatient(
      page,
      environment,
      suffix("keyboard", environment.runId, testInfo.retry),
    );

    await signInDentistWithTotp(page, environment);
    await page.setViewportSize({ width: 390, height: 844 });
    await openOdontogram(page, patientId, environment);
    await openToothRecord(page, 16);
    await page.getByRole("button", { name: "Add clinical record" }).click();
    await page.getByRole("group", { name: "Record kind" }).getByRole("button", { name: "Note" }).click();
    await page.getByLabel(/^Note/).click();

    // A software keyboard is emulated by shrinking the visual viewport. The
    // save action must still be inside it, not underneath it.
    await page.setViewportSize({ width: 390, height: 420 });
    const save = page.getByRole("button", { name: /record note/i });
    await expect(save).toBeInViewport();
  });
});
