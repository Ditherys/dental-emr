import { describe, expect, it } from "vitest";

import {
  createBrowserHeaderRules,
  createBrowserSecurityHeaders,
  createContentSecurityPolicy,
  isHttpsDeploymentUrl,
  PRIVATE_NO_STORE_HEADERS,
  PRIVATE_NO_STORE_ROUTE_PATTERNS,
} from "./browser-policy";

const supabaseUrl = "https://synthetic-project.supabase.co";

function toHeaderMap(headers: readonly { key: string; value: string }[]) {
  return new Map(headers.map(({ key, value }) => [key, value]));
}

describe("browser security policy", () => {
  it("uses an exact Supabase origin and denies unneeded content capabilities", () => {
    const policy = createContentSecurityPolicy({
      isHttpsDeployment: true,
      isProduction: true,
      supabaseUrl,
    });

    expect(policy).toContain(
      "connect-src 'self' https://synthetic-project.supabase.co wss://synthetic-project.supabase.co",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("*");
  });

  it("keeps unsafe-eval out of production and upgrades insecure requests", () => {
    const policy = createContentSecurityPolicy({
      isHttpsDeployment: true,
      isProduction: true,
      supabaseUrl,
    });

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows the installed Next.js debugging runtime only in development", () => {
    const policy = createContentSecurityPolicy({
      isHttpsDeployment: false,
      isProduction: false,
      supabaseUrl,
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("rejects insecure production and injection-prone Supabase URLs", () => {
    expect(() =>
      createContentSecurityPolicy({
        isHttpsDeployment: true,
        isProduction: true,
        supabaseUrl: "http://synthetic-project.supabase.co",
      }),
    ).toThrow("must use HTTPS");

    expect(() =>
      createContentSecurityPolicy({
        isHttpsDeployment: false,
        isProduction: false,
        supabaseUrl: "https://synthetic-project.supabase.co/path?value=unsafe",
      }),
    ).toThrow("must be an origin");

    expect(() =>
      createContentSecurityPolicy({
        isHttpsDeployment: false,
        isProduction: false,
        supabaseUrl: "javascript:alert(1)",
      }),
    ).toThrow("must use HTTP or HTTPS");
  });

  it("adds HSTS only to production responses", () => {
    const productionHeaders = toHeaderMap(
      createBrowserSecurityHeaders({
        isHttpsDeployment: true,
        isProduction: true,
        supabaseUrl,
      }),
    );
    const developmentHeaders = toHeaderMap(
      createBrowserSecurityHeaders({
        isHttpsDeployment: false,
        isProduction: false,
        supabaseUrl,
      }),
    );

    expect(productionHeaders.get("Strict-Transport-Security")).toBe(
      "max-age=31536000",
    );
    expect(developmentHeaders.has("Strict-Transport-Security")).toBe(false);
    expect(productionHeaders.get("X-Content-Type-Options")).toBe("nosniff");
    expect(productionHeaders.get("X-Frame-Options")).toBe("DENY");
    expect(productionHeaders.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(productionHeaders.get("Permissions-Policy")).toContain("camera=()");
  });

  it("emits HTTPS-only controls only for a real production HTTPS origin", () => {
    const localProductionHeaders = toHeaderMap(
      createBrowserSecurityHeaders({
        isHttpsDeployment: false,
        isProduction: true,
        supabaseUrl,
      }),
    );
    const localProductionPolicy = createContentSecurityPolicy({
      isHttpsDeployment: false,
      isProduction: true,
      supabaseUrl,
    });

    expect(localProductionHeaders.has("Strict-Transport-Security")).toBe(false);
    expect(localProductionPolicy).not.toContain("upgrade-insecure-requests");
    expect(isHttpsDeploymentUrl("https://emr.example.test")).toBe(true);
    expect(isHttpsDeploymentUrl("http://localhost:3000")).toBe(false);
    expect(() => isHttpsDeploymentUrl("https://emr.example.test/path")).toThrow(
      "must be an origin",
    );
  });

  it("provides explicit private no-store patterns without covering public pages", () => {
    expect(PRIVATE_NO_STORE_HEADERS).toContainEqual({
      key: "Cache-Control",
      value: "private, no-store, max-age=0, must-revalidate",
    });
    expect(PRIVATE_NO_STORE_ROUTE_PATTERNS).toContain("/dashboard/:path*");
    expect(PRIVATE_NO_STORE_ROUTE_PATTERNS).toContain("/auth/:path*");
    expect(PRIVATE_NO_STORE_ROUTE_PATTERNS).not.toContain("/:path*");

    const rules = createBrowserHeaderRules({
      isHttpsDeployment: true,
      isProduction: true,
      supabaseUrl,
    });
    const publicRule = rules.find(({ source }) => source === "/:path*");
    const dashboardRule = rules.find(
      ({ source }) => source === "/dashboard/:path*",
    );

    expect(publicRule?.headers).not.toContainEqual(
      expect.objectContaining({ key: "Cache-Control" }),
    );
    expect(dashboardRule?.headers).toContainEqual(
      expect.objectContaining({ key: "Cache-Control" }),
    );
  });
});
