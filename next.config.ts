import type { NextConfig } from "next";

import { validateEnvironmentSeparation } from "./src/lib/environment/environment-separation";
import {
  createBrowserHeaderRules,
  isHttpsDeploymentUrl,
} from "./src/lib/security/browser-policy";

const environmentConfig = validateEnvironmentSeparation(process.env);

const nextConfig: NextConfig = {
  async headers() {
    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      throw new Error(
        "APP_URL is required to create the browser security policy.",
      );
    }

    return createBrowserHeaderRules({
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
