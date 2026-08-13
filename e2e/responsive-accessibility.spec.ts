import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { loadE2EEnvironment } from "./support/environment";
import { signInOwnerWithTotp } from "./support/login";

/**
 * R9 — responsive and accessibility verification across the supported form
 * factors. Every test here is tagged @responsive and runs on phone-360,
 * phone-430, ipad-portrait, ipad-landscape, and desktop-responsive.
 *
 * These are the checks a machine can make honestly: WCAG rule violations a
 * scanner can detect, horizontal overflow, target size, focus visibility, and
 * keyboard operability. They are NOT a substitute for the manual pass in
 * `docs/testing/RESPONSIVE_ACCESSIBILITY_QA.md` — an automated scan cannot tell
 * you a layout is usable, only that it is not obviously broken.
 */

const environment = loadE2EEnvironment();

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// WCAG 2.2 SC 2.5.8 Target Size (Minimum). The project's own guidance prefers a
// larger coarse-pointer target; that preference is a manual review item rather
// than a build failure, and is recorded in the QA checklist.
const MINIMUM_TARGET_PX = 24;

async function loginOwner(page: Page) {
  await signInOwnerWithTotp(page, environment.owner);
}

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    help: violation.help,
  }));

  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  // One pixel of tolerance for sub-pixel rounding; anything more is a real
  // horizontal scrollbar on the page body, which the project forbids.
  const overflow = await page.evaluate(() => {
    const element = document.documentElement;
    return element.scrollWidth - element.clientWidth;
  });

  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(1);
}

async function expectUsableTargets(page: Page, label: string) {
  const undersized = await page.evaluate((minimum) => {
    // WCAG 2.2 target size is the *activation* area, not the painted control.
    // A checkbox is 16x16 by design, but an associated <label> makes the real
    // target far larger — measuring the input alone reports a false failure.
    const measure = (element: Element) => {
      const box = element.getBoundingClientRect();
      const id = element.getAttribute("id");

      if (!id) {
        return box;
      }

      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);

      if (!label) {
        return box;
      }

      const labelBox = label.getBoundingClientRect();
      const left = Math.min(box.left, labelBox.left);
      const top = Math.min(box.top, labelBox.top);

      return {
        width: Math.max(box.right, labelBox.right) - left,
        height: Math.max(box.bottom, labelBox.bottom) - top,
      };
    };

    const selector =
      'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"], [role="menuitemradio"], [role="tab"]';

    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return false;
        }

        const box = measure(element);
        // Zero-size elements are not rendered targets (collapsed sheets, etc.).
        if (box.width === 0 && box.height === 0) {
          return false;
        }

        return box.width < minimum || box.height < minimum;
      })
      .map((element) => {
        const box = measure(element);
        return `${element.tagName.toLowerCase()}[${
          element.getAttribute("aria-label") ??
          element.textContent?.trim().slice(0, 32) ??
          ""
        }] ${Math.round(box.width)}x${Math.round(box.height)}`;
      });
  }, MINIMUM_TARGET_PX);

  expect(undersized, `undersized targets on ${label}`).toEqual([]);
}

/** The first keyboard-reachable control must show a visible focus indicator. */
async function expectVisibleFocusIndicator(page: Page, label: string) {
  await page.keyboard.press("Tab");

  const focusIndicator = await page.evaluate(() => {
    const element = document.activeElement;

    if (!element || element === document.body) {
      return null;
    }

    const style = window.getComputedStyle(element);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  });

  expect(focusIndicator, `no element received focus on ${label}`).not.toBeNull();

  const hasOutline =
    focusIndicator!.outlineStyle !== "none" &&
    Number.parseFloat(focusIndicator!.outlineWidth) > 0;
  const hasRing =
    focusIndicator!.boxShadow !== "none" && focusIndicator!.boxShadow !== "";

  expect(
    hasOutline || hasRing,
    `focus indicator is not visible on ${label}`,
  ).toBe(true);
}

test("@responsive the sign-in screen is accessible and does not overflow", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Dental EMR" }),
  ).toBeVisible();

  await expectNoAxeViolations(page, "login");
  await expectNoHorizontalOverflow(page, "login");
  await expectUsableTargets(page, "login");
  await expectVisibleFocusIndicator(page, "login");
});

test("@responsive the sign-in form is operable by keyboard alone", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("Email address").focus();
  await page.keyboard.type(environment.owner.email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(environment.owner.password);

  const submit = page.getByRole("button", { name: "Sign in" });
  await page.keyboard.press("Tab");

  // Tab order must reach the submit control without a pointer. Some layouts
  // insert a "show password" toggle, so allow one intervening stop.
  if (!(await submit.evaluate((node) => node === document.activeElement))) {
    await page.keyboard.press("Tab");
  }

  await expect(submit).toBeFocused();
});

test("@responsive the authenticated shell is accessible on every form factor", async ({
  page,
}) => {
  await loginOwner(page);

  await expectNoAxeViolations(page, "dashboard");
  await expectNoHorizontalOverflow(page, "dashboard");
  await expectUsableTargets(page, "dashboard");
});

test("@responsive navigation is reachable without a pointer on every form factor", async ({
  page,
}, testInfo) => {
  await loginOwner(page);

  const isNarrow = (page.viewportSize()?.width ?? 0) < 1024;
  const trigger = isNarrow
    ? page.getByRole("button", { name: "Open primary navigation" })
    : page.getByRole("link", { name: "Dashboard" });

  await expect(
    trigger,
    `primary navigation entry point missing on ${testInfo.project.name}`,
  ).toBeVisible();

  if (isNarrow) {
    // The collapsed navigation must open from the keyboard, not only by tap.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "mobile navigation");

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("@responsive the branch selector is operable by keyboard", async ({
  page,
}) => {
  await loginOwner(page);

  const selector = page.getByRole("button", { name: /Branch context:/ });
  await selector.focus();
  await page.keyboard.press("Enter");

  const options = page.getByRole("menuitemradio");
  await expect(options.first()).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(selector).toBeVisible();
  await expectNoHorizontalOverflow(page, "branch selector");
});

test("@responsive the branch settings work surface survives an orientation change", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto("/settings/branches");
  await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();

  await expectNoAxeViolations(page, "branch settings");
  await expectNoHorizontalOverflow(page, "branch settings");
  await expectUsableTargets(page, "branch settings");

  const viewport = page.viewportSize();

  if (viewport) {
    // Rotate. Content entered before the rotation must survive it, and the
    // rotated layout must not overflow either.
    await page.getByLabel("Branch name").fill("Orientation Draft");
    await page.setViewportSize({
      width: viewport.height,
      height: viewport.width,
    });

    await expect(page.getByLabel("Branch name")).toHaveValue(
      "Orientation Draft",
    );
    await expectNoHorizontalOverflow(page, "branch settings (rotated)");
    await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();

    await page.setViewportSize(viewport);
  }
});

test("@responsive the account and security screen is accessible", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto("/settings/account");

  await expectNoAxeViolations(page, "account and security");
  await expectNoHorizontalOverflow(page, "account and security");
  await expectUsableTargets(page, "account and security");
});
