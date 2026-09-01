import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

// R9. The responsive/accessibility matrix runs the @responsive flows on every
// supported form factor; every other flow runs once on desktop. Re-running the
// full authorization suite on five viewports would cost time without testing
// anything the desktop run does not already cover.
const responsiveMatrix = /@responsive/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // signInOwnerWithTotp (support/login.ts) can perform one bounded hosted
  // password retry and then spend up to ~30s waiting out a TOTP window after
  // a single-use-code collision. Give that explicit recovery budget room to
  // complete without making any individual wait unbounded.
  timeout: 90_000,
  // Every flow signs in as one of a handful of shared, MFA-enrolled synthetic
  // identities against a single hosted, rate-limited Supabase Auth project.
  // signInOwnerWithTotp's retry-once logic in support/login.ts only accounts
  // for one code-collision within a 30s TOTP window; it assumes a serial
  // suite, but Playwright's local default (workers = half the CPU count) runs
  // several projects' logins concurrently against that same shared identity.
  // That produced cascading "Unable to verify the session security level"
  // server errors and browser sessions closing under contention. Force
  // genuinely serial execution so the suite matches what it already assumes.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    // These hosted flows type passwords and send authenticated Supabase
    // requests. Playwright traces retain DOM input values and request headers,
    // so even failure-only traces would persist credentials and bearer tokens.
    trace: "off",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ipad",
      grep: /@shell/,
      use: { ...devices["iPad Pro 11"] },
    },
    // Small phone. 360 px is the narrowest width the project supports; if a
    // layout overflows anywhere, it overflows here first.
    {
      name: "phone-360",
      grep: responsiveMatrix,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    // Large phone.
    {
      name: "phone-430",
      grep: responsiveMatrix,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "ipad-portrait",
      grep: responsiveMatrix,
      use: {
        ...devices["iPad Pro 11"],
        viewport: { width: 834, height: 1194 },
      },
    },
    {
      name: "ipad-landscape",
      grep: responsiveMatrix,
      use: {
        ...devices["iPad Pro 11 landscape"],
        viewport: { width: 1194, height: 834 },
      },
    },
    {
      name: "desktop-responsive",
      grep: responsiveMatrix,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    // Wide desktop. The dental chart is the first surface whose composition is
    // specified at 1920 as well as 1440, so the matrix has to cover it.
    {
      name: "desktop-1920",
      grep: responsiveMatrix,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
