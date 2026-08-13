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
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
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
  ],
});
