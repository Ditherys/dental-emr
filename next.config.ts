import type { NextConfig } from "next";

import { validateEnvironmentSeparation } from "./src/lib/environment/environment-separation";
import {
  createBrowserHeaderRules,
  isHttpsDeploymentUrl,
} from "./src/lib/security/browser-policy";

const environmentConfig = validateEnvironmentSeparation(process.env);

const nextConfig: NextConfig = {
  // Development-only. Next's dev server refuses to serve /_next/* resources to
  // a page whose origin it considers cross-origin, and it treats 127.0.0.1 and
  // localhost as different origins. The E2E suite and CI both drive the app at
  // http://127.0.0.1:3000, so every dev chunk came back 403 and the client
  // never hydrated — which is why no Playwright flow that needed client-side
  // interactivity could pass. Nothing here affects a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  async headers() {
    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      throw new Error(
        "APP_URL is required to create the browser security policy.",
      );
    }

    return createBrowserHeaderRules({
      allowInsecureLocalSupabase:
        environmentConfig.appEnvironment === "development" &&
        environmentConfig.supabaseProjectId === "local",
      isHttpsDeployment: isHttpsDeploymentUrl(appUrl),
      isProduction: process.env.NODE_ENV === "production",
      supabaseUrl: environmentConfig.supabaseUrl,
    }).map(({ source, headers }) => ({
      source,
      headers: [...headers],
    }));
  },
};

export default nextConfig;
